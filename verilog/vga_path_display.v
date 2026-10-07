`include "graph_config.vh"
// Scalable version of the supplied vga_path_display interface.
// Node IDs are HEX on-screen. Graph table inputs are decimal.
// path_nodes[0 +: NF_NODE_BITS] is the SOURCE, then the next node, etc.
// Input status signals must be synchronous to clk50; synchronize switches
// and hold multi-bit results stable in your top-level design.
module vga_path_display (
    input clk50, input rst,
    input [`NF_NODE_BITS-1:0] source_node, target_node,
    input [1:0] mode,
    input busy, done, no_path, stopped,
    input [`NF_LEN_BITS-1:0] path_len,
    input [`NF_NODES*`NF_NODE_BITS-1:0] path_nodes,
    input [`NF_NODES-1:0] visited_mask,
    input [`NF_NODE_BITS-1:0] current_node,
    input current_valid,
    output [7:0] VGA_R, VGA_G, VGA_B,
    output VGA_CLK, VGA_HS, VGA_VS, VGA_BLANK_N, VGA_SYNC_N
);
    localparam COLS = 4;
    localparam ROWS = 4;
    localparam CELL_W = 640 / COLS;
    localparam CELL_H = 336 / ROWS;
    localparam SCALE = 3;
    wire [9:0] x, y;
    wire active_video;
    wire [2:0] path_page = 3'd0;
    vga_timing_640x480 TIMING (
        .clk50(clk50), .rst(rst), .pixel_clk(VGA_CLK), .x(x), .y(y),
        .active_video(active_video), .hsync(VGA_HS), .vsync(VGA_VS)
    );
    assign VGA_BLANK_N = active_video;
    assign VGA_SYNC_N = 1'b0;

    // A tiny 3x5 font. Each row is three consecutive bits, top row first.
    function [14:0] glyph;
        input [3:0] digit;
        begin
            case (digit)
                0: glyph=15'b111_101_101_101_111;
                1: glyph=15'b010_110_010_010_111;
                2: glyph=15'b111_001_111_100_111;
                3: glyph=15'b111_001_111_001_111;
                4: glyph=15'b101_101_111_001_001;
                5: glyph=15'b111_100_111_001_111;
                6: glyph=15'b111_100_111_101_111;
                7: glyph=15'b111_001_010_010_010;
                8: glyph=15'b111_101_111_101_111;
                9: glyph=15'b111_101_111_001_111;
                10:glyph=15'b111_101_111_101_101;
                11:glyph=15'b110_101_110_101_110;
                12:glyph=15'b111_100_100_100_111;
                13:glyph=15'b110_101_101_101_110;
                14:glyph=15'b111_100_110_100_111;
                default:glyph=15'b111_100_110_100_100;
            endcase
        end
    endfunction

    function digit_pixel;
        input [3:0] digit;
        input [9:0] px, py;
        input integer ox, oy;
        input integer size;
        integer lx, ly, bit_index;
        reg [14:0] bits;
        begin
            lx = px - ox;
            ly = py - oy;
            bits = glyph(digit);
            bit_index = 0;
            digit_pixel = 1'b0;
            if ((lx >= 0) && (lx < 3*size) &&
                (ly >= 0) && (ly < 5*size)) begin
                bit_index = 14 - ((ly/size)*3 + lx/size);
                digit_pixel = bits[bit_index];
            end
        end
    endfunction

    function node_in_path;
        input [`NF_NODE_BITS-1:0] node;
        input [`NF_NODES*`NF_NODE_BITS-1:0] packed_path;
        input [`NF_LEN_BITS-1:0] length;
        integer i;
        begin
            node_in_path = 1'b0;
            // Fixed bound: synthesized hardware, never an unbounded loop.
            for (i=0; i<`NF_NODES; i=i+1)
                if ((i < length) &&
                    (packed_path[i*`NF_NODE_BITS +: `NF_NODE_BITS] == node))
                    node_in_path = 1'b1;
        end
    endfunction

    reg [23:0] rgb;
    integer column, row, node, ox, oy, cx, cy;
    integer slot, path_index;
    reg [`NF_NODE_BITS-1:0] path_digit;
    reg label_on;
    assign VGA_R = rgb[23:16];
    assign VGA_G = rgb[15:8];
    assign VGA_B = rgb[7:0];

    always @(*) begin
        rgb = 24'h000000;
        column=0; row=0; node=0; ox=0; oy=0; cx=0; cy=0;
        slot=0; path_index=0; path_digit=0; label_on=0;
        if (active_video) begin
            // Status bar: error, stopped, busy, done, idle.
            if (y < 10) begin
                if (no_path) rgb=24'hff2020;
                else if (stopped) rgb=24'hff00ff;
                else if (busy) rgb=24'hff9000;
                else if (done) rgb=24'h00ff40;
                else rgb=24'h505050;
            end
            if ((x>=580) && (x<630) && (y>=15) && (y<25)) begin
                case (mode)
                    0: rgb=24'hffffff; // FAST
                    1: rgb=24'h00ffff; // AUTO
                    2: rgb=24'hff00ff; // STEP
                    default: rgb=24'h800000; // HOLD
                endcase
            end

            // Find the ONE grid cell under this pixel.
            if ((y>=40) && (y<40+ROWS*CELL_H) && (x<COLS*CELL_W)) begin
                column = x / CELL_W;
                row = (y-40) / CELL_H;
                node = row*COLS + column;
                ox = column*CELL_W;
                oy = 40 + row*CELL_H;
                cx = ox + CELL_W/2;
                cy = oy + CELL_H/2;
                if ((node<`NF_NODES) && (x>=ox+5) && (x<ox+CELL_W-5) &&
                    (y>=oy+3) && (y<oy+CELL_H-3)) begin
                    rgb = 24'h282828;
                    if (done && !no_path) begin
                        if (node_in_path(node, path_nodes, path_len)) rgb=24'hc5a621;
                    end else if (busy && visited_mask[node]) rgb=24'h21964b;
                    if (node == source_node) rgb=24'h00a98f;
                    if (node == target_node) rgb=24'h356fff;
                    if ((node == source_node) && (node == target_node)) rgb=24'h00ffff;
                    if (busy && current_valid && (node==current_node)) rgb=24'hff3434;
                    if ((x==ox+5) || (x==ox+CELL_W-6) ||
                        (y==oy+3) || (y==oy+CELL_H-4)) rgb=24'ha0a0a0;
                    label_on = digit_pixel(node, x, y, cx-(3*SCALE)/2, cy-(5*SCALE)/2, SCALE);
                    if (label_on) rgb=24'hffffff;
                end
            end

            // 16 path entries per page, starting at the least-significant bits.
            if (done && !no_path && (y>=414) && (y<456) && (x>=8) && (x<632)) begin
                slot = (x-8)/39;
                path_index = path_page*16 + slot;
                ox = 8 + slot*39;
                if ((path_index<path_len) && (path_index<`NF_NODES)) begin
                    path_digit = path_nodes[path_index*`NF_NODE_BITS +: `NF_NODE_BITS];
                    if (x<ox+33) begin
                        if (path_index==0) rgb=24'h00a98f;
                        else if (path_index==path_len-1) rgb=24'h356fff;
                        else rgb=24'hb09000;
                        if ((x==ox) || (x==ox+32) || (y==414) || (y==455)) rgb=24'hffffff;
                        label_on = digit_pixel(path_digit, x, y, ox+13, 429, 2);
                        if (label_on) rgb=24'hffffff;
                    end else if ((path_index<path_len-1) && (y>=433) && (y<436)) rgb=24'hf0d000;
                end
            end
            // Page number at bottom-left (0..6). Unused pages show an empty strip.
            if (digit_pixel({1'b0,path_page}, x, y, 12, 466, 2)) rgb=24'h808080;
        end
    end
endmodule
