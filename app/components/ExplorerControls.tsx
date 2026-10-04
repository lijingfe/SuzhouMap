"use client";

import { useEffect, useId, useRef, useState } from "react";
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
  favoritePlaces: Place[];
  favoritesPersistent: boolean;
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
  favoritePlaces,
  favoritesPersistent,
  transitOptions,
  selectedTransitRefs,
  onToggleTransit,
  onSetAllTransit,
}: Props) {
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const bodyId = useId();
  const searchId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [searchDismissed, setSearchDismissed] = useState(false);
  const searchOpen = query.trim().length > 0 && !searchDismissed;
  const activeResult = Math.min(activeIndex, searchResults.length - 1);
  useEffect(() => {
    if (searchOpen && activeResult >= 0) {
      document.getElementById(`${searchId}-${activeResult}`)?.scrollIntoView({block: "nearest"});
    }
  }, [activeResult, searchId, searchOpen, query]);
  const selectPlace = (place: Place) => {
    setSearchDismissed(true);
    onSelectResult(place);
    inputRef.current?.blur();
    if (window.matchMedia('(max-width: 1023px)').matches) setCollapsed(true);
  };
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
      <div className="search-shell" onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget)) setSearchDismissed(true);
      }}>
        <span className="search-symbol">⌕</span>
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => { onQueryChange(event.target.value); setActiveIndex(0); setSearchDismissed(false); }}
          onFocus={() => setSearchDismissed(false)}
          onKeyDown={event => {
            // Enter used to commit Chinese input must not also select a place.
            if (event.nativeEvent.isComposing || event.keyCode === 229) return;
            if (event.key === "Escape") { setSearchDismissed(true); event.preventDefault(); }
            if ((event.key === "ArrowDown" || event.key === "ArrowUp") && searchResults.length) {
              event.preventDefault();
              setSearchDismissed(false);
              const delta = event.key === "ArrowDown" ? 1 : -1;
              setActiveIndex(searchOpen ? (activeResult + delta + searchResults.length) % searchResults.length : 0);
            }
            if (event.key === "Enter" && searchOpen && searchResults[activeResult]) {
              event.preventDefault(); selectPlace(searchResults[activeResult]);
            }
          }}
          placeholder="搜索地点、别名、拼音或标签"
          aria-label="搜索苏州地点"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={searchOpen}
          aria-controls={searchOpen ? searchId : undefined}
          aria-activedescendant={searchOpen && activeResult >= 0 ? `${searchId}-${activeResult}` : undefined}
          autoComplete="off"
          enterKeyHint="search"
        />
        {query && (
          <button
            type="button"
            onClick={() => { onQueryChange(""); inputRef.current?.focus(); }}
            aria-label="清空搜索"
          >
            ×
          </button>
        )}
        {searchOpen && (
          <div className="search-results" id={searchId} role="listbox" aria-label="地点搜索结果">
            {searchResults.length ? (
              searchResults.map((place, index) => (
                <button
                  key={place.id}
                  id={`${searchId}-${index}`}
                  type="button"
                  role="option"
                  aria-selected={index === activeResult}
                  tabIndex={-1}
                  onMouseDown={event => event.preventDefault()}
                  onClick={() => selectPlace(place)}
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
              <p role="status">未找到地点，试试简称、拼音或“园林”等标签。</p>
            )}
          </div>
        )}
      </div>

      <div className="quick-controls">
        <button
          type="button"
          className={filtersOpen ? "is-active" : ""}
          aria-expanded={filtersOpen && !onlyFavorites}
          disabled={onlyFavorites}
          onClick={() => setFiltersOpen((value) => !value)}
        >
          分类筛选
          <span>{selectedCategories.size}/{categories.length}</span>
        </button>
        <button
          type="button"
          className={onlyFavorites ? "is-active" : ""}
          onClick={onToggleOnlyFavorites}
          aria-pressed={onlyFavorites}
        >
          ☆ 我的收藏
          <span>{favoritePlaces.length} 处</span>
        </button>
        <button
          type="button"
          className={showExtended ? "is-active" : ""}
          title={showExtended ? "切换为重点地点，减少地图上的标记" : "显示全部已收录地点"}
          aria-pressed={showExtended}
          disabled={onlyFavorites}
          onClick={onToggleExtended}
        >
          {showExtended ? "显示精简地点" : "显示更多地点"}
        </button>
      </div>

      {onlyFavorites && <section className="favorites-panel" aria-label="本机收藏">
        <p>{favoritesPersistent ? "保存在本机浏览器，不上传。清理网站数据会移除收藏。" : "浏览器暂不允许持久保存，收藏仅在本次会话中保留。"}</p>
        {favoritePlaces.length > 0 ? <>
          <p>显示全部收藏，不受分类和精简模式限制。点击名称定位。</p>
          <div className="favorite-place-list">
            {favoritePlaces.map(place => <button type="button" key={place.id} onClick={() => selectPlace(place)}>
              <strong>{place.name}</strong><small>{place.region}</small>
            </button>)}
          </div>
        </> : <p>还没有收藏。打开地点介绍，点击 ☆ 即可加入。</p>}
        <button type="button" className="favorites-back" onClick={onToggleOnlyFavorites}>返回地图探索</button>
      </section>}

      {filtersOpen && !onlyFavorites && (
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
        <span>{onlyFavorites ? "处收藏已启用" : "处地点已启用"}</span>
        <small>
          核心 {coreCount} · 扩展 {extendedCount}
        </small>
      </footer>

      {allHidden && !onlyFavorites && <p className="empty-map-notice">当前已隐藏全部地点，可点击“显示全部”恢复</p>}
      </div>
    </section>
  );
}
