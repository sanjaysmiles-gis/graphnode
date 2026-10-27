# NodeForge — Graph to ROM

An Excel-style directed weighted graph editor for 1–100 nodes and 1–100 neighbour slots per node. Enter `destination (weight)`, arrange the graph, and click **Generate MIF** to download `graph.mif` directly.

The static, dependency-free app is in `dist/`. Serve it over HTTP (ES modules). There is no application login, backend, analytics, or external request.

## One file, three parts

`graph.hex` is an NFG1 memory image with eight hexadecimal digits per 32-bit word:

1. **Metadata**: 24 words containing counts, data widths, VGA dimensions and section addresses.
2. **Connections**: N × K words, ordered by source node then neighbour slot. `0000DDWW` stores the 8-bit destination and 8-bit weight. `FFFFFFFF` means unused.
3. **VGA coordinates**: N words, one per node, packed as `XXXXYYYY` (X high 16 bits, Y low 16 bits). X is 0–639; Y is 0–479. These are the exact integer centres in the browser graph.

Node IDs and table weights are decimal, starting at node 0. Weights range from 0 to 255. Directed reverse edges, self-loops, parallel edges and zero weights are preserved. Coordinates can be dragged or entered numerically. Browser zoom, filters and algorithm highlighting do not affect the export.

The HEX inspector describes all three sections. **Download memory map** gives the graph-specific address map. Importing NFG1 restores counts, connections and coordinates. Original 12-bit/16-bit raw ROM files can still be imported using the configured dimensions.

## FPGA integration contract

This new image is **not compatible with the old 12-bit ROM reader without adaptation**. It is raw `$readmemh` text, not Intel HEX. A complete memory map and small example are in `HEX_FORMAT.md` and `examples/`.

Compile the hardware for the maximum capacity: 100 nodes, 100 slots/node, 32-bit memory words, 10124 words, 14-bit memory addresses, 8-bit node IDs, and 16-bit unsigned distances (`FFFF` infinity). The header's active counts control runtime loops. Metadata cannot change synthesized signal widths or Verilog parameters.

The VGA renderer reads node centres from the coordinate block, and endpoints/weights from the connection block. It still needs circle/text/line/arrow drawing logic; this file is neither a bitmap nor a VGA signal. The old generated VGA/Verilog bundle has been removed from the website.

Any legacy `verilog/` files retained in the GitHub repository describe the previous format and must be adapted before use with NFG1.

ROM initialization updates require a supported memory-image or bitstream update. Changing graphs live without reprogramming needs writable RAM and a loader such as UART/JTAG. Your actual RTL has not been modified or hardware-tested here.

## Checks

```
node tests/core.test.mjs
node tests/image.test.mjs
```

See `VERIFICATION.md` for the scope of verification. Download HEX before closing the page; edits are held in the current page only.

## Direct MIF export

Generate MIF downloads `graph.mif`, matching the supplied FPGA converter: WIDTH=32, DEPTH=10124, hexadecimal addresses/data, the unchanged three-part NFG1 payload, and a zero-filled tail. No Python conversion is needed. The Memory files tab retains Generate HEX (canonical, re-importable) and Download padded HEX (simulation, exactly 10124 words). Padding never changes header[17], the active image length.

In NodeForge_FPGA_Implementation.zip, compile `rtl_optional/graph_rom_mif.v` instead of `rtl/graph_rom.v` for Quartus MIF initialization; compile exactly one graph_rom module. The optional wrapper uses graph.mif for synthesis and graph.hex for simulation, so download both MIF and padded HEX from the same graph when using both flows. This export update does not validate the friend's entire RTL or change FPGA loading behavior.
