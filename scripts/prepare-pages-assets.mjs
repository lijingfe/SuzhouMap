import { readFile, writeFile, mkdir, cp, access } from "node:fs/promises";
import { gzipSync } from "node:zlib";

const root = new URL("../", import.meta.url);
const output = new URL("out/", root);
await mkdir(new URL("data/", output), { recursive: true });
const names = ["suzhou", "industrial-park", "basemap", "places", "regions", "transport-config"];
for (const name of names) {
  const sourceName = name === "suzhou" ? "suzhou-osm" : name;
  let compressed;
  try {
    const source = await readFile(new URL(`public/data/${sourceName}.json`, root));
    if (name === "suzhou") {
      const data = JSON.parse(source);
      if (data.license !== "ODbL 1.0" || data.features.length !== 9) throw new Error("Unverified public boundary source");
    }
    compressed = gzipSync(source, { level: 9 });
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    compressed = await readFile(new URL(`public/data/${sourceName}.json.gz`, root));
  }
  await writeFile(new URL(`data/${name}.json.gz`, output), compressed);
  console.log(`${name}: ${(compressed.length / 1024 / 1024).toFixed(2)} MB compressed`);
}
const { places } = JSON.parse(await readFile(new URL("public/data/places.json", root), "utf8").catch(async (error) => {
  if (error.code !== "ENOENT") throw error;
  const { gunzipSync } = await import("node:zlib");
  return gunzipSync(await readFile(new URL("public/data/places.json.gz", root))).toString();
}));
const mapManifest = JSON.parse(await readFile(new URL('public/data/map/manifest.json', root), 'utf8'));
await mkdir(new URL('data/map/', output), { recursive: true });
for (const path of ['/data/map/manifest.json', mapManifest.overview, ...mapManifest.tiles.map(tile => tile.path)]) {
  if (!/^\/data\/map\/[a-z0-9_.-]+\.json$/.test(path)) throw new Error('Invalid map tile path');
  await cp(new URL(`public${path}.gz`, root), new URL(`${path.slice(1)}.gz`, output));
}
await mkdir(new URL("images/places/", output), { recursive: true });
for (const path of new Set(places.flatMap((place) => place.images.map((image) => image.url)).filter((path) => path.startsWith("/images/places/")))) {
  if (!/^\/images\/places\/[a-z0-9-]+\.(jpg|png)$/.test(path)) throw new Error("Invalid image path");
  await access(new URL(`public${path}`, root));
  await cp(new URL(`public${path}`, root), new URL(path.slice(1), output));
}
await cp(new URL("public/favicon.svg", root), new URL("favicon.svg", output));
await cp(new URL("docs/PUBLIC_DATA_NOTICE.md", root), new URL("DATA_SOURCES.txt", output));
await writeFile(new URL(".nojekyll", output), "");
