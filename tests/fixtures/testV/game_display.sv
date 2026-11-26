import game_config::*;

module game_display(
	input clk,
	input turn,
	input [3:0] p1_row, p1_col, p2_row, p2_col,
	input [0:15] board [0:15],
	output wire [0:15] row,
	output wire [0:15] col
);
	wire blink;
	wire [0:15] led [0:15];

	blink_generate #(.COUNT_MAX(8)) blink_generat_1(
		.clk(clk),
		.blink(blink)
	);

	led_display display(
		.clk(clk),
		.led(led),
		.row(row),
		.col(col)
	);

	board_to_led board_to_led_1(
		.clk(clk),
		.turn(turn),
		.board(board),
		.p1_row(p1_row),
		.p1_col(p1_col),
		.p2_row(p2_row),
		.p2_col(p2_col),
		.blink(blink),
		.led(led)
	);
endmodule

module led_display(
	input clk,
	input [0:15] led [0:15],
	output reg [0:15] row,
	output reg [0:15] col
);
	reg [3:0] scan = 0;
	always @(posedge clk) begin
		scan <= scan + 1'b1;
		row <= 16'b1 << scan;
		col <= led[15-scan];
	end
endmodule

module board_to_led(
	input clk, turn,
	input [0:15] board [0:15],
	input [3:0] p1_row, p1_col, p2_row, p2_col,
	input blink,
	output reg [0:15] led [0:15]
);
	integer i, j;
	always @(posedge clk) begin
		for (i = 0; i < 16; i = i + 1) begin
			for (j = 0; j < 16; j = j + 1) begin
				case(turn)
					PLAYER_1: begin
						if ((i == p1_row) && (j == p1_col) || i == 15)
							led[i][j] <= blink;
						else if ((i == p2_row) && (j == p2_col))
							led[i][j] <= ~blink;
						else
							led[i][j] <= board[i][j];
					end
					PLAYER_2: begin
						if ((i == p2_row) && (j == p2_col) || i == 0)
							led[i][j] <= blink;
						else if ((i == p1_row) && (j == p1_col))
							led[i][j] <= ~blink;
						else
							led[i][j] <= board[i][j];
					end
				endcase
			end
		end
	end
endmodule

module blink_generate #(
	parameter COUNT_MAX = 3554430
)(
	input clk,
	output reg blink = 0
);
	reg [24:0] counter = 0;
	always @(posedge clk) begin
		if (counter == COUNT_MAX) begin
			counter <= 0;
			blink <= ~blink;
		end else begin
			counter <= counter + 1'b1;
		end
	end
endmodule
