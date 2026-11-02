`timescale 1ns/1ps
// Original control-only educational MSI-like directory. NOT openTPU hardware.
// Exactly one implicit cache line, two clients, at most one transaction.
// ACK means probe processing (and any necessary data writeback) has completed.
// A client holds a probe while its pending bit is high, and ACKs only that probe.
// There is no data/address storage, eviction, packet transport or client cache FSM.
// SPDX-License-Identifier: MIT
module learn_directory (
  input wire clk, rst,
  input wire req_valid,
  output wire req_ready,
  input wire req_client, req_getm,
  output wire [1:0] probe_valid,
  output wire probe_to_shared,
  input wire [1:0] ack,
  output reg rsp_valid,
  input wire rsp_ready,
  output reg rsp_client, rsp_modified,
  output reg [1:0] state,
  output reg [1:0] sharers,
  output reg owner,
  output reg busy
);
  localparam U=2'd0, S=2'd1, M=2'd2;
  reg [1:0] pending, target_state, target_sharers;
  reg target_owner, transaction_client, transaction_getm;
  reg [1:0] targets, next_state, next_sharers;
  reg next_owner;
  wire [1:0] onehot = req_client ? 2'b10 : 2'b01;
  wire [1:0] owner_mask = owner ? 2'b10 : 2'b01;
  wire [1:0] remaining = pending & ~ack;
  assign req_ready = !rst && !busy && !rsp_valid;
  assign probe_valid = (!rst && busy) ? pending : 2'b00;
  assign probe_to_shared = busy && !transaction_getm;
  always @* begin
    targets = 0;
    next_state = state;
    next_sharers = sharers;
    next_owner = owner;
    if (req_getm) begin
      next_state = M; next_sharers = 0; next_owner = req_client;
      if (state == S) targets = sharers & ~onehot;
      else if (state == M && owner != req_client) targets = owner_mask;
    end else begin
      if (state == U) begin next_state = S; next_sharers = onehot; end
      else if (state == S) next_sharers = sharers | onehot;
      else if (owner != req_client) begin
        targets = owner_mask; next_state = S; next_sharers = owner_mask | onehot;
      end
    end
  end
  always @(posedge clk) begin
    if (rst) begin
      state <= U; sharers <= 0; owner <= 0; busy <= 0; pending <= 0;
      rsp_valid <= 0; rsp_client <= 0; rsp_modified <= 0;
      target_state <= U; target_sharers <= 0; target_owner <= 0;
      transaction_client <= 0; transaction_getm <= 0;
    end else begin
      if (rsp_valid && rsp_ready) rsp_valid <= 0;
      if (req_valid && req_ready) begin
        if (targets == 0) begin
          state <= next_state; sharers <= next_sharers; owner <= next_owner;
          rsp_valid <= 1; rsp_client <= req_client; rsp_modified <= next_state == M;
        end else begin
          busy <= 1; pending <= targets;
          target_state <= next_state; target_sharers <= next_sharers; target_owner <= next_owner;
          transaction_client <= req_client; transaction_getm <= req_getm;
        end
      end
      if (busy) begin
        pending <= remaining;
        if (remaining == 0) begin
          state <= target_state; sharers <= target_sharers; owner <= target_owner;
          busy <= 0; rsp_valid <= 1; rsp_client <= transaction_client;
          rsp_modified <= target_state == M;
        end
      end
    end
  end
endmodule
