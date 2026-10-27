import {validate,parseCell} from './core.mjs';

// NFG1 is a raw $readmemh image. All addresses below count 32-bit words.
export const IMAGE = Object.freeze({magic:0x4E464731,version:1,headerWords:24,width:640,height:480,maxNodes:100,maxSlots:100,unused:0xFFFFFFFF});
export const HEADER_FIELDS = [
  'Magic · NFG1','Format version','Header words','Active nodes','Neighbour slots / node',
  'Valid directed edges','Minimum node-ID bits','Weight bits','ROM word bits',
  'VGA width (pixels)','VGA height (pixels)','X coordinate bits','Y coordinate bits',
  'Connections start address','Connection words','Coordinates start address','Coordinate words',
  'Total image words','Unused connection word','Distance bits','Stored destination bits',
  'Maximum supported nodes','Maximum supported slots','Flags · directed graph'
];
export const hex32 = value => (value>>>0).toString(16).toUpperCase().padStart(8,'0');

export function layoutNodes(nodes,layout='grid') {
  if(!Number.isInteger(nodes)||nodes<1||nodes>100)throw Error('Use 1–100 nodes.');
  const cols=Math.ceil(Math.sqrt(nodes)),rows=Math.ceil(nodes/cols);
  return Array.from({length:nodes},(_,n)=>{
    if(nodes===1)return {x:320,y:240};
    if(layout==='circle')return {x:Math.round(320+240*Math.cos(n/nodes*2*Math.PI-Math.PI/2)),y:Math.round(240+176*Math.sin(n/nodes*2*Math.PI-Math.PI/2))};
    return {x:cols===1?320:Math.round(64+512*(n%cols)/(cols-1)),y:rows===1?240:Math.round(56+368*Math.floor(n/cols)/(rows-1))};
  });
}

function checkPositions(positions,nodes) {
  if(!Array.isArray(positions)||positions.length!==nodes)throw Error('Provide one X/Y coordinate for every node.');
  positions.forEach((p,n)=>{if(!p||!Number.isInteger(p.x)||!Number.isInteger(p.y)||p.x<0||p.x>=640||p.y<0||p.y>=480)throw Error(`Node ${n}: X must be 0–639 and Y must be 0–479, in whole pixels.`);});
}

export function graphImage(state,positions) {
  // The image has a fixed 8-bit destination lane, including for small graphs.
  const graph={...state,format:'extended'},checked=validate(graph);
  if(checked.errors.length)throw Error(`Fix ${checked.errors.length} invalid cell(s) before generating HEX.`);
  checkPositions(positions,graph.nodes);
  const edgeBase=24,edgeWords=graph.nodes*graph.slots,coordBase=edgeBase+edgeWords,total=coordBase+graph.nodes;
  const header=[IMAGE.magic,1,24,graph.nodes,graph.slots,checked.count,Math.max(1,Math.ceil(Math.log2(graph.nodes))),8,32,640,480,10,9,edgeBase,edgeWords,coordBase,graph.nodes,total,IMAGE.unused,16,8,100,100,1];
  const edges=[];
  for(let n=0;n<graph.nodes;n++)for(let s=0;s<graph.slots;s++){
    const e=parseCell(graph.cells[n]?.[s]??'',graph.nodes,'extended');
    edges.push(e?((e.to<<8)|e.weight):IMAGE.unused);
  }
  const coords=positions.map(p=>((p.x<<16)|p.y)>>>0);
  const words=[...header,...edges,...coords];
  return {header,edges,coords,words,edgeBase,coordBase,total,text:words.map(hex32).join('\n')+'\n'};
}

