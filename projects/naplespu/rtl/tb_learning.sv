`timescale 1ns/1ps
module tb_learning;
    reg clk=0; always #5 clk=~clk;
    reg reset=1;
    integer checks=0;
    task check(input bit condition, input string message);
        begin checks=checks+1; if (!condition) $fatal(1,"CHECK %0d: %s",checks,message); end
    endtask

    reg fv=0, fr=0; reg [7:0] fd=0;
    wire fi_ready, fo_valid; wire [7:0] fo_data; wire [2:0] fcount;
    learn_fifo f(.clk(clk),.reset(reset),.in_valid(fv),.in_ready(fi_ready),
        .in_data(fd),.out_valid(fo_valid),.out_ready(fr),.out_data(fo_data),.count(fcount));
    task ftick(input bit valid_in, input bit ready_out, input [7:0] data_in);
        begin @(negedge clk);fv=valid_in;fr=ready_out;fd=data_in;@(posedge clk);#1;end
    endtask

    reg sv=0, sr=1; reg [7:0] ss=0, sd=0, sw=0, sk=0;
    wire raw, waw, sready;wire [7:0] busy;
    learn_scoreboard s(.clk(clk),.reset(reset),.issue_valid(sv),.resource_ready(sr),
        .source_mask(ss),.destination_mask(sd),.wb_clear(sw),.rollback_clear(sk),
        .hazard_raw(raw),.hazard_waw(waw),.issue_ready(sready),.busy(busy));
    task stick(input bit valid_in,input bit resource,input [7:0] source_bits,
        input [7:0] dest_bits,input [7:0] wb_bits,input [7:0] rb_bits);
        begin @(negedge clk);sv=valid_in;sr=resource;ss=source_bits;sd=dest_bits;
            sw=wb_bits;sk=rb_bits;@(posedge clk);#1;end
    endtask

    reg qv=0,qc=0,qw=0,pr=0,av=0,ac=0,rr=0;
    wire qr,pv,pc,pd,ar,rv,rc,rm;wire [1:0] perm,sh,phase;wire own;
    learn_directory d(.clk(clk),.reset(reset),.req_valid(qv),.req_core(qc),.req_write(qw),
        .req_ready(qr),.probe_valid(pv),.probe_core(pc),.probe_downgrade(pd),.probe_ready(pr),
        .ack_valid(av),.ack_core(ac),.ack_ready(ar),.resp_valid(rv),.resp_core(rc),
        .resp_modified(rm),.resp_ready(rr),.permission(perm),.sharers(sh),.owner(own),.phase(phase));
    task dtick(input bit valid_req,input bit core_req,input bit write_req,
        input bit probe_accept,input bit valid_ack,input bit core_ack,input bit response_accept);
        begin @(negedge clk);qv=valid_req;qc=core_req;qw=write_req;pr=probe_accept;
            av=valid_ack;ac=core_ack;rr=response_accept;@(posedge clk);#1;end
    endtask

    initial begin
        repeat(2) @(posedge clk);
        @(negedge clk);reset=0;
        #1;check(fcount==0 && !fo_valid,"FIFO reset empty");
        ftick(1,0,10); ftick(1,0,20); ftick(1,0,30); ftick(1,0,40);
        check(fcount==4 && !fi_ready && fo_data==10,"FIFO fill, order, full");
        ftick(1,0,99);check(fcount==4 && fo_data==10,"FIFO full rejects producer");
        ftick(1,1,55);check(fcount==3 && fo_data==20,"Full pop: no simultaneous refill by policy");
        ftick(1,1,50);check(fcount==3 && fo_data==30,"FIFO simultaneous accepted push/pop");
        ftick(0,1,0);check(fo_data==40,"FIFO wrap order 40");
        ftick(0,1,0);check(fo_data==50,"FIFO wrap order 50");
        ftick(0,1,0);check(!fo_valid && fcount==0,"FIFO drains");
        ftick(0,1,0);check(fcount==0,"FIFO empty ignores consumer");
        ftick(0,0,0);

        stick(1,1,0,8,0,0);check(busy==8,"Scoreboard allocate r3");
        stick(1,1,8,16,0,0);check(busy==8 && raw,"RAW blocks issue");
        stick(1,1,0,8,0,0);check(busy==8 && waw,"WAW blocks issue");
        stick(0,1,0,0,8,0);check(busy==0,"WB release");
        stick(1,0,0,16,0,0);check(busy==0 && !sready,"Resource backpressure");
        stick(1,1,0,16,16,0);check(busy==16,"Allocation wins simultaneous clear");
        stick(0,1,0,0,0,16);check(busy==0,"Rollback release");

        dtick(1,0,0,0,0,0,0);check(rv && rc==0 && perm==1 && sh==1,"C0 read grants S");
        dtick(1,1,1,0,0,0,0);check(rv && rc==0 && sh==1 && !qr,"Response stall blocks new request");
        dtick(0,0,0,0,0,0,1);check(qr,"Response consumed");
        dtick(1,1,0,0,0,0,0);check(rv && perm==1 && sh==3,"C1 read shares");
        dtick(0,0,0,0,0,0,1);
        dtick(1,0,1,0,0,0,0);check(pv && pc==1 && !pd && !rv,"Writer sends invalidation to C1");
        dtick(0,0,0,0,0,0,0);check(pv && pc==1 && perm==1 && sh==3,"Probe held stable under backpressure");
        dtick(0,0,0,1,0,0,0);check(phase==2 && !rv,"Accepted probe waits for ACK");
        dtick(1,1,1,0,1,0,0);check(phase==2 && !rv && !qr,"Wrong-core ACK ignored and new request blocked");
        dtick(0,0,0,0,1,1,0);check(rv && rm && perm==2 && own==0 && sh==1,"ACK enables C0 modified grant");
        dtick(0,0,0,0,0,0,1);
        dtick(1,1,0,0,0,0,0);check(pv && pc==0 && pd,"Read of remote M requires owner downgrade probe");
        dtick(0,0,0,1,0,0,0);
        dtick(0,0,0,0,1,0,0);check(rv && !rm && perm==1 && sh==3,"Downgrade ACK restores sharing");
        dtick(0,0,0,0,0,0,1);
        dtick(1,1,1,0,0,0,0);check(pv && pc==0,"Other writer invalidates C0");
        dtick(0,0,0,1,0,0,0);
        dtick(0,0,0,0,1,0,0);check(rv && own==1 && sh==2 && perm==2,"Modified has exactly one owner");
        dtick(0,0,0,0,0,0,1);
        @(negedge clk);reset=1;@(posedge clk);#1;
        check(perm==0 && sh==0 && phase==0 && busy==0 && fcount==0,"Reset clears all teaching state");
        $display("PASS: %0d checks across FIFO, scoreboard and single-line directory",checks);
        $finish;
    end
    initial begin #20000; $fatal(1,"Test timeout");end
endmodule
