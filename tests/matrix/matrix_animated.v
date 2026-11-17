module matrix_animated (
    input  wire        CLOCK_50,
    input  wire [0:0]  KEY,
    output wire [15:0] MATRIX_ROW,
    output wire [15:0] MATRIX_COL
);
    reg [3:0] row_idx;
    reg [3:0] frame_shift;

    always @(posedge CLOCK_50) begin
        if (KEY[0]) begin
            row_idx     <= 4'd0;
            frame_shift <= 4'd0;
        end else begin
            row_idx <= row_idx + 4'd1;
            if (row_idx == 4'd15)
                frame_shift <= frame_shift + 4'd1;
        end
    end

    assign MATRIX_ROW = 16'd1 << row_idx;
    assign MATRIX_COL = 16'h000F << ((row_idx + frame_shift) & 4'hC);
endmodule
