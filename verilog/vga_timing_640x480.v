// All sequential logic uses clk50. pixel_clk is an OUTPUT, not an RTL clock.
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
