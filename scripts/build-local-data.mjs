import { readFile, writeFile } from "node:fs/promises";
import { pinyin } from "pinyin-pro";
import { buildSurfaces } from "./surface-geometry.mjs";
import { enrichPlaces } from "./place-content.mjs";

const DATA_DIR = new URL("../public/data/", import.meta.url);
const RAW_DIR = new URL("../public/data/raw/", import.meta.url);

const CATEGORY_CONFIG = {
  garden: { label: "古典园林", color: "#256b4a" },
  town: { label: "古镇、古村与历史街区", color: "#d9a72a" },
  museum: { label: "博物馆与文化场馆", color: "#7656a8" },
  modern: { label: "现代建筑与城市地标", color: "#3279b7" },
  viewpoint: { label: "摄影机位与观景点", color: "#c84f7f" },
  historic: { label: "古建筑、故居与历史遗址", color: "#9b5d3d" },
  nature: { label: "自然景观", color: "#68a65f" },
  entertainment: { label: "商圈、夜游与休闲娱乐", color: "#288e9b" },
  restaurant: { label: "本地餐馆与老字号", color: "#bc4c43" },
  cafe: { label: "咖啡、茶馆与甜品", color: "#df7b69" },
  hotel: { label: "酒店与特色住宿", color: "#4d5b9e" },
  university: { label: "大学与校园景观", color: "#2f8b78" },
};

const ESSENTIAL_NAMES = new Set([
  "拙政园",
  "留园",
  "狮子林",
  "沧浪亭",
  "网师园",
  "环秀山庄",
  "耦园",
  "艺圃",
  "退思园",
  "苏州博物馆",
  "苏州博物馆西馆",
  "寒山寺",
  "虎丘",
  "平江路",
  "山塘街",
  "东方之门",
  "金鸡湖",
  "同里古镇",
  "周庄古镇",
  "甪直古镇",
  "木渎古镇",
  "沙溪古镇",
  "千灯古镇",
  "锦溪古镇",
  "震泽古镇",
  "黎里古镇",
  "苏州文化艺术中心",
  "苏州中心",
  "苏州湾大剧院",
  "盘门",
  "北寺塔",
  "西园寺",
  "天平山",
  "穹窿山",
  "旺山",
  "太湖国家湿地公园",
  "阳澄湖",
  "独墅湖",
  "苏州大学",
]);

const ALIASES_BY_NAME = {
  东方之门: ["秋裤楼"],
  苏州博物馆: ["苏博"],
  苏州博物馆西馆: ["苏博西馆"],
  山塘街: ["七里山塘"],
  平江路: ["平江历史文化街区"],
  周庄古镇景区: ["周庄古镇", "周庄"],
  同里古镇游览区: ["同里古镇", "同里"],
};

const CATEGORY_BY_NAME = {
  拙政园: "garden",
  留园: "garden",
  狮子林: "garden",
  沧浪亭: "garden",
  网师园: "garden",
  环秀山庄: "garden",
  耦园: "garden",
  艺圃: "garden",
  退思园: "garden",
  静思园: "garden",
  东方之门: "modern",
  苏州中心: "modern",
  北寺塔: "historic",
  金鸡湖: "nature",
  白象湾: "nature",
  平江路: "town",
  山塘街: "town",
  寒山寺: "historic",
  虎丘: "historic",
  苏州文化艺术中心: "museum",
  苏州湾大剧院: "museum",
  苏州大学: "university",
  太湖: "nature",
};

const EXCLUDED_PLACE_NAMES = new Set([
  "种植屋顶",
  "街旁绿地",
]);

const CORE_LIMIT = 220;
const EXTENDED_LIMIT = 130;

async function loadJson(url) {
  return JSON.parse(await readFile(url, "utf8"));
}

