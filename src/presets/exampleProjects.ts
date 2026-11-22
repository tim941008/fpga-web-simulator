/**
 * Multi-file example projects (Phase C.1). Each example provides a tailored
 * HardwareConfig matching its exact top-module ports via `createBoardConfigForSignals`.
 */
import { HardwareConfigSchema } from '../types/hardwareConfig';
import {
  createBoardConfigForSignals,
  createLcdHelloWorldHardwareConfig,
} from '../config/defaultHardwareConfig';

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
  {
    id: 'ex5-lcd-hello',
    name: 'Example 5: LCD Hello World (2 files)',
    topModule: 'top_lcd_hello',
    createHardwareConfig: createLcdHelloWorldHardwareConfig,
    files: [
      {
        name: 'top_lcd_hello.v',
        content: `module top_lcd_hello (
    input  wire       CLOCK_50,
    input  wire       rst,
    output wire [7:0] data,
    output wire       rs,
    output wire       rw,
    output wire       en
);
    lcd_hello_ctrl u_lcd (
        .clk(CLOCK_50),
        .rst(rst),
        .data(data),
        .rs(rs),
        .rw(rw),
        .en(en)
    );
endmodule
`,
      },
      {
        name: 'lcd_hello_ctrl.v',
        content: `// HD44780 16x2 Character LCD Hello World Controller
module lcd_hello_ctrl (
    input  wire       clk,
    input  wire       rst,
    output reg  [7:0] data = 8'h00,
    output reg        rs   = 1'b0,
    output wire       rw,
    output reg        en   = 1'b0
);
    assign rw = 1'b0; // Write-only mode

    reg [5:0] idx   = 6'd0;
    reg       phase = 1'b0; // 0: setup + EN=1, 1: EN=0 (falling-edge latch)

    localparam [5:0] TOTAL_WRITES = 6'd33;

    function [8:0] rom_entry;
        input [5:0] k;
        begin
            case (k)
                // Init commands (RS=0)
                6'd0:  rom_entry = {1'b0, 8'h38}; // Function set: 8-bit, 2-line
                6'd1:  rom_entry = {1'b0, 8'h0C}; // Display ON, cursor OFF
                6'd2:  rom_entry = {1'b0, 8'h06}; // Entry mode: increment
                6'd3:  rom_entry = {1'b0, 8'h01}; // Clear display
                6'd4:  rom_entry = {1'b0, 8'h80}; // Row 0, Col 0
                // Line 1: "Hello, FPGA!"
                6'd5:  rom_entry = {1'b1, "H"};
                6'd6:  rom_entry = {1'b1, "e"};
                6'd7:  rom_entry = {1'b1, "l"};
                6'd8:  rom_entry = {1'b1, "l"};
                6'd9:  rom_entry = {1'b1, "o"};
                6'd10: rom_entry = {1'b1, ","};
                6'd11: rom_entry = {1'b1, " "};
                6'd12: rom_entry = {1'b1, "F"};
                6'd13: rom_entry = {1'b1, "P"};
                6'd14: rom_entry = {1'b1, "G"};
                6'd15: rom_entry = {1'b1, "A"};
                6'd16: rom_entry = {1'b1, "!"};
                // Line 2 address: 0xC0
                6'd17: rom_entry = {1'b0, 8'hC0};
                // Line 2: "16x2 LCD Ready!"
                6'd18: rom_entry = {1'b1, "1"};
                6'd19: rom_entry = {1'b1, "6"};
                6'd20: rom_entry = {1'b1, "x"};
                6'd21: rom_entry = {1'b1, "2"};
                6'd22: rom_entry = {1'b1, " "};
                6'd23: rom_entry = {1'b1, "L"};
                6'd24: rom_entry = {1'b1, "C"};
                6'd25: rom_entry = {1'b1, "D"};
                6'd26: rom_entry = {1'b1, " "};
                6'd27: rom_entry = {1'b1, "R"};
                6'd28: rom_entry = {1'b1, "e"};
                6'd29: rom_entry = {1'b1, "a"};
                6'd30: rom_entry = {1'b1, "d"};
                6'd31: rom_entry = {1'b1, "y"};
                6'd32: rom_entry = {1'b1, "!"};
                default: rom_entry = {1'b0, 8'h00};
            endcase
        end
    endfunction

    always @(posedge clk) begin
        if (rst) begin
            idx   <= 6'd0;
            phase <= 1'b0;
            en    <= 1'b0;
            rs    <= 1'b0;
            data  <= 8'h00;
        end else if (idx < TOTAL_WRITES) begin
            if (!phase) begin
                {rs, data} <= rom_entry(idx);
                en         <= 1'b1;
                phase      <= 1'b1;
            end else begin
                en    <= 1'b0;
                phase <= 1'b0;
                idx   <= idx + 6'd1;
            end
        end else begin
            en <= 1'b0;
        end
    end
endmodule
`,
      },
    ],
  },
];
