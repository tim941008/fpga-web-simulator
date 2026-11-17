module matrix_scanned (
    input  wire        CLOCK_50,
    input  wire [0:0]  KEY,
    output wire [15:0] MATRIX_ROW,
    output wire [15:0] MATRIX_COL
);
    reg [3:0] row_idx;

    always @(posedge CLOCK_50) begin
        if (KEY[0])
            row_idx <= 4'd0;
        else
            row_idx <= row_idx + 4'd1;
    end

    assign MATRIX_ROW = 16'd1 << row_idx;
    assign MATRIX_COL = 16'h8000 >> row_idx;
endmodule
