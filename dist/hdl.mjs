import {encode,toMif,csvTable,validate} from './core.mjs';
const bt='`';
export function makeBundle(state){
  const checked=validate(state);if(checked.errors.length)throw Error('Fix invalid cells before generating Verilog.');
  const n=state.nodes,k=state.slots,nb=state.format==='legacy'?4:8,wb=nb+8,lb=Math.max(1,Math.ceil(Math.log2(n+1))),ab=Math.max(1,Math.ceil(Math.log2(n*k))),sb=Math.max(1,Math.ceil(Math.log2(k))),cols=Math.ceil(Math.sqrt(n)),rows=Math.ceil(n/cols),scale=n>25?2:3,extended=state.format==='extended';
  const config=`// NodeForge: regenerate this bundle after changing graph dimensions or format.\n${bt}ifndef NODEFORGE_CONFIG_VH\n${bt}define NODEFORGE_CONFIG_VH\n${bt}define NF_NODES ${n}\n${bt}define NF_SLOTS ${k}\n${bt}define NF_NODE_BITS ${nb}\n${bt}define NF_LEN_BITS ${lb}\n${bt}define NF_ROM_BITS ${wb}\n${bt}define NF_ADDR_BITS ${ab}\n${bt}define NF_SLOT_BITS ${sb}\n${bt}endif\n`;
  const timing=`// All sequential logic uses clk50. pixel_clk is an OUTPUT, not an RTL clock.
// 640 active + 16 front porch + 96 sync + 48 back porch = 800 pixels.
// 480 active + 10 front porch + 2 sync + 33 back porch = 525 lines.
// 25 MHz / (800 * 525) = 59.5238 Hz. Check your monitor's tolerance.
module vga_timing_640x480 (
    input clk50, input rst,
    output pixel_clk,
    output [9:0] x, output [9:0] y,
    output active_video, output hsync, output vsync
);
    reg phase;
    reg [9:0] h_count, v_count;
    always @(posedge clk50) begin
        if (rst) begin
            phase <= 1'b0;
            h_count <= 10'd0;
            v_count <= 10'd0;
        end else begin
            phase <= ~phase;
            // Change pixel data on the falling edge of the OUTPUT clock.
            // The external DAC samples the following rising edge.
            if (phase) begin
                if (h_count == 10'd799) begin
                    h_count <= 10'd0;
                    if (v_count == 10'd524) v_count <= 10'd0;
                    else v_count <= v_count + 1'b1;
                end else h_count <= h_count + 1'b1;
            end
        end
    end
    assign pixel_clk = phase;
    assign x = h_count;
    assign y = v_count;
    assign active_video = !rst && (h_count < 640) && (v_count < 480);
    assign hsync = !((h_count >= 656) && (h_count < 752));
    assign vsync = !((v_count >= 490) && (v_count < 492));
endmodule
`;
  const rom=`${bt}include "graph_config.vh"
// Address = source_node * NF_SLOTS + zero_based_slot.
// Present address before a rising clk edge; data changes just after that edge.
// Check valid before using neighbour or weight. Zero weight IS a valid edge.
module graph_rom (
    input clk,
    input [${bt}NF_ADDR_BITS-1:0] address,
    output [${bt}NF_ROM_BITS-1:0] data,
    output [${bt}NF_NODE_BITS-1:0] neighbour,
    output [7:0] weight,
    output valid
);
    reg [${bt}NF_ROM_BITS-1:0] memory [0:${bt}NF_NODES*${bt}NF_SLOTS-1];
    reg [${bt}NF_ROM_BITS-1:0] word_q;
    reg address_valid_q;
    initial $readmemh("graph.mem", memory);
    always @(posedge clk) begin
        // The first register is the synchronous ROM read port.
        word_q <= memory[address];
        address_valid_q <= (address < ${bt}NF_NODES*${bt}NF_SLOTS);
    end
    assign data = address_valid_q ? word_q : {${bt}NF_ROM_BITS{1'b1}};
    assign neighbour = data[${bt}NF_ROM_BITS-1:8];
    assign weight = data[7:0];
    assign valid = address_valid_q && (data != {${bt}NF_ROM_BITS{1'b1}})
                 && (neighbour < ${bt}NF_NODES);
endmodule
`;
  const display=`${bt}include "graph_config.vh"
// Scalable version of the supplied vga_path_display interface.
// Node IDs are HEX on-screen. Graph table inputs are decimal.
// path_nodes[0 +: NF_NODE_BITS] is the SOURCE, then the next node, etc.
// Input status signals must be synchronous to clk50; synchronize switches
// and hold multi-bit results stable in your top-level design.
module vga_path_display (
    input clk50, input rst,
    input [${bt}NF_NODE_BITS-1:0] source_node, target_node,
    input [1:0] mode,
    input busy, done, no_path, stopped,
    input [${bt}NF_LEN_BITS-1:0] path_len,
    input [${bt}NF_NODES*${bt}NF_NODE_BITS-1:0] path_nodes,
    input [${bt}NF_NODES-1:0] visited_mask,
    input [${bt}NF_NODE_BITS-1:0] current_node,
    input current_valid,
${extended?'    input [2:0] path_page, // page 0: entries 0..15; page 6: entries 96..99\n':''}    output [7:0] VGA_R, VGA_G, VGA_B,
    output VGA_CLK, VGA_HS, VGA_VS, VGA_BLANK_N, VGA_SYNC_N
);
    localparam COLS = ${cols};
    localparam ROWS = ${rows};
    localparam CELL_W = 640 / COLS;
    localparam CELL_H = 336 / ROWS;
    localparam SCALE = ${scale};
    wire [9:0] x, y;
    wire active_video;
${extended?'':'    wire [2:0] path_page = 3\'d0;\n'}    vga_timing_640x480 TIMING (
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
        input [${bt}NF_NODE_BITS-1:0] node;
        input [${bt}NF_NODES*${bt}NF_NODE_BITS-1:0] packed_path;
        input [${bt}NF_LEN_BITS-1:0] length;
        integer i;
        begin
            node_in_path = 1'b0;
            // Fixed bound: synthesized hardware, never an unbounded loop.
            for (i=0; i<${bt}NF_NODES; i=i+1)
                if ((i < length) &&
                    (packed_path[i*${bt}NF_NODE_BITS +: ${bt}NF_NODE_BITS] == node))
                    node_in_path = 1'b1;
        end
    endfunction

    reg [23:0] rgb;
    integer column, row, node, ox, oy, cx, cy;
    integer slot, path_index;
    reg [${bt}NF_NODE_BITS-1:0] path_digit;
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
                if ((node<${bt}NF_NODES) && (x>=ox+5) && (x<ox+CELL_W-5) &&
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
${nb===4?'                    label_on = digit_pixel(node, x, y, cx-(3*SCALE)/2, cy-(5*SCALE)/2, SCALE);':'                    label_on = digit_pixel(node/16, x, y, cx-4*SCALE, cy-(5*SCALE)/2, SCALE) ||\n                               digit_pixel(node%16, x, y, cx+SCALE, cy-(5*SCALE)/2, SCALE);'}
                    if (label_on) rgb=24'hffffff;
                end
            end

            // 16 path entries per page, starting at the least-significant bits.
            if (done && !no_path && (y>=414) && (y<456) && (x>=8) && (x<632)) begin
                slot = (x-8)/39;
                path_index = path_page*16 + slot;
                ox = 8 + slot*39;
                if ((path_index<path_len) && (path_index<${bt}NF_NODES)) begin
                    path_digit = path_nodes[path_index*${bt}NF_NODE_BITS +: ${bt}NF_NODE_BITS];
                    if (x<ox+33) begin
                        if (path_index==0) rgb=24'h00a98f;
                        else if (path_index==path_len-1) rgb=24'h356fff;
                        else rgb=24'hb09000;
                        if ((x==ox) || (x==ox+32) || (y==414) || (y==455)) rgb=24'hffffff;
${nb===4?'                        label_on = digit_pixel(path_digit, x, y, ox+13, 429, 2);':'                        label_on = digit_pixel(path_digit[7:4], x, y, ox+7, 429, 2) ||\n                                   digit_pixel(path_digit[3:0], x, y, ox+19, 429, 2);'}
                        if (label_on) rgb=24'hffffff;
                    end else if ((path_index<path_len-1) && (y>=433) && (y<436)) rgb=24'hf0d000;
                end
            end
            // Page number at bottom-left (0..6). Unused pages show an empty strip.
            if (digit_pixel({1'b0,path_page}, x, y, 12, 466, 2)) rgb=24'h808080;
        end
    end
endmodule
`;
  const demo=`${bt}include "graph_config.vh"
// Standalone display demo. It does NOT compute Dijkstra; the demo path
// visits node IDs in numeric order to exercise the VGA display.
// Use vga_path_display with your own core for a real shortest path.
module nodeforge_vga_demo (
    input clk50, input rst,
${extended?'    input [2:0] path_page,\n':''}    output [7:0] VGA_R, VGA_G, VGA_B,
    output VGA_CLK, VGA_HS, VGA_VS, VGA_BLANK_N, VGA_SYNC_N
);
    wire [${bt}NF_NODES*${bt}NF_NODE_BITS-1:0] demo_path;
    genvar i;
    generate for (i=0; i<${bt}NF_NODES; i=i+1) begin: DEMO_PATH
        assign demo_path[i*${bt}NF_NODE_BITS +: ${bt}NF_NODE_BITS] = i;
    end endgenerate
    vga_path_display DISPLAY (
        .clk50(clk50), .rst(rst), .source_node(${nb}'d0), .target_node(${nb}'d${n-1}),
        .mode(2'b00), .busy(1'b0), .done(1'b1), .no_path(1'b0), .stopped(1'b0),
        .path_len(${lb}'d${n}), .path_nodes(demo_path), .visited_mask({${bt}NF_NODES{1'b1}}),
        .current_node(${nb}'d0), .current_valid(1'b0),
${extended?'        .path_page(path_page),\n':''}        .VGA_R(VGA_R), .VGA_G(VGA_G), .VGA_B(VGA_B), .VGA_CLK(VGA_CLK),
        .VGA_HS(VGA_HS), .VGA_VS(VGA_VS), .VGA_BLANK_N(VGA_BLANK_N), .VGA_SYNC_N(VGA_SYNC_N)
    );
endmodule
`;
  const tb=`${bt}timescale 1ns/1ps
${bt}include "graph_config.vh"
// Finite test: checks every ROM address and one entire 800x525 video frame.
module tb_nodeforge;
    reg clk50, rst;
    reg [${bt}NF_ADDR_BITS-1:0] address;
    wire [${bt}NF_ROM_BITS-1:0] data;
    wire [${bt}NF_NODE_BITS-1:0] neighbour;
    wire [7:0] weight;
    wire valid;
    wire [7:0] r,g,b;
    wire pclk,hs,vs,blank_n,sync_n;
    reg [${bt}NF_ROM_BITS-1:0] expected [0:${bt}NF_NODES*${bt}NF_SLOTS-1];
    integer i, active_count, hs_count, vs_count;
    integer expected_x, expected_y;
    graph_rom ROM (.clk(clk50), .address(address), .data(data),
        .neighbour(neighbour), .weight(weight), .valid(valid));
    nodeforge_vga_demo DEMO (.clk50(clk50), .rst(rst),
${extended?'        .path_page(3\'d0),\n':''}        .VGA_R(r), .VGA_G(g), .VGA_B(b), .VGA_CLK(pclk),
        .VGA_HS(hs), .VGA_VS(vs), .VGA_BLANK_N(blank_n), .VGA_SYNC_N(sync_n));
    initial begin
        clk50=0;
        repeat (1800000) #10 clk50=~clk50;
    end
    initial begin
        #17999900;
        $display("FAIL: watchdog timeout");
        $finish;
    end
    initial begin
        rst=1; address=0;
        active_count=0; hs_count=0; vs_count=0;
        $readmemh("graph.mem", expected);
        for (i=0; i<${bt}NF_NODES*${bt}NF_SLOTS; i=i+1) begin
            @(negedge clk50); address=i;
            @(posedge clk50); #1;
            if ((^expected[i] === 1'bx) || (data !== expected[i])) begin
                $display("FAIL: ROM address %0d got %h expected %h",i,data,expected[i]); $finish;
            end
            if ((neighbour !== expected[i][${bt}NF_ROM_BITS-1:8]) ||
                (weight !== expected[i][7:0]) ||
                (valid !== (expected[i] != {${bt}NF_ROM_BITS{1'b1}}))) begin
                $display("FAIL: ROM decoding at %0d",i); $finish;
            end
        end
        if (${bt}NF_NODES*${bt}NF_SLOTS < (2**${bt}NF_ADDR_BITS)) begin
            @(negedge clk50); address=${bt}NF_NODES*${bt}NF_SLOTS;
            @(posedge clk50); #1;
            if ((valid !== 1'b0) || (data !== {${bt}NF_ROM_BITS{1'b1}})) begin
                $display("FAIL: out-of-range ROM address"); $finish;
            end
        end
        repeat (3) @(negedge clk50);
        rst=0;
        for (i=0; i<420000; i=i+1) begin
            @(posedge pclk); #1;
            expected_x=i%800; expected_y=i/800;
            if ((DEMO.DISPLAY.x !== expected_x) || (DEMO.DISPLAY.y !== expected_y)) begin
                $display("FAIL: pixel coordinate %0d",i); $finish;
            end
            if ((blank_n !== ((expected_x<640)&&(expected_y<480))) ||
                (hs !== !((expected_x>=656)&&(expected_x<752))) ||
                (vs !== !((expected_y>=490)&&(expected_y<492))) || (sync_n !== 1'b0)) begin
                $display("FAIL: VGA timing at %0d,%0d",expected_x,expected_y); $finish;
            end
            if ((^({r,g,b}) === 1'bx) || (!blank_n && ({r,g,b} !== 24'h0))) begin
                $display("FAIL: unknown RGB or nonblack blanking"); $finish;
            end
            if ((expected_x==7)&&(expected_y==44) && ({r,g,b} !== 24'h${n===1?'00ffff':'00a98f'})) begin
                $display("FAIL: source node colour"); $finish;
            end
            if (blank_n) active_count=active_count+1;
            if (!hs) hs_count=hs_count+1;
            if (!vs) vs_count=vs_count+1;
        end
        if ((active_count!=307200)||(hs_count!=50400)||(vs_count!=1600)) begin
            $display("FAIL: frame counts"); $finish;
        end
        $display("PASS: ${n*k} ROM words, decoding, VGA coordinates, sync, blanking and source colour");
        $finish;
    end
endmodule
`;
  const readme=`# NodeForge — ${n} nodes × ${k} neighbours

This folder contains generated Verilog-2001 VGA and ROM modules for your Dijkstra project. All files live together. There are no .do files and no vendor IP. This is a display/ROM integration bundle; your Dijkstra algorithm core remains a separate module.

## 1. ROM format — use this contract in your core

| Item | Value |
| --- | --- |
| Nodes / slots per node | ${n} / ${k} |
| Word width / node width / weight width | ${wb} / ${nb} / 8 bits |
| Depth / address width | ${n*k} words / ${ab} bits |
| Empty word | ${wb===12?'FFF':'FFFF'} |
| Address | source_node * ${k} + slot, slot=0..${k-1} |
| Node labels in table | Decimal, 0..${n-1} |
| Node labels on VGA | Hexadecimal (${n-1} decimal = ${(n-1).toString(16).toUpperCase()} hex) |

The top ${nb} bits store the destination node; the low 8 bits store an unsigned integer weight. For example, ${wb===12?'104':'0104'} means destination 1, weight 4; ${wb===12?'F14':'0F14'} means destination 15, weight 20 (when those nodes exist). There is no header, edge count, byte reversal or checksum. Blank slots are preserved in place. Reverse edges require separate entries. The generated graph.mem and graph.hex have identical bytes; .hex here is RAW HEX, not Intel HEX. graph.mif is provided for Quartus tools expecting MIF.

Zero weight is valid. Always check the entire unused word and valid output, not weight==0. In legacy format only destination 15 with weight 255 is unrepresentable because it equals FFF. A node ID of 15 with any other weight is valid.

The supplied 16-node graph.mem, not the screenshot, defines the original sample. Several screenshot self-edges with weight 63 correspond to FFF in the actual file. They remain unused.

## 2. Use graph_rom

Add graph_rom.v and graph_config.vh to the project; put graph.mem in the project/simulation working directory. Give graph_rom an address before a rising clk edge. data, neighbour, weight and valid change after that edge. Wait until the following cycle to consume the value in your controller. ROM outputs are unspecified before the first read clock. Addresses beyond the configured depth produce an invalid all-ones output after the clock.

Compute addresses with at least ${ab} bits. Do not keep a hard-coded source*4 expression when changing neighbour count. Source and slot counters need ${nb} and ${sb} bits respectively. Counters that must represent the end value itself need an extra bit where appropriate.

For ${n} nodes with weights up to 255, a finite simple shortest path can cost up to ${(n-1)*255}. Use at least ${Math.max(1,Math.ceil(Math.log2((n-1)*255+2)))} distance bits with an infinity value above that bound. A 16-bit distance and 17-bit candidate adder are convenient up to 100 nodes: do not add to infinity and do not allow overflow to wrap.

## 3. Connect the VGA display

For the ORIGINAL 16-node/12-bit configuration, vga_path_display keeps the supplied port names and widths: 4-bit node IDs, 5-bit path length, 64-bit packed path and a 16-bit visited mask. The screen layout/font is updated, but the interface is compatible. Compile only one module named vga_path_display and one vga_timing_640x480.

For this generated configuration:
- source_node, target_node and current_node: ${nb} bits.
- path_nodes: ${n*nb} bits; entry 0 occupies bits ${nb-1}:0 and must be the SOURCE.
- path_len: ${lb} bits, 0..${n}. It counts nodes, not edges.
- visited_mask: ${n} bits; bit i describes node i.
- busy/current_valid/current_node: drive the current finalized node red and prior finalized nodes green.
- done/no_path: show the valid final path yellow or the red no-path status bar.
- mode is display-only: 00 fast, 01 auto, 10 step, 11 hold. It does not control your core.
${extended?'- path_page: 3 bits. Page 0 shows path entries 0–15; page 6 shows entries 96–99. Tie to 0 initially, or connect synchronized page controls. Invalid/unused pages show an empty strip.':'- No extra page port is required; all path entries fit on page zero.'}

All inputs must be synchronous to clk50 and stable while sampled. Keep the packed path stable after done; if your core changes data mid-frame, visible tearing is possible. If your predecessor walk produces target-to-source order, reverse it before packing. The display does not reverse or calculate the path.

The hardware renders a node STATUS GRID and ordered path, matching the role of your provided VGA module. Weighted arrows are visualized in the website graph. Drawing all weighted edges in hardware is not part of this VGA module.

## 4. Standalone VGA demonstration

Set nodeforge_vga_demo as the Quartus top-level to test the display without your core. It shows an illustrative numeric-order path through all node IDs, not a shortest path computed from graph.mem. For the actual algorithm, instantiate vga_path_display in your own top-level.

The RTL uses a 50 MHz input and a clock-enable phase. All flip-flops are clocked by clk50; VGA_CLK is only an output to the external DAC. Counters advance when VGA_CLK falls and the pixel settles before it rises. The raster is 800×525 with 640×480 active pixels, active-low 96-pixel HS and 2-line VS. The pixel clock is 25 MHz, about 59.524 Hz rather than exact 25.175 MHz VGA. Verify your monitor accepts it.

Assign pins using YOUR board manual. No board model was supplied, so no QSF pin assignments are guessed. RGB outputs are 8 bits per channel; use the most significant bits if your resistor DAC has fewer. VGA_SYNC_N stays 0, and VGA_BLANK_N indicates active video. If the board has a clocked video DAC, connect its clock to VGA_CLK and complete output timing constraints for that DAC. For direct resistor VGA outputs, map HS/VS and the RGB bits according to that board.

clock_50mhz.sdc provides the base clock only, not board-specific output delays or pin constraints. Update its port name if the outer top-level calls it CLOCK_50. Confirm fitter resource use and timing in Quartus for your exact Cyclone device before claiming hardware readiness.

## 5. Simulate — no .do script

In ModelSim/Questa, switch the working directory to this folder. Enter each command in the Transcript:

    vlib work
    vlog +incdir+. vga_timing_640x480.v vga_path_display.v graph_rom.v nodeforge_vga_demo.v tb_nodeforge.v
    vsim work.tb_nodeforge
    run -all

The testbench terminates by itself before 18 ms. It checks all ${n*k} ROM words, decoding, out-of-range addressing when representable, one entire VGA frame, sync pulse counts, blanking and a source-node colour. It includes a watchdog and finite clock generation. It does not check your Dijkstra core, synthesis, pin assignments or electrical timing.

With Icarus Verilog installed:

    iverilog -g2005 -I. -s tb_nodeforge -o sim.out vga_timing_640x480.v vga_path_display.v graph_rom.v nodeforge_vga_demo.v tb_nodeforge.v
    vvp sim.out

Expect a line beginning PASS. Any line beginning FAIL means the check failed.

## 6. Larger graphs

The original 12-bit ROM cannot encode more than 16 destinations. Above 16 nodes, NodeForge generates 16-bit words (8 destination + 8 weight), FFFF empty, and matching display/config widths. You MUST update the core's node registers, arrays, counters, path packing, visited mask, sentinel handling and ROM width/depth. Regenerating VGA alone does not expand a fixed 16-node Dijkstra core.

100 nodes × 100 slots uses 10,000 × 16 = 160,000 ROM payload bits. Physical block packing adds overhead. Check the device memory budget together with the rest of your project. Duplicate neighbours and self-loops are supported; an ordinary graph with no self-loops needs at most N−1 distinct neighbours per node.

## References

Intel/Altera Quartus Standard documentation supports inferred memory initialization with initial and $readmemh:
https://docs.altera.com/r/docs/683323/18.1/intel-quartus-prime-standard-edition-user-guide-design-recommendations/specifying-initial-memory-contents-at-power-up

Terasic DE2-115 manual provides VGA timing and board-specific signal examples (use your actual board's pin map):
https://www.terasic.com.tw/attachment/archive/502/DE2_115_User_manual.pdf
`;
  return {'graph_config.vh':config,'vga_timing_640x480.v':timing,'vga_path_display.v':display,'graph_rom.v':rom,'nodeforge_vga_demo.v':demo,'tb_nodeforge.v':tb,'graph.mem':encode(state),'graph.hex':encode(state),'graph.mif':toMif(state),'nodeforge-table.csv':csvTable(state),'clock_50mhz.sdc':'# Base clock only. Add device-specific output constraints in your project.\ncreate_clock -name clk50 -period 20.000 [get_ports {clk50}]\n','README.md':readme};
}

