"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  buildTransitPlan,
  estimateDriving,
  formatDuration,
} from "../lib/core.mjs";
import { assetUrl } from "../lib/assets";
import type {
  Category,
  Place,
  TransitRoute,
  TransportConfig,
} from "../types";

type SidebarMode = "cards" | "select" | "results";

type Props = {
  places: Place[];
  categories: Category[];
  favorites: Set<string>;
  transportConfig: TransportConfig;
  transitRoutes: TransitRoute[];
  highlightPlaceId: string | null;
  openSignal: number;
  onToggleFavorite: (placeId: string) => void;
  onClosePlace: (placeId: string) => void;
  onCloseAll: () => void;
};

function ImageCarousel({
  place,
  category,
}: {
  place: Place;
  category: Category | undefined;
}) {
  const [index, setIndex] = useState(0);
  const [failedUrls, setFailedUrls] = useState<Set<string>>(new Set());
  const availableImages = place.images.filter((image) => !failedUrls.has(image.url));
  const currentIndex = availableImages.length ? index % availableImages.length : 0;
  const image = availableImages[currentIndex];

  if (!image) {
    return (
      <div
        className="place-image-placeholder local-data-cover"
        style={
          {
            "--cover-color": category?.color ?? "#56746c",
          } as CSSProperties
        }
      >
        <span>景点资料</span>
        <strong>{place.name}</strong>
        <small>
          {place.region} · {place.coordinate[0].toFixed(3)},{" "}
          {place.coordinate[1].toFixed(3)}
        </small>
        <em>{place.images.length ? "照片暂时无法读取" : "暂未收录可核实的实景照片"}</em>
      </div>
    );
  }

  return (
    <div className="place-carousel">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        key={image.url}
        src={assetUrl(image.url)}
        alt={place.name}
        loading="lazy"
        decoding="async"
        onError={() => setFailedUrls((current) => new Set(current).add(image.url))}
      />
      {availableImages.length > 1 && (
        <div className="carousel-controls">
          <button
            type="button"
            onClick={() =>
              setIndex(
                (value) =>
                  (value - 1 + availableImages.length) % availableImages.length,
              )
            }
            aria-label="上一张图片"
          >
            ←
          </button>
          <span>
            {currentIndex + 1}/{availableImages.length}
          </span>
          <button
            type="button"
            onClick={() =>
              setIndex((value) => (value + 1) % availableImages.length)
            }
            aria-label="下一张图片"
          >
            →
          </button>
        </div>
      )}
      <div className="photo-attribution">
        <a href={image.sourceUrl} target="_blank" rel="noreferrer">{image.sourceName} ↗</a>
        {image.author && <span>摄影：{image.author}</span>}
        {image.license && <a href={image.licenseUrl ?? image.sourceUrl} target="_blank" rel="noreferrer">{image.license}</a>}
      </div>
    </div>
  );
}

