import type { Coordinate } from "../types";

export function mapDetail(zoom: number) {
  return {
    simplified: zoom < 8,
    waterMinArea: zoom < 3 ? 80 : zoom < 8 ? 24 : 4,
    greenMinArea: zoom < 3 ? 160 : zoom < 8 ? 48 : 8,
    primaryRoads: zoom >= 3,
    secondaryRoads: zoom >= 8,
    waterways: zoom >= 3,
    roadLabels: zoom >= 8,
  };
}

// Iterative Douglas–Peucker: bound screen-space error without recursive stacks.
export function simplifyLine(points: Coordinate[], tolerance: number): Coordinate[] {
  if (points.length <= 2) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [start, end] = stack.pop()!;
    const [ax, ay] = points[start];
    const dx = points[end][0] - ax;
    const dy = points[end][1] - ay;
    const lengthSquared = dx * dx + dy * dy;
    let maxDistance = tolerance * tolerance;
    let furthest = -1;
    for (let i = start + 1; i < end; i++) {
      const [x, y] = points[i];
      const t = lengthSquared ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / lengthSquared)) : 0;
      const distance = (x - ax - t * dx) ** 2 + (y - ay - t * dy) ** 2;
      if (distance > maxDistance) { maxDistance = distance; furthest = i; }
    }
    if (furthest >= 0) {
      keep[furthest] = 1;
      stack.push([start, furthest], [furthest, end]);
    }
  }
  const result = points.filter((_, index) => keep[index]);
  const closed = points[0][0] === points.at(-1)![0] && points[0][1] === points.at(-1)![1];
  return closed && result.length < 4 ? points : result;
}

export function stationLabelEligible(zoom: number, lineCount: number) {
  return zoom >= 5 || (zoom >= 2.5 && lineCount > 1);
}