export function decodeImage(text) {
  const raw=text.trim().split(/\s+/);
  if(raw.length<24||raw.some(w=>!(/^[0-9a-f]{8}$/i).test(w)))throw Error('NFG1 needs eight hex digits per 32-bit word.');
  const words=raw.map(w=>parseInt(w,16)),h=words.slice(0,24),nodes=h[3],slots=h[4];
  if(h[0]!==IMAGE.magic||h[1]!==1)throw Error('Not a supported NodeForge NFG1 image.');
  // Bound counts before allocating, then require canonical offsets and widths.
  validate({nodes,slots,format:'extended',cells:[]});
  const edges=nodes*slots,coordBase=24+edges,total=coordBase+nodes;
  const fixed={2:24,6:Math.max(1,Math.ceil(Math.log2(nodes))),7:8,8:32,9:640,10:480,11:10,12:9,13:24,14:edges,15:coordBase,16:nodes,17:total,18:IMAGE.unused,19:16,20:8,21:100,22:100,23:1};
  for(const [i,v] of Object.entries(fixed))if(h[i]!==v)throw Error(`Invalid header field: ${HEADER_FIELDS[i]}.`);
  if(words.length!==total)throw Error(`Header expects ${total} words; found ${words.length}.`);
  const cells=Array.from({length:nodes},()=>Array(slots).fill(''));
  for(let i=0;i<edges;i++){
    const word=words[24+i];if(word===IMAGE.unused)continue;
    const to=word>>>8,weight=word&255;
    if(to>=nodes)throw Error(`Connection ${i}: destination ${to} is outside this graph.`);
    cells[Math.floor(i/slots)][i%slots]=`${to} (${weight})`;
  }
  const positions=words.slice(coordBase).map(w=>({x:w>>>16,y:w&65535}));
  checkPositions(positions,nodes);
  const state={nodes,slots,format:'extended',cells};
  if(validate(state).count!==h[5])throw Error('The edge count does not match the header.');
  return {state,positions};
}

export function imageMap(state,positions) {
  const image=graphImage(state,positions);
  return [
    'NODEFORGE NFG1 · graph.hex',
    'Raw hexadecimal for $readmemh; not Intel HEX. Every line is one 32-bit word.',
    'Addresses are zero-based WORD addresses, not byte addresses.',
    '',
    '1. METADATA',
    ...image.header.map((v,i)=>`${String(i).padStart(2)} / 0x${i.toString(16).toUpperCase().padStart(4,'0')}  ${hex32(v)}  ${HEADER_FIELDS[i]} = ${v}`),
    '',
    `2. CONNECTIONS · words ${image.edgeBase}–${image.coordBase-1}`,
    'Address = connection_start + source_node * slots_per_node + slot (slot is zero-based).',
    'Word = 0000DDWW; destination = bits [15:8]; weight = bits [7:0].',
    'FFFFFFFF means unused. A zero-weight edge is valid. Reverse edges need their own entry.',
    '',
    `3. VGA COORDINATES · words ${image.coordBase}–${image.total-1}`,
    'Address = coordinate_start + node_id. Word = XXXXYYYY.',
    'X = bits [31:16] (0–639), Y = bits [15:0] (0–479).',
    'Origin is top-left. X increases right; Y increases down. All entries are node centres.',
    ...positions.map((p,n)=>`Node ${n}: (${p.x}, ${p.y}) = ${hex32(image.coords[n])}`),
    '',
    'FPGA INTEGRATION',
    'This is a new image format, not a drop-in replacement for the original 12-bit ROM.',
    'Compile hardware once for capacity: 100 nodes, 100 slots/node, 32-bit ROM, 10124 words, 14-bit address.',
    'Use an 8-bit node lane, 7-bit node/slot counts, 100-entry visited/distance/parent storage.',
    'Use 16-bit unsigned distances with FFFF as infinity; guard infinity before adding weights.',
    'Read active node count from word 3 and slot count from word 4. Only process those entries.',
    'The minimum-ID-bit field is descriptive; a HEX file cannot resize synthesized wires or parameters.',
    'VGA logic must draw circles/text at the coordinate centres and lines/arrows from each source to destination.',
    'Coordinates are data, not a bitmap or VGA waveform. Labels, weight text, arrows and self-loops need renderer logic.',
    'Browser path highlighting, visibility filters and zoom are not encoded. Connections and centres are encoded.',
    'Changing the initialization file requires a supported memory-image/bitstream update. Live replacement needs a RAM loader (UART/JTAG/etc.).',
    'Actual Dijkstra/VGA RTL must be adapted to this map and checked on your board.',
    ''
  ].join('\n');
}
