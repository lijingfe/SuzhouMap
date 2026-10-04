"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { BasemapCanvas } from "./BasemapCanvas";
import { useMapDetail } from '../lib/use-map-detail';
import type { MapManifest } from '../lib/map-stream';
import {
  clampView,
  clusterScreenPlaces,
  createProjector,
  geometryPath,
  MAX_MAP_ZOOM,
  MIN_MAP_ZOOM,
  visibleLabels,
  withView,
  type Cluster,
  type ViewTransform,
} from "../lib/map";
import type {
  BasemapData,
  Category,
  Coordinate,
  DistrictFeature,
  Place,
  RegionMeta,
} from "../types";

type Size = { width: number; height: number };

type HoverState =
  | {
      kind: "place";
      x: number;
      y: number;
      place: Place;
    }
  | {
      kind: "cluster";
      x: number;
      y: number;
      cluster: Cluster;
    }
  | null;

type RegionPopup = {
  region: RegionMeta;
  x: number;
  y: number;
} | null;

type Props = {
  districts: DistrictFeature[];
  industrialPark: DistrictFeature | null;
  regionMeta: RegionMeta[];
  basemap: BasemapData;
  mapManifest: MapManifest;
  selectedTransitRefs: Set<string>;
  places: Place[];
  categories: Category[];
  favorites: Set<string>;
  openPlaceIds: string[];
  focusPlaceId: string | null;
  focusToken: number;
  onOpenPlace: (place: Place) => void;
};

const BASE_VIEW: ViewTransform = { zoom: 1, panX: 0, panY: 0 };
const INITIAL_ZOOM = 15;

function initialViewForDistrict(
  districts: DistrictFeature[],
  project: (coordinate: Coordinate) => Coordinate,
  size: Size,
) {
  const gusuDistrict = districts.find(
    (district) => district.properties.name === "姑苏区",
  );
  const gusuCenter =
    gusuDistrict?.properties.centroid ?? gusuDistrict?.properties.center;
  if (!gusuCenter) return BASE_VIEW;

  const projectedCenter = project(gusuCenter);
  return clampView(
    {
      zoom: INITIAL_ZOOM,
      panX: size.width / 2 - projectedCenter[0] * INITIAL_ZOOM,
      panY: size.height / 2 - projectedCenter[1] * INITIAL_ZOOM,
    },
    size.width,
    size.height,
  );
}

function useElementSize() {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<Size>({ width: 1200, height: 780 });

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const next = entry.contentRect;
      setSize({
        width: Math.max(1, Math.round(next.width)),
        height: Math.max(1, Math.round(next.height)),
      });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return { ref, size };
}