function PlaceCard({
  place,
  category,
  isFavorite,
  highlighted,
  onToggleFavorite,
  onClose,
}: {
  place: Place;
  category: Category | undefined;
  isFavorite: boolean;
  highlighted: boolean;
  onToggleFavorite: () => void;
  onClose: () => void;
}) {
  return (
    <article
      className={`place-card ${highlighted ? "is-highlighted" : ""}`}
      data-place-id={place.id}
    >
      <header className="place-card-header">
        <div>
          <p className="card-kicker">{category?.label ?? "城市地点"}</p>
          <h2>{place.name}</h2>
          <span>{place.region}</span>
        </div>
        <div className="card-actions">
          <button
            type="button"
            className={isFavorite ? "is-favorite" : ""}
            onClick={onToggleFavorite}
            aria-label={isFavorite ? "取消收藏" : "收藏地点"}
          >
            {isFavorite ? "★" : "☆"}
          </button>
          <button type="button" onClick={onClose} aria-label="关闭地点卡片">
            ×
          </button>
        </div>
      </header>

      <ImageCarousel place={place} category={category} />

      <div className="place-card-body">
        <div className="tag-row">
          {place.tags.filter((tag) => !/^[a-z_]+$/.test(tag)).slice(0, 6).map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
          <span
            className={
              place.verificationStatus === "source-linked"
                ? "verification-linked"
                : "verification-pending"
            }
          >
            {place.contentUpdatedAt ? "已补充景点资料" : place.verificationStatus === "source-linked"
              ? "附加来源待复核"
              : "仅 OSM 基础核验"}
          </span>
        </div>

        <section>
          <h3>地点概览</h3>
          <p>{place.encyclopedia}</p>
        </section>
        <section>
          <h3>探索建议</h3>
          <p>{place.recommendation}</p>
        </section>

        {place.visitGuide && <section className="visit-guide">
          <h3>值得留意</h3>
          <ul className="travel-highlights">{place.visitGuide.highlights.map(item => <li key={item}>{item}</li>)}</ul>
          <h3>到访提醒</h3>
          <p>{place.visitGuide.access}</p>
          <p className="visit-note">建议停留：{place.visitGuide.duration}（编辑估算，不含排队与路途）</p>
        </section>}
        <dl className="place-facts">
          <div>
            <dt>开放条件</dt>
            <dd>{place.opening}</dd>
          </div>
          <div>
            <dt>价格参考</dt>
            <dd>{place.price}</dd>
          </div>
          <div>
            <dt>最近轨道交通</dt>
            <dd>{place.nearestTransit}</dd>
          </div>
          <div>
            <dt>数据更新时间</dt>
            <dd>{place.contentUpdatedAt ?? place.sourceUpdatedAt}</dd>
          </div>
        </dl>

        <footer className="source-footer">
          {place.contentSources?.map((source) => (
            <a key={source.url} href={source.url} target="_blank" rel="noreferrer">
              {source.name}{source.license ? ` · ${source.license}` : ""}{source.checkedAt ? ` · 查阅 ${source.checkedAt}` : ""} ↗
            </a>
          ))}
          <a href={place.source.url} target="_blank" rel="noreferrer">
            数据来源：{place.source.name} ↗
          </a>
          {place.officialUrl && (
            <a href={place.officialUrl} target="_blank" rel="noreferrer">
              附加网站 ↗
            </a>
          )}
          {place.contentUpdatedAt && !place.contentSources?.length && (
            <p>当前为基础资料整理，详细沿革与现状仍待第二来源复核。</p>
          )}
          <p>开放时间、价格和活动安排请以官方最新信息为准。</p>
        </footer>
      </div>
    </article>
  );
}

export function PlaceSidebar({
  places,
  categories,
  favorites,
  transportConfig,
  transitRoutes,
  highlightPlaceId,
  openSignal,
  onToggleFavorite,
  onClosePlace,
  onCloseAll,
}: Props) {
  const [mode, setMode] = useState<SidebarMode>("cards");
  const [sheetSize,setSheetSize]=useState<'normal'|'full'|'min'>('normal');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const bodyRef = useRef<HTMLDivElement>(null);
  const scrollPositionRef = useRef(0);
  const categoryById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  );

  useEffect(() => {
    if (!highlightPlaceId || mode !== "cards") return;
    const element = bodyRef.current?.querySelector<HTMLElement>(
      `[data-place-id="${CSS.escape(highlightPlaceId)}"]`,
    );
    element?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [highlightPlaceId, mode, openSignal]);

  const origin = places.find((place) => place.id === selectedIds[0]);
  const destination = places.find((place) => place.id === selectedIds[1]);
  const transitPlan = useMemo(
    () =>
      origin && destination
        ? buildTransitPlan(
            origin.coordinate,
            destination.coordinate,
            transitRoutes,
            transportConfig,
          )
        : null,
    [destination, origin, transitRoutes, transportConfig],
  );
  const driving = useMemo(
    () =>
      origin && destination
        ? estimateDriving(
            origin.coordinate,
            destination.coordinate,
            transportConfig,
          )
        : null,
    [destination, origin, transportConfig],
  );

  const toggleTrafficPlace = (id: string) => {
    setSelectedIds((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      if (current.length >= 2) return [current[1], id];
      return [...current, id];
    });
  };

  const showSelector = () => {
    scrollPositionRef.current = bodyRef.current?.scrollTop ?? 0;
    setMode("select");
  };

  const returnToCards = () => {
    setMode("cards");
    requestAnimationFrame(() => {
      if (bodyRef.current) {
        bodyRef.current.scrollTop = scrollPositionRef.current;
      }
    });
  };

  const handleClosePlace = (placeId: string) => {
    if (selectedIds.includes(placeId)) {
      setSelectedIds([]);
      setMode("cards");
    }
    onClosePlace(placeId);
  };

  return (
    <aside className={`place-sidebar sheet-${sheetSize}`} aria-label="地点详情与交通比较">
      <header className="sidebar-toolbar">
        <div className="mobile-sheet-controls">
          <button type="button" onClick={()=>setSheetSize(sheetSize==='min'?'normal':'min')} aria-expanded={sheetSize!=='min'}>{sheetSize==='min'?'显示详情':'收起详情'}</button>
          {sheetSize!=='min' && <button type="button" onClick={()=>setSheetSize(sheetSize==='full'?'normal':'full')}>{sheetSize==='full'?'半屏':'全屏阅读'}</button>}
        </div>
        <div>
          <strong>{places.length}</strong>
          <span>个地点</span>
        </div>
        {places.length >= 2 && mode === "cards" && (
          <button type="button" onClick={showSelector}>
            交通比较
          </button>
        )}
        {mode !== "cards" && (
          <button type="button" onClick={returnToCards}>
            ← 返回地点
          </button>
        )}
        <button type="button" className="close-all-details" onClick={onCloseAll}
          aria-label="关闭所有地点详情" title="关闭所有地点详情，保留收藏">×</button>
      </header>

      {mode === "cards" && (
        <div
          ref={bodyRef}
          className={`sidebar-cards cards-${Math.min(places.length, 3)}`}
        >
          {places.map((place) => (
            <PlaceCard
              key={place.id}
              place={place}
              category={categoryById.get(place.category)}
              isFavorite={favorites.has(place.id)}
              highlighted={highlightPlaceId === place.id}
              onToggleFavorite={() => onToggleFavorite(place.id)}
              onClose={() => handleClosePlace(place.id)}
            />
          ))}
        </div>
      )}

      {mode === "select" && (
        <div className="traffic-selector">
          <p className="card-kicker">交通双选</p>
          <h2>选择起点和终点</h2>
          <p>第一次选择为起点，第二次选择为终点。列表仅包含当前已打开地点。</p>
          <div className="traffic-place-list">
            {places.map((place) => {
              const selectedIndex = selectedIds.indexOf(place.id);
              return (
                <button
                  key={place.id}
                  type="button"
                  className={selectedIndex >= 0 ? "is-selected" : ""}
                  onClick={() => toggleTrafficPlace(place.id)}
                >
                  <span className="selection-index">
                    {selectedIndex === 0 ? "起" : selectedIndex === 1 ? "终" : ""}
                  </span>
                  <span>
                    <strong>{place.name}</strong>
                    <small>{place.region}</small>
                  </span>
                </button>
              );
            })}
          </div>
          {selectedIds.length === 2 && (
            <div className="traffic-selector-actions">
              <button
                type="button"
                onClick={() => setSelectedIds(([a, b]) => [b, a])}
              >
                ⇄ 交换起终点
              </button>
              <button type="button" onClick={() => setMode("results")}>
                生成离线方案
              </button>
            </div>
          )}
        </div>
      )}

      {mode === "results" && origin && destination && (
        <div className="traffic-results">
          <p className="traffic-disclaimer">{transportConfig.disclaimer}</p>
          <header>
            <div>
              <span>起点</span>
              <strong>{origin.name}</strong>
            </div>
            <button
              type="button"
              onClick={() => setSelectedIds([destination.id, origin.id])}
              aria-label="交换起点终点"
            >
              ⇄
            </button>
            <div>
              <span>终点</span>
              <strong>{destination.name}</strong>
            </div>
          </header>

          <section className="route-block">
            <div className="route-title">
              <span>01</span>
              <div>
                <h3>步行＋轨道交通</h3>
                <p>公交网络尚未完成可靠覆盖，本方案只使用已收录轨道线路。</p>
              </div>
              <strong>
                {transitPlan
                  ? formatDuration(transitPlan.totalMinutes)
                  : "无法生成"}
              </strong>
            </div>
            {transitPlan ? (
              <>
                <div className="route-steps">
                  {transitPlan.steps.map((step, index) => (
                    <div key={`${step.mode}-${step.from}-${index}`}>
                      <i />
                      <span>{step.mode}</span>
                      <p>
                        {step.from} → {step.to}
                        {"line" in step && step.line
                          ? ` · ${step.line}号线`
                          : ""}
                      </p>
                      <strong>{formatDuration(step.minutes)}</strong>
                      {"distanceKm" in step &&
                        step.distanceKm &&
                        step.distanceKm / transportConfig.walkingSpeedKmh >
                          0.5 && <em>单段步行超过30分钟</em>}
                    </div>
                  ))}
                </div>
                <footer>
                  换乘 {transitPlan.transfers} 次 · 总时间包含预计候车时间
                </footer>
              </>
            ) : (
              <p className="route-unavailable">
                当前离线数据无法生成可靠方案。
              </p>
            )}
          </section>

          <section className="route-block">
            <div className="route-title">
              <span>02</span>
              <div>
                <h3>包含普通铁路或高铁</h3>
                <p>保留铁路结果位，不使用未经核验的时刻和运行时间。</p>
              </div>
              <strong>暂无可靠数据</strong>
            </div>
            <p className="route-unavailable">
              当前离线数据无法生成可靠铁路方案。铁路时刻和余票可能变化，出发前请通过官方渠道查询和购票。
            </p>
          </section>

          <section className="route-block driving-block">
            <div className="route-title">
              <span>03</span>
              <div>
                <h3>驾车参考</h3>
                <p>不绘制路线，不含实时路况。</p>
              </div>
              <strong>
                {driving ? formatDuration(driving.minutes) : "暂无"}
              </strong>
            </div>
            {driving && (
              <p>
                直线距离约 {driving.directKm.toFixed(1)} 公里，按道路绕行系数修正为约{" "}
                {driving.adjustedKm.toFixed(1)} 公里。该结果是固定工作日白天条件下的
                {driving.method}。
              </p>
            )}
          </section>

          <footer className="traffic-notes">
            <p>基准时间：{transportConfig.referenceTime}</p>
            <p>超过3小时的结果将标记为“耗时较长”。</p>
          </footer>
        </div>
      )}
    </aside>
  );
}
