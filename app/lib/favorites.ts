export const FAVORITES_KEY = "gusu-trails-favorites";
type FavoriteStorage = Pick<Storage, "getItem" | "setItem" | "removeItem"> | undefined;

export function parseFavoriteIds(raw: string | null): Set<string> {
  try {
    const value: unknown = JSON.parse(raw ?? "[]");
    return new Set(Array.isArray(value)
      ? value.filter((id): id is string => typeof id === "string" && id.trim().length > 0)
      : []);
  } catch {
    return new Set();
  }
}

export function browserStorage(kind: "localStorage" | "sessionStorage"): FavoriteStorage {
  try { return typeof window === "undefined" ? undefined : window[kind]; }
  catch { return undefined; }
}

function readIds(storage: FavoriteStorage) {
  try { return parseFavoriteIds(storage?.getItem(FAVORITES_KEY) ?? null); }
  catch { return new Set<string>(); }
}

export function saveFavorites(ids: Set<string>, local: FavoriteStorage, session: FavoriteStorage): boolean {
  const value = JSON.stringify([...ids]);
  try {
    if (!local) throw new Error("Local storage unavailable");
    local.setItem(FAVORITES_KEY, value);
  } catch {
    try { session?.setItem(FAVORITES_KEY, value); } catch { /* Keep in-memory favorites usable. */ }
    return false;
  }
  try { session?.removeItem(FAVORITES_KEY); } catch { /* Migration cleanup is best-effort. */ }
  return true;
}

export function loadFavorites(local: FavoriteStorage, session: FavoriteStorage) {
  const ids = new Set([...readIds(local), ...readIds(session)]);
  // Migrate old tab-only favorites once, without overwriting existing local ones.
  const persistent = saveFavorites(ids, local, session);
  return {ids, persistent};
}
