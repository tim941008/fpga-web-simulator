module dff (
    input  wire       CLOCK_50,
    input  wire [0:0] KEY,
    input  wire [0:0] SW,
    output reg  [0:0] LEDR
);
    always @(posedge CLOCK_50) begin
        if (KEY[0])
            LEDR[0] <= 1'b0;
        else
            LEDR[0] <= SW[0];
    end
endmodule
