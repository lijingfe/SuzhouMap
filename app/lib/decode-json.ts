// Static hosts differ: some send .gz verbatim, others set Content-Encoding
// and the browser decompresses automatically. Inspect bytes, not the suffix.
export async function decodeJson(response: Response, compressed: boolean) {
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (compressed && bytes[0] === 0x1f && bytes[1] === 0x8b) {
    if (typeof DecompressionStream === 'undefined') throw new Error('请使用支持压缩数据的新版浏览器');
    return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).json();
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}
