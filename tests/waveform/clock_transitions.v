module clock_transitions (
    input  wire       CLOCK_50,
    output reg  [0:0] LEDR
);
    always @(posedge CLOCK_50) begin
        LEDR[0] <= ~LEDR[0];
    end
endmodule
