import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("keeps one OSM direction for every subway service branch", async () => {
  const data = JSON.parse(
    await readFile(new URL("../public/data/basemap.json", import.meta.url), "utf8"),
  );
  const relationIdsByRef = new Map();

  for (const line of data.transitLines) {
    const relationIds = relationIdsByRef.get(line.ref) ?? new Set();
    relationIds.add(line.relationId);
    relationIdsByRef.set(line.ref, relationIds);
  }

  assert.deepEqual(
    Object.fromEntries(
      [...relationIdsByRef]
        .sort(([a], [b]) => a.localeCompare(b, "zh-CN", { numeric: true }))
        .map(([ref, relationIds]) => [ref, relationIds.size]),
    ),
    {
      1: 1,
      2: 1,
      3: 1,
      4: 2,
      5: 1,
      6: 2,
      7: 1,
      8: 1,
      11: 1,
    },
  );
});

test("renders every subway station only once", async () => {
  const data = JSON.parse(
    await readFile(new URL("../public/data/basemap.json", import.meta.url), "utf8"),
  );
  const stationNames = data.transitStations.map((station) => station.name);

  assert.equal(new Set(stationNames).size, stationNames.length);
});
