import { useEffect, useMemo, useRef, useState } from 'react';
import { loadMapJson } from './assets';
import { mergeMapChunks, visibleTiles, type MapChunk, type MapManifest } from './map-stream';
import type { BasemapData } from '../types';

export function useMapDetail(base:BasemapData, manifest:MapManifest, bounds:number[], zoom:number, moving:boolean) {
  const cache=useRef(new Map<string,MapChunk>());
  const [chunks,setChunks]=useState<MapChunk[]>([]);
  const [status,setStatus]=useState<'ready'|'loading'|'error'>('ready');
  const [retry,setRetry]=useState(0);
  const wanted=visibleTiles(manifest,bounds,zoom);
  const key=wanted.map(t=>t.id).join(',');
  useEffect(()=>{
    if(moving) return;
    const controller=new AbortController();
    const timer=setTimeout(async()=>{
      if(!wanted.length){setChunks([]);setStatus('ready');return;}
      const missing=wanted.filter(t=>!cache.current.has(t.id));
      setStatus(missing.length?'loading':'ready');
      try {
        let index=0;
        await Promise.all(Array.from({length:Math.min(3,missing.length)},async()=>{
          while(index<missing.length){
            const tile=missing[index++];
            const chunk=await loadMapJson<MapChunk>(tile.path,controller.signal);
            if(controller.signal.aborted)return;
            cache.current.set(tile.id,chunk);
            const keep=new Set(wanted.map(t=>t.id));
            for(const id of cache.current.keys())if(cache.current.size>18&&!keep.has(id))cache.current.delete(id);
          }
        }));
        if(controller.signal.aborted)return;
        setChunks(wanted.map(t=>cache.current.get(t.id)!));setStatus('ready');
        const keep=new Set(wanted.map(t=>t.id));
        for(const id of cache.current.keys()) if(cache.current.size>18 && !keep.has(id))cache.current.delete(id);
      }catch{if(!controller.signal.aborted){setStatus('error');controller.abort();}}
    },300);
    return()=>{clearTimeout(timer);controller.abort();};
    // Tile IDs, not every pointer position, define the network request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[key,moving,retry,manifest]);
  const basemap=useMemo(()=>mergeMapChunks(base,chunks),[base,chunks]);
  return {basemap,status,retry:()=>setRetry(n=>n+1)};
}