function classify(tags) {
  const name = String(tags.name ?? "");
  if (EXCLUDED_PLACE_NAMES.has(name)) return null;
  if (CATEGORY_BY_NAME[name]) return CATEGORY_BY_NAME[name];
  if (tags.route || tags.public_transport || tags.highway) return null;
  if (/观景台|瞭望台|眺望台/.test(name)) return "viewpoint";
  if (/海洋馆|水族馆|动物园|动物世界|摩天轮|游乐园|乐园|森林世界|音乐喷泉/.test(name)) {
    return "entertainment";
  }
  if (/植物园|湿地|生态园|森林公园|花博园|园博园|郊野公园|湿地公园/.test(name)) {
    return "nature";
  }
  if (/博物馆|美术馆|艺术馆|文化馆|图书馆|展览馆|纪念馆/.test(name)) {
    return "museum";
  }
  if (tags.leisure === "garden" || tags.garden_type) return "garden";
  if (tags.tourism === "museum" || tags.amenity === "museum") return "museum";
  if (["theatre", "arts_centre", "library"].includes(tags.amenity)) return "museum";
  if (["university", "college"].includes(tags.amenity)) return "university";
  if (tags.tourism === "viewpoint" || tags.man_made === "observatory") return "viewpoint";
  if (["hotel", "guest_house", "hostel"].includes(tags.tourism)) return "hotel";
  if (tags.amenity === "restaurant") return "restaurant";
  if (tags.amenity === "cafe") return "cafe";
  if (/古镇|古村|老街|历史文化街区|平江路|山塘街/.test(name)) return "town";
  if (tags.historic) return "historic";
  if (["park", "nature_reserve"].includes(tags.leisure)) return "nature";
  if (["theme_park", "zoo"].includes(tags.tourism)) return "entertainment";
  if (tags.man_made === "tower") return "modern";
  if (/中心|大厦|塔|剧院|艺术中心|体育场/.test(name) && tags.building) return "modern";
  if (tags.tourism === "attraction") return tags.architect ? "modern" : "historic";
  if (tags.tourism === "gallery") return "museum";
  return null;
}

function placeCoordinate(element) {
  if (typeof element.lon === "number" && typeof element.lat === "number") {
    return [element.lon, element.lat];
  }
  if (element.center) return [element.center.lon, element.center.lat];
  return null;
}

function ringContains(ring, point) {
  let inside = false;
  const [x, y] = point;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersects =
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / (yj - yi || Number.EPSILON) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function geometryContains(geometry, point) {
  const polygons =
    geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  return polygons.some((polygon) => {
    if (!ringContains(polygon[0], point)) return false;
    return !polygon.slice(1).some((hole) => ringContains(hole, point));
  });
}

function findRegion(districts, sip, coordinate) {
  if (sip && geometryContains(sip.geometry, coordinate)) return "苏州工业园区";
  return (
    districts.features.find((feature) =>
      geometryContains(feature.geometry, coordinate),
    )?.properties.name ?? "苏州市"
  );
}

function imageFromTags(tags) {
  const commons = tags.wikimedia_commons;
  if (typeof commons === "string" && commons.startsWith("File:")) {
    const filename = commons.slice(5);
    return {
      url: `https://commons.wikimedia.org/wiki/Special:Redirect/file/${encodeURIComponent(filename)}`,
      sourceName: "Wikimedia Commons",
      sourceUrl: `https://commons.wikimedia.org/wiki/${encodeURIComponent(commons.replaceAll(" ", "_"))}`,
    };
  }
  if (typeof tags.image === "string" && /^https?:\/\//.test(tags.image)) {
    return {
      url: tags.image,
      sourceName: "OpenStreetMap image tag",
      sourceUrl: tags.image,
    };
  }
  return null;
}

function scorePlace(tags, name, category) {
  let score = 0;
  if (ESSENTIAL_NAMES.has(name)) score += 100;
  if (tags.wikidata) score += 25;
  if (tags.wikipedia) score += 22;
  if (tags.heritage || tags.heritage_operator) score += 16;
  if (tags.website || tags["contact:website"]) score += 8;
  if (tags.opening_hours) score += 5;
  if (["garden", "museum", "historic", "viewpoint"].includes(category)) score += 6;
  if (tags.tourism === "attraction") score += 5;
  return score;
}

function normalizeName(name) {
  return name.trim().replace(/\s+/g, " ");
}

function buildPinyin(name) {
  return {
    full: pinyin(name, { toneType: "none", type: "array" }).join(""),
    initials: pinyin(name, {
      pattern: "first",
      toneType: "none",
      type: "array",
    }).join(""),
  };
}

function buildIntroduction(name, categoryLabel) {
  return `${name}是本地离线地点库收录的${categoryLabel}。当前位置、名称与基础类型来自公开的 OpenStreetMap 数据；当前版本尚未完成该地点百科资料、开放信息和价格信息的多来源复核。`;
}

function buildRecommendation() {
  return "当前版本主要提供空间定位、分类筛选与行程比较。计划到访前，请通过地点官方网站、苏州文旅或相关管理机构核验开放时间、预约条件、票价及临时调整。";
}

function samePoint(a, b) {
  return (
    Math.abs(a[0] - b[0]) < 1e-7 &&
    Math.abs(a[1] - b[1]) < 1e-7
  );
}

function assembleRings(members, role) {
  const segments = members
    .filter(
      (member) =>
        member.type === "way" &&
        Array.isArray(member.geometry) &&
        (role === "outer"
          ? member.role === "outer" || member.role === ""
          : member.role === role),
    )
    .map((member) => member.geometry.map(({ lon, lat }) => [lon, lat]));
  const rings = [];

  while (segments.length) {
    const ring = segments.shift();
    let changed = true;
    while (changed && segments.length) {
      changed = false;
      const end = ring[ring.length - 1];
      const index = segments.findIndex(
        (segment) =>
          samePoint(segment[0], end) ||
          samePoint(segment[segment.length - 1], end),
      );
      if (index >= 0) {
        const segment = segments.splice(index, 1)[0];
        if (samePoint(segment[segment.length - 1], end)) segment.reverse();
        ring.push(...segment.slice(1));
        changed = true;
      }
    }
    if (ring.length >= 4 && samePoint(ring[0], ring[ring.length - 1])) {
      rings.push(ring);
    }
  }
  return rings;
}

function extractIndustrialPark(overpass) {
  const relation = overpass.elements.find(
    (element) =>
      element.type === "relation" &&
      element.tags?.name === "苏州工业园区" &&
      Array.isArray(element.members),
  );
  if (!relation) return null;

  const outerRings = assembleRings(relation.members, "outer");
  const innerRings = assembleRings(relation.members, "inner");
  if (!outerRings.length) return null;

  const geometry =
    outerRings.length === 1
      ? { type: "Polygon", coordinates: [outerRings[0], ...innerRings] }
      : {
          type: "MultiPolygon",
          coordinates: outerRings.map((ring, index) => [
            ring,
            ...(index === 0 ? innerRings : []),
          ]),
        };

  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {
          name: "苏州工业园区",
          source: "OpenStreetMap Overpass",
          osmType: "relation",
          osmId: relation.id,
        },
        geometry,
      },
    ],
  };
}

