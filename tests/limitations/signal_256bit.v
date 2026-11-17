module signal_256bit (
    input  wire [7:0]   SW,
    output wire [255:0] matrix_flat
);
    assign matrix_flat = {32{SW}};
endmodule
