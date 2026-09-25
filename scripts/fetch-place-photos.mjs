import { readdir, readFile, writeFile, mkdir, access } from "node:fs/promises";
const root = new URL("../", import.meta.url);
const researchDir = new URL("content/research/", root);
const photoDir = new URL("public/images/places/", root);
const manifestFile = new URL("content/place-photos.json", root);
await mkdir(photoDir, { recursive: true });
let manifest = {};
try { manifest = JSON.parse(await readFile(manifestFile, "utf8")); } catch { /* First download. */ }
const plain = (s = "") => s.replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&#0?39;/g, "'").replace(/&quot;/g, '"').trim();
for (const file of await readdir(researchDir)) {
  const source = JSON.parse(await readFile(new URL(file, researchDir), "utf8"));
  if (!source.paragraphs?.length || source.paragraphs.some((text) => text.includes("Wikimedia projects"))) continue;
  if (["苏州博物馆西馆", "苏州丝绸博物馆", "平门", "西交利物浦大学 (南校区)", "中国科学技术大学苏州研究院（仁爱路校园）", "国防科技大学外国语学院昆山校区"].includes(source.name)) {
    delete manifest[source.id];
    await writeFile(manifestFile, JSON.stringify(manifest, null, 2));
    continue;
  }
  if (manifest[source.id]?.length) { console.log(`${source.name}: cached photo`); continue; }
  const names = source.images.filter((name) => !/logo|sign.of|coat.of|Wangshiyuan|大運河|外国语学院|map\.png|Guo_Moruo|Bei_Shizhang/i.test(name)).slice(0, 1);
  if (!names.length) continue;
  await new Promise((resolve) => setTimeout(resolve, 6500));
  const api = new URL("https://commons.wikimedia.org/w/api.php");
  api.search = new URLSearchParams({ action: "query", format: "json", titles: names.map((name) => `File:${name}`).join("|"), prop: "imageinfo", iiprop: "url|extmetadata|size|mime", iiurlwidth: "960" });
  try {
    let response = await fetch(api, { signal: AbortSignal.timeout(20000) });
    if (response.status === 429) {
      await new Promise((resolve) => setTimeout(resolve, 60000));
      response = await fetch(api, { signal: AbortSignal.timeout(20000) });
    }
    if (!response.ok) throw new Error(`metadata HTTP ${response.status}`);
    const data = await response.json();
    const photos = [];
    for (const name of names) {
      const page = Object.values(data.query?.pages ?? {}).find((p) => p.title.replaceAll(" ", "_") === `File:${name}`.replaceAll(" ", "_"));
      const info = page?.imageinfo?.[0];
      if (!info || !["image/jpeg", "image/png"].includes(info.mime)) continue;
      const metadata = info.extmetadata;
      const license = plain(metadata.LicenseShortName?.value);
      if (!/CC BY|CC0|Public domain/i.test(license)) continue;
      if (info.width < 400 || info.height < 200) continue;
      const remote = info.thumburl ?? info.url;
      const filename = `${source.id}-${photos.length + 1}.${info.mime === "image/png" ? "png" : "jpg"}`;
      const local = new URL(filename, photoDir);
      try { await access(local); } catch {
        const image = await fetch(remote, { signal: AbortSignal.timeout(25000) });
        if (!image.ok || !image.headers.get("content-type")?.startsWith("image/")) throw new Error(`photo HTTP ${image.status}`);
        await writeFile(local, new Uint8Array(await image.arrayBuffer()));
      }
      photos.push({ url: `/images/places/${filename}`, sourceName: "Wikimedia Commons", sourceUrl: info.descriptionurl,
        author: plain(metadata.Artist?.value), license, licenseUrl: metadata.LicenseUrl?.value ?? "https://creativecommons.org/publicdomain/mark/1.0/",
        caption: plain(metadata.ImageDescription?.value).slice(0, 300), originalUrl: info.url, fetchedAt: source.fetchedAt });
    }
    if (photos.length) manifest[source.id] = photos;
    await writeFile(manifestFile, JSON.stringify(manifest, null, 2));
    console.log(`${source.name}: ${photos.length} licensed local photos`);
  } catch (error) { console.log(`${source.name}: FAILED ${error.message}`); }
}
