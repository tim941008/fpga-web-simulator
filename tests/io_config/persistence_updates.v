module persistence_updates (
    input  wire       clk_in,
    input  wire [3:0] sw_in,
    output wire [3:0] led_out
);
    assign led_out = sw_in ^ {4{clk_in}};
endmodule
