import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { surfaceGeometry, surfaceLabel } from "../scripts/surface-geometry.mjs";

const member = (role, points) => ({ type: "way", role, geometry: points.map(([lon, lat]) => ({ lon, lat })) });

test("assembles split lake shores, preserves islands, and rejects incomplete shores", () => {
  const geometry = surfaceGeometry({ type: "relation", members: [
    member("outer", [[0, 0], [6, 0], [6, 6]]),
    member("outer", [[0, 0], [0, 6], [6, 6]]),
    member("inner", [[2, 2], [4, 2], [4, 4], [2, 4], [2, 2]]),
    member("outer", [[10, 0], [12, 0], [12, 2], [10, 2], [10, 0]]),
  ] });
  assert.equal(geometry.coordinates.length, 2);
  assert.equal(geometry.coordinates[0].length, 2);
  assert.equal(geometry.coordinates[1].length, 1);
  const [x, y] = surfaceLabel(geometry);
  assert.ok(x >= 0 && x <= 6 && y >= 0 && y <= 6);
  assert.ok(!(x > 2 && x < 4 && y > 2 && y < 4), "lake name must not sit on an island");
  assert.equal(surfaceGeometry({ type: "relation", members: [member("outer", [[0, 0], [1, 0], [1, 1]])] }), null);
});

test("local basemap includes the two landmark lakes and real green areas", async () => {
  const data = JSON.parse(await readFile(new URL("../public/data/basemap.json", import.meta.url), "utf8"));
  for (const name of ["金鸡湖", "独墅湖"]) {
    const lake = data.waterAreas.find((area) => area.name === name);
    assert.ok(lake, `${name} must be a filled water polygon`);
    assert.ok(lake.geometry.coordinates.length > 0);
  }
  assert.ok(data.landcover.some((area) => ["wood", "forest"].includes(area.surfaceClass)));
  assert.ok(data.landcover.some((area) => ["park", "garden"].includes(area.surfaceClass)));
  const refs = new Set(data.transitLines.map((line) => line.ref));
  for (const station of data.transitStations) {
    assert.ok(station.lineRefs.length > 0, `${station.name} needs filterable line membership`);
    assert.ok(station.lineRefs.every((ref) => refs.has(ref)));
  }
});
