module fsm_2state (
    input  wire       CLOCK_50,
    input  wire [0:0] KEY,
    input  wire [0:0] SW,
    output wire [0:0] LEDR
);
    localparam S_IDLE   = 1'b0;
    localparam S_ACTIVE = 1'b1;

    reg state;

    always @(posedge CLOCK_50) begin
        if (KEY[0])
            state <= S_IDLE;
        else begin
            case (state)
                S_IDLE:   state <= SW[0] ? S_ACTIVE : S_IDLE;
                S_ACTIVE: state <= SW[0] ? S_ACTIVE : S_IDLE;
            endcase
        end
    end

    assign LEDR[0] = (state == S_ACTIVE);
endmodule
