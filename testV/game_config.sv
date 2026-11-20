package game_config;

	// Players
	localparam logic PLAYER_1 = 1'b0;
	localparam logic PLAYER_2 = 1'b1;
	 
	// Board
	localparam int BOARD_ROWS = 16;
	localparam int BOARD_COLS = 16;

	localparam int valid = 1;
	localparam int invalid = 0;
	
	// FSM states
    localparam logic [1:0] SELECT_STATE = 2'd0;
    localparam logic [1:0] MOVE_STATE   = 2'd1;
    localparam logic [1:0] WALL_STATE   = 2'd2;
    localparam logic [1:0] NEXT_TURN    = 2'd3;

endpackage

// 其他檔案要加import game_config::*;在前面
