package game_config;
	localparam logic PLAYER_1 = 1'b0;
	localparam logic PLAYER_2 = 1'b1;
	localparam int BOARD_ROWS = 16;
	localparam int BOARD_COLS = 16;
	localparam int valid = 1;
	localparam int invalid = 0;
	localparam logic [1:0] SELECT_STATE = 2'd0;
	localparam logic [1:0] MOVE_STATE   = 2'd1;
	localparam logic [1:0] WALL_STATE   = 2'd2;
	localparam logic [1:0] NEXT_TURN    = 2'd3;
endpackage
