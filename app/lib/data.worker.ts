// Fetch, decompress and parse large detail chunks off the interaction thread.
import { decodeJson } from './decode-json';
const controllers = new Map<number,AbortController>();
self.onmessage = async ({data}:{data:{id:number;url?:string;compressed?:boolean;cancel?:boolean}}) => {
  if(data.cancel){controllers.get(data.id)?.abort();return;}
  const controller=new AbortController(); controllers.set(data.id,controller);
  try {
    const url=data.url!;
    const cacheable=/\/map\/[^/?]+-[0-9a-f]{12}\.json/.test(url);
    let cache:Cache|undefined;
    try { if(cacheable) cache=await caches.open('gusu-map-v1'); } catch { /* Private mode may deny cache storage. */ }
    let response=await cache?.match(url);
    if(!response){
      response=await fetch(url,{signal:AbortSignal.any([controller.signal, AbortSignal.timeout(30000)])});
      if(!response.ok) throw new Error(`地图资源加载失败 (${response.status})`);
      if(cache){try{
        await cache.put(url,response.clone());
        const keys=await cache.keys();
        for(const key of keys.slice(0,Math.max(0,keys.length-36))) await cache.delete(key);
      }catch{/* A full cache must not prevent loading. */}}
    }
    if(controller.signal.aborted) return;
    const value=await decodeJson(response, Boolean(data.compressed));
    if(!controller.signal.aborted) self.postMessage({id:data.id,value});
  }catch(error){self.postMessage({id:data.id,error:error instanceof Error?error.message:'地图加载失败'});}
  finally {controllers.delete(data.id);}
};
