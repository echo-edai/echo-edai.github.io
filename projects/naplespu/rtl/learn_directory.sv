// Permission-only teaching controller: TWO clients, ONE line, ONE transaction.
// No address, payload, L2 tag/data RAM, replacement, dirty writeback or network.
// A probe ACK abstracts all required owner data/downgrade/invalidation work.
// Real integration MUST transport/validate data and preserve its latest value.
// Every output handshake remains stable until consumed. A second request is
// blocked while probe/ACK/response is outstanding. Unknown ACK is not consumed.
module learn_directory (
    input wire clk, reset,
    input wire req_valid, req_core, req_write,
    output wire req_ready,
    output wire probe_valid, probe_core, probe_downgrade,
    input wire probe_ready,
    input wire ack_valid, ack_core,
    output wire ack_ready,
    output wire resp_valid, resp_core, resp_modified,
    input wire resp_ready,
    output reg [1:0] permission, sharers,
    output reg owner,
    output reg [1:0] phase
);
    localparam [1:0] I=0, S=1, M=2;
    localparam [1:0] IDLE=0, PROBE=1, WAIT_ACK=2, RESP=3;
    reg pending_core, pending_write, target;
    wire [1:0] requester = req_core ? 2'b10 : 2'b01;
    wire [1:0] pending_requester = pending_core ? 2'b10 : 2'b01;
    wire [1:0] others = sharers & ~requester;
    assign req_ready = !reset && phase == IDLE;
    assign probe_valid = !reset && phase == PROBE;
    assign probe_core = target;
    assign probe_downgrade = !pending_write;
    assign ack_ready = !reset && phase == WAIT_ACK && ack_core == target;
    assign resp_valid = !reset && phase == RESP;
    assign resp_core = pending_core;
    assign resp_modified = permission == M;

    always @(posedge clk) begin
        if (reset) begin
            permission <= I; sharers <= 0; owner <= 0; phase <= IDLE;
            pending_core <= 0; pending_write <= 0; target <= 0;
        end else case (phase)
            IDLE: if (req_valid && req_ready) begin
                pending_core <= req_core;
                pending_write <= req_write;
                if ((req_write && |others) ||
                    (!req_write && permission == M && owner != req_core)) begin
                    target <= !req_core; // exactly one other client in this model
                    phase <= PROBE;
                end else begin
                    if (req_write) begin
                        permission <= M; owner <= req_core; sharers <= requester;
                    end else if (permission != M) begin
                        permission <= S; sharers <= sharers | requester;
                    end
                    phase <= RESP;
                end
            end
            PROBE: if (probe_valid && probe_ready) phase <= WAIT_ACK;
            WAIT_ACK: if (ack_valid && ack_ready) begin
                if (pending_write) begin
                    permission <= M;
                    owner <= pending_core;
                    sharers <= pending_requester;
                end else begin
                    permission <= S;
                    sharers <= sharers | pending_requester;
                end
                phase <= RESP;
            end
            RESP: if (resp_valid && resp_ready) phase <= IDLE;
            default: phase <= IDLE;
        endcase
    end
endmodule
