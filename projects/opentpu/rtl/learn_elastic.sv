`timescale 1ns/1ps
// Original educational example, not an openTPU module. SPDX-License-Identifier: MIT
// A two-entry synchronous FIFO; no combinational bypass and no full-cycle replacement.
module learn_elastic #(parameter integer W = 8) (
  input wire clk, rst,
  input wire in_valid,
  output wire in_ready,
  input wire [W-1:0] in_data,
  output wire out_valid,
  input wire out_ready,
  output wire [W-1:0] out_data,
  output reg [1:0] occupancy
);
  reg [W-1:0] mem [0:1];
  reg head, tail;
  wire put = in_valid && in_ready;
  wire pop = out_valid && out_ready;
  assign in_ready = !rst && occupancy < 2;
  assign out_valid = !rst && occupancy != 0;
  assign out_data = mem[head];
  always @(posedge clk) begin
    if (rst) begin
      occupancy <= 0;
      head <= 0;
      tail <= 0;
    end else begin
      if (put) begin mem[tail] <= in_data; tail <= !tail; end
      if (pop) head <= !head;
      case ({put, pop})
        2'b10: occupancy <= occupancy + 1'b1;
        2'b01: occupancy <= occupancy - 1'b1;
        default: occupancy <= occupancy;
      endcase
    end
  end
endmodule
