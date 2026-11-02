`timescale 1ns/1ps
module tb_learning;
  logic clk=0, rst=1;
  always #5 clk=~clk;
  integer checks=0;
  task check(input logic cond, input string msg);
    begin checks=checks+1; if (cond !== 1'b1) $fatal(1,"CHECK FAILED: %s",msg); end
  endtask
  task tick; begin @(posedge clk); #1; end endtask
  task drive; begin @(negedge clk); #1; end endtask
  logic iv=0, ir, ov, ordy=0; logic [31:0] idata=0, odata;
  learn_elastic elastic(clk,rst,iv,ir,idata,ov,ordy,odata);
  logic ws=0, preload=0, valid=0, start=0, pov;
  logic signed [7:0] a=0,b=0,weight=0,wdebug;
  logic signed [31:0] partial=0,result,sum;
  learn_pe pe(clk,rst,ws,preload,valid,start,a,b,weight,partial,pov,result,sum,wdebug);
  logic rv=0, rr, rc=0, rw=0, pv, pr=0, pc, pi, av=0, ac=0;
  logic dv, dr=0, dc,dw,owner,busy; logic [1:0] state,sharers,pending,sent;
  learn_directory dir(clk,rst,rv,rr,rc,rw,pv,pr,pc,pi,av,ac,dv,dr,dc,dw,state,sharers,pending,sent,owner,busy);
  integer model[0:2047]; integer head=0,tail=0,seq=1,seed=32'h6941;
  integer i,exp_sum,exp_result; logic push,pop;
  task request(input logic client_id, input logic write_request);
    begin drive(); check(rr,"directory ready before request"); rv=1;rc=client_id;rw=write_request;tick();drive();rv=0; end
  endtask
  task response(input logic client_id, input logic write_request);
    begin
      check(dv && dc==client_id && dw==write_request,"correct grant");
      repeat(3) begin tick(); check(dv && dc==client_id && dw==write_request && !rr,"grant held under backpressure"); end
      drive();dr=1;tick();drive();dr=0;check(rr,"transaction released after response");
    end
  endtask
  initial begin
    tick();drive();rst=0;tick();check(!ov && !pov && state==0 && rr,"reset");
    // Randomized scoreboard: output order, no loss/duplication, full replacement.
    for(i=0;i<500;i=i+1) begin
      drive();
      if (!iv || ir) begin iv=($random(seed)&3)!=0;idata=seq;end
      ordy=($random(seed)&3)!=0;
      #1;push=iv&&ir;pop=ov&&ordy;
      if(pop) begin check(head<tail,"no phantom output");check(odata==model[head],"FIFO output order");head=head+1;end
      if(push) begin model[tail]=idata;tail=tail+1;seq=seq+1;end
      tick();check((tail-head)==(ov?1:0),"occupancy conservation");
    end
    drive();iv=0;ordy=1;#1;
    if(ov) begin check(odata==model[head],"final FIFO item");head=head+1;end
    tick();check(!ov && head==tail,"FIFO drain");
    // OS: exact signed reference with gaps, explicit start on first term.
    exp_sum=0;
    for(i=0;i<100;i=i+1) begin
      drive();ws=0;preload=0;valid=1;start=(i==0);a=$random(seed);b=$random(seed);
      exp_sum=exp_sum+$signed(a)*$signed(b);tick();check(pov && result==exp_sum && sum==exp_sum,"OS signed accumulation");
      drive();valid=0;tick();check(!pov && sum==exp_sum,"OS bubble holds sum");
    end
    drive();ws=0;valid=1;start=1;a=-128;b=-128;tick();check(result==16384,"INT8 minimum operands sign extension");
    // WS weight reused with changing signed activations and incoming partial sum.
    drive();ws=1;preload=1;valid=1;weight=-7;tick();check(!pov && wdebug==-7,"preload priority");
    for(i=0;i<100;i=i+1) begin
      drive();preload=0;valid=1;a=$random(seed);partial=$random(seed);exp_result=partial+$signed(a)*(-7);
      tick();check(pov && result==exp_result && wdebug==-7,"WS signed partial sum and weight reuse");
    end
    drive();preload=1;valid=0;weight=-128;tick();drive();preload=0;valid=1;a=-128;partial=32'sh7fffffff;tick();check(result==32'sh80003fff,"explicit INT32 modulo overflow");
    drive();valid=0;
    // U -> S0 -> S01 -> M1. Premature/wrong/duplicate ACKs ignored.
    request(0,0);response(0,0);check(state==1 && sharers==1,"first shared reader");
    request(1,0);response(1,0);check(state==1 && sharers==3,"second shared reader");
    request(1,1);check(pv && pc==0 && pi && pending==1,"write sends invalidation to other sharer");
    av=1;ac=0;tick();check(!dv && pending==1 && sent==0,"ACK before probe accepted ignored");
    drive();av=0;pr=1;tick();drive();pr=0;check(!pv && pending==1 && sent==1,"probe is not repeated after acceptance");
    av=1;ac=1;tick();check(!dv && pending==1,"ACK from wrong client ignored");
    drive();ac=0;tick();check(dv && pending==0,"expected ACK permits grant");
    drive();av=1;tick();check(dv,"duplicate ACK cannot remove response");drive();av=0;
    response(1,1);check(state==2 && owner==1 && sharers==2,"exclusive writer installed");
    // M1 -> S01 by C0 read; downgrade probe and same-cycle ACK permitted.
    request(0,0);check(pv && pc==1 && !pi,"read recalls owner for downgrade");
    pr=1;av=1;ac=1;tick();drive();pr=0;av=0;check(dv,"same-cycle accepted probe+ACK");
    response(0,0);check(state==1 && sharers==3,"owner downgrade becomes shared");
    request(0,1);check(pv && pc==1 && pi,"second ownership transfer invalidates C1");
    pr=1;tick();drive();pr=0;av=1;ac=1;tick();drive();av=0;response(0,1);
    check(state==2 && owner==0 && sharers==1,"writer C0 installed");
    request(0,0);check(dv && !pv,"same owner reads without recall");response(0,0);check(state==2 && owner==0,"owner retains M");
    $display("PASS %0d checks; FIFO 500 randomized cycles; OS/WS 100 vectors each; directory directed transitions",checks);
    $finish;
  end
  initial begin #100000; $fatal(1,"timeout"); end
endmodule
