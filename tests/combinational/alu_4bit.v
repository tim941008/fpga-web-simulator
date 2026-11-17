module alu_4bit (
    input  wire [1:0] KEY,
    input  wire [7:0] SW,
    output reg  [4:0] LEDR
);
    wire [3:0] a = SW[3:0];
    wire [3:0] b = SW[7:4];

    always @(*) begin
        case (KEY)
            2'b00: LEDR = a + b;
            2'b01: LEDR = a - b;
            2'b10: LEDR = {1'b0, a & b};
            default: LEDR = {1'b0, a ^ b};
        endcase
    end
endmodule
