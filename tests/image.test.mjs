import assert from 'node:assert/strict';
import {SAMPLE,decode} from '../dist/core.mjs';
import {graphImage,decodeImage,layoutNodes,hex32} from '../dist/image.mjs';
const sample={...decode(SAMPLE,16,4,'legacy'),format:'extended'},pos=layoutNodes(16),img=graphImage(sample,pos);
assert.deepEqual(img.header,[0x4E464731,1,24,16,4,52,4,8,32,640,480,10,9,24,64,88,16,104,0xFFFFFFFF,16,8,100,100,1]);
// Independently compute all legacy edge values and source/slot addresses.
SAMPLE.trim().split('\n').forEach((word,i)=>assert.equal(img.words[24+i],word==='FFF'?0xFFFFFFFF:parseInt(word,16)));
assert.equal(img.words[88],64*65536+56);assert.equal(img.words[103],576*65536+424);
assert.deepEqual(decodeImage(img.text),{state:sample,positions:pos});
const edgecase={nodes:16,slots:3,format:'extended',cells:Array.from({length:16},()=>['','',''])};
edgecase.cells[0]=['0 (0)','15 (255)','15 (255)'];const ep=layoutNodes(16);ep[0]={x:0,y:0};ep[15]={x:639,y:479};
const ei=graphImage(edgecase,ep);assert.equal(ei.words[24],0);assert.equal(ei.words[25],0xFFF);assert.equal(ei.words[26],0xFFF);assert.equal(ei.coords[15],0x027F01DF);assert.deepEqual(decodeImage(ei.text).state,edgecase);
for(const n of [1,2,16,17,99,100])for(const slots of [1,4,100])for(const layout of ['grid','circle']){
 const state={nodes:n,slots,format:'extended',cells:Array.from({length:n},(_,i)=>Array.from({length:slots},(_,j)=>j===0?`${(i+1)%n} (255)`:''))};
 const p=layoutNodes(n,layout),i=graphImage(state,p);assert.equal(i.words.length,24+n*slots+n);assert.deepEqual(decodeImage(i.text),{state,positions:p});assert.match(i.text,/^(?:[A-F0-9]{8}\n)+$/);
}
const max={nodes:100,slots:100,format:'extended',cells:Array.from({length:100},()=>Array.from({length:100},(_,n)=>`${n} (255)`))};
const mi=graphImage(max,layoutNodes(100));assert.equal(mi.total,10124);assert.equal(mi.header[5],10000);assert.equal(mi.coordBase,10024);assert.equal(mi.edges.at(-1),0x63FF);
for(let n=0;n<100;n++)for(let slot=0;slot<100;slot++)assert.equal(mi.words[24+n*100+slot],slot*256+255);
function corrupt(index,value){const words=[...img.words];words[index]=value;return words.map(hex32).join('\n');}
for(const [index,value] of [[0,0],[1,2],[2,23],[3,101],[4,0],[5,99],[8,16],[13,0],[15,24],[17,999],[18,65535],[20,7],[23,0],[24,0x1000],[88,640*65536],[88,480]])assert.throws(()=>decodeImage(corrupt(index,value)));
assert.throws(()=>decodeImage(img.text+'00000000\n'));assert.throws(()=>decodeImage(img.text.replace('4E464731','GGGGGGGG')));
assert.throws(()=>graphImage(sample,[{x:0,y:0}]));assert.throws(()=>graphImage(sample,pos.map((p,i)=>i? p:{x:1.5,y:0})));
console.log('PASS: exact NFG1 header/address map, all 10000 edge addresses, 36 dimension/layout roundtrips, 0/255 weights, unused slots, coordinates and malformed files.');
