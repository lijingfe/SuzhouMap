import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
import {visibleTiles, mergeMapChunks} from '../app/lib/map-stream.ts';
import {decodeJson} from '../app/lib/decode-json.ts';
const root = new URL('../', import.meta.url);
const read = async p => JSON.parse(await readFile(new URL(p,root),'utf8'));
test('gzip and automatically decompressed responses both decode',async()=>{
  const data={message:'姑苏寻迹'};
  assert.deepEqual(await decodeJson(new Response(gzipSync(JSON.stringify(data))),true),data);
  assert.deepEqual(await decodeJson(new Response(JSON.stringify(data),{headers:{'Content-Encoding':'gzip'}}),true),data);
  assert.deepEqual(await decodeJson(Response.json(data),false),data);
  await assert.rejects(decodeJson(new Response('<html>not JSON</html>'),true));
});
test('detail selection is viewport bounded, capped and disabled at overview zoom',()=>{
  const manifest={tiles:Array.from({length:20},(_,i)=>({id:String(i),bounds:[i,0,i+1,1]}))};
  assert.equal(visibleTiles(manifest,[0,0,20,1],7.9).length,0);
  assert.equal(visibleTiles(manifest,[0,0,20,1],15).length,12);
  assert.deepEqual(visibleTiles(manifest,[6.1,0,6.9,1],15).map(t=>t.id),['6']);
  assert.deepEqual(visibleTiles(manifest,[50,0,51,1],15),[]);
});
test('tile merge deduplicates features and detailed geometry replaces overview',()=>{
  const empty={roads:[],water:[],waterAreas:[],landcover:[]};
  const base={...empty,roads:[{id:'a',name:'coarse'}],transitStations:[{id:'station'}]};
  const chunk={...empty,roads:[{id:'a',name:'detail'},{id:'b'}]};
  const merged=mergeMapChunks(base,[chunk,chunk]);
  assert.equal(merged.roads.length,2);assert.equal(merged.roads[0].name,'detail');
  assert.equal(merged.transitStations,base.transitStations);assert.equal(base.roads[0].name,'coarse');
});
test('overview stays below 1MB gzip, keeps landmark lakes and tiles cover every feature',async()=>{
  const manifest=await read('public/data/map/manifest.json');
  assert.ok(manifest.overviewBytes<1024*1024);
  assert.ok(manifest.tiles.every(t=>t.bytes<512*1024));
  const overview=await read('public'+manifest.overview);
  for(const name of ['金鸡湖','独墅湖'])assert.ok(overview.waterAreas.some(f=>f.name===name),name);
  const ids=Object.fromEntries(['roads','water','waterAreas','landcover'].map(k=>[k,new Set()]));
  for(const tile of manifest.tiles){const chunk=await read('public'+tile.path);for(const k of Object.keys(ids))for(const f of chunk[k])ids[k].add(f.id);}
  const source=await read('public/data/basemap.json');
  for(const k of Object.keys(ids))for(const f of source[k])assert.ok(ids[k].has(f.id),`${k}/${f.id}`);
});
