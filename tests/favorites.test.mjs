import test from 'node:test';
import assert from 'node:assert/strict';
import {FAVORITES_KEY, loadFavorites, parseFavoriteIds, saveFavorites} from '../app/lib/favorites.ts';

function storage(raw = null) {
  const data = new Map(raw === null ? [] : [[FAVORITES_KEY, raw]]);
  return {
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    removeItem: key => data.delete(key),
  };
}

test('favorite parsing tolerates corrupted or wrong-shaped browser data', () => {
  for (const value of [null, '{bad', '{}', '42', '"not-an-array"']) {
    assert.equal(parseFavoriteIds(value).size, 0);
  }
  assert.deepEqual([...parseFavoriteIds('["a","a",null,2,"",{},"  ","b"]')], ['a', 'b']);
});

test('migrates session favorites once and preserves local favorites', () => {
  const local = storage('["a"]'), session = storage('["b","a"]');
  const state = loadFavorites(local, session);
  assert.deepEqual([...state.ids], ['a', 'b']);
  assert.equal(state.persistent, true);
  assert.equal(session.getItem(FAVORITES_KEY), null);
  assert.equal(saveFavorites(new Set(['b']), local, session), true);
  assert.deepEqual([...loadFavorites(local, session).ids], ['b']);
});

test('blocked local storage preserves session or in-memory favorites without crashing', () => {
  const blocked = {getItem() {throw Error('blocked');}, setItem() {throw Error('blocked');}, removeItem() {throw Error('blocked');}};
  const session = storage('["a"]');
  assert.deepEqual(loadFavorites(blocked, session), {ids: new Set(['a']), persistent: false});
  assert.equal(saveFavorites(new Set(['b']), blocked, session), false);
  assert.deepEqual([...loadFavorites(blocked, session).ids], ['b']);
  assert.deepEqual(loadFavorites(blocked, blocked), {ids: new Set(), persistent: false});
  assert.equal(saveFavorites(new Set(['a']), undefined, undefined), false);
});
