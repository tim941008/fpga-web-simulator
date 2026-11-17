module nibble_adder #(
    parameter WIDTH = 4
) (
    input  wire [WIDTH-1:0] a,
    input  wire [WIDTH-1:0] b,
    output wire [WIDTH:0]   sum
);
    assign sum = a + b;
endmodule

module module_instantiation (
    input  wire [7:0] SW,
    output wire [4:0] LEDR
);
    nibble_adder #(
        .WIDTH(4)
    ) u_add (
        .a   (SW[3:0]),
        .b   (SW[7:4]),
        .sum (LEDR)
    );
endmodule
