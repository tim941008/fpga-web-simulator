module direction_width_validation (
    input  wire [3:0]  wide_clk,
    input  wire [11:0] wide_sw,
    output wire [3:0]  short_seg,
    output wire [7:0]  seg_with_dp,
    output wire [11:0] narrow_matrix_row
);
    assign short_seg         = wide_clk;
    assign seg_with_dp       = wide_sw[7:0];
    assign narrow_matrix_row = wide_sw;
endmodule
