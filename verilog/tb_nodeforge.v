`timescale 1ns/1ps
`include "graph_config.vh"
// Finite test: checks every ROM address and one entire 800x525 video frame.
module tb_nodeforge;
    reg clk50, rst;
    reg [`NF_ADDR_BITS-1:0] address;
    wire [`NF_ROM_BITS-1:0] data;
    wire [`NF_NODE_BITS-1:0] neighbour;
    wire [7:0] weight;
    wire valid;
    wire [7:0] r,g,b;
    wire pclk,hs,vs,blank_n,sync_n;
    reg [`NF_ROM_BITS-1:0] expected [0:`NF_NODES*`NF_SLOTS-1];
    integer i, active_count, hs_count, vs_count;
    integer expected_x, expected_y;
    graph_rom ROM (.clk(clk50), .address(address), .data(data),
        .neighbour(neighbour), .weight(weight), .valid(valid));
    nodeforge_vga_demo DEMO (.clk50(clk50), .rst(rst),
        .VGA_R(r), .VGA_G(g), .VGA_B(b), .VGA_CLK(pclk),
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
        for (i=0; i<`NF_NODES*`NF_SLOTS; i=i+1) begin
            @(negedge clk50); address=i;
            @(posedge clk50); #1;
            if ((^expected[i] === 1'bx) || (data !== expected[i])) begin
                $display("FAIL: ROM address %0d got %h expected %h",i,data,expected[i]); $finish;
            end
            if ((neighbour !== expected[i][`NF_ROM_BITS-1:8]) ||
                (weight !== expected[i][7:0]) ||
                (valid !== (expected[i] != {`NF_ROM_BITS{1'b1}}))) begin
                $display("FAIL: ROM decoding at %0d",i); $finish;
            end
        end
        if (`NF_NODES*`NF_SLOTS < (2**`NF_ADDR_BITS)) begin
            @(negedge clk50); address=`NF_NODES*`NF_SLOTS;
            @(posedge clk50); #1;
            if ((valid !== 1'b0) || (data !== {`NF_ROM_BITS{1'b1}})) begin
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
            if ((expected_x==7)&&(expected_y==44) && ({r,g,b} !== 24'h00a98f)) begin
                $display("FAIL: source node colour"); $finish;
            end
            if (blank_n) active_count=active_count+1;
            if (!hs) hs_count=hs_count+1;
            if (!vs) vs_count=vs_count+1;
        end
        if ((active_count!=307200)||(hs_count!=50400)||(vs_count!=1600)) begin
            $display("FAIL: frame counts"); $finish;
        end
        $display("PASS: 64 ROM words, decoding, VGA coordinates, sync, blanking and source colour");
        $finish;
    end
endmodule