// Small dependency-free ZIP writer (stored entries, UTF-8 filenames, CRC32).
function crc32(bytes){let crc=0xffffffff;for(const b of bytes){crc^=b;for(let k=0;k<8;k++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
export function zipFiles(files){const encoder=new TextEncoder(),parts=[],central=[];let offset=0,centralSize=0;for(const [name,source] of Object.entries(files)){const filename=encoder.encode('nodeforge/'+name),data=typeof source==='string'?encoder.encode(source):source,crc=crc32(data);const local=new Uint8Array(30+filename.length),v=new DataView(local.buffer);v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x800,true);v.setUint16(12,0x21,true);v.setUint32(14,crc,true);v.setUint32(18,data.length,true);v.setUint32(22,data.length,true);v.setUint16(26,filename.length,true);local.set(filename,30);parts.push(local,data);const c=new Uint8Array(46+filename.length),cv=new DataView(c.buffer);cv.setUint32(0,0x02014b50,true);cv.setUint16(4,20,true);cv.setUint16(6,20,true);cv.setUint16(8,0x800,true);cv.setUint16(14,0x21,true);cv.setUint32(16,crc,true);cv.setUint32(20,data.length,true);cv.setUint32(24,data.length,true);cv.setUint16(28,filename.length,true);cv.setUint32(42,offset,true);c.set(filename,46);central.push(c);centralSize+=c.length;offset+=local.length+data.length;}const end=new Uint8Array(22),ev=new DataView(end.buffer);ev.setUint32(0,0x06054b50,true);ev.setUint16(8,central.length,true);ev.setUint16(10,central.length,true);ev.setUint32(12,centralSize,true);ev.setUint32(16,offset,true);const out=new Uint8Array(offset+centralSize+22);let at=0;for(const part of [...parts,...central,end]){out.set(part,at);at+=part.length;}return out;}
