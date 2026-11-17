module and_gate (
    input  wire [1:0] SW,
    output wire [0:0] LEDR
);
    assign LEDR[0] = SW[0] & SW[1];
endmodule
