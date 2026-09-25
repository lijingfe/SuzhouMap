import { readFile, writeFile } from "node:fs/promises";
import { surfaceGeometry, surfaceLabel } from "./surface-geometry.mjs";

const file = new URL("../public/data/suzhou-osm.json", import.meta.url);
const districts = { "虎丘区": 320505, "吴中区": 320506, "相城区": 320507, "姑苏区": 320508, "吴江区": 320509, "常熟市": 320581, "张家港市": 320582, "昆山市": 320583, "太仓市": 320585 };
try {
  const cached = JSON.parse(await readFile(file, "utf8"));
  if (cached.features.length === 9) { console.log("Public OSM boundaries already available"); process.exit(0); }
} catch { /* Fetch the missing public dataset. */ }
const query = `[out:json][timeout:180];relation["boundary"="administrative"]["name"~"^(${Object.keys(districts).join("|")})$"](30.65,119.85,32.15,121.35);out body geom;`;
let data;
for (const endpoint of ["https://overpass.kumi.systems/api/interpreter", "https://overpass-api.de/api/interpreter"]) {
  try {
    const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8", "user-agent": "Gusu-Trails-Public-Map/1.0" }, body: new URLSearchParams({ data: query }), signal: AbortSignal.timeout(65000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    data = await response.json();
    break;
  } catch (error) { console.log(error.message); }
}
if (!data) throw new Error("Could not obtain licensed boundaries");
const features = Object.entries(districts).map(([name, adcode]) => {
  const matches = data.elements.filter((item) => item.tags?.name === name);
  if (matches.length !== 1) throw new Error(`Ambiguous boundary: ${name}`);
  const item = matches[0];
  const geometry = surfaceGeometry(item);
  if (!geometry) throw new Error(`Missing boundary: ${name}`);
  const anchor = surfaceLabel(geometry);
  return { type: "Feature", properties: { name, adcode, center: anchor, centroid: anchor, level: "district", source: `https://www.openstreetmap.org/relation/${item.id}`, license: "ODbL 1.0" }, geometry };
});
await writeFile(file, JSON.stringify({ type: "FeatureCollection", source: "© OpenStreetMap contributors", license: "ODbL 1.0", coordinateSystem: "WGS84", updatedAt: data.osm3s?.timestamp_osm_base?.slice(0, 10), features }));
console.log(features.map((f) => `${f.properties.name}: ${f.geometry.coordinates.length} polygons`).join("\n"));
