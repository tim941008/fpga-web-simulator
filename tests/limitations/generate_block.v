module generate_block (
    input  wire [7:0] SW,
    output wire [7:0] LEDR
);
    genvar i;
    generate
        for (i = 0; i < 8; i = i + 1) begin : gen_inv
            assign LEDR[i] = ~SW[i];
        end
    endgenerate
endmodule
