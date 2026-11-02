// Original teaching RTL (MIT), NOT Gemmini, MESI, or TileLink RTL.
// Two clients, one implicit line, permission metadata only, one transaction.
// Clients truthfully ACK a received probe after giving up conflicting rights.
// No address, cache-line data, dirty forwarding, transaction epoch or timeout.
// Therefore late ACKs from a previous completed transaction are OUT OF CONTRACT.
module learn_directory(
  input logic clk, rst,
  input logic req_valid, output logic req_ready,
  input logic req_client, req_write,
  output logic probe_valid, input logic probe_ready,
  output logic probe_client, probe_invalidate,
  input logic ack_valid, ack_client,
  output logic resp_valid, input logic resp_ready,
  output logic resp_client, resp_write,
  output logic [1:0] stable_state, sharers, pending_debug, sent_debug,
  output logic owner, busy
);
  localparam [1:0] U=0, S=1, M=2;
  localparam [1:0] IDLE=0, WAIT_ACK=1, RESP=2;
  logic [1:0] phase, pending, sent;
  logic client_q, write_q;
  logic [1:0] request_bit, targets, unsent, fired_mask, ack_mask;
  logic [1:0] pending_next;
  assign request_bit = req_client ? 2'b10 : 2'b01;
  always_comb begin
    targets = 2'b00;
    if (req_write) begin
      if (stable_state == S) targets = sharers & ~request_bit;
      else if (stable_state == M && owner != req_client)
        targets = owner ? 2'b10 : 2'b01;
    end else if (stable_state == M && owner != req_client)
      targets = owner ? 2'b10 : 2'b01;
  end
  assign req_ready = phase == IDLE;
  assign busy = phase != IDLE;
  assign unsent = pending & ~sent;
  assign probe_valid = phase == WAIT_ACK && |unsent;
  assign probe_client = !unsent[0];
  assign probe_invalidate = write_q;
  assign fired_mask = probe_valid && probe_ready ? (probe_client ? 2'b10 : 2'b01) : 2'b00;
  // Permit an ACK on the same edge as that client's probe handshake.
  assign ack_mask = ack_valid ? (ack_client ? 2'b10 : 2'b01) : 2'b00;
  assign pending_next = pending & ~(ack_mask & (sent | fired_mask));
  assign pending_debug = pending;
  assign sent_debug = sent;
  assign resp_valid = phase == RESP;
  assign resp_client = client_q;
  assign resp_write = write_q;
  always_ff @(posedge clk) begin
    if (rst) begin
      phase <= IDLE; stable_state <= U; sharers <= 0; owner <= 0;
      pending <= 0; sent <= 0; client_q <= 0; write_q <= 0;
    end else begin
      case (phase)
        IDLE: if (req_valid) begin
          client_q <= req_client; write_q <= req_write;
          pending <= targets; sent <= 0;
          phase <= |targets ? WAIT_ACK : RESP;
        end
        WAIT_ACK: begin
          sent <= sent | fired_mask;
          pending <= pending_next;
          if (pending_next == 0) phase <= RESP;
        end
        RESP: if (resp_ready) begin
          if (write_q) begin
            stable_state <= M; owner <= client_q;
            sharers <= client_q ? 2'b10 : 2'b01;
          end else if (stable_state == M && owner == client_q) begin
            // Existing owner retains exclusive permission.
            stable_state <= M;
          end else begin
            stable_state <= S;
            sharers <= sharers | (client_q ? 2'b10 : 2'b01);
          end
          phase <= IDLE;
        end
        default: phase <= IDLE;
      endcase
    end
  end
endmodule
