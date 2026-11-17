module fsm_4state (
    input  wire       CLOCK_50,
    input  wire [0:0] KEY,
    input  wire [0:0] SW,
    output reg  [3:0] LEDR
);
    localparam [1:0] S0 = 2'd0,
                     S1 = 2'd1,
                     S2 = 2'd2,
                     S3 = 2'd3;

    reg [1:0] state;

    always @(posedge CLOCK_50) begin
        if (KEY[0])
            state <= S0;
        else if (SW[0]) begin
            case (state)
                S0: state <= S1;
                S1: state <= S2;
                S2: state <= S3;
                default: state <= S0;
            endcase
        end
    end

    always @(*) begin
        LEDR = 4'b0001 << state;
    end
endmodule
