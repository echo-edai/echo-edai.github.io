`timescale 1ns/1ps
// Original educational routing function, not a router and not openTPU hardware.
// Coordinate y increases southward. Equal coordinates eject to LOCAL.
// SPDX-License-Identifier: MIT
module learn_xy_route #(parameter integer CW = 2) (
  input wire [CW-1:0] cx, cy, dx, dy,
  output reg [2:0] port
);
  localparam LOCAL=3'd0, EAST=3'd1, WEST=3'd2, SOUTH=3'd3, NORTH=3'd4;
  always_comb begin
    if (dx > cx) port = EAST;
    else if (dx < cx) port = WEST;
    else if (dy > cy) port = SOUTH;
    else if (dy < cy) port = NORTH;
    else port = LOCAL;
  end
endmodule
