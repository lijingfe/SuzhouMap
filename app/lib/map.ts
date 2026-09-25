import type {
  AreaGeometry,
  Coordinate,
  DistrictFeature,
  Place,
} from "../types";

export type ViewTransform = {
  zoom: number;
  panX: number;
  panY: number;
};

export type MapProjector = {
  (coordinate: Coordinate): Coordinate;
  unproject(point: Coordinate): Coordinate;
};

export const MIN_MAP_ZOOM = 1;
export const MAX_MAP_ZOOM = 100;

export function geometryPolygons(geometry: AreaGeometry): Coordinate[][][] {
  return geometry.type === "Polygon"
    ? [geometry.coordinates]
    : geometry.coordinates;
}

// Consistent winding makes nonzero clipping a union, not an XOR: the park
// may be separate in OSM, but overlap Wuzhong in the local boundary dataset.
export function appendMapCoverage(
  path: Pick<Path2D, "moveTo" | "lineTo" | "closePath">,
  features: DistrictFeature[],
  project: (coordinate: Coordinate) => Coordinate,
) {
  for (const feature of features) {
    for (const polygon of geometryPolygons(feature.geometry)) {
      polygon.forEach((ring, ringIndex) => {
        const points = ring.map(project);
        if (points.length < 3) return;
        const area = points.reduce((sum, point, index) => {
          const next = points[(index + 1) % points.length];
          return sum + point[0] * next[1] - next[0] * point[1];
        }, 0);
        if ((area > 0) !== (ringIndex === 0)) points.reverse();
        points.forEach(([x, y], index) => {
          if (index === 0) path.moveTo(x, y);
          else path.lineTo(x, y);
        });
        path.closePath();
      });
    }
  }
}

export function districtBounds(features: DistrictFeature[]) {
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;

  for (const feature of features) {
    for (const polygon of geometryPolygons(feature.geometry)) {
      for (const ring of polygon) {
        for (const [lon, lat] of ring) {
          minLon = Math.min(minLon, lon);
          minLat = Math.min(minLat, lat);
          maxLon = Math.max(maxLon, lon);
          maxLat = Math.max(maxLat, lat);
        }
      }
    }
  }

  return { minLon, minLat, maxLon, maxLat };
}

export function createProjector(
  features: DistrictFeature[],
  width: number,
  height: number,
  padding = 72,
): MapProjector {
  const bounds = districtBounds(features);
  const longitudeSpan = Math.max(bounds.maxLon - bounds.minLon, 0.001);
  const latitudeSpan = Math.max(bounds.maxLat - bounds.minLat, 0.001);
  const latitudeCorrection = Math.cos(
    (((bounds.minLat + bounds.maxLat) / 2) * Math.PI) / 180,
  );
  const correctedWidth = longitudeSpan * latitudeCorrection;
  const scale = Math.min(
    Math.max(1, width - padding * 2) / correctedWidth,
    Math.max(1, height - padding * 2) / latitudeSpan,
  );
  const drawnWidth = correctedWidth * scale;
  const drawnHeight = latitudeSpan * scale;
  const startX = (width - drawnWidth) / 2;
  const startY = (height - drawnHeight) / 2;

  return Object.assign(
    (coordinate: Coordinate): Coordinate => [
      startX + (coordinate[0] - bounds.minLon) * latitudeCorrection * scale,
      startY + (bounds.maxLat - coordinate[1]) * scale,
    ],
    {
      unproject: ([x, y]: Coordinate): Coordinate => [
        bounds.minLon + (x - startX) / (latitudeCorrection * scale),
        bounds.maxLat - (y - startY) / scale,
      ],
    },
  );
}

export function withView(
  point: Coordinate,
  view: ViewTransform,
): Coordinate {
  return [
    point[0] * view.zoom + view.panX,
    point[1] * view.zoom + view.panY,
  ];
}

export function geometryPath(
  geometry: AreaGeometry,
  project: (coordinate: Coordinate) => Coordinate,
  view: ViewTransform,
) {
  return geometryPolygons(geometry)
    .flatMap((polygon) =>
      polygon.map((ring) =>
        ring
          .map((coordinate, index) => {
            const [x, y] = withView(project(coordinate), view);
            return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
          })
          .join(" ")
          .concat(" Z"),
      ),
    )
    .join(" ");
}

export function clampView(
  candidate: ViewTransform,
  width: number,
  height: number,
) {
  const zoom = Math.min(
    MAX_MAP_ZOOM,
    Math.max(MIN_MAP_ZOOM, candidate.zoom),
  );
  const visibleCenterMarginX = width * 0.34;
  const visibleCenterMarginY = height * 0.34;
  const minPanX = visibleCenterMarginX - width * zoom;
  const maxPanX = width - visibleCenterMarginX;
  const minPanY = visibleCenterMarginY - height * zoom;
  const maxPanY = height - visibleCenterMarginY;

  return {
    zoom,
    panX: Math.min(maxPanX, Math.max(minPanX, candidate.panX)),
    panY: Math.min(maxPanY, Math.max(minPanY, candidate.panY)),
  };
}

export type ScreenPlace = {
  place: Place;
  x: number;
  y: number;
};

export type Cluster = {
  id: string;
  x: number;
  y: number;
  places: Place[];
  categoryCounts: Record<string, number>;
};

export function clusterScreenPlaces(
  points: ScreenPlace[],
  zoom: number,
): { singles: ScreenPlace[]; clusters: Cluster[] } {
  if (zoom >= 3.35) return { singles: points, clusters: [] };

  const cellSize = zoom < 1.65 ? 62 : zoom < 2.35 ? 52 : 44;
  const important = points.filter((point) => point.place.priority === 1);
  const regular = points.filter((point) => point.place.priority !== 1);
  const cells = new Map<string, ScreenPlace[]>();

  for (const point of regular) {
    const key = `${Math.round(point.x / cellSize)}:${Math.round(point.y / cellSize)}`;
    const values = cells.get(key) ?? [];
    values.push(point);
    cells.set(key, values);
  }

  const singles = [...important];
  const clusters: Cluster[] = [];
  for (const [id, values] of cells) {
    if (values.length === 1) {
      singles.push(values[0]);
      continue;
    }
    const categoryCounts: Record<string, number> = {};
    for (const value of values) {
      categoryCounts[value.place.category] =
        (categoryCounts[value.place.category] ?? 0) + 1;
    }
    clusters.push({
      id,
      x: values.reduce((sum, value) => sum + value.x, 0) / values.length,
      y: values.reduce((sum, value) => sum + value.y, 0) / values.length,
      places: values.map((value) => value.place),
      categoryCounts,
    });
  }

  return { singles, clusters };
}

export function visibleLabels(points: ScreenPlace[], zoom: number) {
  const candidates = points.filter((point) => {
    if (zoom >= 4.25) return true;
    if (zoom >= 3.1) return point.place.priority <= 2;
    if (zoom >= 2.15) return point.place.priority === 1;
    return false;
  });
  const occupied = new Set<string>();
  return candidates.filter((point) => {
    const key = `${Math.round(point.x / 82)}:${Math.round(point.y / 30)}`;
    if (occupied.has(key)) return false;
    occupied.add(key);
    return true;
  });
}
