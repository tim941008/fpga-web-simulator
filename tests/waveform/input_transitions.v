module input_transitions (
    input  wire [1:0] SW,
    output wire [1:0] LEDR
);
    assign LEDR = SW;
endmodule
