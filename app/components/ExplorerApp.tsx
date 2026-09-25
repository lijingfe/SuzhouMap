"use client";

import { useEffect, useMemo, useState } from "react";
import { ExplorerControls } from "./ExplorerControls";
import { MapViewport } from "./MapViewport";
import { PlaceSidebar } from "./PlaceSidebar";
import { matchesPlace } from "../lib/core.mjs";
import { assetUrl, isPublicBuild, loadMapJson } from "../lib/assets";
import type { MapManifest } from '../lib/map-stream';
import type {
  BasemapData,
  FeatureCollection,
  PlacesData,
  RegionsData,
  TransportConfig,
} from "../types";

type AppData = {
  districts: FeatureCollection;
  industrialPark: FeatureCollection;
  basemap: BasemapData;
  mapManifest: MapManifest;
  places: PlacesData;
  regions: RegionsData;
  transportConfig: TransportConfig;
};

const FAVORITES_KEY = "gusu-trails-favorites";
const INTRO_KEY = "gusu-trails-intro-seen";

export function ExplorerApp() {
  const [data, setData] = useState<AppData | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [query, setQuery] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(
    new Set(["garden"]),
  );
  const [showExtended, setShowExtended] = useState(true);
  const [selectedTransitRefs, setSelectedTransitRefs] = useState<Set<string>>(new Set());
  const [temporaryExtended, setTemporaryExtended] = useState<Set<string>>(
    new Set(),
  );
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [favorites, setFavorites] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const saved = sessionStorage.getItem(FAVORITES_KEY);
      return saved ? new Set(JSON.parse(saved) as string[]) : new Set();
    } catch {
      return new Set();
    }
  });
  const [openPlaceIds, setOpenPlaceIds] = useState<string[]>([]);
  const [focusPlaceId, setFocusPlaceId] = useState<string | null>(null);
  const [focusToken, setFocusToken] = useState(0);
  const [openSignal, setOpenSignal] = useState(0);
  const [showIntro, setShowIntro] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return sessionStorage.getItem(INTRO_KEY) !== "yes";
    } catch {
      return true;
    }
  });

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      loadMapJson<FeatureCollection>(isPublicBuild ? "/data/suzhou.json" : "/data/suzhou-osm.json", controller.signal),
      loadMapJson<FeatureCollection>("/data/industrial-park.json", controller.signal),
      loadMapJson<MapManifest>('/data/map/manifest.json', controller.signal).then(async mapManifest => ({
        mapManifest, basemap: await loadMapJson<BasemapData>(mapManifest.overview, controller.signal),
      })),
      loadMapJson<PlacesData>("/data/places.json", controller.signal),
      loadMapJson<RegionsData>("/data/regions.json", controller.signal),
      loadMapJson<TransportConfig>("/data/transport-config.json", controller.signal),
    ])
      .then(
        ([
          districts,
          industrialPark,
          {basemap, mapManifest},
          places,
          regions,
          transportConfig,
        ]) => {
          setData({
            districts,
            industrialPark,
            basemap,
            mapManifest,
            places,
            regions,
            transportConfig,
          });
        },
      )
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setLoadError(true);
      });
    return () => controller.abort();
  }, [loadAttempt]);

  const persistFavorites = (next: Set<string>) => {
    setFavorites(next);
    try {
      sessionStorage.setItem(FAVORITES_KEY, JSON.stringify([...next]));
    } catch {
      // The app remains usable when session storage is unavailable.
    }
  };

  const toggleFavorite = (placeId: string) => {
    const next = new Set(favorites);
    if (next.has(placeId)) next.delete(placeId);
    else next.add(placeId);
    persistFavorites(next);
  };

  const allPlaces = useMemo(() => data?.places.places ?? [], [data]);
  const transitOptions = useMemo(() => {
    const options = new Map<string, { ref: string; color: string }>();
    for (const line of data?.basemap.transitLines ?? []) {
      if (line.ref && !options.has(line.ref)) options.set(line.ref, { ref: line.ref, color: line.color });
    }
    return [...options.values()].sort((a, b) => a.ref.localeCompare(b.ref, "zh-CN", { numeric: true }));
  }, [data]);
  const searchResults = useMemo(
    () =>
      query
        ? allPlaces.filter((place) => matchesPlace(place, query)).slice(0, 10)
        : [],
    [allPlaces, query],
  );

  const visiblePlaces = useMemo(
    () =>
      allPlaces.filter((place) => {
        const libraryVisible =
          (place.library === "core" && place.priority <= 2) ||
          showExtended ||
          temporaryExtended.has(place.id);
        const categoryVisible = selectedCategories.has(place.category);
        const favoriteVisible = !onlyFavorites || favorites.has(place.id);
        return libraryVisible && categoryVisible && favoriteVisible;
      }),
    [
      allPlaces,
      favorites,
      onlyFavorites,
      selectedCategories,
      showExtended,
      temporaryExtended,
    ],
  );

  const openPlaces = useMemo(
    () =>
      openPlaceIds
        .map((id) => allPlaces.find((place) => place.id === id))
        .filter((place) => place !== undefined),
    [allPlaces, openPlaceIds],
  );

  const openPlace = (place: (typeof allPlaces)[number]) => {
    if (place.library === "extended") {
      setTemporaryExtended((current) => new Set(current).add(place.id));
    }
    setOpenPlaceIds((current) =>
      current.includes(place.id) ? current : [...current, place.id],
    );
    setFocusPlaceId(place.id);
    setFocusToken((value) => value + 1);
    setOpenSignal((value) => value + 1);
  };

  const selectSearchResult = (place: (typeof allPlaces)[number]) => {
    setQuery("");
    setTemporaryExtended(current=>new Set(current).add(place.id));
    setSelectedCategories(current=>new Set(current).add(place.category));
    if(!favorites.has(place.id))setOnlyFavorites(false);
    openPlace(place);
  };

  const closePlace = (placeId: string) => {
    setOpenPlaceIds((current) => current.filter((id) => id !== placeId));
    if (focusPlaceId === placeId) setFocusPlaceId(null);
  };

  const toggleCategory = (categoryId: string) => {
    setSelectedCategories((current) => {
      const next = new Set(current);
      if (next.has(categoryId)) next.delete(categoryId);
      else next.add(categoryId);
      return next;
    });
  };

  const toggleAllCategories = () => {
    if (!data) return;
    setSelectedCategories((current) =>
      current.size
        ? new Set()
        : new Set(data.places.categories.map((category) => category.id)),
    );
  };

  const dismissIntro = () => {
    setShowIntro(false);
    try {
      sessionStorage.setItem(INTRO_KEY, "yes");
    } catch {
      // Closing the intro still works without storage.
    }
  };

  if (loadError) {
    return (
      <main className="app-loading">
        <p className="card-kicker">地图资源加载失败</p>
        <h1>姑苏寻迹暂时无法启动</h1>
        <p>请检查网络后重试，已缓存的地图细节可以重复使用。</p>
        <button type="button" onClick={() => {setLoadError(false);setLoadAttempt(n=>n+1);}}>重新加载</button>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="app-loading">
        <div className="loading-mark">苏</div>
        <p>正在装载苏州全域离线地图…</p>
      </main>
    );
  }

  const coreCount = data.places.places.filter(
    (place) => place.library === "core",
  ).length;
  const extendedCount = data.places.places.filter(
    (place) => place.library === "extended",
  ).length;

  return (
    <main className="explorer-app">
      <section className="map-column">
        <MapViewport
          districts={data.districts.features}
          industrialPark={data.industrialPark.features[0] ?? null}
          regionMeta={data.regions.regions}
          basemap={data.basemap}
          mapManifest={data.mapManifest}
          selectedTransitRefs={selectedTransitRefs}
          places={visiblePlaces}
          categories={data.places.categories}
          favorites={favorites}
          openPlaceIds={openPlaceIds}
          focusPlaceId={focusPlaceId}
          focusToken={focusToken}
          onOpenPlace={openPlace}
        />

        <ExplorerControls
          query={query}
          onQueryChange={setQuery}
          searchResults={searchResults}
          onSelectResult={selectSearchResult}
          categories={data.places.categories}
          selectedCategories={selectedCategories}
          onToggleCategory={toggleCategory}
          onToggleAllCategories={toggleAllCategories}
          onlyFavorites={onlyFavorites}
          onToggleOnlyFavorites={() => setOnlyFavorites((value) => !value)}
          showExtended={showExtended}
          onToggleExtended={() => setShowExtended((value) => !value)}
          transitOptions={transitOptions}
          selectedTransitRefs={selectedTransitRefs}
          onToggleTransit={(ref) => setSelectedTransitRefs((current) => {
            const next = new Set(current);
            if (next.has(ref)) next.delete(ref);
            else next.add(ref);
            return next;
          })}
          onSetAllTransit={(visible) => setSelectedTransitRefs(new Set(visible ? transitOptions.map((line) => line.ref) : []))}
          visibleCount={visiblePlaces.length}
          coreCount={coreCount}
          extendedCount={extendedCount}
          favorites={favorites}
        />

        <div className="data-stamp">
          <strong>数据版本 · 2026.07.24</strong>
          <span>边界 / 地点 / 交通：2026-07-24</span>
          <span>水域 / 绿地：{data.basemap.surfaceUpdatedAt ?? "本地数据"}</span>
          <span>工业园区为功能区视觉展示，不等同于法定县级行政区划</span>
          <span>交通为固定工作日白天离线估算 · 请以官方最新信息为准</span>
          <span>© OpenStreetMap contributors · ODbL 1.0</span>
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">地图数据许可 ↗</a>
          {isPublicBuild && <a href={assetUrl("/DATA_SOURCES.txt")} target="_blank" rel="noreferrer">公开数据与图片说明 ↗</a>}
        </div>
      </section>

      {openPlaces.length > 0 && (
        <PlaceSidebar
          key={openSignal}
          places={openPlaces}
          categories={data.places.categories}
          favorites={favorites}
          transportConfig={data.transportConfig}
          transitRoutes={data.basemap.transitRoutes}
          highlightPlaceId={focusPlaceId}
          openSignal={openSignal}
          onToggleFavorite={toggleFavorite}
          onClosePlace={closePlace}
        />
      )}

      {showIntro && (
        <div className="intro-overlay">
          <section>
            <button
              type="button"
              onClick={dismissIntro}
              aria-label="关闭使用引导"
            >
              ×
            </button>
            <p className="card-kicker">首次使用</p>
            <h2>在苏州地图上慢慢寻迹</h2>
            <ol>
              <li>
                <span>01</span>
                单指拖动、双指缩放；电脑也可使用滚轮
              </li>
              <li>
                <span>02</span>
                点击圆点查看地点名称和分类
              </li>
              <li>
                <span>03</span>
                点击地点，打开介绍卡片（手机在底部显示）
              </li>
              <li>
                <span>04</span>
                打开两个地点后比较离线交通
              </li>
              <li>
                <span>05</span>
                使用搜索、分类筛选与会话收藏
              </li>
            </ol>
            <button type="button" className="intro-start" onClick={dismissIntro}>
              开始探索
            </button>
          </section>
        </div>
      )}

    </main>
  );
}
