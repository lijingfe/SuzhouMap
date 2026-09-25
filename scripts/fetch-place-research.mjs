import { readFile, writeFile, mkdir } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const dir = new URL("content/research/", root);
await mkdir(dir, { recursive: true });
const places = JSON.parse(await readFile(new URL("public/data/places.json", root), "utf8")).places
  .filter((place) => place.library === "core" && place.priority <= 2)
  .filter((place) => !process.argv[2] || place.name.includes(process.argv[2]));
const raw = (await Promise.all(["places", "places-essential"].map(async (name) =>
  JSON.parse(await readFile(new URL(`public/data/raw/${name}.json`, root), "utf8")).elements))).flat();
const titles = {
  "北寺塔": "报恩寺塔 (苏州市)",
  "苏州博物馆西馆": "苏州博物馆", "甪直古镇": "甪直镇", "黎里古镇": "黎里镇", "木渎古镇": "木渎镇",
  "震泽古镇": "震泽镇", "千灯古镇": "千灯镇", "虎丘": "虎丘", "虎丘塔（云岩寺塔）": "云岩寺塔",
  "西交利物浦大学 (南校区)": "西交利物浦大学", "中国昆曲博物馆": "苏州戏曲博物馆",
  "苏州摩天轮": "苏州摩天轮乐园",
  "怡园": "怡园", "苏州文庙": "苏州文庙", "横塘驿站": "横塘驿站", "金门": "金门 (苏州)",
  "江苏巡抚衙门旧址": "江苏巡抚衙门", "苏帮菜博物馆西中市馆": "苏帮菜博物馆",
};
function plain(html) {
  return html.replace(/<sup\b[\s\S]*?<\/sup>/gi, "").replace(/<(?:"[^"]*"|'[^']*'|[^'">])*>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code))).trim();
}
for (let offset = 0; offset < places.length; offset += 1) {
  await Promise.all(places.slice(offset, offset + 1).map(async (place) => {
    const file = new URL(`${place.id}.json`, dir);
    try { const saved = JSON.parse(await readFile(file)); if (saved.paragraphs.length && !saved.paragraphs[0]?.includes("Wikimedia projects")) { console.log(`${place.name}: cached`); return; } } catch { /* missing */ }
    const tags = raw.find((element) => `osm-${element.type}-${element.id}` === place.id)?.tags;
    const title = titles[place.name] ?? (tags?.wikipedia?.startsWith("zh:") ? tags.wikipedia.slice(3) : place.name);
    const url = `https://api.wikimedia.org/core/v1/wikipedia/zh/page/${encodeURIComponent(title.replaceAll(" ", "_"))}/html`;
    try {
      await new Promise((resolve) => setTimeout(resolve, 7000));
      let response = await fetch(url, { signal: AbortSignal.timeout(25000), headers: { "User-Agent": "Gusu-Trails-Local-Research/1.0" } });
      if (response.status === 429) {
        const seconds = Math.max(60, Number(response.headers.get("retry-after")) || 60);
        console.log(`${place.name}: rate limited, waiting ${seconds}s`);
        await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
        response = await fetch(url, { signal: AbortSignal.timeout(25000) });
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const html = await response.text();
      if (!html.includes("mw:pageId")) throw new Error("Response was not an encyclopedia article");
      const cleaned = html.replace(/<(?:style|script|table)\b[\s\S]*?<\/(?:style|script|table)>/gi, "");
      const paragraphs = [...cleaned.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map((match) => plain(match[1])).filter((p) => p.length > 30);
      const images = [...new Set([...html.matchAll(/resource="\.\/File:([^"]+)"/g)].map((match) => plain(match[1])).filter((name) => /\.(jpg|jpeg|png)$/i.test(name)))].slice(0, 10);
      const record = { id: place.id, name: place.name, title, url: `https://zh.wikipedia.org/wiki/${encodeURIComponent(title)}`, fetchedAt: new Date().toISOString().slice(0, 10), paragraphs, images };
      await writeFile(file, JSON.stringify(record, null, 2));
      console.log(`${place.name}: ${paragraphs.length} paragraphs; ${images.slice(0, 2).join(" / ")}`);
    } catch (error) { console.log(`${place.name}: FAILED ${error.message}`); }
  }));
}
