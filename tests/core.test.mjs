import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SAMPLE,decode,encode,validate,shortestPath,pasteCells,toMif,parseCell} from '../dist/core.mjs';
const original=readFileSync(new URL('./fixtures/graph.mem',import.meta.url),'utf8');
assert.equal(SAMPLE,original,'Embedded sample must match every original byte');
const sample=decode(original,16,4,'legacy');
assert.equal(encode(sample),original,'Sample import/export must match every byte');
assert.equal(encode(sample).trim().split('\n')[54],'F14');
assert.deepEqual(parseCell('15 (20)',16,'legacy'),{to:15,weight:20});
assert.throws(()=>parseCell('15 (255)',16,'legacy'),/reserved/);
assert.throws(()=>parseCell('16 (4)',16,'legacy'),/Neighbour/);
assert.throws(()=>parseCell('1 (-2)',16,'legacy'));
assert.throws(()=>parseCell('1 (256)',16,'legacy'),/Weight/);
assert.throws(()=>decode(original,15,4,'legacy'),/Expected/);
assert.throws(()=>decode(original.replace('104','1XZ'),16,4,'legacy'),/hex digits/);
assert.throws(()=>decode(original,16,4,'extended'),/hex digits/);
assert.equal(toMif(sample).split('\n')[0],'WIDTH=12;');
let pasted=pasteCells(sample,0,0,'2 (0)\t3 (255)\n4 (3)\t');
assert.deepEqual(pasted.cells[0].slice(0,2),['2 (0)','3 (255)']);
assert.equal(pasted.cells[1][1],'');
assert.throws(()=>pasteCells(sample,15,3,'1 (1)\t2 (2)'),/exceeds/);
assert.equal(sample.cells[0][0],'1 (4)','Pasting must be atomic');

// Independent Floyd–Warshall oracle for all source/target pairs in the sample.
function oracle(s){const d=Array.from({length:s.nodes},(_,i)=>Array.from({length:s.nodes},(_,j)=>i===j?0:Infinity));for(let u=0;u<s.nodes;u++)for(const e of validate(s).edges[u])d[u][e.to]=Math.min(d[u][e.to],e.weight);for(let k=0;k<s.nodes;k++)for(let i=0;i<s.nodes;i++)for(let j=0;j<s.nodes;j++)d[i][j]=Math.min(d[i][j],d[i][k]+d[k][j]);return d;}
const distances=oracle(sample);
for(let s=0;s<16;s++)for(let t=0;t<16;t++){const r=shortestPath(sample,s,t);assert.equal(r.distance,distances[s][t]);assert.equal(r.path[0],s);assert.equal(r.path.at(-1),t);}
const tiny={nodes:4,slots:3,format:'legacy',cells:[['1 (0)','1 (8)','0 (0)'],['2 (0)','',''],['','',''],['','','']]};
assert.deepEqual(shortestPath(tiny,0,2).path,[0,1,2]);assert.equal(shortestPath(tiny,0,2).distance,0);assert.equal(shortestPath(tiny,2,0).distance,Infinity);assert.deepEqual(shortestPath(tiny,3,3).path,[3]);
const full={nodes:100,slots:100,format:'extended',cells:Array.from({length:100},(_,n)=>Array.from({length:100},(_,s)=>`${s} (${(n+s)%256})`))};
full.cells[0][0]='99 (255)';full.cells[99][99]='';
const maxHex=encode(full);assert.equal(maxHex.trim().split('\n').length,10000);assert.equal(maxHex.slice(0,5),'63FF\n');assert.equal(maxHex.trim().split('\n').at(-1),'FFFF');assert.deepEqual(decode(maxHex,100,100,'extended'),full);
const maxOracle=oracle(full);for(const [s,t] of [[0,99],[99,0],[73,64],[32,71]])assert.equal(shortestPath(full,s,t).distance,maxOracle[s][t]);
console.log('PASS: original ROM roundtrip, cell validation, 256 shortest paths and 100×100 graph boundaries.');
