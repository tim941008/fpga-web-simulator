module duplicate_conflicts (
    input  wire [1:0] btn_a,
    input  wire [1:0] btn_b,
    output wire [3:0] led_a,
    output wire [3:0] led_b,
    output wire [15:0] mat_r
);
    assign led_a = {btn_a, btn_b};
    assign led_b = {btn_b, btn_a};
    assign mat_r = {12'd0, led_a};
endmodule
