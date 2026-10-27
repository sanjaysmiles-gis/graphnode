# Verification — three-part NFG1 export

Verified for this revision:
- Original 12-bit ROM import roundtrip and graph parsing.
- All 256 source/target sample shortest paths against an independent Floyd–Warshall implementation.
- Exact 24-word header and every source/slot address in a 100 × 100 graph.
- 36 dimension/layout roundtrips across 1, 2, 16, 17, 99 and 100 nodes; 1, 4 and 100 slots; grid and circular layouts.
- Weights 0 and 255, unused slots, self-loops, duplicate edges and coordinate boundaries.
- Rejection of inconsistent counts, offsets, widths, extra/truncated words, invalid destinations and out-of-screen coordinates.
- DOM tests: Generate HEX payload, both download controls, coordinate editing, reset-view preserving coordinates, inspector sections, memory map, invalid-cell blocking, Dijkstra, 100 × 100 resizing, NFG1 re-import, atomic failure on invalid import.
- Real browser: editor rendering, numeric position change and coordinate word shown in inspector (123,234 -> 007B00EA); three-section layout visually inspected.
- Public Vercel site: native Generate HEX download completed; downloaded bytes exactly matched the expected 104-word NFG1 image for the 16-node, 4-slot sample. The site opened without login.

Limitations: no Quartus synthesis, ModelSim run, physical FPGA/VGA monitor test, or adaptation of the user's actual Dijkstra/VGA RTL was performed for NFG1. Earlier Verilog bundle simulation results do not establish compatibility with this new image format.
