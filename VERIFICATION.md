# Validation performed

- Original uploaded graph.mem: all 256 bytes exactly reproduced after import/export (64 words, 52 directed edges).
- Dijkstra: all 256 source/target pairs in the original sample matched an independent Floyd–Warshall reference. Example 0→15: 0,6,8,10,12,14,15; total weight 21.
- Unreachable nodes, source=target, zero weights, parallel edges, self-loops, weight bounds, legacy sentinel collision, malformed hex and paste boundaries checked.
- 100×100 extended table: 10,000 words, exact round trip; 99 (255) exports as 63FF; empty slots as FFFF.
- All generated ZIPs verified with Python's zipfile CRC checks.
- Generated Verilog-2001 compiled with Icarus Verilog 12.0 for 1×1 legacy, 16×4 legacy, 17×3 extended and 100×100 extended configurations.
- Each configuration passed its bounded simulation: every ROM word and decoder output, out-of-range address handling when representable, 420,000 raster positions, 307,200 active pixels, 50,400 HS-low pixels, 1,600 VS-low pixels, RGB blanking and source-node colour.
- DOM tests with jsdom exercised initialization, tabs, exact MEM/MIF downloads, ZIP generation, Dijkstra/trace, invalid-cell handling and resizing to 100×100. Canvas drawing and native dialog behavior were not visually tested.
- Optional WebMCP actions were checked through a mocked registry for same-state updates and atomic failure. Validation in a native supported WebMCP browser was unavailable.
- Local HTML asset references and JavaScript module syntax checked.

Not performed: graphical browser QA, Quartus synthesis/fitting/timing analysis, physical VGA or Dijkstra-core integration. No exact board model or Dijkstra core RTL was supplied. The VGA timing is a 25 MHz approximation of the 640×480 mode; verify monitor and board compatibility.