function geometryLines(element) {
  if (element.type === "way" && Array.isArray(element.geometry)) {
    return [element.geometry.map(({ lon, lat }) => [lon, lat])];
  }
  if (element.type === "relation" && Array.isArray(element.members)) {
    return element.members
      .filter((member) => member.type === "way" && Array.isArray(member.geometry))
      .map((member) => member.geometry.map(({ lon, lat }) => [lon, lat]));
  }
  return [];
}

const [
  districts,
  roadsRaw,
  waterRaw,
  transitRaw,
  placesRaw,
  essentialPlacesRaw,
  sipRaw,
  surfaceWaterRaw,
  landcoverRaw,
] =
  await Promise.all([
    loadJson(new URL("suzhou-osm.json", DATA_DIR)),
    loadJson(new URL("roads.json", RAW_DIR)),
    loadJson(new URL("water.json", RAW_DIR)),
    loadJson(new URL("transit-complete.json", RAW_DIR)),
    loadJson(new URL("places.json", RAW_DIR)),
    loadJson(new URL("places-essential.json", RAW_DIR)),
    loadJson(new URL("industrial-park-geometry.json", RAW_DIR)),
    loadJson(new URL("surface-water.json", RAW_DIR)),
    loadJson(new URL("landcover.json", RAW_DIR)),
  ]);

const sipCollection = extractIndustrialPark(sipRaw);
const sipFeature = sipCollection?.features[0] ?? null;

const roadCandidates = roadsRaw.elements
  .flatMap((element) =>
    geometryLines(element).map((coordinates) => ({
      id: `osm-${element.type}-${element.id}`,
      name: element.tags?.name ?? null,
      ref: element.tags?.ref ?? null,
      level: ["motorway", "trunk", "primary"].includes(element.tags?.highway)
        ? 1
        : 2,
      roadClass: element.tags?.highway,
      coordinates,
    })),
  )
  .filter(
    (road) =>
      road.name ||
      road.ref ||
      ["motorway", "trunk"].includes(road.roadClass),
  );

const majorRoads = roadCandidates
  .filter((road) => road.level === 1)
  .sort((a, b) => b.coordinates.length - a.coordinates.length)
  .slice(0, 8000);
