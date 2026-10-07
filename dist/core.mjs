export const SAMPLE = `104
402
605
FFF
004
203
506
FFF
103
305
502
FFF
205
703
507
FFF
002
101
204
603
106
202
307
702
005
403
704
802
303
502
604
903
602
904
A03
FFF
703
804
B02
FFF
803
905
B02
C04
902
A02
C03
FFF
A04
B03
D02
E05
C02
E03
F14
FFF
C05
D03
F02
FFF
E02
FFF
FFF
FFF
`;

export function dimensions(nodes, slots, format) {
  if (!Number.isInteger(nodes) || nodes < 1 || nodes > 100) throw Error('Use 1–100 nodes.');
  if (!Number.isInteger(slots) || slots < 1 || slots > 100) throw Error('Use 1–100 neighbours per node.');
  if (!['legacy','extended'].includes(format)) throw Error('Choose a ROM format.');
  if (format === 'legacy' && nodes > 16) throw Error('More than 16 nodes needs the extended 16-bit format.');
}
export function parseCell(text, nodes, format) {
  const t=String(text).trim();
  if (!t || /^unused$/i.test(t) || t==='—' || t==='-') return null;
  const match=t.match(/^(\d+)\s*(?:\(\s*(\d+)\s*\)|:\s*(\d+)|,\s*(\d+)|\s+(\d+))$/);
  if (!match) throw Error('Enter neighbour (weight), for example 4 (12).');
  const to=Number(match[1]), weight=Number(match[2]??match[3]??match[4]??match[5]);
  if (!Number.isInteger(to) || to < 0 || to >= nodes) throw Error(`Neighbour must be 0–${nodes-1}.`);
  if (!Number.isInteger(weight) || weight < 0 || weight > 255) throw Error('Weight must be an integer from 0 to 255.');
  if(format==='legacy' && to===15 && weight===255) throw Error('15 (255) is reserved as FFF in the legacy format.');
  return {to,weight};
}
export function validate(state) {
  dimensions(state.nodes,state.slots,state.format);
  const edges=[], errors=[];
  let count=0;
  for(let n=0;n<state.nodes;n++) {
    edges[n]=[];
    for(let s=0;s<state.slots;s++) {
      try { const edge=parseCell(state.cells[n]?.[s]??'',state.nodes,state.format); if(edge){edges[n].push({...edge,slot:s});count++;} }
      catch(e){errors.push({node:n,slot:s,message:e.message});}
    }
  }
  return {edges,errors,count};
}
export function encode(state) {
  const checked=validate(state);
  if(checked.errors.length) throw Error(`Fix ${checked.errors.length} invalid cell(s) before exporting.`);
  const width=state.format==='legacy'?3:4, sentinel=state.format==='legacy'?'FFF':'FFFF';
  const lines=[];
  for(let n=0;n<state.nodes;n++) for(let s=0;s<state.slots;s++) {
    const e=parseCell(state.cells[n]?.[s]??'',state.nodes,state.format);
    lines.push(e?((e.to<<8)|e.weight).toString(16).toUpperCase().padStart(width,'0'):sentinel);
  }
  return lines.join('\n')+'\n';
}
export function decode(text,nodes,slots,format) {
  dimensions(nodes,slots,format);
  const width=format==='legacy'?3:4;
  const words=text.replace(/\/\/[^\n]*/g,'').trim().split(/\s+/);
  if(words.length!==nodes*slots) throw Error(`Expected ${nodes*slots} words (${nodes} × ${slots}); found ${words.length}. Set the matching dimensions first.`);
  const cells=Array.from({length:nodes},()=>Array(slots).fill(''));
  words.forEach((w,i)=>{
    if(!(new RegExp(`^[0-9a-fA-F]{${width}}$`)).test(w)) throw Error(`Word ${i}: expected exactly ${width} hex digits. Intel HEX is not a raw ROM file.`);
    if(w.toUpperCase()===(width===3?'FFF':'FFFF'))return;
    const num=parseInt(w,16), to=num>>8, weight=num&255;
    if(to>=nodes)throw Error(`Word ${i}: neighbour ${to} is outside 0–${nodes-1}.`);
    cells[Math.floor(i/slots)][i%slots]=`${to} (${weight})`;
  });
  return {nodes,slots,format,cells};
}
export function shortestPath(state,source,target) {
  const {edges,errors}=validate(state);
  if(errors.length)throw Error('Fix the invalid cells before running Dijkstra.');
  if(!Number.isInteger(source)||!Number.isInteger(target)||source<0||target<0||source>=state.nodes||target>=state.nodes)throw Error('Choose valid source and target nodes.');
  const dist=Array(state.nodes).fill(Infinity),prev=Array(state.nodes).fill(-1), seen=Array(state.nodes).fill(false),steps=[];
  dist[source]=0;
  for(let i=0;i<state.nodes;i++) {
    let u=-1;
    for(let j=0;j<state.nodes;j++)if(!seen[j]&&(u===-1||dist[j]<dist[u]))u=j;
    if(u<0||dist[u]===Infinity)break;
    seen[u]=true;
    for(const e of edges[u])if(!seen[e.to]&&dist[u]+e.weight<dist[e.to]) {dist[e.to]=dist[u]+e.weight;prev[e.to]=u;}
    steps.push({current:u,dist:[...dist],visited:[...seen]});
    if(u===target)break;
  }
  const path=[];
  if(dist[target]!==Infinity){let v=target;for(let i=0;i<state.nodes;i++){path.push(v);if(v===source)break;v=prev[v];}path.reverse();}
  return {distance:dist[target],path,dist,steps};
}
export function pasteCells(state,row,col,text) {
  const lines=text.replace(/\r/g,'').replace(/\n$/,'').split('\n').map(x=>x.split('\t'));
  if(row+lines.length>state.nodes || lines.some(x=>col+x.length>state.slots))throw Error('The pasted range exceeds the table. Increase the dimensions first.');
  const cells=state.cells.map(x=>[...x]);
  lines.forEach((line,r)=>line.forEach((value,c)=>{cells[row+r][col+c]=value.trim();}));
  return {...state,cells};
}
export function toMif(state) {
  const words=encode(state).trim().split('\n');
  return `WIDTH=${state.format==='legacy'?12:16};\nDEPTH=${words.length};\nADDRESS_RADIX=UNS;\nDATA_RADIX=HEX;\nCONTENT BEGIN\n${words.map((w,i)=>`  ${i} : ${w};`).join('\n')}\nEND;\n`;
}
export function csvTable(state) {
  return [['Node',...Array.from({length:state.slots},(_,i)=>`Neighbour ${i+1}`)],...state.cells.map((r,i)=>[i,...r])].map(row=>row.map(x=>'"'+String(x).replaceAll('"','""')+'"').join(',')).join('\r\n')+'\r\n';
}
