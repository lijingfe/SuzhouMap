import { readFile, readdir } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import test from "node:test";
import assert from "node:assert/strict";
import { appendMapCoverage } from "../app/lib/map.ts";

const output = new URL("../out/", import.meta.url);
const load = async (name) => JSON.parse(gunzipSync(await readFile(new URL(`data/${name}.json.gz`, output))));

test("left panel can collapse without unmounting filters or changing map state", async () => {
  const controls = await readFile(new URL("../app/components/ExplorerControls.tsx", import.meta.url), "utf8");
  assert.match(controls, /\[collapsed, setCollapsed\] = useState\(false\)/);
  assert.match(controls, /aria-expanded=\{!collapsed\}/);
  assert.match(controls, /aria-controls=\{bodyId\}/);
  assert.match(controls, /onClick=\{\(\) => setCollapsed\(\(value\) => !value\)\}/);
  assert.match(controls, /id=\{bodyId\} className="explorer-controls-body" hidden=\{collapsed\}/);
  assert.match(controls, /"展开地图面板" : "收起地图面板"/);
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /\.explorer-controls\.is-collapsed\s*\{[^}]*width: max-content/);
  assert.match(css, /\.brand-row\s*\{[^}]*position: sticky/);
});

test("metro starts hidden and station labels match the 11px place labels", async () => {
  const app = await readFile(new URL("../app/components/ExplorerApp.tsx", import.meta.url), "utf8");
  assert.match(app, /\[selectedTransitRefs, setSelectedTransitRefs\] = useState<Set<string>>\(new Set\(\)\)/);
  const startup = app.slice(app.indexOf("useEffect(() =>"), app.indexOf("const persistFavorites"));
  assert.doesNotMatch(startup, /setSelectedTransitRefs/);
  assert.match(app, /onToggleTransit=/);
  assert.match(app, /onSetAllTransit=/);
  const canvas = await readFile(new URL("../app/components/BasemapCanvas.tsx", import.meta.url), "utf8");
  assert.match(canvas, /const font = .* 11px/);
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /\.place-label\s*\{[^}]*font-size: 11px/);
});

// Record the exact Canvas clipping rings and evaluate its nonzero fill rule.
function coverageContains(features) {
  const rings = [];
  appendMapCoverage({
    moveTo(x, y) { rings.push([[x, y]]); },
    lineTo(x, y) { rings.at(-1).push([x, y]); },
    closePath() {},
  }, features, ([x, y]) => [x, -y]);
  return ([x, latitude]) => {
    const y = -latitude;
    let winding = 0;
    for (const ring of rings) for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      const cross = (b[0] - a[0]) * (y - a[1]) - (x - a[0]) * (b[1] - a[1]);
      if (a[1] <= y && b[1] > y && cross > 0) winding++;
      if (a[1] > y && b[1] <= y && cross < 0) winding--;
    }
    return winding !== 0;
  };
}

test("public map coverage includes park lakes and stations without exposing outside Suzhou", async () => {
  const [districts, park, basemap] = await Promise.all(["suzhou", "industrial-park", "basemap"].map(load));
  const covered = coverageContains([...districts.features, ...park.features]);
  for (const name of ["金鸡湖", "独墅湖"]) {
    const lake = basemap.waterAreas.find((item) => item.name === name);
    assert.ok(lake && covered(lake.labelCoordinate), name);
  }
  for (const name of ["东方之门", "时代广场", "星湖街"]) {
    const station = basemap.transitStations.find((item) => item.name === name);
    assert.ok(station && covered(station.coordinate), name);
  }
  assert.ok(covered([120.75, 31.32]), "园区湖东");
  assert.ok(covered([120.62, 31.32]), "姑苏区");
  assert.equal(covered([121.47, 31.23]), false, "上海 remains outside");
  const viewport = await readFile(new URL("../app/components/MapViewport.tsx", import.meta.url), "utf8");
  assert.match(viewport, /districts=\{mapCoverage\}/);
  const canvas = await readFile(new URL("../app/components/BasemapCanvas.tsx", import.meta.url), "utf8");
  assert.match(canvas, /context\.clip\(cache\.clip, "nonzero"\)/);
});

test("coverage unions overlaps and preserves real polygon holes regardless of winding", () => {
  const feature = (coordinates) => ({ geometry: { type: "Polygon", coordinates } });
  const outer = [[0,0],[10,0],[10,10],[0,10],[0,0]];
  const hole = [[2,2],[4,2],[4,4],[2,4],[2,2]];
  const park = [[5,5],[5,12],[12,12],[12,5],[5,5]];
  const covered = coverageContains([feature([outer, hole]), feature([park])]);
  assert.ok(covered([7,7]), "overlap must not become an XOR hole");
  assert.ok(covered([11,11]), "separate park extent included");
  assert.equal(covered([3,3]), false, "actual inner ring preserved");
  assert.equal(covered([13,13]), false);
});

test("Pages shell uses the repository path and bundled scripts", async () => {
  const html = await readFile(new URL("index.html", output), "utf8");
  const base = process.env.PAGES_BASE_PATH ?? "/SuzhouMap/";
  assert.ok(html.includes(`${base}assets/`));
  assert.ok(html.includes(`${base}favicon.svg`));
  assert.ok(html.includes("姑苏寻迹"));
  assert.doesNotMatch(html, /localhost|\/main.tsx|_vinext/);
  await readFile(new URL(".nojekyll", output));
});

test("public package contains licensed boundaries and the complete place library", async () => {
  const districts = await load("suzhou");
  assert.equal(districts.features.length, 9);
  assert.equal(districts.license, "ODbL 1.0");
  assert.equal(districts.coordinateSystem, "WGS84");
  for (const feature of districts.features) {
    assert.match(feature.properties.source, /^https:\/\/www.openstreetmap.org\/relation\/\d+$/);
    for (const rings of feature.geometry.coordinates) {
      for (const ring of rings) assert.deepEqual(ring[0], ring.at(-1), feature.properties.name);
    }
  }
  const { places } = await load("places");
  assert.equal(places.length, 350);
  for (const photo of places.flatMap((place) => place.images)) {
    if (!photo.url.startsWith("/images/places/")) continue;
    const bytes = await readFile(new URL(photo.url.slice(1), output));
    assert.ok(bytes.length > 1000);
    assert.ok(photo.author && photo.license && photo.sourceUrl);
  }
  const basemap = await load("basemap");
  assert.ok(basemap.waterAreas.length > 1000);
  assert.ok(basemap.transitStations.length > 200);
  await load("industrial-park");
  await load("regions");
  await load("transport-config");
});

test("Pages artifact excludes raw data, development folders and secrets", async () => {
  const paths = await readdir(output, { recursive: true });
  for (const path of paths) assert.doesNotMatch(path, /(^|[\\/])(raw|node_modules|\.npm-cache|\.env[^\\/]*|\.git|suzhou\.json)([\\/]|$)/);
  assert.ok(paths.includes("DATA_SOURCES.txt"));
});
