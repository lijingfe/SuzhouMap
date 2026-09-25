import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTransitPlan,
  estimateDriving,
  formatDuration,
  haversineKm,
  matchesPlace,
  normalizeSearchText,
} from "../app/lib/core.mjs";
import { readFile } from "node:fs/promises";

const config = {
  referenceTime: "工作日上午10点",
  walkingSpeedKmh: 4.5,
  subwayWaitMinutes: 5,
  busWaitMinutes: 10,
  suburbanBusWaitMinutes: 15,
  conventionalRailBufferMinutes: 30,
  highSpeedRailBufferMinutes: 40,
  drivingSpeedKmh: { urban: 32, suburban: 45, expressway: 70 },
  disclaimer: "测试",
};

test("normalizes and matches Chinese aliases, pinyin and tags", () => {
  const place = {
    name: "东方之门",
    aliases: ["秋裤楼"],
    pinyin: "dongfangzhimen",
    pinyinInitials: "dfzm",
    region: "苏州工业园区",
    tags: ["夜景", "拍照"],
  };

  assert.equal(normalizeSearchText(" 东-方 之门 "), "东方之门");
  assert.equal(matchesPlace(place, "秋裤楼"), true);
  assert.equal(matchesPlace(place, "dfzm"), true);
  assert.equal(matchesPlace(place, "夜景"), true);
  assert.equal(matchesPlace(place, "不存在"), false);
});

test("calculates stable local distance and driving estimates", () => {
  const origin = [120.62, 31.31];
  const destination = [120.72, 31.31];
  const distance = haversineKm(origin, destination);
  assert.ok(distance > 8 && distance < 12);

  const driving = estimateDriving(origin, destination, config);
  assert.ok(driving.adjustedKm > distance);
  assert.ok(driving.minutes > 0);
  assert.equal(formatDuration(75), "1小时15分钟");
});

test("builds an offline subway path with a transfer", () => {
  const routes = [
    {
      ref: "1",
      stops: [
        { name: "甲站", coordinate: [120.6, 31.3] },
        { name: "换乘站", coordinate: [120.65, 31.3] },
      ],
    },
    {
      ref: "2",
      stops: [
        { name: "换乘站", coordinate: [120.65, 31.3] },
        { name: "乙站", coordinate: [120.7, 31.3] },
      ],
    },
  ];

  const plan = buildTransitPlan(
    [120.599, 31.3],
    [120.701, 31.3],
    routes,
    config,
  );
  assert.ok(plan);
  assert.equal(plan.transfers, 1);
  assert.ok(plan.steps.some((step) => step.mode === "轨道交通"));
  assert.ok(plan.totalMinutes > 0);
});

test("keeps generated place categories free of obvious attraction fallbacks", async () => {
  const data = JSON.parse(
    await readFile(new URL("../public/data/places.json", import.meta.url), "utf8"),
  );
  const categoriesByName = new Map(
    data.places.map((place) => [place.name, place.category]),
  );

  assert.equal(categoriesByName.get("苏州摩天轮"), "entertainment");
  assert.equal(categoriesByName.get("苏州海洋馆"), "entertainment");
  assert.equal(categoriesByName.get("金鸡湖音乐喷泉"), "entertainment");
  assert.equal(categoriesByName.get("古樟植物园"), "nature");
  assert.equal(categoriesByName.get("中国刺绣艺术馆"), "museum");
  assert.equal(categoriesByName.get("北寺塔"), "historic");
  assert.equal(categoriesByName.has("种植屋顶"), false);
  assert.equal(categoriesByName.has("街旁绿地"), false);
});
