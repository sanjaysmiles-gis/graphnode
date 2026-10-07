`include "graph_config.vh"
// Standalone display demo. It does NOT compute Dijkstra; the demo path
// visits node IDs in numeric order to exercise the VGA display.
// Use vga_path_display with your own core for a real shortest path.
module nodeforge_vga_demo (
    input clk50, input rst,
    output [7:0] VGA_R, VGA_G, VGA_B,
    output VGA_CLK, VGA_HS, VGA_VS, VGA_BLANK_N, VGA_SYNC_N
);
    wire [`NF_NODES*`NF_NODE_BITS-1:0] demo_path;
    genvar i;
    generate for (i=0; i<`NF_NODES; i=i+1) begin: DEMO_PATH
        assign demo_path[i*`NF_NODE_BITS +: `NF_NODE_BITS] = i;
    end endgenerate
    vga_path_display DISPLAY (
        .clk50(clk50), .rst(rst), .source_node(4'd0), .target_node(4'd15),
        .mode(2'b00), .busy(1'b0), .done(1'b1), .no_path(1'b0), .stopped(1'b0),
        .path_len(5'd16), .path_nodes(demo_path), .visited_mask({`NF_NODES{1'b1}}),
        .current_node(4'd0), .current_valid(1'b0),
        .VGA_R(VGA_R), .VGA_G(VGA_G), .VGA_B(VGA_B), .VGA_CLK(VGA_CLK),
        .VGA_HS(VGA_HS), .VGA_VS(VGA_VS), .VGA_BLANK_N(VGA_BLANK_N), .VGA_SYNC_N(VGA_SYNC_N)
    );
endmodule
