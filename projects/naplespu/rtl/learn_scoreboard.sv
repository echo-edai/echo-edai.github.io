// One-context teaching scoreboard. Registers are represented by bit masks.
// No bypass, renaming, WAR tracking, thread banking, or pipeline tag handling.
// Clear and allocation at the same edge: allocation wins, like NaplesPU's
// (scoreboard & ~clear_bitmap) | set_bitmap. Hazards use PRE-edge busy bits.
module learn_scoreboard #(parameter integer REGS = 8) (
    input wire clk, reset,
    input wire issue_valid, resource_ready,
    input wire [REGS-1:0] source_mask, destination_mask,
    input wire [REGS-1:0] wb_clear, rollback_clear,
    output wire hazard_raw, hazard_waw, issue_ready,
    output reg [REGS-1:0] busy
);
    assign hazard_raw = |(source_mask & busy);
    assign hazard_waw = |(destination_mask & busy);
    assign issue_ready = !reset && resource_ready && !hazard_raw && !hazard_waw;
    wire [REGS-1:0] set_mask = destination_mask & {REGS{issue_valid && issue_ready}};
    wire [REGS-1:0] clear_mask = wb_clear | rollback_clear;
    always @(posedge clk) begin
        if (reset) busy <= 0;
        else busy <= (busy & ~clear_mask) | set_mask;
    end
endmodule
