import { decodeJson } from './decode-json';
declare const __GUSU_BASE_PATH__: string | undefined;
declare const __GUSU_COMPRESSED_DATA__: boolean | undefined;
export const isPublicBuild = typeof __GUSU_COMPRESSED_DATA__ !== "undefined" && __GUSU_COMPRESSED_DATA__;

export function assetUrl(path: string) {
  if (!path.startsWith("/") || path.startsWith("//")) return path;
  const base = typeof __GUSU_BASE_PATH__ === "undefined" ? "/" : __GUSU_BASE_PATH__ ?? "/";
  return `${base}${path.slice(1)}`;
}

export async function loadMapJson<T>(path: string, signal: AbortSignal): Promise<T> {
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
  if (typeof Worker !== 'undefined') {
    const worker = getDataWorker();
    if (worker) return new Promise<T>((resolve, reject) => {
      const id = ++requestId;
      const abort = () => { worker.postMessage({id,cancel:true}); pending.delete(id); reject(new DOMException('Aborted','AbortError')); };
      signal.addEventListener('abort', abort, {once:true});
      pending.set(id, { resolve: value => { signal.removeEventListener('abort',abort); resolve(value as T); }, reject: error => { signal.removeEventListener('abort',abort); reject(error); } });
      worker.postMessage({id,url:new URL(assetUrl(path+(isPublicBuild?'.gz':'')),window.location.href).href,compressed:isPublicBuild});
    });
  }
  const compressed = isPublicBuild;
  const response = await fetch(assetUrl(path + (compressed ? ".gz" : "")), { signal });
  if (!response.ok) throw new Error(`地图数据请求失败：${response.status}`);
  return decodeJson(response, compressed) as Promise<T>;
}

let dataWorker:Worker|null=null;
let requestId=0;
const pending=new Map<number,{resolve:(value:unknown)=>void;reject:(error:Error)=>void}>();
function getDataWorker() {
  if(dataWorker) return dataWorker;
  try {
    dataWorker=new Worker(new URL('./data.worker.ts',import.meta.url),{type:'module'});
    dataWorker.onmessage=({data})=>{
      const request=pending.get(data.id); if(!request)return;
      pending.delete(data.id);
      if(data.error)request.reject(new Error(data.error));else request.resolve(data.value);
    };
    dataWorker.onerror=()=>{
      for(const request of pending.values())request.reject(new Error('地图解析失败，请重试'));
      pending.clear();dataWorker?.terminate();dataWorker=null;
    };
    return dataWorker;
  }catch{return null;}
}
