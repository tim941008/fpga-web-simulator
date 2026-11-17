module counter_8bit (
    input  wire       CLOCK_50,
    input  wire [0:0] KEY,
    input  wire [0:0] SW,
    output reg  [7:0] LEDR
);
    always @(posedge CLOCK_50) begin
        if (KEY[0])
            LEDR <= 8'd0;
        else if (SW[0])
            LEDR <= LEDR + 8'd1;
    end
endmodule
