const samePoint = (a, b) => a[0] === b[0] && a[1] === b[1];

export function joinRings(members, role) {
  const segments = members
    .filter((member) => member.type === "way" && member.geometry?.length >= 2 &&
      (member.role === role || (role === "outer" && !member.role)))
    .map((member) => member.geometry.map(({ lon, lat }) => [lon, lat]));
  const rings = [];
  while (segments.length) {
    const ring = segments.shift();
    while (!samePoint(ring[0], ring.at(-1))) {
      const index = segments.findIndex((segment) =>
        samePoint(segment[0], ring.at(-1)) || samePoint(segment.at(-1), ring.at(-1)));
      if (index < 0) break;
      const segment = segments.splice(index, 1)[0];
      if (!samePoint(segment[0], ring.at(-1))) segment.reverse();
      ring.push(...segment.slice(1));
    }
    // Never close incomplete coastlines with an invented straight edge.
    if (ring.length >= 4 && samePoint(ring[0], ring.at(-1))) rings.push(ring);
  }
  return rings;
}

function contains(ring, [x, y]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function surfaceGeometry(element) {
  if (element.type === "way" && element.geometry?.length >= 4) {
    const ring = element.geometry.map(({ lon, lat }) => [lon, lat]);
    return samePoint(ring[0], ring.at(-1)) ? { type: "Polygon", coordinates: [ring] } : null;
  }
  if (element.type !== "relation") return null;
  const outer = joinRings(element.members ?? [], "outer");
  const inner = joinRings(element.members ?? [], "inner");
  if (!outer.length) return null;
  const polygons = outer.map((ring) => [ring, ...inner.filter((hole) => contains(ring, hole[0]))]);
  return { type: "MultiPolygon", coordinates: polygons };
}

export function surfaceLabel(geometry) {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  let best = null;
  for (const rings of polygons) {
    const [minY, maxY] = rings[0].reduce(([min, max], point) => [Math.min(min, point[1]), Math.max(max, point[1])], [Infinity, -Infinity]);
    const y = (minY + maxY) / 2;
    const intersections = [];
    for (const ring of rings) {
      for (let i = 1; i < ring.length; i++) {
        const [ax, ay] = ring[i - 1];
        const [bx, by] = ring[i];
        if ((ay > y) !== (by > y)) intersections.push(ax + (y - ay) * (bx - ax) / (by - ay));
      }
    }
    intersections.sort((a, b) => a - b);
    for (let i = 0; i + 1 < intersections.length; i += 2) {
      const width = intersections[i + 1] - intersections[i];
      if (!best || width > best.width) best = { width, point: [(intersections[i] + intersections[i + 1]) / 2, y] };
    }
  }
  return best?.point ?? polygons[0][0][0];
}

export function buildSurfaces(raw) {
  const memberIds = new Set(raw.elements.filter((element) => element.type === "relation")
    .flatMap((element) => (element.members ?? []).filter((member) => member.type === "way").map((member) => member.ref)));
  return raw.elements.flatMap((element) => {
    if (element.type === "way" && memberIds.has(element.id)) return [];
    const geometry = surfaceGeometry(element);
    if (!geometry) return [];
    return [{
      id: `osm-${element.type}-${element.id}`,
      name: element.tags?.["name:zh"] ?? element.tags?.name ?? null,
      surfaceClass: element.tags?.landuse ?? element.tags?.leisure ?? element.tags?.water ?? element.tags?.natural ?? "water",
      geometry,
      labelCoordinate: surfaceLabel(geometry),
    }];
  });
}
