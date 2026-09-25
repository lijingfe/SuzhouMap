"use client";

import { useEffect, useRef } from "react";
import { appendMapCoverage, geometryPolygons, withView, type ViewTransform } from "../lib/map";
import { mapDetail, simplifyLine, stationLabelEligible } from "../lib/map-detail";
import type {
  BasemapData,
  Coordinate,
  DistrictFeature,
  SurfaceFeature,
} from "../types";

type Props = {
  basemap: BasemapData;
  selectedTransitRefs: Set<string>;
  districts: DistrictFeature[];
  width: number;
  height: number;
  project: (coordinate: Coordinate) => Coordinate;
  view: ViewTransform;
  isDragging: boolean;
};

type CachedLabel = {
  name: string;
  level: number;
  point: Coordinate;
};

type CachedBasemap = {
  basemap: BasemapData;
  districts: DistrictFeature[];
  project: Props["project"];
  clip: Path2D;
  waterAreas: CachedSurface[];
  landcover: CachedSurface[];
  waterLines: Path2D;
  overviewWaterLines: Path2D;
  expressRoads: Path2D;
  primaryRoads: Path2D;
  overviewExpressRoads: Path2D;
  overviewPrimaryRoads: Path2D;
  secondaryRoads: Path2D;
  transitLines: Map<string, { color: string; path: Path2D }>;
  roadLabels: CachedLabel[];
  stations: Array<{ name: string; point: Coordinate; lineRefs: string[] }>;
};

type CachedSurface = {
  path: Path2D;
  overviewPath: Path2D;
  name: string | null;
  point: Coordinate;
  bounds: [number, number, number, number];
  color: string;
};

function cacheSurface(feature: SurfaceFeature, project: Props["project"], water: boolean): CachedSurface {
  const path = new Path2D();
  const overviewPath = new Path2D();
  const bounds: CachedSurface["bounds"] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const polygon of geometryPolygons(feature.geometry)) {
    for (const ring of polygon) {
      const projected = ring.map(project);
      appendPolyline(path, projected, (point) => point, true);
      appendPolyline(overviewPath, simplifyLine(projected, 0.12), (point) => point, true);
      for (const [x, y] of projected) {
        bounds[0] = Math.min(bounds[0], x);
        bounds[1] = Math.min(bounds[1], y);
        bounds[2] = Math.max(bounds[2], x);
        bounds[3] = Math.max(bounds[3], y);
      }
    }
  }
  return { path, overviewPath, bounds, name: feature.name, point: project(feature.labelCoordinate),
    color: water ? "#a4d5f1" : ["wood", "forest", "nature_reserve"].includes(feature.surfaceClass)
      ? "#bdddb3" : feature.surfaceClass === "wetland" ? "#c5e3d3" : "#d5eac5" };
}

function appendPolyline(
  path: Path2D,
  coordinates: Coordinate[],
  project: Props["project"],
  close = false,
) {
  if (coordinates.length < 2) return;
  coordinates.forEach((coordinate, index) => {
    const [x, y] = project(coordinate);
    if (index === 0) path.moveTo(x, y);
    else path.lineTo(x, y);
  });
  if (close) path.closePath();
}

