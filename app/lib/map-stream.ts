import type { BasemapData } from '../types';

export type MapTile = { id:string; bounds:number[]; path:string; bytes:number };
export type MapManifest = {version:number; overview:string; overviewBytes:number; tiles:MapTile[]};
export type MapChunk = Pick<BasemapData, 'roads'|'water'|'waterAreas'|'landcover'>;
export function visibleTiles(manifest:MapManifest, bounds:number[], zoom:number) {
  if (zoom < 8) return [];
  const [l,b,r,t]=bounds;
  const cx=(l+r)/2, cy=(b+t)/2;
  return manifest.tiles.filter(tile=>tile.bounds[0]<=r && tile.bounds[2]>=l && tile.bounds[1]<=t && tile.bounds[3]>=b)
    .sort((a,b)=>Math.hypot((a.bounds[0]+a.bounds[2])/2-cx,(a.bounds[1]+a.bounds[3])/2-cy)-Math.hypot((b.bounds[0]+b.bounds[2])/2-cx,(b.bounds[1]+b.bounds[3])/2-cy)).slice(0,12);
}
export function mergeMapChunks(base:BasemapData, chunks:MapChunk[]):BasemapData {
  const result={...base};
  for(const key of ['roads','water','waterAreas','landcover'] as const) {
    const items=new Map<string, BasemapData[typeof key][number]>();
    for(const item of base[key]) items.set(item.id,item);
    for(const chunk of chunks) for(const item of chunk[key]) items.set(item.id,item);
    // Each key retains its own feature type; no cross-layer values are inserted.
    Object.assign(result,{[key]:[...items.values()]});
  }
  return result;
}
