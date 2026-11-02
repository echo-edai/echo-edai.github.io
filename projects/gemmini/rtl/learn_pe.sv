// Original teaching RTL (MIT), not a port-equivalent Gemmini PE.
// Signed INT8 operands; INT32 modulo arithmetic; no scaling or saturation.
// preload has priority; no compute is accepted while preloading.
// mode_ws=0: OS sum=(start?0:sum)+a*b, result updated each valid compute.
// mode_ws=1: result=partial_in+a*weight_reg. preload sets weight_reg.
module learn_pe(
  input logic clk, rst, mode_ws, preload, valid, start,
  input logic signed [7:0] a, b, weight_in,
  input logic signed [31:0] partial_in,
  output logic out_valid,
  output logic signed [31:0] result, os_sum,
  output logic signed [7:0] weight_debug
);
  logic signed [7:0] weight_reg;
  logic signed [15:0] product;
  logic signed [31:0] product_extended, os_next;
  assign product = a * (mode_ws ? weight_reg : b);
  assign product_extended = {{16{product[15]}}, product};
  assign os_next = (start ? 32'sd0 : os_sum) + product_extended;
  assign weight_debug = weight_reg;
  always_ff @(posedge clk) begin
    if (rst) begin
      weight_reg <= '0; os_sum <= '0; result <= '0; out_valid <= 1'b0;
    end else begin
      out_valid <= 1'b0;
      if (preload) weight_reg <= weight_in;
      else if (valid) begin
        out_valid <= 1'b1;
        if (mode_ws) result <= partial_in + product_extended;
        else begin result <= os_next; os_sum <= os_next; end
      end
    end
  end
endmodule
