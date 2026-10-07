# NodeForge — Graph to ROM

A self-contained static website for editing directed weighted neighbour tables, viewing a graph, checking shortest paths and exporting FPGA ROM / VGA integration files.

The served application is in `dist/`. There are no runtime dependencies or external requests. Publish `dist/` as static assets; use an HTTP server when working locally because the app uses ES modules.

## Important contracts

- Original format: 12 bits per word, destination in bits 11:8, unsigned weight in 7:0, `FFF` unused. Limited to 16 node IDs.
- Extended format: 16 bits per word, destination in 15:8, unsigned weight in 7:0, `FFFF` unused. The app supports at most 100 nodes and 100 slots per node.
- Words are ordered by source node, then fixed neighbour slot. Unused slots are preserved. Files are raw uppercase hex, one word per line, with a final newline.
- `.hex` is not Intel HEX. `.mif` is a separate Quartus-format export.
- Larger dimensions require a correspondingly widened Dijkstra core. The generated VGA/ROM package does not implement the algorithm core.
- Graph edits live in the open page. Downloads are the way to preserve edits; no cloud or browser-state persistence is claimed.

## Checks

`node tests/core.test.mjs` checks exact sample round trips, malformed entries, format boundaries, Excel paste bounds, all 256 sample shortest paths against Floyd–Warshall, and 100×100 export/import. It generates Verilog test packages in `/tmp/nodeforge-generated` by default; set `NODEFORGE_TEST_OUTPUT` to select another directory.

The generated package contains a bounded Verilog testbench with commands in its README. Browser-generated ZIP files use stored entries and CRC32 with no third-party dependency.

See `VERIFICATION.md` for the validation actually performed on this version.
