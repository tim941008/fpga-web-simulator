import { HardwareConfigSchema } from '../types/hardwareConfig';
import {
  createCombAluHardwareConfig,
  createFullDemoHardwareConfig,
} from '../config/defaultHardwareConfig';

export interface SamplePreset {
  id: string;
  name: string;
  description: string;
  verilogFilename: string;
  verilogCode: string;
  createHardwareConfig: () => HardwareConfigSchema;
}

export const SAMPLE_PRESETS: SamplePreset[] = [
  {
    id: 'full-demo',
    name: 'Complete FPGA Suite (Counter + 7-Seg + 16x16 Matrix)',
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
    createHardwareConfig: createFullDemoHardwareConfig,
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
    createHardwareConfig: createCombAluHardwareConfig,
  },
];
