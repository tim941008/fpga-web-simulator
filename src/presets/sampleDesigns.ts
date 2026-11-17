export interface SamplePreset {
  id: string;
  name: string;
  description: string;
  verilogFilename: string;
  verilogCode: string;
  qsfFilename: string;
  qsfContent: string;
}

export const SAMPLE_PRESETS: SamplePreset[] = [
  {
    id: 'full-demo',
    name: 'DE10-Lite Complete Suite (Counter + 7-Seg + 16x16 Matrix)',
    description:
      'Combines combinational switch logic, sequential counter on HEX0/HEX1, push-button reset/enable, and a 16x16 scanned LED Matrix display.',
    verilogFilename: 'top_fpga_demo.v',
    verilogCode: `// ============================================================================
// Top-Level FPGA Demo: Combinational + Sequential + 7-Seg + 16x16 LED Matrix
// ============================================================================
module top_fpga_demo (
    input  wire        CLOCK_50,
    input  wire [3:0]  KEY,
    input  wire [9:0]  SW,
    output wire [9:0]  LEDR,
    output reg  [6:0]  HEX0,
    output reg  [6:0]  HEX1,
    output wire [15:0] MATRIX_ROW,
    output reg  [15:0] MATRIX_COL
);

    // 8-bit sequential counter & 4-bit row scanner for the 16x16 LED matrix
    reg [7:0] counter;
    reg [3:0] scan_row;

    // Combinational logic: mirror switches XORed with counter onto LEDR
    assign LEDR[7:0] = SW[7:0] ^ counter;
    assign LEDR[9:8] = SW[9:8] ^ {KEY[1], KEY[0]};

    // One-hot active row driver for 16x16 LED matrix
    assign MATRIX_ROW = 16'd1 << scan_row;

    // Sequential logic: triggered on rising edge of CLOCK_50
    always @(posedge CLOCK_50) begin
        if (KEY[0]) begin
            counter  <= 8'd0;
            scan_row <= 4'd0;
        end else begin
            scan_row <= scan_row + 4'd1;
            if (!KEY[1]) begin
                counter <= counter + (SW[8] ? 8'd2 : 8'd1);
            end
        end
    end

    // Combinational 16x16 LED Matrix pattern generator (SW[9] selects mode)
    always @(*) begin
        if (SW[9]) begin
            // Smiley / Icon Frame mixed with SW[7:0]
            case (scan_row)
                4'd0:  MATRIX_COL = 16'b0000011111100000;
                4'd1:  MATRIX_COL = 16'b0001100000011000;
                4'd2:  MATRIX_COL = 16'b0010000000000100;
                4'd3:  MATRIX_COL = 16'b0100011001100010;
                4'd4:  MATRIX_COL = 16'b0100011001100010;
                4'd5:  MATRIX_COL = 16'b1000000000000001;
                4'd6:  MATRIX_COL = 16'b1000000110000001;
                4'd7:  MATRIX_COL = 16'b1000000110000001;
                4'd8:  MATRIX_COL = 16'b1001000000001001;
                4'd9:  MATRIX_COL = 16'b1000100000010001;
                4'd10: MATRIX_COL = 16'b0100011111100010;
                4'd11: MATRIX_COL = 16'b0100000000000010;
                4'd12: MATRIX_COL = 16'b0010000000000100;
                4'd13: MATRIX_COL = 16'b0001100000011000;
                4'd14: MATRIX_COL = 16'b0000011111100000;
                default: MATRIX_COL = {counter, SW[7:0]};
            endcase
        end else begin
            // Dynamic moving wave + switch mask pattern
            MATRIX_COL = ((16'h00FF << (scan_row[2:0])) ^ {counter, SW[7:0]}) | (16'd1 << scan_row);
        end
    end

    // Active-low 7-segment display decoder for lower nibble (HEX0)
    always @(*) begin
        case (counter[3:0] ^ SW[3:0])
            4'h0: HEX0 = 7'b1000000;
            4'h1: HEX0 = 7'b1111001;
            4'h2: HEX0 = 7'b0100100;
            4'h3: HEX0 = 7'b0110000;
            4'h4: HEX0 = 7'b0011001;
            4'h5: HEX0 = 7'b0010010;
            4'h6: HEX0 = 7'b0000010;
            4'h7: HEX0 = 7'b1111000;
            4'h8: HEX0 = 7'b0000000;
            4'h9: HEX0 = 7'b0010000;
            4'hA: HEX0 = 7'b0001000;
            4'hB: HEX0 = 7'b0000011;
            4'hC: HEX0 = 7'b1000110;
            4'hD: HEX0 = 7'b0100001;
            4'hE: HEX0 = 7'b0000110;
            default: HEX0 = 7'b0001110;
        endcase
    end

    // Active-low 7-segment display decoder for upper nibble (HEX1)
    always @(*) begin
        case (counter[7:4] ^ SW[7:4])
            4'h0: HEX1 = 7'b1000000;
            4'h1: HEX1 = 7'b1111001;
            4'h2: HEX1 = 7'b0100100;
            4'h3: HEX1 = 7'b0110000;
            4'h4: HEX1 = 7'b0011001;
            4'h5: HEX1 = 7'b0010010;
            4'h6: HEX1 = 7'b0000010;
            4'h7: HEX1 = 7'b1111000;
            4'h8: HEX1 = 7'b0000000;
            4'h9: HEX1 = 7'b0010000;
            4'hA: HEX1 = 7'b0001000;
            4'hB: HEX1 = 7'b0000011;
            4'hC: HEX1 = 7'b1000110;
            4'hD: HEX1 = 7'b0100001;
            4'hE: HEX1 = 7'b0000110;
            default: HEX1 = 7'b0001110;
        endcase
    end

endmodule
`,
    qsfFilename: 'top_fpga_demo.qsf',
    qsfContent: `# -------------------------------------------------------------------------- #
# Quartus Prime Settings File (.qsf) - DE10-Lite / MAX 10 Pin Assignments
# -------------------------------------------------------------------------- #
set_global_assignment -name FAMILY "MAX 10"
set_global_assignment -name DEVICE 10M50DAF484C7G
set_global_assignment -name TOP_LEVEL_ENTITY top_fpga_demo

# Clock
set_location_assignment PIN_P11 -to CLOCK_50
set_instance_assignment -name IO_STANDARD "3.3-V LVTTL" -to CLOCK_50

# Push Buttons (KEY)
set_location_assignment PIN_B8  -to KEY[0]
set_location_assignment PIN_A7  -to KEY[1]
set_location_assignment PIN_B9  -to KEY[2]
set_location_assignment PIN_B15 -to KEY[3]

# Slide Switches (SW)
set_location_assignment PIN_C10 -to SW[0]
set_location_assignment PIN_C11 -to SW[1]
set_location_assignment PIN_D12 -to SW[2]
set_location_assignment PIN_C12 -to SW[3]
set_location_assignment PIN_A12 -to SW[4]
set_location_assignment PIN_B12 -to SW[5]
set_location_assignment PIN_A13 -to SW[6]
set_location_assignment PIN_A14 -to SW[7]
set_location_assignment PIN_B14 -to SW[8]
set_location_assignment PIN_F15 -to SW[9]

# Red LEDs (LEDR)
set_location_assignment PIN_A8  -to LEDR[0]
set_location_assignment PIN_A9  -to LEDR[1]
set_location_assignment PIN_A10 -to LEDR[2]
set_location_assignment PIN_B10 -to LEDR[3]
set_location_assignment PIN_D13 -to LEDR[4]
set_location_assignment PIN_C13 -to LEDR[5]
set_location_assignment PIN_E14 -to LEDR[6]
set_location_assignment PIN_D14 -to LEDR[7]
set_location_assignment PIN_A11 -to LEDR[8]
set_location_assignment PIN_B11 -to LEDR[9]

# 7-Segment Display HEX0
set_location_assignment PIN_C14 -to HEX0[0]
set_location_assignment PIN_E15 -to HEX0[1]
set_location_assignment PIN_C15 -to HEX0[2]
set_location_assignment PIN_C16 -to HEX0[3]
set_location_assignment PIN_E16 -to HEX0[4]
set_location_assignment PIN_D17 -to HEX0[5]
set_location_assignment PIN_C17 -to HEX0[6]

# 7-Segment Display HEX1
set_location_assignment PIN_C18 -to HEX1[0]
set_location_assignment PIN_D18 -to HEX1[1]
set_location_assignment PIN_E18 -to HEX1[2]
set_location_assignment PIN_B16 -to HEX1[3]
set_location_assignment PIN_A17 -to HEX1[4]
set_location_assignment PIN_A18 -to HEX1[5]
set_location_assignment PIN_B17 -to HEX1[6]

# 16x16 LED Matrix GPIO Expansion Header
set_location_assignment PIN_V10 -to MATRIX_ROW[0]
set_location_assignment PIN_W10 -to MATRIX_ROW[1]
set_location_assignment PIN_V9  -to MATRIX_ROW[2]
set_location_assignment PIN_W9  -to MATRIX_ROW[3]
set_location_assignment PIN_V8  -to MATRIX_ROW[4]
set_location_assignment PIN_W8  -to MATRIX_ROW[5]
set_location_assignment PIN_V7  -to MATRIX_ROW[6]
set_location_assignment PIN_W7  -to MATRIX_ROW[7]
set_location_assignment PIN_W6  -to MATRIX_ROW[8]
set_location_assignment PIN_V5  -to MATRIX_ROW[9]
set_location_assignment PIN_W5  -to MATRIX_ROW[10]
set_location_assignment PIN_AA15 -to MATRIX_ROW[11]
set_location_assignment PIN_AA14 -to MATRIX_ROW[12]
set_location_assignment PIN_W13 -to MATRIX_ROW[13]
set_location_assignment PIN_W12 -to MATRIX_ROW[14]
set_location_assignment PIN_AB13 -to MATRIX_ROW[15]

set_location_assignment PIN_AB12 -to MATRIX_COL[0]
set_location_assignment PIN_Y11  -to MATRIX_COL[1]
set_location_assignment PIN_AB11 -to MATRIX_COL[2]
set_location_assignment PIN_W11  -to MATRIX_COL[3]
set_location_assignment PIN_AB10 -to MATRIX_COL[4]
set_location_assignment PIN_AA10 -to MATRIX_COL[5]
set_location_assignment PIN_AA9  -to MATRIX_COL[6]
set_location_assignment PIN_Y8   -to MATRIX_COL[7]
set_location_assignment PIN_AA8  -to MATRIX_COL[8]
set_location_assignment PIN_Y7   -to MATRIX_COL[9]
set_location_assignment PIN_AA7  -to MATRIX_COL[10]
set_location_assignment PIN_Y6   -to MATRIX_COL[11]
set_location_assignment PIN_AA6  -to MATRIX_COL[12]
set_location_assignment PIN_Y5   -to MATRIX_COL[13]
set_location_assignment PIN_AA5  -to MATRIX_COL[14]
set_location_assignment PIN_Y4   -to MATRIX_COL[15]
`,
  },
  {
    id: 'comb-alu',
    name: 'Combinational 4-Bit ALU & 7-Segment Display',
    description:
      'Pure combinational logic design: computes A (+, -, &, ^) B from SW[7:0] and KEY[1:0], outputting instantly to LEDR and HEX0.',
    verilogFilename: 'comb_alu.v',
    verilogCode: `module comb_alu (
    input  wire [1:0] KEY,
    input  wire [7:0] SW,
    output wire [7:0] LEDR,
    output reg  [6:0] HEX0
);
    wire [3:0] a = SW[3:0];
    wire [3:0] b = SW[7:4];
    reg  [4:0] result;

    always @(*) begin
        case (KEY)
            2'b00: result = a + b;
            2'b01: result = a - b;
            2'b10: result = {1'b0, a & b};
            default: result = {1'b0, a ^ b};
        endcase
    end

    assign LEDR = {3'b000, result};

    always @(*) begin
        case (result[3:0])
            4'h0: HEX0 = 7'b1000000;
            4'h1: HEX0 = 7'b1111001;
            4'h2: HEX0 = 7'b0100100;
            4'h3: HEX0 = 7'b0110000;
            4'h4: HEX0 = 7'b0011001;
            4'h5: HEX0 = 7'b0010010;
            4'h6: HEX0 = 7'b0000010;
            4'h7: HEX0 = 7'b1111000;
            4'h8: HEX0 = 7'b0000000;
            4'h9: HEX0 = 7'b0010000;
            4'hA: HEX0 = 7'b0001000;
            4'hB: HEX0 = 7'b0000011;
            4'hC: HEX0 = 7'b1000110;
            4'hD: HEX0 = 7'b0100001;
            4'hE: HEX0 = 7'b0000110;
            default: HEX0 = 7'b0001110;
        endcase
    end
endmodule
`,
    qsfFilename: 'comb_alu.qsf',
    qsfContent: `set_global_assignment -name FAMILY "Cyclone V"
set_global_assignment -name DEVICE 5CSEMA5F31C6
set_global_assignment -name TOP_LEVEL_ENTITY comb_alu
set_location_assignment PIN_AA14 -to KEY[0]
set_location_assignment PIN_AA15 -to KEY[1]
set_location_assignment PIN_AB12 -to SW[0]
set_location_assignment PIN_AC12 -to SW[1]
set_location_assignment PIN_AF9  -to SW[2]
set_location_assignment PIN_AF10 -to SW[3]
set_location_assignment PIN_AD11 -to SW[4]
set_location_assignment PIN_AD12 -to SW[5]
set_location_assignment PIN_AE11 -to SW[6]
set_location_assignment PIN_AC9  -to SW[7]
set_location_assignment PIN_V16  -to LEDR[0]
set_location_assignment PIN_W16  -to LEDR[1]
set_location_assignment PIN_V17  -to LEDR[2]
set_location_assignment PIN_V18  -to LEDR[3]
set_location_assignment PIN_W17  -to LEDR[4]
set_location_assignment PIN_W19  -to LEDR[5]
set_location_assignment PIN_Y19  -to LEDR[6]
set_location_assignment PIN_W20  -to LEDR[7]
set_location_assignment PIN_AE26 -to HEX0[0]
set_location_assignment PIN_AE27 -to HEX0[1]
set_location_assignment PIN_AE28 -to HEX0[2]
set_location_assignment PIN_AG27 -to HEX0[3]
set_location_assignment PIN_AF28 -to HEX0[4]
set_location_assignment PIN_AG28 -to HEX0[5]
set_location_assignment PIN_AH28 -to HEX0[6]
`,
  },
];
