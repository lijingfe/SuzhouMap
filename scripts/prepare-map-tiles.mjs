import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { simplifyLine } from '../app/lib/map-detail.ts';

const root = new URL('../public/data/', import.meta.url);
const target = new URL('map/', root);
await mkdir(target, { recursive: true });
const source = JSON.parse(await readFile(new URL('basemap.json', root), 'utf8'));
const keys = ['roads', 'water', 'waterAreas', 'landcover'];
const empty = () => Object.fromEntries(keys.map(k => [k, []]));
const overview = { ...source, ...empty() };
const tiles = new Map();
const dx = 0.08, dy = 0.06;
const points = f => f.coordinates ?? (f.geometry.type === 'Polygon' ? f.geometry.coordinates.flat() : f.geometry.coordinates.flat(2));
const bounds = f => points(f).reduce((b, [x,y]) => [Math.min(b[0],x),Math.min(b[1],y),Math.max(b[2],x),Math.max(b[3],y)], [Infinity,Infinity,-Infinity,-Infinity]);
const simple = f => {
  if (f.coordinates) return { ...f, coordinates: simplifyLine(f.coordinates, 0.00012) };
  const polygons = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  const reduced = polygons.map(p => p.map(r => simplifyLine(r, 0.0001)));
  return {...f, geometry:{...f.geometry, coordinates:f.geometry.type === 'Polygon' ? reduced[0] : reduced}};
};
for (const key of keys) for (const feature of source[key]) {
  const b = bounds(feature);
  const area = (b[2]-b[0])*(b[3]-b[1]);
  const prominent = key === 'roads' ? ['motorway', 'trunk'].includes(feature.roadClass) : key === 'waterAreas' ? area > 0.0003 || ['金鸡湖','独墅湖'].includes(feature.name) : key === 'landcover' ? area > 0.0005 : false;
  if (prominent) overview[key].push(simple(feature));
  for (let x=Math.floor(b[0]/dx);x<=Math.floor(b[2]/dx);x++) for(let y=Math.floor(b[1]/dy);y<=Math.floor(b[3]/dy);y++) {
    const id = `${x}_${y}`;
    if (!tiles.has(id)) tiles.set(id, { bounds:[x*dx,y*dy,(x+1)*dx,(y+1)*dy], data:empty() });
    tiles.get(id).data[key].push(feature);
  }
}
async function save(name, data) {
  const text = JSON.stringify(data);
  const hash = createHash('sha256').update(text).digest('hex').slice(0,12);
  const filename = `${name}-${hash}.json`;
  const compressed = gzipSync(text, {level:9});
  await writeFile(new URL(filename, target),text);
  await writeFile(new URL(filename+'.gz', target),compressed);
  return { path:'/data/map/'+filename, bytes:compressed.length };
}
const main = await save('overview', overview);
const entries=[];
for(const [id,tile] of tiles) entries.push({id,bounds:tile.bounds,...await save('tile-'+id,tile.data)});
const manifest={version:1,overview:main.path,overviewBytes:main.bytes,tiles:entries};
const text=JSON.stringify(manifest);
await writeFile(new URL('manifest.json',target),text);
await writeFile(new URL('manifest.json.gz',target),gzipSync(text));
console.log(`Map overview ${(main.bytes/1024).toFixed(0)} KB; ${entries.length} on-demand tiles; largest ${(Math.max(...entries.map(e=>e.bytes))/1024).toFixed(0)} KB gzip`);