function buildCache(
  basemap: BasemapData,
  districts: DistrictFeature[],
  project: Props["project"],
): CachedBasemap {
  const clip = new Path2D();
  appendMapCoverage(clip, districts, project);

  const waterAreas = (basemap.waterAreas ?? []).map((feature) => cacheSurface(feature, project, true));
  const landcover = (basemap.landcover ?? []).map((feature) => cacheSurface(feature, project, false));
  const waterLines = new Path2D();
  const overviewWaterLines = new Path2D();
  for (const water of basemap.water) {
    appendPolyline(overviewWaterLines, simplifyLine(water.coordinates.map(project), 0.12), (point) => point);
    appendPolyline(
      waterLines,
      water.coordinates,
      project,
      water.kind === "area",
    );
  }

  const expressRoads = new Path2D();
  const primaryRoads = new Path2D();
  const secondaryRoads = new Path2D();
  const overviewExpressRoads = new Path2D();
  const overviewPrimaryRoads = new Path2D();
  for (const road of basemap.roads) {
    const path = ["motorway", "trunk"].includes(road.roadClass)
      ? expressRoads
      : road.level === 1
        ? primaryRoads
        : secondaryRoads;
    appendPolyline(path, road.coordinates, project);
    if (path !== secondaryRoads) appendPolyline(
      path === expressRoads ? overviewExpressRoads : overviewPrimaryRoads,
      simplifyLine(road.coordinates.map(project), 0.12), (point) => point,
    );
  }

  const transitLines = new Map<string, { color: string; path: Path2D }>();
  for (const line of basemap.transitLines) {
    const color = /^#[0-9a-f]{6}$/i.test(line.color)
      ? line.color
      : "#4682a3";
    const ref = line.ref ?? "";
    const path = transitLines.get(ref)?.path ?? new Path2D();
    appendPolyline(path, line.coordinates, project);
    transitLines.set(ref, { color, path });
  }

  const labelNames = new Set<string>();
  const roadLabels: CachedLabel[] = [];
  for (const road of basemap.roads) {
    if (
      !road.name ||
      labelNames.has(road.name) ||
      road.coordinates.length < 3
    ) {
      continue;
    }
    labelNames.add(road.name);
    roadLabels.push({
      name: road.name,
      level: road.level,
      point: project(
        road.coordinates[Math.floor(road.coordinates.length / 2)],
      ),
    });
  }

  const stationKeys = new Set<string>();
  const stations = basemap.transitStations.flatMap((station) => {
    const key = `${station.name}:${station.coordinate[0].toFixed(4)}:${station.coordinate[1].toFixed(4)}`;
    if (stationKeys.has(key)) return [];
    stationKeys.add(key);
    return [{ name: station.name, point: project(station.coordinate), lineRefs: station.lineRefs ?? [] }];
  });

  return {
    basemap,
    districts,
    project,
    clip,
    waterAreas,
    landcover,
    waterLines,
    overviewWaterLines,
    expressRoads,
    primaryRoads,
    overviewExpressRoads,
    overviewPrimaryRoads,
    secondaryRoads,
    transitLines,
    roadLabels,
    stations,
  };
}

