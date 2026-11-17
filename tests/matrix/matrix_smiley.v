module matrix_smiley (
    input  wire [3:0]  SW,
    output wire [15:0] MATRIX_ROW,
    output reg  [15:0] MATRIX_COL
);
    assign MATRIX_ROW = 16'd1 << SW;

    always @(*) begin
        case (SW)
            4'd0:  MATRIX_COL = 16'h07E0;
            4'd1:  MATRIX_COL = 16'h1818;
            4'd2:  MATRIX_COL = 16'h2004;
            4'd3:  MATRIX_COL = 16'h4662;
            4'd4:  MATRIX_COL = 16'h4662;
            4'd5:  MATRIX_COL = 16'h8001;
            4'd6:  MATRIX_COL = 16'h8181;
            4'd7:  MATRIX_COL = 16'h8181;
            4'd8:  MATRIX_COL = 16'h9009;
            4'd9:  MATRIX_COL = 16'h8811;
            4'd10: MATRIX_COL = 16'h47E2;
            4'd11: MATRIX_COL = 16'h4002;
            4'd12: MATRIX_COL = 16'h2004;
            4'd13: MATRIX_COL = 16'h1818;
            4'd14: MATRIX_COL = 16'h07E0;
            default: MATRIX_COL = 16'h0000;
        endcase
    end
endmodule
