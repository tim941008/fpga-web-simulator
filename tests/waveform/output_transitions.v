module output_transitions (
    input  wire       CLOCK_50,
    input  wire [0:0] KEY,
    output reg  [3:0] LEDR
);
    always @(posedge CLOCK_50) begin
        if (KEY[0])
            LEDR <= 4'h1;
        else
            LEDR <= {LEDR[2:0], LEDR[3]};
    end
endmodule
