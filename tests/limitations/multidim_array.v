module multidim_array (
    input  wire       CLOCK_50,
    input  wire [3:0] SW,
    output reg  [7:0] LEDR
);
    reg [7:0] mem2d [0:3][0:3];

    always @(posedge CLOCK_50) begin
        mem2d[SW[3:2]][SW[1:0]] <= {4'hA, SW};
        LEDR <= mem2d[SW[3:2]][SW[1:0]];
    end
endmodule
