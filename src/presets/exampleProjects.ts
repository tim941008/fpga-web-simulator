/**
 * Multi-file example projects (Phase C.1). Each example provides a tailored
 * HardwareConfig matching its exact top-module ports via `createBoardConfigForSignals`.
 */
import { HardwareConfigSchema } from '../types/hardwareConfig';
import { createBoardConfigForSignals } from '../config/defaultHardwareConfig';

export interface ExampleProject {
  id: string;
  name: string;
  topModule: string;
  files: Array<{ name: string; content: string }>;
  createHardwareConfig: () => HardwareConfigSchema;
}

const counterV = `module counter #(parameter W = 8) (
    input  wire         clk,
    input  wire         rst,
    output reg  [W-1:0] count
);
    always @(posedge clk) begin
        if (rst) count <= {W{1'b0}};
        else     count <= count + 1'b1;
    end
endmodule
`;

export const EXAMPLE_PROJECTS: ExampleProject[] = [
  {
    id: 'ex1-sw-led',
    name: 'Example 1: SW to LED (2 files)',
    topModule: 'top_sw_led',
    createHardwareConfig: () =>
      createBoardConfigForSignals('Multi-File Example — SW to LED', ['SW', 'LEDR']),
    files: [
      {
        name: 'top_sw_led.v',
        content: `module top_sw_led (
    input  wire [9:0] SW,
    output wire [9:0] LEDR
);
    sw_buffer u_buf (.din(SW), .dout(LEDR));
endmodule
`,
      },
      {
        name: 'sw_buffer.v',
        content: `module sw_buffer (
    input  wire [9:0] din,
    output wire [9:0] dout
);
    assign dout = din;
endmodule
`,
      },
    ],
  },
  {
    id: 'ex2-counter',
    name: 'Example 2: Counter (2 files)',
    topModule: 'top_counter',
    createHardwareConfig: () =>
      createBoardConfigForSignals('Multi-File Example — Counter', [
        'CLOCK_50',
        'KEY',
        'LEDR',
      ]),
    files: [
      {
        name: 'top_counter.v',
        content: `module top_counter (
    input  wire       CLOCK_50,
    input  wire [3:0] KEY,
    output wire [9:0] LEDR
);
    wire [9:0] cnt;
    counter #(.W(10)) u_cnt (.clk(CLOCK_50), .rst(KEY[0]), .count(cnt));
    assign LEDR = cnt;
endmodule
`,
      },
      { name: 'counter.v', content: counterV },
    ],
  },
  {
    id: 'ex3-sevenseg',
    name: 'Example 3: Seven-Segment Decoder (3 files)',
    topModule: 'top_hex',
    createHardwareConfig: () =>
      createBoardConfigForSignals('Multi-File Example — Seven-Segment Decoder', [
        'CLOCK_50',
        'KEY',
        'HEX0',
      ]),
    files: [
      {
        name: 'top_hex.v',
        content: `module top_hex (
    input  wire       CLOCK_50,
    input  wire [3:0] KEY,
    output wire [6:0] HEX0
);
    wire [3:0] cnt;
    counter #(.W(4)) u_cnt (.clk(CLOCK_50), .rst(KEY[0]), .count(cnt));
    sevenseg u_dec (.value(cnt), .seg(HEX0));
endmodule
`,
      },
      { name: 'counter.v', content: counterV },
      {
        name: 'sevenseg.v',
        content: `// Active-low segments {g,f,e,d,c,b,a}
module sevenseg (
    input  wire [3:0] value,
    output reg  [6:0] seg
);
    always @(*) begin
        case (value)
            4'h0: seg = 7'b1000000;
            4'h1: seg = 7'b1111001;
            4'h2: seg = 7'b0100100;
            4'h3: seg = 7'b0110000;
            4'h4: seg = 7'b0011001;
            4'h5: seg = 7'b0010010;
            4'h6: seg = 7'b0000010;
            4'h7: seg = 7'b1111000;
            4'h8: seg = 7'b0000000;
            4'h9: seg = 7'b0010000;
            4'ha: seg = 7'b0001000;
            4'hb: seg = 7'b0000011;
            4'hc: seg = 7'b1000110;
            4'hd: seg = 7'b0100001;
            4'he: seg = 7'b0000110;
            default: seg = 7'b0001110;
        endcase
    end
endmodule
`,
      },
    ],
  },
  {
    id: 'ex4-matrix',
    name: 'Example 4: Matrix Demo (3 files)',
    topModule: 'top_matrix',
    createHardwareConfig: () =>
      createBoardConfigForSignals('Multi-File Example — 16×16 Matrix Demo', [
        'CLOCK_50',
        'KEY',
        'MATRIX_ROW',
        'MATRIX_COL',
      ]),
    files: [
      {
        name: 'top_matrix.v',
        content: `module top_matrix (
    input  wire        CLOCK_50,
    input  wire [3:0]  KEY,
    output wire [15:0] MATRIX_ROW,
    output wire [15:0] MATRIX_COL
);
    wire [3:0] row_idx;
    counter #(.W(4)) u_scan (.clk(CLOCK_50), .rst(KEY[0]), .count(row_idx));
    matrix_driver u_drv (.row_idx(row_idx), .row(MATRIX_ROW), .col(MATRIX_COL));
endmodule
`,
      },
      { name: 'counter.v', content: counterV },
      {
        name: 'matrix_driver.v',
        content: `// Diagonal scan: row i lights column 15-i
module matrix_driver (
    input  wire [3:0]  row_idx,
    output wire [15:0] row,
    output wire [15:0] col
);
    assign row = 16'd1 << row_idx;
    assign col = 16'h8000 >> row_idx;
endmodule
`,
      },
    ],
  },
];