const secondaryRoads = roadCandidates
  .filter((road) => road.level === 2)
  .sort((a, b) => b.coordinates.length - a.coordinates.length)
  .slice(0, 3500);
const roads = [...majorRoads, ...secondaryRoads];

const water = waterRaw.elements.filter((element) => ["river", "canal", "stream"].includes(element.tags?.waterway)).flatMap((element) =>
  geometryLines(element).map((coordinates) => ({
    id: `osm-${element.type}-${element.id}`,
    name: element.tags?.name ?? null,
    kind: element.tags?.waterway ? "line" : "area",
    waterClass:
      element.tags?.waterway ?? element.tags?.water ?? element.tags?.natural,
    coordinates,
  })),
);

const waterAreas = buildSurfaces(surfaceWaterRaw);
const landcover = buildSurfaces(landcoverRaw);

const transitNodeById = new Map(
  transitRaw.elements
    .filter((element) => element.type === "node")
    .map((element) => [element.id, element]),
);

function subwayStopIds(element) {
  return new Set(
    (element.members ?? [])
      .filter(
        (member) =>
          member.type === "node" &&
          ["stop", "platform", ""].includes(member.role ?? ""),
      )
      .map((member) => member.ref),
  );
}

function subwayEndpointNames(element) {
  if (element.tags?.from && element.tags?.to) {
    return [element.tags.from, element.tags.to];
  }

  const stopNames = (element.members ?? [])
    .filter(
      (member) =>
        member.type === "node" &&
        ["stop", "platform", ""].includes(member.role ?? ""),
    )
    .map((member) => transitNodeById.get(member.ref)?.tags?.name)
    .filter(Boolean);

  return stopNames.length >= 2
    ? [stopNames[0], stopNames[stopNames.length - 1]]
    : [];
}

const subwayLineCandidates = transitRaw.elements
  .filter(
    (element) =>
      element.type === "relation" &&
      element.tags?.route === "subway" &&
      Array.isArray(element.members),
  )
  .map((element) => {
    const ref = element.tags?.ref ?? "轨道交通";
    const endpoints = subwayEndpointNames(element).sort((a, b) =>
      a.localeCompare(b, "zh-CN"),
    );
    return {
      element,
      ref,
      stopIds: subwayStopIds(element),
      serviceKey:
        endpoints.length === 2
          ? `${ref}:${endpoints.join("|")}`
          : `${ref}:relation-${element.id}`,
      geometryPointCount: geometryLines(element).reduce(
        (count, coordinates) => count + coordinates.length,
        0,
      ),
    };
  });

const directionlessServices = new Map();
for (const candidate of subwayLineCandidates) {
  const current = directionlessServices.get(candidate.serviceKey);
  if (
    !current ||
    candidate.geometryPointCount > current.geometryPointCount ||
    (candidate.geometryPointCount === current.geometryPointCount &&
      candidate.element.id < current.element.id)
  ) {
    directionlessServices.set(candidate.serviceKey, candidate);
  }
}

const selectedSubwayLines = [...directionlessServices.values()].filter(
  (candidate, _index, candidates) =>
    !candidates.some(
      (other) =>
        other !== candidate &&
        other.ref === candidate.ref &&
        candidate.stopIds.size < other.stopIds.size &&
        [...candidate.stopIds].every((id) => other.stopIds.has(id)),
    ),
);

const lineColorByRef = new Map();
for (const candidate of subwayLineCandidates) {
  const color = candidate.element.tags?.colour;
  if (color && !lineColorByRef.has(candidate.ref)) {
    lineColorByRef.set(candidate.ref, color);
  }
}

const transitLines = selectedSubwayLines.flatMap(({ element, ref }) =>
    geometryLines(element).map((coordinates, index) => ({
      id: `osm-relation-${element.id}-${index}`,
      relationId: element.id,
      name: element.tags?.name ?? element.tags?.ref ?? "轨道交通",
      ref,
      color: element.tags?.colour ?? lineColorByRef.get(ref) ?? "#3f7da6",
      coordinates,
    })),
  );

