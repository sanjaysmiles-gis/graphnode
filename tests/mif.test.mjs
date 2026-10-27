import assert from 'node:assert/strict';
import {graphImage,graphMif,graphPaddedHex,layoutNodes} from '../dist/image.mjs';
for(const [n,k] of [[1,1],[3,2],[16,4],[17,3],[99,100],[100,100]]){
 const state={nodes:n,slots:k,format:'extended',cells:Array.from({length:n},(_,i)=>Array.from({length:k},(_,s)=>s===0?`${(i+1)%n} (255)`:s===1?'0 (0)':''))};
 const p=layoutNodes(n),img=graphImage(state,p),mif=graphMif(state,p),decoded=Array(10124);
 assert.ok(mif.startsWith('WIDTH=32;\nDEPTH=10124;\nADDRESS_RADIX=HEX;\nDATA_RADIX=HEX;\nCONTENT BEGIN\n'));
 for(const line of mif.split('\n')){let m;if(m=line.match(/^([0-9A-F]{4}) : ([0-9A-F]{8});$/))decoded[parseInt(m[1],16)]=parseInt(m[2],16);else if(m=line.match(/^\[([0-9A-F]{4})\.\.([0-9A-F]{4})\] : 00000000;$/)){for(let a=parseInt(m[1],16);a<=parseInt(m[2],16);a++)decoded[a]=0;}}
 assert.deepEqual(decoded,[...img.words,...Array(10124-img.total).fill(0)]);
 assert.deepEqual(graphPaddedHex(state,p).trim().split('\n').map(x=>parseInt(x,16)),decoded);
 assert.equal(mif.includes('..'),img.total<10124);assert.ok(mif.endsWith('END;\n'));
}
assert.throws(()=>graphMif({nodes:1,slots:1,cells:[['1 (3)']]},[{x:0,y:0}]));
console.log('PASS: MIF decoded addresses and full memory match HEX at six dimensions, including zero/255 weights and maximum capacity.');
