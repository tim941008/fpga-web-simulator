import game_config::*;

module game(
    input clk,
    output wire [0:15] row, col
);

	reg [3:0] p1_row, p1_col, p2_row, p2_col;
	reg [3:0] wall_x, wall_y;
	reg wall_dir;
	reg turn;
	reg [0:15] board [0:15];
	wire blink;
	wire [0:15] led [0:15];

	initial begin
		turn = PLAYER_1;
		p1_row = 4'd2;
		p1_col = 4'd7;
		p2_row = 4'd13;
		p2_col = 4'd8;
		board[0]  = 16'b1111111111111111;
		board[1]  = 16'b1111111111111111;
		board[2]  = 16'b1000000100000011;
		board[3]  = 16'b1000000000000001;
		board[4]  = 16'b1000000000000001;
		board[5]  = 16'b1000000000000001;
		board[6]  = 16'b1000000000000001;
		board[7]  = 16'b1000000000000001;
		board[8]  = 16'b1000000000000001;
		board[9]  = 16'b1000000000000001;
		board[10] = 16'b1000000000000001;
		board[11] = 16'b1000000000000001;
		board[12] = 16'b1000000000000001;
		board[13] = 16'b1000000010000001;
		board[14] = 16'b1111111111111111;
		board[15] = 16'b1111111111111111;
	end

	game_display game_display_1(
		.clk(clk),
		.p1_row(p1_row),
		.p1_col(p1_col),
		.p2_row(p2_row),
		.p2_col(p2_col),
		.board(board),
		.row(row),
		.col(col),
		.turn(turn)
	);
endmodule
