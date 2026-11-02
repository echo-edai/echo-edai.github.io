// Teaching prototype, independently authored. Not a NaplesPU replacement.
// Contract: transfer only on valid && ready at the rising edge.
// Deliberate policy: no bypass and no push on a pre-edge-full FIFO, even if
// a pop happens on that edge. This is simple but costs one refill opportunity.
module learn_fifo #(
    parameter integer WIDTH = 8,
    parameter integer DEPTH = 4,
    parameter integer PW = $clog2(DEPTH),
    parameter integer CW = $clog2(DEPTH + 1)
) (
    input  wire clk, reset,
    input  wire in_valid,
    output wire in_ready,
    input  wire [WIDTH-1:0] in_data,
    output wire out_valid,
    input  wire out_ready,
    output wire [WIDTH-1:0] out_data,
    output reg [CW-1:0] count
);
    reg [WIDTH-1:0] mem [0:DEPTH-1];
    reg [PW-1:0] head, tail;
    wire push = in_valid && in_ready;
    wire pop  = out_valid && out_ready;
    assign in_ready  = !reset && count < DEPTH;
    assign out_valid = !reset && count != 0;
    assign out_data  = mem[head]; // meaningful only while out_valid=1

    initial begin
        if (DEPTH < 2 || (DEPTH & (DEPTH-1)) != 0)
            $fatal(1, "DEPTH must be a power of two >= 2");
    end
    always @(posedge clk) begin
        if (reset) begin
            head <= 0;
            tail <= 0;
            count <= 0;
        end else begin
            if (push) begin
                mem[tail] <= in_data;
                tail <= tail + 1'b1;
            end
            if (pop) head <= head + 1'b1;
            case ({push, pop})
                2'b10: count <= count + 1'b1;
                2'b01: count <= count - 1'b1;
                default: count <= count;
            endcase
        end
    end
endmodule
