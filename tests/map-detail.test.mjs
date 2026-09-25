import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { mapDetail, simplifyLine, stationLabelEligible } from "../app/lib/map-detail.ts";
import { createProjector, geometryPolygons } from "../app/lib/map.ts";

test("overview simplification keeps bends and closed rings", () => {
  const line = Array.from({ length: 1000 }, (_, i) => [i / 100, 0]);
  line.push([10, 0], [10, 5]);
  const simplified = simplifyLine(line, 0.12);
  assert.deepEqual(simplified, [[0, 0], [10, 0], [10, 5]]);
  const ring = [[0, 0], [3, 0], [3, 3], [0, 3], [0, 0]];
  assert.deepEqual(simplifyLine(ring, 0.12), ring);
});

test("overview removes most tiny polygons while keeping landmark lakes", async () => {
  const [data, districts] = await Promise.all(["basemap", "suzhou-osm"].map(async (name) =>
    JSON.parse(await readFile(new URL(`../public/data/${name}.json`, import.meta.url), "utf8"))));
  const project = createProjector(districts.features, 1440, 900, 108);
  const detail = mapDetail(1);
  let retained = 0;
  let fullVertices = 0;
  let overviewVertices = 0;
  const names = new Set();
  for (const [surfaces, minArea] of [[data.waterAreas, detail.waterMinArea], [data.landcover, detail.greenMinArea]]) {
    for (const surface of surfaces) {
      const rings = geometryPolygons(surface.geometry).flat().map((ring) => ring.map(project));
      const bounds = [Infinity, Infinity, -Infinity, -Infinity];
      for (const ring of rings) for (const [x, y] of ring) {
        bounds[0] = Math.min(bounds[0], x); bounds[1] = Math.min(bounds[1], y);
        bounds[2] = Math.max(bounds[2], x); bounds[3] = Math.max(bounds[3], y);
      }
      if ((bounds[2] - bounds[0]) * (bounds[3] - bounds[1]) < minArea) continue;
      retained++;
      names.add(surface.name);
      for (const ring of rings) {
        fullVertices += ring.length;
        overviewVertices += simplifyLine(ring, 0.12).length;
      }
    }
  }
  const total = data.waterAreas.length + data.landcover.length;
  assert.ok(retained < total * 0.25, "hide at least 75% of tiny overview polygons");
  assert.ok(overviewVertices < fullVertices * 0.5, "reduce retained shoreline vertex work");
  assert.ok(names.has("金鸡湖") && names.has("独墅湖"));
  assert.equal(detail.secondaryRoads, false);
  assert.equal(mapDetail(15).secondaryRoads, true);
  const station = data.transitStations.find((item) => item.name === "东方之门");
  assert.ok(station && stationLabelEligible(3, station.lineRefs.length));
  assert.ok(data.transitStations.every((item) => stationLabelEligible(15, item.lineRefs.length)));
  console.log(`Overview polygons: ${retained}/${total}; retained polygon vertices: ${overviewVertices}/${fullVertices}`);
});
