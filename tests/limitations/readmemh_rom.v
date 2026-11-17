module readmemh_rom (
    input  wire [1:0] SW,
    output wire [7:0] LEDR
);
    reg [7:0] rom [0:3];

    initial begin
        $readmemh("rom_init.hex", rom);
    end

    assign LEDR = rom[SW];
endmodule
