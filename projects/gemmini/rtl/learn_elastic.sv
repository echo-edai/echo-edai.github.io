// Original teaching RTL (MIT), not Gemmini upstream RTL.
// One stored item; one-cycle data latency; combinational ready return path.
module learn_elastic #(parameter integer W=32)(
  input logic clk, rst,
  input logic in_valid, output logic in_ready, input logic [W-1:0] in_data,
  output logic out_valid, input logic out_ready, output logic [W-1:0] out_data
);
  logic full;
  logic [W-1:0] data;
  assign in_ready = !full || out_ready;
  assign out_valid = full;
  assign out_data = data;
  always_ff @(posedge clk) begin
    if (rst) begin full <= 1'b0; data <= '0; end
    else if (in_ready) begin
      full <= in_valid;
      if (in_valid) data <= in_data;
    end
  end
endmodule
