`include "graph_config.vh"
// Address = source_node * NF_SLOTS + zero_based_slot.
// Present address before a rising clk edge; data changes just after that edge.
// Check valid before using neighbour or weight. Zero weight IS a valid edge.
module graph_rom (
    input clk,
    input [`NF_ADDR_BITS-1:0] address,
    output [`NF_ROM_BITS-1:0] data,
    output [`NF_NODE_BITS-1:0] neighbour,
    output [7:0] weight,
    output valid
);
    reg [`NF_ROM_BITS-1:0] memory [0:`NF_NODES*`NF_SLOTS-1];
    reg [`NF_ROM_BITS-1:0] word_q;
    reg address_valid_q;
    initial $readmemh("graph.mem", memory);
    always @(posedge clk) begin
        // The first register is the synchronous ROM read port.
        word_q <= memory[address];
        address_valid_q <= (address < `NF_NODES*`NF_SLOTS);
    end
    assign data = address_valid_q ? word_q : {`NF_ROM_BITS{1'b1}};
    assign neighbour = data[`NF_ROM_BITS-1:8];
    assign weight = data[7:0];
    assign valid = address_valid_q && (data != {`NF_ROM_BITS{1'b1}})
                 && (neighbour < `NF_NODES);
endmodule
