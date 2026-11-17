module signal_65bit (
    input  wire        CLOCK_50,
    input  wire [0:0]  KEY,
    output reg  [64:0] over64_out
);
    always @(posedge CLOCK_50) begin
        if (KEY[0])
            over64_out <= 65'd1;
        else
            over64_out <= {over64_out[63:0], over64_out[64]};
    end
endmodule
