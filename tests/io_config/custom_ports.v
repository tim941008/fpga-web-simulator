module custom_ports (
    input  wire       sys_pulse,
    input  wire [1:0] ctrl_btns,
    input  wire [7:0] dip_inputs,
    output wire [7:0] red_bar,
    output wire [3:0] green_bar,
    output reg  [6:0] digit_seg,
    output wire [3:0] optional_debug
);
    reg [7:0] cnt;

    always @(posedge sys_pulse) begin
        if (ctrl_btns[0])
            cnt <= 8'd0;
        else if (!ctrl_btns[1])
            cnt <= cnt + 8'd1;
    end

    assign red_bar        = cnt ^ dip_inputs;
    assign green_bar      = cnt[3:0];
    assign optional_debug = cnt[7:4];

    always @(*) begin
        case (cnt[3:0])
            4'h0: digit_seg = 7'b1000000;
            4'h1: digit_seg = 7'b1111001;
            default: digit_seg = 7'b0100100;
        endcase
    end
endmodule
