`timescale 1ns/1ps
module tb_learning;
  reg clk=0;
  always #5 clk=~clk;
  reg rst=1;
  reg iv=0, ordy=0;
  reg [7:0] idata=0;
  wire ir, ov;
  wire [7:0] odata;
  wire [1:0] count;
  learn_elastic fifo(clk,rst,iv,ir,idata,ov,ordy,odata,count);
  reg [1:0] cx=0,cy=0,dx=0,dy=0;
  wire [2:0] port;
  learn_xy_route xy(cx,cy,dx,dy,port);
  reg issue=0;
  reg [7:0] reads=0,writes=0,complete=0;
  wire issue_ready;
  wire [7:0] busy_regs;
  learn_scoreboard sb(clk,rst,issue,reads,writes,complete,issue_ready,busy_regs);
  reg rq=0,client=0,getm=0,rsp_r=0;
  reg [1:0] ack=0;
  wire rq_ready,probe_shared,rsp_v,rsp_c,rsp_m,dir_owner,dir_busy;
  wire [1:0] probes,dir_state,sharers;
  learn_directory dir(clk,rst,rq,rq_ready,client,getm,probes,probe_shared,ack,
                      rsp_v,rsp_r,rsp_c,rsp_m,dir_state,sharers,dir_owner,dir_busy);
  integer fifo_cycles=0, fifo_puts=0, fifo_pops=0, route_hops=0,route_pairs=0;
  integer sb_checks=0,dir_checks=0;
  integer qc=0;
  reg [7:0] q0=0,q1=0;
  reg [31:0] random_state=32'h0f71c3a5;
  reg take_in,take_out;
  integer x,y,a,b,nx,ny,px,py,distance,newdist,i;
  task tick; begin @(posedge clk); #1; end endtask
  task check;
    input condition;
    input [8*140-1:0] message;
    begin if (condition !== 1'b1) begin $display("FAIL: %0s time=%0t",message,$time); $fatal(1); end end
  endtask
  task fifo_cycle;
    input vin;
    input rout;
    input [7:0] data;
    begin
      @(negedge clk); iv=vin;ordy=rout;idata=data; #1;
      check(ir == (qc<2),"FIFO ready follows old occupancy");
      check(ov == (qc!=0),"FIFO valid follows old occupancy");
      if(qc!=0) check(odata==q0,"FIFO oldest value is preserved");
      take_in=vin&&ir;take_out=rout&&ov;
      if(take_out) begin q0=q1;qc=qc-1;fifo_pops=fifo_pops+1;end
      if(take_in) begin
        if(qc==0) q0=data;else q1=data;
        qc=qc+1;fifo_puts=fifo_puts+1;
      end
      tick;
      check(count==qc,"FIFO count matches independent two-element reference");
      fifo_cycles=fifo_cycles+1;
    end
  endtask
  task sb_cycle;
    input v;
    input [7:0] r,w,c;
    input expected_ready;
    input [7:0] expected_busy;
    begin
      @(negedge clk);issue=v;reads=r;writes=w;complete=c;#1;
      check(issue_ready==expected_ready,"scoreboard issue hazard decision");
      tick;check(busy_regs==expected_busy,"scoreboard producer reservation and completion");
      sb_checks=sb_checks+1;
    end
  endtask
  task request;
    input c,m;
    begin
      @(negedge clk);check(rq_ready,"directory ready before request");rq=1;client=c;getm=m;
      tick;@(negedge clk);rq=0;
    end
  endtask
  task expect_dir;
    input [1:0] s,sh,p;
    input o,bs,rv,rc,rm;
    begin
      #1;
      check(dir_state==s && sharers==sh && dir_owner==o,"directory stable metadata");
      check(probes==p && dir_busy==bs,"directory pending target mask");
      check(rsp_v==rv,"directory response validity");
      if(rv) check(rsp_c==rc && rsp_m==rm,"directory grant identity and permission");
      check(rq_ready==(!bs&&!rv),"directory blocks new transactions until response consumed");
      dir_checks=dir_checks+1;
    end
  endtask
  task consume_rsp;
    begin @(negedge clk);rsp_r=1;tick;@(negedge clk);rsp_r=0;end
  endtask
  initial begin
    tick;@(negedge clk);rst=0;
    // Empty read, fill, full backpressure, full+pop bubble, simultaneous replacement, drain.
    fifo_cycle(0,1,0);
    fifo_cycle(1,0,8'h11);fifo_cycle(1,0,8'h22);
    fifo_cycle(1,0,8'h33);fifo_cycle(1,1,8'h33);
    fifo_cycle(1,1,8'h44);fifo_cycle(0,1,0);fifo_cycle(0,1,0);
    for(i=0;i<512;i=i+1) begin
      random_state={random_state[30:0],random_state[31]^random_state[21]^random_state[1]^random_state[0]};
      fifo_cycle(random_state[0],random_state[7],random_state[23:16]);
    end
    fifo_cycle(0,1,0);fifo_cycle(0,1,0);
    @(negedge clk);iv=0;ordy=0;
    check(qc==0 && fifo_puts==fifo_pops,"FIFO all accepted values drained exactly once");
    $display("FIFO_PASS cycles=%0d accepted=%0d retired=%0d",fifo_cycles,fifo_puts,fifo_pops);

    // Exhaustive legal source/destination pairs on 4x4; walk each complete path.
    for(x=0;x<4;x=x+1) for(y=0;y<4;y=y+1)
      for(a=0;a<4;a=a+1) for(b=0;b<4;b=b+1) begin
        px=x;py=y;dx=a;dy=b;route_pairs=route_pairs+1;
        for(i=0;i<7;i=i+1) begin
          cx=px;cy=py;#1;
          distance=(a>px?a-px:px-a)+(b>py?b-py:py-b);
          if(distance==0) check(port==0,"XY local ejection");
          else begin
            nx=px;ny=py;
            case(port)
              1: nx=px+1;
              2: nx=px-1;
              3: ny=py+1;
              4: ny=py-1;
              default: check(0,"XY nonlocal destination cannot eject");
            endcase
            check(nx>=0&&nx<4&&ny>=0&&ny<4,"XY no boundary crossing");
            if(px!=a) check(ny==py,"XY horizontal dimension finishes first");
            newdist=(a>nx?a-nx:nx-a)+(b>ny?b-ny:ny-b);
            check(newdist==distance-1,"XY every hop reduces Manhattan distance");
            px=nx;py=ny;route_hops=route_hops+1;
          end
        end
        check(px==a&&py==b,"XY path terminates within six hops");
      end
    $display("XY_PASS pairs=%0d hops=%0d",route_pairs,route_hops);

    sb_cycle(1,0,8'h04,0,1,8'h04);       // writer r2
    sb_cycle(1,8'h04,8'h08,0,0,8'h04); // RAW blocks
    sb_cycle(1,0,8'h04,0,0,8'h04);       // WAW blocks
    sb_cycle(1,8'h01,8'h10,0,1,8'h14); // independent writer
    sb_cycle(1,8'h04,8'h08,8'h04,0,8'h10); // completion has no same-cycle bypass
    sb_cycle(1,8'h04,8'h08,0,1,8'h18);
    sb_cycle(0,0,0,8'h18,1,0);
    sb_cycle(1,0,8'h02,0,1,8'h02);
    sb_cycle(0,0,0,0,1,8'h02); // valid low causes no issue
    sb_cycle(0,0,0,8'h02,1,0);
    @(negedge clk);issue=0;complete=0;
    $display("SCOREBOARD_PASS directed=%0d",sb_checks);

    expect_dir(0,0,0,0,0,0,0,0);
    request(0,0);expect_dir(1,1,0,0,0,1,0,0); // U -> S0
    tick;expect_dir(1,1,0,0,0,1,0,0); // response held
    consume_rsp;
    request(1,0);expect_dir(1,3,0,0,0,1,1,0); // S -> S01
    consume_rsp;
    request(0,1);expect_dir(1,3,2,0,1,0,0,0); // GetM must invalidate client1
    tick;expect_dir(1,3,2,0,1,0,0,0); // delay ACK
    @(negedge clk);ack=1;tick;@(negedge clk);ack=0;
    expect_dir(1,3,2,0,1,0,0,0); // unrelated ack cannot complete it
    @(negedge clk);ack=2;tick;@(negedge clk);ack=0;
    expect_dir(2,0,0,0,0,1,0,1); // complete invalidation -> M0
    consume_rsp;
    request(0,0);expect_dir(2,0,0,0,0,1,0,1); // same owner read stays M
    consume_rsp;
    request(1,0);expect_dir(2,0,1,0,1,0,0,0); // M0 -> pending downgrade
    check(probe_shared,"GETS of another owner's M line requests downgrade");
    @(negedge clk);ack=1;tick;@(negedge clk);ack=0;
    expect_dir(1,3,0,0,0,1,1,0); // now S01
    consume_rsp;
    request(1,1);expect_dir(1,3,1,0,1,0,0,0);
    @(negedge clk);ack=1;tick;@(negedge clk);ack=0;
    expect_dir(2,0,0,1,0,1,1,1); // M1
    consume_rsp;
    request(0,1);expect_dir(2,0,2,1,1,0,0,0); // M owner transfer
    check(!probe_shared,"GETM transfers ownership by invalidation");
    // Reset while all three stateful modules hold real work.
    @(negedge clk);iv=1;idata=8'h55;issue=1;reads=0;writes=8'h80;complete=0;
    tick;check(count==1 && busy_regs==8'h80,"live state exists before reset");
    @(negedge clk);rst=1;tick;
    check(dir_state==0 && sharers==0 && !dir_busy&&!rsp_v,"reset cancels the pedagogical transaction");
    check(count==0&&busy_regs==0,"reset clears FIFO and scoreboard");
    @(negedge clk);rst=0;iv=0;issue=0;
    request(0,1);expect_dir(2,0,0,0,0,1,0,1); // U -> M0 needs no probe
    consume_rsp;
    request(0,1);expect_dir(2,0,0,0,0,1,0,1); // owner repeats GETM
    consume_rsp;
    @(negedge clk);rst=1;tick;@(negedge clk);rst=0;
    request(1,0);expect_dir(1,2,0,0,0,1,1,0); // sole sharer
    consume_rsp;
    request(1,1);expect_dir(2,0,0,1,0,1,1,1); // sole-sharer upgrade needs no probe
    @(negedge clk);rst=1;tick;
    check(dir_state==0&&!rsp_v&&!dir_busy,"reset removes a held response");
    $display("DIRECTORY_PASS directed=%0d",dir_checks);
    $display("ALL_PASS");$finish;
  end
  initial begin #100000;$fatal(1,"watchdog");end
endmodule