export function BasemapCanvas({
  basemap,
  selectedTransitRefs,
  districts,
  width,
  height,
  project,
  view,
  isDragging,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cacheRef = useRef<CachedBasemap | null>(null);
  const renderedViewRef = useRef<ViewTransform | null>(null);
  const latestViewRef = useRef(view);
  const renderedTransitRefs = useRef(selectedTransitRefs);

  useEffect(() => {
    latestViewRef.current = view;
    const canvas = canvasRef.current;
    if (!canvas || width <= 0 || height <= 0) return;

    let cacheChanged = false;
    if (
      !cacheRef.current ||
      cacheRef.current.basemap !== basemap ||
      cacheRef.current.districts !== districts ||
      cacheRef.current.project !== project
    ) {
      cacheRef.current = buildCache(basemap, districts, project);
      cacheChanged = true;
    }
    const cache = cacheRef.current;
    const mobile=width<1024;
    const marginX = Math.round(width * (mobile ? 0.25 : 0.5));
    const marginY = Math.round(height * (mobile ? 0.25 : 0.5));
    const bufferWidth = width + marginX * 2;
    const bufferHeight = height + marginY * 2;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, mobile ? 1.25 : 1.5);
    const targetWidth = Math.round(bufferWidth * pixelRatio);
    const targetHeight = Math.round(bufferHeight * pixelRatio);
    const sizeChanged =
      canvas.width !== targetWidth || canvas.height !== targetHeight;

    if (sizeChanged) {
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      canvas.style.left = `${-marginX}px`;
      canvas.style.top = `${-marginY}px`;
      canvas.style.right = "auto";
      canvas.style.bottom = "auto";
      canvas.style.width = `${bufferWidth}px`;
      canvas.style.height = `${bufferHeight}px`;
    }
    canvas.style.transformOrigin = "0 0";
    canvas.style.willChange = "transform";

    if (cacheChanged || sizeChanged || renderedTransitRefs.current !== selectedTransitRefs) renderedViewRef.current = null;
    renderedTransitRefs.current = selectedTransitRefs;

    const draw = (drawView: ViewTransform) => {
      const detail = mapDetail(drawView.zoom);
      const context = canvas.getContext("2d");
      if (!context) return;

      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context.clearRect(0, 0, bufferWidth, bufferHeight);
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, bufferWidth, bufferHeight);

      context.save();
      context.setTransform(
        pixelRatio * drawView.zoom,
        0,
        0,
        pixelRatio * drawView.zoom,
        pixelRatio * (drawView.panX + marginX),
        pixelRatio * (drawView.panY + marginY),
      );
      context.clip(cache.clip, "nonzero");
      context.fillStyle = "#f3f5f7";
      context.fill(cache.clip, "nonzero");
      context.lineJoin = "round";
      context.lineCap = "round";

      const strokePath = (
        path: Path2D,
        stroke: string,
        screenWidth: number,
        fill?: string,
      ) => {
        if (fill) {
          context.fillStyle = fill;
          context.fill(path);
        }
        context.strokeStyle = stroke;
        context.lineWidth = screenWidth / drawView.zoom;
        context.stroke(path);
      };

      const visibleSurfaces: Array<{ surface: CachedSurface; water: boolean }> = [];
      const drawSurfaces = (surfaces: CachedSurface[], water: boolean) => {
        for (const surface of surfaces) {
          const [left, top] = withView([surface.bounds[0], surface.bounds[1]], drawView);
          const [right, bottom] = withView([surface.bounds[2], surface.bounds[3]], drawView);
          if (right < -marginX || bottom < -marginY || left > width + marginX || top > height + marginY) continue;
          if ((right - left) * (bottom - top) < (water ? detail.waterMinArea : detail.greenMinArea)) continue;
          const path = detail.simplified ? surface.overviewPath : surface.path;
          context.fillStyle = surface.color;
          context.fill(path, "evenodd");
          if (water && !detail.simplified) strokePath(path, "#8fc5e4", 0.6);
          if (surface.name && (right - left) > 55 && (bottom - top) > 24) visibleSurfaces.push({ surface, water });
        }
      };
      drawSurfaces(cache.landcover, false);
      drawSurfaces(cache.waterAreas, true);
      if (detail.waterways) strokePath(
        detail.simplified ? cache.overviewWaterLines : cache.waterLines,
        "#9bcde8",
        Math.max(1, Math.min(5, drawView.zoom * 0.6)),
      );
      strokePath(
        detail.simplified ? cache.overviewExpressRoads : cache.expressRoads,
        "#e3b76b",
        Math.min(8, 1.8 + drawView.zoom * 0.45),
      );
      strokePath(detail.simplified ? cache.overviewExpressRoads : cache.expressRoads, "#ffe4a3", Math.min(6, 0.8 + drawView.zoom * 0.35));
      if (detail.primaryRoads) strokePath(
        detail.simplified ? cache.overviewPrimaryRoads : cache.primaryRoads,
        "#d8dfe5",
        Math.min(6.5, 1.4 + drawView.zoom * 0.32),
      );
      if (detail.primaryRoads) strokePath(detail.simplified ? cache.overviewPrimaryRoads : cache.primaryRoads, "#ffffff", Math.min(4.5, 0.7 + drawView.zoom * 0.25));
      if (detail.secondaryRoads) {
        strokePath(
          cache.secondaryRoads,
          "#ffffff",
          Math.min(3.5, 0.6 + drawView.zoom * 0.18),
        );
      }
      if (drawView.zoom >= 1.1) {
        for (const [ref, { color, path }] of cache.transitLines) {
          if (!selectedTransitRefs.has(ref)) continue;
          strokePath(
            path,
            color,
            Math.min(4.2, 1.6 + drawView.zoom * 0.45),
          );
        }
      }

      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.font = `${Math.min(12, 8 + drawView.zoom)}px "Microsoft YaHei", sans-serif`;
      context.fillStyle = "#777c7f";
      context.strokeStyle = "rgba(255,255,255,.9)";
      context.lineWidth = 3;
      const occupied: Array<[number, number, number, number]> = [];
      const labelNames = new Set<string>();
      const drawLabel = (name: string, x: number, y: number, color: string, font: string, allowOverlap = false) => {
        if (labelNames.has(name)) return false;
        if (x < 20 || y < 20 || x > bufferWidth - 20 || y > bufferHeight - 20) return false;
        context.font = font;
        const half = context.measureText(name).width / 2 + 5;
        const box: [number, number, number, number] = [x - half, y - 9, x + half, y + 9];
        if (!allowOverlap && occupied.some(([l, t, r, b]) => box[0] < r && box[2] > l && box[1] < b && box[3] > t)) return false;
        occupied.push(box);
        labelNames.add(name);
        context.strokeStyle = "rgba(255,255,255,.95)";
        context.fillStyle = color;
        context.strokeText(name, x, y);
        context.fillText(name, x, y);
        return true;
      };
      // Reserve station names before decorative labels. In-viewport transfer
      // stations take priority over offscreen buffer labels, not source order.
      const visibleStations = cache.stations
        .filter((station) => station.lineRefs.some((ref) => selectedTransitRefs.has(ref)))
        .map((station) => {
          const [x, y] = withView(station.point, drawView);
          return { ...station, x: x + marginX, y: y + marginY,
            inViewport: x >= 0 && y >= 0 && x <= width && y <= height,
            distance: Math.hypot(x - width / 2, y - height / 2) };
        })
        .filter(({ x, y }) => x >= 0 && y >= 0 && x <= bufferWidth && y <= bufferHeight)
        .sort((a, b) => Number(b.inViewport) - Number(a.inViewport) || b.lineRefs.length - a.lineRefs.length || a.distance - b.distance);
      for (const station of visibleStations) {
        if (!stationLabelEligible(drawView.zoom, station.lineRefs.length)) continue;
        const font = `${station.lineRefs.length > 1 ? "600" : "400"} 11px "Microsoft YaHei", sans-serif`;
        context.font = font;
        const sideOffset = context.measureText(station.name).width / 2 + 10;
        const positions = [[station.x, station.y - 17], [station.x, station.y + 18],
          [station.x + sideOffset, station.y], [station.x - sideOffset, station.y]];
        const placed = positions.some(([x, y]) => drawLabel(station.name, x, y, "#324e68", font));
        if (!placed && drawView.zoom >= 12) drawLabel(station.name, station.x, station.y - 17, "#324e68", font, true);
      }

      // Large lakes remain recognizable while tiny green-area labels disappear.
      visibleSurfaces.sort((a, b) => Number(b.water) - Number(a.water));
      for (const { surface, water } of visibleSurfaces) {
        if (!water && detail.simplified) continue;
        const [x, y] = withView(surface.point, drawView);
        if (surface.name) drawLabel(surface.name, x + marginX, y + marginY,
          water ? "#4383aa" : "#5e8956", `${water ? 14 : 12}px "Microsoft YaHei", sans-serif`);
      }
      let roadLabelCount = 0;
      for (const label of cache.roadLabels) {
        if (!detail.roadLabels) break;
        if (label.level === 2 && drawView.zoom < 3.2) continue;
        if (label.level === 1 && drawView.zoom < 2.1) continue;
        const [screenX, screenY] = withView(label.point, drawView);
        const x = screenX + marginX;
        const y = screenY + marginY;
        if (
          x < 80 ||
          y < 60 ||
          x > bufferWidth - 80 ||
          y > bufferHeight - 60
        ) {
          continue;
        }
        drawLabel(label.name, x, y, "#7a8794", '12px "Microsoft YaHei", sans-serif');
        roadLabelCount += 1;
        if (roadLabelCount >= 38) break;
      }

      if (drawView.zoom >= 1.7) {
        for (const station of cache.stations) {
          if (!station.lineRefs.some((ref) => selectedTransitRefs.has(ref))) continue;
          const [screenX, screenY] = withView(station.point, drawView);
          const x = screenX + marginX;
          const y = screenY + marginY;
          if (
            x < -8 ||
            y < -8 ||
            x > bufferWidth + 8 ||
            y > bufferHeight + 8
          ) {
            continue;
          }
          context.beginPath();
          context.arc(
            x,
            y,
            drawView.zoom >= 2.8 ? 2.6 : 1.8,
            0,
            Math.PI * 2,
          );
          context.fillStyle = "#ffffff";
          context.fill();
          context.strokeStyle = "#62757f";
          context.lineWidth = 1.1;
          context.stroke();
        }
      }

      context.restore();
      renderedViewRef.current = { ...drawView };
      canvas.style.transform = "none";
    };

    let frame: number | null = null;
    let redrawTimer: ReturnType<typeof setTimeout> | null = null;
    const renderedView = renderedViewRef.current;

    if (!renderedView) {
      frame = requestAnimationFrame(() => draw(latestViewRef.current));
    } else {
      const scale = view.zoom / renderedView.zoom;
      const translateX =
        view.panX +
        marginX -
        scale * (renderedView.panX + marginX);
      const translateY =
        view.panY +
        marginY -
        scale * (renderedView.panY + marginY);
      canvas.style.transform = `translate3d(${translateX}px, ${translateY}px, 0) scale(${scale})`;
      if (!isDragging) redrawTimer = setTimeout(() => {
        frame = requestAnimationFrame(() => draw(latestViewRef.current));
      }, 220);
    }

    return () => {
      if (redrawTimer) clearTimeout(redrawTimer);
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [basemap, districts, height, project, view, width, selectedTransitRefs, isDragging]);

  return <canvas ref={canvasRef} className="basemap-canvas" aria-hidden="true" />;
}
