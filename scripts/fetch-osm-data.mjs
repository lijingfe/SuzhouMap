import { access, mkdir, readFile, writeFile } from "node:fs/promises";

const OUTPUT_DIR = new URL("../public/data/raw/", import.meta.url);
const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];
const BBOX = "30.65,119.85,32.15,121.35";

const QUERIES = {
  "surface-water": `
[out:json][timeout:180];
(
  way["natural"="water"](${BBOX});
  relation["natural"="water"](${BBOX});
  way["waterway"="riverbank"](${BBOX});
  relation["waterway"="riverbank"](${BBOX});
);
out body geom;
`,
  landcover: `
[out:json][timeout:180];
(
  way["natural"~"^(wood|scrub|grassland|wetland)$"](${BBOX});
  relation["natural"~"^(wood|scrub|grassland|wetland)$"](${BBOX});
  way["landuse"~"^(forest|grass|meadow|recreation_ground)$"](${BBOX});
  relation["landuse"~"^(forest|grass|meadow|recreation_ground)$"](${BBOX});
  way["leisure"~"^(park|garden|nature_reserve|golf_course)$"](${BBOX});
  relation["leisure"~"^(park|garden|nature_reserve|golf_course)$"](${BBOX});
);
out body geom;
`,
  roads: `
[out:json][timeout:180];
way["highway"~"motorway|trunk|primary|secondary"](${BBOX});
out tags geom;
`,
  water: `
[out:json][timeout:180];
(
  way["waterway"~"river|canal"]["name"](${BBOX});
  way["natural"="water"]["name"](${BBOX});
  way["water"~"lake|reservoir|pond"]["name"](${BBOX});
);
out tags geom;
`,
  "transit-geometry": `
[out:json][timeout:180];
(
  relation["route"~"subway|light_rail"]["network"~"苏州|Suzhou"](${BBOX});
  node["station"="subway"](${BBOX});
  node["railway"="station"]["subway"="yes"](${BBOX});
);
out body geom;
`,
  "transit-complete": `
[out:json][timeout:180];
relation["route"~"subway|light_rail"]["network"~"苏州|Suzhou"](${BBOX})->.routes;
.routes out body geom;
node(r.routes);
out body;
`,
  places: `
[out:json][timeout:180];
(
  nwr["name"]["tourism"](${BBOX});
  nwr["name"]["historic"](${BBOX});
  nwr["name"]["amenity"~"museum|theatre|arts_centre|library|university|college|cafe|restaurant"](${BBOX});
  nwr["name"]["leisure"~"garden|park|nature_reserve"](${BBOX});
  nwr["name"]["man_made"~"tower|observatory"](${BBOX});
);
out tags center;
`,
  "places-essential": `
[out:json][timeout:180];
nwr["name"~"东方之门|苏州中心|金鸡湖|平江路|山塘街|同里古镇|周庄古镇|锦溪古镇|千灯古镇|沙溪古镇|震泽古镇|黎里古镇|木渎古镇|甪直古镇|寒山寺|虎丘|苏州博物馆|苏州文化艺术中心|苏州湾大剧院|苏州大学|太湖"](${BBOX});
out tags center;
`,
  "industrial-park-geometry": `
[out:json][timeout:180];
relation["name"="苏州工业园区"](31.12,120.52,31.48,121.02);
out body geom;
`,
};

async function fetchOverpass(name, query) {
  try {
    await access(new URL(`${name}.json`, OUTPUT_DIR));
    console.log(`${name}: existing file kept`);
    return;
  } catch {
    // Continue and fetch the missing source file.
  }

  let lastError;

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const response = await fetch(endpoint, {
        signal: AbortSignal.timeout(65000),
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
          "user-agent": "Gusu-Trails-Local-Data-Builder/1.0",
        },
        body: new URLSearchParams({ data: query }),
      });

      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }

      const text = await response.text();
      const data = JSON.parse(text);
      if (data.remark || !Array.isArray(data.elements) || !data.elements.length) {
        throw new Error(data.remark ?? "Empty Overpass response");
      }
      await writeFile(new URL(`${name}.json`, OUTPUT_DIR), text, "utf8");
      console.log(`${name}: ${Math.round(text.length / 1024)} KB`);
      return;
    } catch (error) {
      lastError = error;
      console.warn(`${name}: ${endpoint} failed: ${error.message}`);
    }
  }

  throw lastError;
}

await mkdir(OUTPUT_DIR, { recursive: true });

for (const [name, query] of Object.entries(QUERIES)) {
  if (!["surface-water", "landcover"].includes(name)) {
    await fetchOverpass(name, query);
    continue;
  }
  try {
    await access(new URL(`${name}.json`, OUTPUT_DIR));
    console.log(`${name}: existing file kept`);
    continue;
  } catch { /* Fetch surface geometry in smaller geographic batches. */ }
  const elements = new Map();
  let timestamp;
  for (let row = 0; row < 3; row++) {
    for (let column = 0; column < 2; column++) {
      const south = 30.65 + row * 0.5;
      const west = 119.85 + column * 0.75;
      const bounds = [south, west, south + 0.5, west + 0.75].join(",");
      const tileName = `${name}-${row}-${column}`;
      await fetchOverpass(tileName, query.replaceAll(BBOX, bounds));
      const tile = JSON.parse(await readFile(new URL(`${tileName}.json`, OUTPUT_DIR), "utf8"));
      timestamp = tile.osm3s?.timestamp_osm_base;
      for (const element of tile.elements) elements.set(`${element.type}-${element.id}`, element);
    }
  }
  await writeFile(new URL(`${name}.json`, OUTPUT_DIR), JSON.stringify({
    osm3s: { timestamp_osm_base: timestamp }, elements: [...elements.values()],
  }));
  console.log(`${name}: ${elements.size} merged features`);
}