const transitStationNodesByName = new Map();
const transitStationRefsByName = new Map();
for (const { element, ref } of selectedSubwayLines) {
  for (const member of element.members ?? []) {
    if (
      member.type !== "node" ||
      !["stop", "platform", ""].includes(member.role ?? "")
    ) {
      continue;
    }
    const node = transitNodeById.get(member.ref);
    if (
      !node?.tags?.name ||
      typeof node.lon !== "number" ||
      typeof node.lat !== "number"
    ) {
      continue;
    }
    const nodes = transitStationNodesByName.get(node.tags.name) ?? new Map();
    nodes.set(node.id, node);
    transitStationNodesByName.set(node.tags.name, nodes);
    const refs = transitStationRefsByName.get(node.tags.name) ?? new Set();
    refs.add(ref);
    transitStationRefsByName.set(node.tags.name, refs);
  }
}

const transitStations = [...transitStationNodesByName]
  .map(([name, nodesById]) => {
    const nodes = [...nodesById.values()];
    const coordinate = nodes.reduce(
      ([longitude, latitude], node) => [
        longitude + node.lon / nodes.length,
        latitude + node.lat / nodes.length,
      ],
      [0, 0],
    );
    return {
      id: `osm-station-${nodes
        .map((node) => node.id)
        .sort((a, b) => a - b)[0]}`,
      name,
      coordinate,
      lineRefs: [...transitStationRefsByName.get(name)].sort((a, b) => a.localeCompare(b, "zh-CN", { numeric: true })),
    };
  })
  .sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));

const routeCandidates = transitRaw.elements
  .filter(
    (element) =>
      element.type === "relation" &&
      element.tags?.route === "subway" &&
      Array.isArray(element.members),
  )
  .map((element) => {
    const stops = element.members
      .filter(
        (member) =>
          member.type === "node" &&
          ["stop", "platform", ""].includes(member.role ?? ""),
      )
      .map((member) => {
        const node = transitNodeById.get(member.ref);
        if (!node?.tags?.name) return null;
        return {
          id: `osm-node-${node.id}`,
          name: node.tags.name,
          coordinate: [node.lon, node.lat],
        };
      })
      .filter(Boolean)
      .filter(
        (stop, index, items) =>
          index === 0 ||
          stop.name !== items[index - 1].name,
      );
    return {
      id: `osm-relation-${element.id}`,
      ref: element.tags?.ref ?? "轨道交通",
      name: element.tags?.name ?? element.tags?.ref ?? "轨道交通",
      color: element.tags?.colour ?? "#3f7da6",
      stops,
    };
  })
  .filter((route) => route.stops.length >= 2);

const transitRoutes = [...new Set(routeCandidates.map((route) => route.ref))]
  .map((ref) =>
    routeCandidates
      .filter((route) => route.ref === ref)
      .sort((a, b) => b.stops.length - a.stops.length)[0],
  )
  .sort((a, b) =>
    String(a.ref).localeCompare(String(b.ref), "zh-CN", { numeric: true }),
  );

const unique = new Map();
const nameCounts = new Map();
for (const element of [...placesRaw.elements, ...essentialPlacesRaw.elements]) {
  const tags = element.tags ?? {};
  const name = typeof tags.name === "string" ? normalizeName(tags.name) : "";
  const coordinate = placeCoordinate(element);
  const category = classify(tags);
  if (!name || !coordinate || !category) continue;
  if (!geometryContains({ type: "MultiPolygon", coordinates: districts.features.flatMap((feature) => feature.geometry.type === "Polygon" ? [feature.geometry.coordinates] : feature.geometry.coordinates) }, coordinate)) continue;

  const nameKey = name;
  const maximumSameName = ["restaurant", "cafe", "hotel"].includes(category)
    ? 3
    : 1;
  const currentNameCount = nameCounts.get(nameKey) ?? 0;
  if (currentNameCount >= maximumSameName) continue;
  nameCounts.set(nameKey, currentNameCount + 1);
  const duplicateKey = `${nameKey}:${currentNameCount}`;

  const score = scorePlace(tags, name, category);
  const pinyinFields = buildPinyin(name);
  const nearestStation = transitStations
    .map((station) => ({
      ...station,
      distance:
        (station.coordinate[0] - coordinate[0]) ** 2 +
        (station.coordinate[1] - coordinate[1]) ** 2,
    }))
    .sort((a, b) => a.distance - b.distance)[0];

  unique.set(duplicateKey, {
    id: `osm-${element.type}-${element.id}`,
    name,
    aliases: ALIASES_BY_NAME[name] ?? [],
    pinyin: pinyinFields.full,
    pinyinInitials: pinyinFields.initials,
    coordinate,
    region: findRegion(districts, sipFeature, coordinate),
    category,
    tags: [
      CATEGORY_CONFIG[category].label,
      tags.tourism,
      tags.historic,
      tags.cuisine,
    ].filter(Boolean),
    library: "candidate",
    priority: score >= 100 ? 1 : score >= 20 ? 2 : 3,
    encyclopedia: buildIntroduction(name, CATEGORY_CONFIG[category].label),
    recommendation: buildRecommendation(),
    opening: tags.opening_hours ?? "暂无经核验信息",
    price: "暂无经核验信息",
    nearestTransit: nearestStation?.name ?? "暂无经核验信息",
    images: [imageFromTags(tags)].filter(Boolean),
    source: {
      name: "OpenStreetMap",
      url: `https://www.openstreetmap.org/${element.type}/${element.id}`,
      license: "ODbL 1.0",
    },
    sourceUpdatedAt: "2026-07-24",
    verificationStatus: tags.website || tags.wikipedia ? "source-linked" : "osm-only",
    officialUrl: tags.website ?? tags["contact:website"] ?? null,
    score,
  });
}

