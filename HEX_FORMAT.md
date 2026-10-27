# NFG1 memory image

The HEX file contains only raw 32-bit words, one per line, with no text headings. Its three sections are identified by the header. All addresses count words, starting at zero.

## 1. Header: words 0–23

| Address (decimal) | Field | Example value |
|---|---|---|
| 0 | Magic · NFG1 | `4E464731` (1313228593) |
| 1 | Format version | `00000001` (1) |
| 2 | Header words | `00000018` (24) |
| 3 | Active nodes | `00000003` (3) |
| 4 | Neighbour slots / node | `00000002` (2) |
| 5 | Valid directed edges | `00000004` (4) |
| 6 | Minimum node-ID bits | `00000002` (2) |
| 7 | Weight bits | `00000008` (8) |
| 8 | ROM word bits | `00000020` (32) |
| 9 | VGA width (pixels) | `00000280` (640) |
| 10 | VGA height (pixels) | `000001E0` (480) |
| 11 | X coordinate bits | `0000000A` (10) |
| 12 | Y coordinate bits | `00000009` (9) |
| 13 | Connections start address | `00000018` (24) |
| 14 | Connection words | `00000006` (6) |
| 15 | Coordinates start address | `0000001E` (30) |
| 16 | Coordinate words | `00000003` (3) |
| 17 | Total image words | `00000021` (33) |
| 18 | Unused connection word | `FFFFFFFF` (4294967295) |
| 19 | Distance bits | `00000010` (16) |
| 20 | Stored destination bits | `00000008` (8) |
| 21 | Maximum supported nodes | `00000064` (100) |
| 22 | Maximum supported slots | `00000064` (100) |
| 23 | Flags · directed graph | `00000001` (1) |

## 2. Connections

`address = header[13] + source_node × header[4] + slot` (zero-based slot).

`0000DDWW`: bits 31:16 must be zero, destination is 15:8, weight is 7:0. Skip the whole word if it equals `FFFFFFFF`. A valid `00000000` is an edge to node 0 with weight 0.

## 3. Coordinates

`address = header[15] + node_id`. `XXXXYYYY` packs unsigned X in 31:16 and Y in 15:0, with top-left origin. X requires 10 useful bits and Y 9; unused high bits in each 16-bit lane are zero. Every node has one centre, including disconnected nodes. The VGA logic uses section 2 to find source/destination pairs and section 3 for endpoints.

Example: `(100,100)` is `00640064`. Node 0 → node 1 with weight 4 is `00000104`.

## Reader behavior

1. Validate magic `4E464731`, version 1, widths, supported counts and total length before starting.
2. Read the active node and slot counts at words 3 and 4.
3. Use connection base at word 13 and coordinate base at word 15.
4. Traverse only the active counts, skip unused edges and reject out-of-range IDs.
5. Render node centres, then connections/arrowheads/labels from the graph. The browser uses curved paths for parallel/reverse edges; the file records the graph and centres, not a specific rasterization.

Use a fixed-capacity design for up to 100 nodes. Maximum image size is `24 + 100×100 + 100 = 10124` 32-bit words (40496 bytes). The header holds a descriptive minimum node-ID width, but destination lanes are always 8 bits. Hardware widths and memory capacity are fixed at synthesis. Use runtime counts as loop bounds; do not use ROM data as a Verilog parameter.

For a 32-bit inferred memory, load the raw file with `$readmemh`. This is not the Intel HEX record format used by some Quartus IP import dialogs. Do not pass it to an incompatible loader. Unused memory beyond `header[17]` is outside the image and must never be read.

A stored ROM image changes only after an applicable memory initialization/bitstream update. For live graph replacement, add a RAM loading path and hold the algorithm/display idle until validation finishes.

The 16-bit distance recommendation supports a simple shortest path of at most 99 × 255 = 25245. Reserve `16’hFFFF` for infinity and guard infinity before addition.

See `examples/graph.hex` for a complete three-node image and `examples/nodeforge-memory-map.txt` for its decoded values. Your current RTL must be adapted to this interface; it has not been hardware-verified.

## Quartus MIF container

Generate MIF preserves every active word/address above. It emits WIDTH=32; DEPTH=10124; ADDRESS_RADIX=HEX; DATA_RADIX=HEX; CONTENT BEGIN, then `AAAA : DDDDDDDD;` entries and END;. When active length is below capacity, `[NEXT..278B] : 00000000;` fills unused memory. A full 100x100 image has no tail range. Header[17] remains the active length. MIF is not accepted by $readmemh; choose the MIF synthesis wrapper and matching raw simulation file.
