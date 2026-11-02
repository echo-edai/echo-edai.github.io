`timescale 1ns/1ps
// Original educational register scoreboard, not openTPU's range scoreboard.
// A producer must report each destination exactly once; no speculative cancellation.
// Completion is visible to issue in the next cycle (there is no same-cycle bypass).
// SPDX-License-Identifier: MIT
module learn_scoreboard #(parameter integer N = 8) (
  input wire clk, rst,
  input wire issue_valid,
  input wire [N-1:0] reads, writes,
  input wire [N-1:0] complete,
  output wire issue_ready,
  output reg [N-1:0] busy
);
  assign issue_ready = !rst && ((busy & (reads | writes)) == 0);
  always @(posedge clk) begin
    if (rst) busy <= 0;
    else busy <= (busy & ~complete) | ((issue_valid && issue_ready) ? writes : {N{1'b0}});
  end
endmodule
