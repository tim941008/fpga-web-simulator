module signal_64bit (
    input  wire        CLOCK_50,
    input  wire [0:0]  KEY,
    output reg  [63:0] wide_out
);
    always @(posedge CLOCK_50) begin
        if (KEY[0])
            wide_out <= 64'h8000_0000_0000_0001;
        else
            wide_out <= wide_out + 64'd1;
    end
endmodule