const CATEGORY_QUOTAS = {
  garden: 38,
  town: 35,
  museum: 50,
  modern: 28,
  viewpoint: 22,
  historic: 55,
  nature: 38,
  entertainment: 18,
  restaurant: 22,
  cafe: 18,
  hotel: 16,
  university: 10,
};

const selectedByCategory = Object.entries(CATEGORY_QUOTAS).flatMap(
  ([category, quota]) =>
    [...unique.values()]
      .filter((place) => place.category === category)
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, "zh-CN"))
      .slice(0, quota),
);

const selectedIds = new Set(selectedByCategory.map((place) => place.id));
const fallbackPlaces = [...unique.values()]
  .filter((place) => !selectedIds.has(place.id))
  .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, "zh-CN"))
  .slice(0, CORE_LIMIT + EXTENDED_LIMIT - selectedByCategory.length);

const selectedPlaces = await enrichPlaces([...selectedByCategory, ...fallbackPlaces]
  .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, "zh-CN"))
  .map((place, index) => ({
    ...place,
    library: index < CORE_LIMIT ? "core" : "extended",
  })));

const categories = Object.entries(CATEGORY_CONFIG).map(([id, value]) => ({
  id,
  ...value,
}));

const transportConfig = {
  referenceTime: "工作日上午10点",
  walkingSpeedKmh: 4.5,
  subwayWaitMinutes: 5,
  busWaitMinutes: 10,
  suburbanBusWaitMinutes: 15,
  conventionalRailBufferMinutes: 30,
  highSpeedRailBufferMinutes: 40,
  drivingSpeedKmh: {
    urban: 32,
    suburban: 45,
    expressway: 70,
  },
  disclaimer:
    "方案仅在本站已收录的公共交通数据范围内计算，不代表现实世界中的绝对最快方案。",
};

await Promise.all([
  writeFile(
    new URL("basemap.json", DATA_DIR),
    JSON.stringify({
      roads,
      water,
      waterAreas,
      landcover,
      surfaceUpdatedAt: surfaceWaterRaw.osm3s?.timestamp_osm_base?.slice(0, 10) ?? null,
      transitLines,
      transitStations,
      transitRoutes,
    }),
    "utf8",
  ),
  writeFile(
    new URL("places.json", DATA_DIR),
    JSON.stringify({ categories, places: selectedPlaces }),
    "utf8",
  ),
  writeFile(
    new URL("transport-config.json", DATA_DIR),
    JSON.stringify(transportConfig, null, 2),
    "utf8",
  ),
  sipCollection
    ? writeFile(
        new URL("industrial-park.json", DATA_DIR),
        JSON.stringify(sipCollection),
        "utf8",
      )
    : Promise.resolve(),
]);

console.log(
  JSON.stringify(
    {
      roads: roads.length,
      water: water.length,
      waterAreas: waterAreas.length,
      landcover: landcover.length,
      transitLines: transitLines.length,
      transitStations: transitStations.length,
      transitRoutes: transitRoutes.map((route) => ({
        ref: route.ref,
        stops: route.stops.length,
      })),
      places: selectedPlaces.length,
      core: selectedPlaces.filter((place) => place.library === "core").length,
      extended: selectedPlaces.filter((place) => place.library === "extended")
        .length,
      industrialPark: Boolean(sipCollection),
    },
    null,
    2,
  ),
);
