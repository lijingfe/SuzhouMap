import { readFile } from "node:fs/promises";

const contentDir = new URL("../content/", import.meta.url);
const mismatchedArticles = new Set([
  "中国科学技术大学苏州研究院（仁爱路校园）",
  "国防科技大学外国语学院昆山校区",
]);

export async function enrichPlaces(places) {
  const editorial = JSON.parse(await readFile(new URL("place-editorial.json", contentDir), "utf8"));
  const photos = JSON.parse(await readFile(new URL("place-photos.json", contentDir), "utf8"));
  const visits = JSON.parse(await readFile(new URL("place-visits.json", contentDir), "utf8"));
  return Promise.all(places.map(async (place) => {
    const entry = editorial[place.name];
    if (!entry) return place;
    const visitGuide = visits[place.name];
    const contentSources = [];
    if (!mismatchedArticles.has(place.name)) {
      try {
        const research = JSON.parse(await readFile(new URL(`research/${place.id}.json`, contentDir), "utf8"));
        if (research.paragraphs?.length && !research.paragraphs.some((text) => text.includes("Wikimedia projects"))) {
          contentSources.push({ name: `背景参考：${research.title}`, url: research.url, license: "CC BY-SA 4.0" });
        }
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
    if (place.name === "横塘驿站") {
      contentSources.push({ name: "Wikidata 基础条目", url: "https://www.wikidata.org/wiki/Q124079220", license: "CC0" });
    }
    return {
      ...place,
      encyclopedia: entry.encyclopedia,
      recommendation: entry.recommendation,
      opening: visitGuide ? "当日开放时段与预约要求尚未逐项核实；请结合下方到访提醒查询管理方公告。" : entry.opening ?? place.opening,
      price: visitGuide ? "未核实当前票价；以官方票务及现场公示为准，地图收录不代表免费开放。" : entry.price ?? place.price,
      officialUrl: entry.officialUrl ?? place.officialUrl,
      tags: [...new Set([...place.tags, ...(entry.tags ?? [])])],
      images: photos[place.id] ?? [],
      contentUpdatedAt: visitGuide ? "2026-09-25" : "2026-09-05",
      visitGuide,
      contentSources: [...contentSources, ...(visitGuide?.sources ?? [])],
    };
  }));
}
