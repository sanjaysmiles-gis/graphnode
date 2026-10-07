# NodeForge — 16 nodes × 4 neighbours

This folder contains generated Verilog-2001 VGA and ROM modules for your Dijkstra project. All files live together. There are no .do files and no vendor IP. This is a display/ROM integration bundle; your Dijkstra algorithm core remains a separate module.

## 1. ROM format — use this contract in your core

| Item | Value |
| --- | --- |
| Nodes / slots per node | 16 / 4 |
| Word width / node width / weight width | 12 / 4 / 8 bits |
| Depth / address width | 64 words / 6 bits |
| Empty word | FFF |
| Address | source_node * 4 + slot, slot=0..3 |
| Node labels in table | Decimal, 0..15 |
| Node labels on VGA | Hexadecimal (15 decimal = F hex) |

The top 4 bits store the destination node; the low 8 bits store an unsigned integer weight. For example, 104 means destination 1, weight 4; F14 means destination 15, weight 20 (when those nodes exist). There is no header, edge count, byte reversal or checksum. Blank slots are preserved in place. Reverse edges require separate entries. The generated graph.mem and graph.hex have identical bytes; .hex here is RAW HEX, not Intel HEX. graph.mif is provided for Quartus tools expecting MIF.

Zero weight is valid. Always check the entire unused word and valid output, not weight==0. In legacy format only destination 15 with weight 255 is unrepresentable because it equals FFF. A node ID of 15 with any other weight is valid.

The supplied 16-node graph.mem, not the screenshot, defines the original sample. Several screenshot self-edges with weight 63 correspond to FFF in the actual file. They remain unused.

## 2. Use graph_rom

Add graph_rom.v and graph_config.vh to the project; put graph.mem in the project/simulation working directory. Give graph_rom an address before a rising clk edge. data, neighbour, weight and valid change after that edge. Wait until the following cycle to consume the value in your controller. ROM outputs are unspecified before the first read clock. Addresses beyond the configured depth produce an invalid all-ones output after the clock.

Compute addresses with at least 6 bits. Do not keep a hard-coded source*4 expression when changing neighbour count. Source and slot counters need 4 and 2 bits respectively. Counters that must represent the end value itself need an extra bit where appropriate.

For 16 nodes with weights up to 255, a finite simple shortest path can cost up to 3825. Use at least 12 distance bits with an infinity value above that bound. A 16-bit distance and 17-bit candidate adder are convenient up to 100 nodes: do not add to infinity and do not allow overflow to wrap.

## 3. Connect the VGA display

For the ORIGINAL 16-node/12-bit configuration, vga_path_display keeps the supplied port names and widths: 4-bit node IDs, 5-bit path length, 64-bit packed path and a 16-bit visited mask. The screen layout/font is updated, but the interface is compatible. Compile only one module named vga_path_display and one vga_timing_640x480.

For this generated configuration:
- source_node, target_node and current_node: 4 bits.
- path_nodes: 64 bits; entry 0 occupies bits 3:0 and must be the SOURCE.
- path_len: 5 bits, 0..16. It counts nodes, not edges.
- visited_mask: 16 bits; bit i describes node i.
- busy/current_valid/current_node: drive the current finalized node red and prior finalized nodes green.
- done/no_path: show the valid final path yellow or the red no-path status bar.
- mode is display-only: 00 fast, 01 auto, 10 step, 11 hold. It does not control your core.
- No extra page port is required; all path entries fit on page zero.

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

The testbench terminates by itself before 18 ms. It checks all 64 ROM words, decoding, out-of-range addressing when representable, one entire VGA frame, sync pulse counts, blanking and a source-node colour. It includes a watchdog and finite clock generation. It does not check your Dijkstra core, synthesis, pin assignments or electrical timing.

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
