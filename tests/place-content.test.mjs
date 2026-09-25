import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { enrichPlaces } from "../scripts/place-content.mjs";

const root = new URL("../", import.meta.url);
const { places } = JSON.parse(await readFile(new URL("public/data/places.json", root), "utf8"));
const compact = places.filter((place) => place.library === "core" && place.priority <= 2);
const editorial = JSON.parse(await readFile(new URL("content/place-editorial.json", root), "utf8"));

test("all 64 compact places retain individual editorial content after data build", async () => {
  assert.equal(compact.length, 64);
  assert.equal(new Set(compact.map((place) => place.encyclopedia)).size, compact.length);
  for (const place of compact) {
    assert.equal(place.encyclopedia, editorial[place.name].encyclopedia, place.name);
    assert.equal(place.recommendation, editorial[place.name].recommendation, place.name);
    assert.ok(place.encyclopedia.length >= 70, place.name);
    assert.ok(place.recommendation.length >= 60, place.name);
    assert.equal(place.contentUpdatedAt, "2026-09-25");
    assert.ok(place.visitGuide.duration && place.visitGuide.access.length >= 25, place.name);
    assert.ok(place.visitGuide.highlights.length >= 2, place.name);
    assert.match(place.opening, /尚未逐项核实/, place.name);
    assert.doesNotMatch(place.encyclopedia, /Wikimedia projects|<[^>]+>|暂无经核验信息/);
    for (const source of place.contentSources) assert.match(source.url, /^https:\/\//);
  }
  assert.deepEqual(await enrichPlaces(places), places, "enrichment is idempotent and preserves map metadata");
});

test("all 12 compact gardens have attributed local real photos", () => {
  const gardens = compact.filter((place) => place.category === "garden");
  assert.equal(gardens.length, 12);
  for (const place of gardens) assert.ok(place.images.length, place.name);
  assert.ok(compact.filter((place) => place.images.length).length >= 44);
});

test("every compact photo is an actual local JPEG/PNG with attribution", async () => {
  for (const place of compact) {
    for (const photo of place.images) {
      assert.match(photo.url, /^\/images\/places\/[a-z0-9-]+\.(jpg|png)$/);
      assert.match(photo.sourceUrl, /^https:\/\/commons.wikimedia.org\/wiki\/File:/);
      assert.ok(photo.author, place.name);
      assert.match(photo.license, /CC BY|CC0|Public domain/);
      assert.match(photo.licenseUrl, /^https?:\/\//);
      const bytes = await readFile(new URL(`public${photo.url}`, root));
      assert.ok(bytes.length > 1000, place.name);
      const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
      const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      assert.ok(jpeg || png, `${place.name}: image payload, not an HTML error page`);
    }
  }
});

test("unverified branches never borrow another campus or museum's photos", () => {
  for (const name of ["苏州博物馆西馆", "中国科学技术大学苏州研究院（仁爱路校园）", "西交利物浦大学 (南校区)"]) {
    assert.deepEqual(compact.find((place) => place.name === name).images, []);
  }
});
