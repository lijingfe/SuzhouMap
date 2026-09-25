"use client";

import { useEffect, useId, useState } from "react";
import type { Category, Place } from "../types";

type Props = {
  query: string;
  onQueryChange: (value: string) => void;
  searchResults: Place[];
  onSelectResult: (place: Place) => void;
  categories: Category[];
  selectedCategories: Set<string>;
  onToggleCategory: (categoryId: string) => void;
  onToggleAllCategories: () => void;
  onlyFavorites: boolean;
  onToggleOnlyFavorites: () => void;
  showExtended: boolean;
  onToggleExtended: () => void;
  visibleCount: number;
  coreCount: number;
  extendedCount: number;
  favorites: Set<string>;
  transitOptions: Array<{ ref: string; color: string }>;
  selectedTransitRefs: Set<string>;
  onToggleTransit: (ref: string) => void;
  onSetAllTransit: (visible: boolean) => void;
};

export function ExplorerControls({
  query,
  onQueryChange,
  searchResults,
  onSelectResult,
  categories,
  selectedCategories,
  onToggleCategory,
  onToggleAllCategories,
  onlyFavorites,
  onToggleOnlyFavorites,
  showExtended,
  onToggleExtended,
  visibleCount,
  coreCount,
  extendedCount,
  favorites,
  transitOptions,
  selectedTransitRefs,
  onToggleTransit,
  onSetAllTransit,
}: Props) {
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const bodyId = useId();
  useEffect(() => {
    const media=window.matchMedia('(max-width: 1023px)');
    const update=()=>setCollapsed(media.matches);
    update(); media.addEventListener('change',update);
    return()=>media.removeEventListener('change',update);
  }, []);
  const allHidden = selectedCategories.size === 0;

  return (
    <section className={`explorer-controls${collapsed ? " is-collapsed" : ""}`} aria-label="地图搜索和筛选">
      <header className="brand-row">
        <div>
          <p hidden={collapsed}>SUZHOU FIELD MAP</p>
          <h1>姑苏寻迹</h1>
        </div>
        <div className="brand-actions">
          <span className="offline-badge" hidden={collapsed}>本地数据</span>
          <button
            type="button"
            className="control-panel-toggle"
            aria-label={collapsed ? "展开地图面板" : "收起地图面板"}
            aria-expanded={!collapsed}
            aria-controls={bodyId}
            onClick={() => setCollapsed((value) => !value)}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d={collapsed ? "M6 3l5 5-5 5" : "M10 3L5 8l5 5"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {collapsed ? "展开" : "收起"}
          </button>
        </div>
      </header>

      <div id={bodyId} className="explorer-controls-body" hidden={collapsed}>
      <div className="search-shell">
        <span className="search-symbol">⌕</span>
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="搜索地点、别名、拼音或标签"
          aria-label="搜索苏州地点"
        />
        {query && (
          <button
            type="button"
            onClick={() => onQueryChange("")}
            aria-label="清空搜索"
          >
            ×
          </button>
        )}
        {query && (
          <div className="search-results">
            {searchResults.length ? (
              searchResults.slice(0, 10).map((place) => (
                <button
                  key={place.id}
                  type="button"
                  onClick={() => { onSelectResult(place); if(window.matchMedia('(max-width: 1023px)').matches)setCollapsed(true); }}
                >
                  <span>
                    <strong>{place.name}</strong>
                    <small>
                      {categories.find((item) => item.id === place.category)
                        ?.label ?? "地点"}
                    </small>
                  </span>
                  <span className="result-region">
                    {place.region}
                    {favorites.has(place.id) && <b>★</b>}
                  </span>
                </button>
              ))
            ) : (
              <p>没有匹配地点</p>
            )}
          </div>
        )}
      </div>

      <div className="quick-controls">
        <button
          type="button"
          className={filtersOpen ? "is-active" : ""}
          aria-expanded={filtersOpen}
          onClick={() => setFiltersOpen((value) => !value)}
        >
          分类筛选
          <span>{selectedCategories.size}/{categories.length}</span>
        </button>
        <button
          type="button"
          className={onlyFavorites ? "is-active" : ""}
          onClick={onToggleOnlyFavorites}
        >
          ☆ 仅看收藏
        </button>
        <button
          type="button"
          className={showExtended ? "is-active" : ""}
          title={showExtended ? "切换为重点地点，减少地图上的标记" : "显示全部已收录地点"}
          aria-pressed={showExtended}
          onClick={onToggleExtended}
        >
          {showExtended ? "显示精简地点" : "显示更多地点"}
        </button>
      </div>

      {filtersOpen && (
        <div className="filter-panel">
          <header>
            <span>主要分类</span>
            <button type="button" className={allHidden ? "bulk-select" : ""} onClick={onToggleAllCategories}>
              {allHidden ? "显示全部" : "隐藏全部"}
            </button>
          </header>
          <div>
            {categories.map((category) => {
              const selected = selectedCategories.has(category.id);
              return (
                <button
                  key={category.id}
                  type="button"
                  className={selected ? "is-selected" : ""}
                  aria-pressed={selected}
                  onClick={() => onToggleCategory(category.id)}
                >
                  <i style={{ background: category.color }} />
                  {category.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="transit-filter">
        <header>
          <span>地铁线路 <small>已选 {selectedTransitRefs.size}/{transitOptions.length} 条</small></span>
          <div>
            <button type="button" className="bulk-select" onClick={() => onSetAllTransit(true)}>全选</button>
            <button type="button" onClick={() => onSetAllTransit(false)}>隐藏全部</button>
          </div>
        </header>
        <div className="transit-options">
          {transitOptions.map((line) => (
            <button key={line.ref} type="button"
              aria-pressed={selectedTransitRefs.has(line.ref)}
              className={selectedTransitRefs.has(line.ref) ? "is-selected" : ""}
              onClick={() => onToggleTransit(line.ref)}>
              <i style={{ background: line.color }} />{line.ref}号线
            </button>
          ))}
        </div>
      </div>

      <footer>
        <strong>{visibleCount}</strong>
        <span>处地点正在显示</span>
        <small>
          核心 {coreCount} · 扩展 {extendedCount}
        </small>
      </footer>

      {allHidden && <p className="empty-map-notice">当前已隐藏全部地点</p>}
      </div>
    </section>
  );
}