export function MapViewport({
  districts,
  industrialPark,
  regionMeta,
  basemap,
  mapManifest,
  selectedTransitRefs,
  places,
  categories,
  favorites,
  openPlaceIds,
  focusPlaceId,
  focusToken,
  onOpenPlace,
}: Props) {
  const { ref, size } = useElementSize();
  const mapCoverage = useMemo(
    () => industrialPark ? [...districts, industrialPark] : districts,
    [districts, industrialPark],
  );
  const project = useMemo(
    () =>
      createProjector(
        districts,
        size.width,
        size.height,
        Math.max(58, Math.min(size.width, size.height) * 0.12),
      ),
    [districts, size.height, size.width],
  );
  const [view, setView] = useState<ViewTransform>(() =>
    initialViewForDistrict(districts, project, size),
  );
  const viewRef = useRef(view);
  useLayoutEffect(() => {
    viewRef.current = view;
  }, [view]);
  const [hover, setHover] = useState<HoverState>(null);
  const [regionPopup, setRegionPopup] = useState<RegionPopup>(null);
  const [clusterList, setClusterList] = useState<Cluster | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const corners = [project.unproject([(-view.panX)/view.zoom,(-view.panY)/view.zoom]),project.unproject([(size.width-view.panX)/view.zoom,(size.height-view.panY)/view.zoom])];
  const detail = useMapDetail(basemap,mapManifest,[corners[0][0],corners[1][1],corners[1][0],corners[0][1]],view.zoom,isDragging);
  const pointers=useRef(new Map<number,Coordinate>());
  const pinch=useRef<{distance:number;mid:Coordinate;view:ViewTransform}|null>(null);
  const suppressClickUntil=useRef(0);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    panX: number;
    panY: number;
    moved: boolean;
  } | null>(null);
  const dragFrameRef = useRef<number | null>(null);
  const pendingDragViewRef = useRef<ViewTransform | null>(null);

  useEffect(
    () => () => {
      if (dragFrameRef.current !== null) {
        cancelAnimationFrame(dragFrameRef.current);
      }
    },
    [],
  );

  const previousLayoutRef = useRef<{
    project: typeof project;
    size: Size;
  } | null>(null);

  useLayoutEffect(() => {
    const previous = previousLayoutRef.current;
    previousLayoutRef.current = { project, size };
    if (!previous) {
      return;
    }
    if (
      previous.size.width === size.width &&
      previous.size.height === size.height
    ) {
      return;
    }

    const current = viewRef.current;
    const previousCenter = previous.project.unproject([
      (previous.size.width / 2 - current.panX) / current.zoom,
      (previous.size.height / 2 - current.panY) / current.zoom,
    ]);
    const nextCenter = project(previousCenter);
    const next = clampView(
      {
        zoom: current.zoom,
        panX: size.width / 2 - nextCenter[0] * current.zoom,
        panY: size.height / 2 - nextCenter[1] * current.zoom,
      },
      size.width,
      size.height,
    );

    viewRef.current = next;
    setView(next);
  }, [project, size]);

  const categoryById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  );
  const openPlaceSet = useMemo(() => new Set(openPlaceIds), [openPlaceIds]);
  const districtPaths = useMemo(
    () =>
      new Map(
        districts.map((feature) => [
          feature.properties.adcode ?? feature.properties.name,
          geometryPath(feature.geometry, project, BASE_VIEW),
        ]),
      ),
    [districts, project],
  );
  const industrialParkPath = useMemo(
    () =>
      industrialPark
        ? geometryPath(industrialPark.geometry, project, BASE_VIEW)
        : null,
    [industrialPark, project],
  );

  const screenPlaces = useMemo(
    () =>
      places
        .map((place) => {
          const [x, y] = withView(project(place.coordinate), view);
          return { place, x, y };
        })
        .filter(
          ({ x, y }) =>
            x > -80 &&
            y > -80 &&
            x < size.width + 80 &&
            y < size.height + 80,
        ),
    [places, project, size.height, size.width, view],
  );

  const { singles, clusters } = useMemo(
    () => clusterScreenPlaces(screenPlaces, view.zoom),
    [screenPlaces, view.zoom],
  );
  const labels = useMemo(
    () => visibleLabels(singles, view.zoom),
    [singles, view.zoom],
  );

  const focusOn = useCallback(
    (coordinate: Coordinate, zoom = Math.max(3.2, view.zoom)) => {
      const projected = project(coordinate);
      setView(
        clampView(
          {
            zoom,
            panX: size.width / 2 - projected[0] * zoom,
            panY: size.height / 2 - projected[1] * zoom,
          },
          size.width,
          size.height,
        ),
      );
    },
    [project, size.height, size.width, view.zoom],
  );

  const lastFocus=useRef('');
  useEffect(() => {
    if (!focusPlaceId) return;
    const key=`${focusPlaceId}:${focusToken}`;
    if(lastFocus.current===key)return;
    const place = places.find((item) => item.id === focusPlaceId);
    if (!place) return;
    const frame = requestAnimationFrame(() => {lastFocus.current=key;focusOn(place.coordinate);});
    return () => cancelAnimationFrame(frame);
  }, [focusOn, focusPlaceId, focusToken, places, size.width]);

  const zoomAt = useCallback(
    (targetZoom: number, x: number, y: number) => {
      const zoom = Math.min(
        MAX_MAP_ZOOM,
        Math.max(MIN_MAP_ZOOM, targetZoom),
      );
      const ratio = zoom / view.zoom;
      setView(
        clampView(
          {
            zoom,
            panX: x - (x - view.panX) * ratio,
            panY: y - (y - view.panY) * ratio,
          },
          size.width,
          size.height,
        ),
      );
    },
    [size.height, size.width, view],
  );

  const handleWheel = (event: React.WheelEvent<SVGSVGElement>) => {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    zoomAt(view.zoom * (event.deltaY > 0 ? 0.86 : 1.16), x, y);
  };

  const handlePointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return;
    const rect=event.currentTarget.getBoundingClientRect();
    pointers.current.set(event.pointerId,[event.clientX-rect.left,event.clientY-rect.top]);
    if(pointers.current.size===2){
      if(dragFrameRef.current!==null)cancelAnimationFrame(dragFrameRef.current);
      dragFrameRef.current=null;pendingDragViewRef.current=null;
      for(const id of pointers.current.keys())event.currentTarget.setPointerCapture(id);
      const [a,b]=[...pointers.current.values()];
      pinch.current={distance:Math.max(1,Math.hypot(a[0]-b[0],a[1]-b[1])),mid:[(a[0]+b[0])/2,(a[1]+b[1])/2],view:{...viewRef.current}};
      suppressClickUntil.current=event.timeStamp+700;setIsDragging(true);
      event.currentTarget.setPointerCapture(event.pointerId);return;
    }
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      panX: view.panX,
      panY: view.panY,
      moved: false,
    };
  };

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if(pointers.current.has(event.pointerId)){
      const rect=event.currentTarget.getBoundingClientRect();
      pointers.current.set(event.pointerId,[event.clientX-rect.left,event.clientY-rect.top]);
    }
    if(pinch.current && pointers.current.size>=2){
      const [a,b]=[...pointers.current.values()], start=pinch.current;
      const zoom=Math.max(MIN_MAP_ZOOM,Math.min(MAX_MAP_ZOOM,start.view.zoom*Math.hypot(a[0]-b[0],a[1]-b[1])/start.distance));
      const ratio=zoom/start.view.zoom;
      const next=clampView({zoom,panX:(a[0]+b[0])/2-(start.mid[0]-start.view.panX)*ratio,panY:(a[1]+b[1])/2-(start.mid[1]-start.view.panY)*ratio},size.width,size.height);
      viewRef.current=next;setView(next);suppressClickUntil.current=event.timeStamp+700;return;
    }
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    if (Math.abs(deltaX) + Math.abs(deltaY) <= 4 && !drag.moved) return;
    if (!drag.moved) {
      drag.moved = true;
      setIsDragging(true);
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    suppressClickUntil.current=event.timeStamp+400;
    pendingDragViewRef.current = clampView(
      {
        zoom: view.zoom,
        panX: drag.panX + deltaX,
        panY: drag.panY + deltaY,
      },
      size.width,
      size.height,
    );
    if (dragFrameRef.current !== null) return;
    dragFrameRef.current = requestAnimationFrame(() => {
      if (pendingDragViewRef.current) {
        viewRef.current=pendingDragViewRef.current;
        setView(pendingDragViewRef.current);
        pendingDragViewRef.current = null;
      }
      dragFrameRef.current = null;
    });
  };

  const handlePointerUp = (event: React.PointerEvent<SVGSVGElement>) => {
    if(pendingDragViewRef.current){viewRef.current=pendingDragViewRef.current;setView(pendingDragViewRef.current);pendingDragViewRef.current=null;}
    pointers.current.delete(event.pointerId);
    if(pinch.current){
      pinch.current=null;dragRef.current=null;
      suppressClickUntil.current=event.timeStamp+400;
      const remaining=[...pointers.current.entries()][0];
      if(remaining){
        const rect=event.currentTarget.getBoundingClientRect();
        dragRef.current={pointerId:remaining[0],startX:remaining[1][0]+rect.left,startY:remaining[1][1]+rect.top,panX:viewRef.current.panX,panY:viewRef.current.panY,moved:true};
      }
    }
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
      setIsDragging(false);
    }
    if(!pointers.current.size)setIsDragging(false);
    if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const selectRegion = (
    event: React.MouseEvent<SVGGElement>,
    feature: DistrictFeature,
  ) => {
    event.stopPropagation();
    if (dragRef.current?.moved || event.timeStamp<suppressClickUntil.current) return;
    const meta = regionMeta.find((region) => region.name === feature.properties.name);
    if (!meta) return;
    setClusterList(null);
    setRegionPopup({
      region: meta,
      x: Math.min(size.width - 340, Math.max(24, event.clientX - event.currentTarget.ownerSVGElement!.getBoundingClientRect().left)),
      y: Math.min(size.height - 360, Math.max(24, event.clientY - event.currentTarget.ownerSVGElement!.getBoundingClientRect().top)),
    });
  };

  const handlePlaceClick = (
    event: React.MouseEvent<SVGGElement>,
    place: Place,
  ) => {
    event.stopPropagation();
    if(event.timeStamp<suppressClickUntil.current)return;
    setRegionPopup(null);
    setClusterList(null);
    onOpenPlace(place);
  };

  const handleClusterClick = (
    event: React.MouseEvent<SVGGElement>,
    cluster: Cluster,
  ) => {
    event.stopPropagation();
    if(event.timeStamp<suppressClickUntil.current)return;
    setRegionPopup(null);
    if (view.zoom < 3.1) {
      const nextZoom = Math.min(MAX_MAP_ZOOM, view.zoom * 1.7);
      const representative = cluster.places[0];
      const center: Coordinate = [
        cluster.places.reduce((sum, place) => sum + place.coordinate[0], 0) /
          cluster.places.length,
        cluster.places.reduce((sum, place) => sum + place.coordinate[1], 0) /
          cluster.places.length,
      ];
      focusOn(center, nextZoom);
      if (representative) setClusterList(null);
    } else {
      setClusterList(cluster);
    }
  };

  const closeTransient = () => {
    if (dragRef.current?.moved) return;
    setRegionPopup(null);
    setClusterList(null);
  };

  const resetView = (fullCity: boolean) => {
    setHover(null);
    setRegionPopup(null);
    setClusterList(null);
    setView(fullCity ? BASE_VIEW : initialViewForDistrict(districts, project, size));
  };

  return (
    <div ref={ref} className="map-viewport">
      <BasemapCanvas
        basemap={detail.basemap}
        selectedTransitRefs={selectedTransitRefs}
        districts={mapCoverage}
        width={size.width}
        height={size.height}
        project={project}
        view={view}
        isDragging={isDragging}
      />
      {detail.status !== 'ready' && <div className="map-detail-status" role="status">
        {detail.status==='loading' ? '正在补充附近地图细节…' : <button onClick={detail.retry}>细节暂未加载，点击重试</button>}
      </div>}
      <svg
        className="map-interaction-layer"
        viewBox={`0 0 ${size.width} ${size.height}`}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onClick={closeTransient}
        aria-label="苏州全域探索地图"
      >
        <title>苏州全域探索地图</title>
        <g
          className="district-layer"
          transform={`translate(${view.panX} ${view.panY}) scale(${view.zoom})`}
        >
          {districts.map((feature) => (
            <g
              key={feature.properties.adcode ?? feature.properties.name}
              className="district-area"
              onClick={(event) => selectRegion(event, feature)}
            >
              <path
                d={
                  districtPaths.get(
                    feature.properties.adcode ?? feature.properties.name,
                  ) ?? ""
                }
                fillRule="evenodd"
              />
            </g>
          ))}
          {industrialPark && (
            <g
              className="district-area industrial-park-area"
              onClick={(event) => selectRegion(event, industrialPark)}
            >
              <path
                d={industrialParkPath ?? ""}
                fillRule="evenodd"
              />
            </g>
          )}
        </g>

        <g className="place-layer">
          {clusters.map((cluster) => (
            <g
              key={cluster.id}
              className="place-cluster"
              transform={`translate(${cluster.x} ${cluster.y})`}
              onClick={(event) => handleClusterClick(event, cluster)}
              onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();event.currentTarget.dispatchEvent(new MouseEvent('click',{bubbles:true}));}}}
              onMouseEnter={() =>
                setHover({
                  kind: "cluster",
                  x: cluster.x,
                  y: cluster.y,
                  cluster,
                })
              }
              onMouseLeave={() => setHover(null)}
              role="button"
              tabIndex={0}
              aria-label={`${cluster.places.length}个地点的聚合`}
            >
              <circle r={Math.min(22, 12 + Math.log2(cluster.places.length) * 2.5)} />
              <text y="1">{cluster.places.length}</text>
            </g>
          ))}

          {singles.map(({ place, x, y }) => {
            const category = categoryById.get(place.category);
            const isOpen = openPlaceSet.has(place.id);
            const isFavorite = favorites.has(place.id);
            const isFocused = focusPlaceId === place.id;
            return (
              <g
                key={place.id}
                className={`place-marker priority-${place.priority} ${isOpen ? "is-open" : ""} ${isFavorite ? "is-favorite" : ""} ${isFocused ? "is-focused" : ""}`}
                transform={`translate(${x} ${y})`}
                onClick={(event) => handlePlaceClick(event, place)}
                onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();setRegionPopup(null);setClusterList(null);onOpenPlace(place);}}}
                onMouseEnter={() =>
                  setHover({ kind: "place", x, y, place })
                }
                onMouseLeave={() => setHover(null)}
              role="button"
              tabIndex={0}
              aria-label={`${place.name}，${category?.label ?? "地点"}`}
            >
                <circle className="place-hit-target" r={size.width<1024 ? 18 : 12} />
                {isFavorite && <circle className="favorite-ring" r="8" />}
                <circle
                  className="place-dot"
                  r={place.priority === 1 ? 6 : place.priority === 2 ? 5 : 4.2}
                  fill={category?.color ?? "#68757d"}
                />
              </g>
            );
          })}

          {labels.map(({ place, x, y }) => (
            <text
              key={`label-${place.id}`}
              x={x}
              y={y - 11}
              className="place-label"
            >
              {place.name}
            </text>
          ))}
        </g>
      </svg>

      <div
        className="map-zoom-controls"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => zoomAt(view.zoom * 1.25, size.width / 2, size.height / 2)}
          aria-label="放大地图"
        >
          ＋
        </button>
        <button
          type="button"
          onClick={() => zoomAt(view.zoom / 1.25, size.width / 2, size.height / 2)}
          aria-label="缩小地图"
        >
          −
        </button>
        <span>{view.zoom.toFixed(1)}×</span>
      </div>

      <div className="map-navigation-controls" aria-label="地图视野快捷操作">
        <button type="button" onClick={() => resetView(false)} aria-label="回到姑苏，15倍视野" title="回到姑苏区中心 · 15×">姑苏</button>
        <button type="button" onClick={() => resetView(true)} aria-label="查看苏州全域" title="查看苏州全域 · 1×">全域</button>
      </div>

      {hover && (
        <div
          className="map-tooltip"
          style={{
            left: Math.min(size.width - 240, Math.max(12, hover.x + 14)),
            top: Math.min(size.height - 110, Math.max(12, hover.y + 14)),
          }}
        >
          {hover.kind === "place" ? (
            <>
              <strong>{hover.place.name}</strong>
              <span>
                {categoryById.get(hover.place.category)?.label ?? "地点"}
              </span>
            </>
          ) : (
            <>
              <strong>{hover.cluster.places.length} 个地点</strong>
              <span>
                {Object.entries(hover.cluster.categoryCounts)
                  .slice(0, 4)
                  .map(
                    ([category, count]) =>
                      `${categoryById.get(category)?.label ?? category} ${count}`,
                  )
                  .join(" · ")}
              </span>
            </>
          )}
        </div>
      )}

      {regionPopup && (
        <article
          className="region-popup"
          style={{ left: regionPopup.x, top: regionPopup.y }}
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            className="floating-close"
            onClick={() => setRegionPopup(null)}
            aria-label="关闭行政区介绍"
          >
            ×
          </button>
          <div
            className="region-image-placeholder local-data-cover"
            style={
              {
                "--cover-color": "#4c7968",
              } as CSSProperties
            }
          >
            <span>LOCAL REGION COVER</span>
            <strong>{regionPopup.region.name}</strong>
            <small>{regionPopup.region.landmarks.slice(0, 3).join(" · ")}</small>
            <em>本地行政区数据封面 · 非实景照片</em>
          </div>
          <p className="card-kicker">行政区域</p>
          <h2>{regionPopup.region.name}</h2>
          <p>{regionPopup.region.description}</p>
          <div className="tag-row">
            {regionPopup.region.tags.map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
          </div>
          <dl className="region-facts">
            <div>
              <dt>代表景观</dt>
              <dd>{regionPopup.region.landmarks.join("、")}</dd>
            </div>
            <div>
              <dt>城市特征</dt>
              <dd>{regionPopup.region.character}</dd>
            </div>
          </dl>
        </article>
      )}

      {clusterList && (
        <section className="cluster-list">
          <header>
            <div>
              <span>聚合地点</span>
              <strong>{clusterList.places.length} 处</strong>
            </div>
            <button
              type="button"
              onClick={() => setClusterList(null)}
              aria-label="关闭地点列表"
            >
              ×
            </button>
          </header>
          <div>
            {clusterList.places.slice(0, 24).map((place) => (
              <button
                key={place.id}
                type="button"
                onClick={() => {
                  setClusterList(null);
                  onOpenPlace(place);
                }}
              >
                <i
                  style={{
                    background:
                      categoryById.get(place.category)?.color ?? "#68757d",
                  }}
                />
                <span>{place.name}</span>
                <small>{place.region}</small>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
