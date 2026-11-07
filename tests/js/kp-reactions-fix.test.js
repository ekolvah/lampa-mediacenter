'use strict';

// plugins/kp-reactions-fix.js грузится как есть в свежем vm-контексте (design 7):
// window — сам контекст, Lampa.Api.sources — двойники KP, tmdb, cub в памяти.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', '..', 'plugins', 'kp-reactions-fix.js'), 'utf8');
const WEEK_MIN = 60 * 24 * 7; // life кэша движка — в минутах (day$1 = 60 * 24 в app.min.js)
// Объекты из vm-контекста несут чужой Object.prototype — deepStrictEqual их не сравнит.
const plain = (x) => JSON.parse(JSON.stringify(x));

// opts (по умолчанию — найденный фильм с видео и реакциями): movie — ответ KP.full().movie;
// find — ответ find или 'error'; videos — ответ tmdb.videos или null (функции нет);
// reactions — ответ cub.
function load(over) {
  const opts = Object.assign({ movie: MOVIE, find: FOUND_MOVIE, videos: VIDEOS, reactions: REACTIONS }, over);
  const calls = { get: [], videos: [], reactions: [], warn: [], done: [] };
  const KP = {
    full(params, ok) { ok({ movie: opts.movie }); },
  };
  const tmdb = {
    get(url, params, ok, err, cache) {
      calls.get.push(plain({ url, cache }));
      if (opts.find === 'error') err();
      else ok(opts.find);
    },
  };
  if (opts.videos !== null) {
    tmdb.videos = function (params, ok) {
      calls.videos.push(plain(params));
      ok(opts.videos);
    };
  }
  const cub = {
    reactionsGet(params, ok) {
      calls.reactions.push(plain(params));
      ok(opts.reactions);
    },
  };
  const ctx = {
    Lampa: { Api: { sources: { KP, tmdb, cub } } },
    console: { warn(...args) { calls.warn.push(args); }, log() {} },
    setInterval, clearInterval,
  };
  ctx.window = ctx;
  vm.runInNewContext(SRC, ctx);
  KP.full({ id: 'KP_1', method: 'movie' }, (result) => calls.done.push(result), () => {});
  return calls;
}

const MOVIE = { imdb_id: 'tt1675434', type: 'movie' };
const FOUND_MOVIE = { movie_results: [{ id: 77338 }], tv_results: [] };
const VIDEOS = { results: [{ key: 'dvdJ--DV0Uo', site: 'YouTube', type: 'Trailer' }] };
const REACTIONS = { result: [{ type: 'fire', counter: 3 }] };

test('videos and reactions added for found movie', () => {
  const c = load();
  assert.deepStrictEqual(c.done[0].videos, VIDEOS);
  assert.deepStrictEqual(c.videos, [{ method: 'movie', id: 77338 }]);
  assert.deepStrictEqual(c.done[0].reactions, REACTIONS);
});

test('oncomplite called once', () => {
  const c = load();
  assert.strictEqual(c.done.length, 1);
});

test('tv match requests videos and reactions as tv', () => {
  const c = load({ find: { movie_results: [], tv_results: [{ id: 5 }] } });
  assert.deepStrictEqual(c.videos, [{ method: 'tv', id: 5 }]);
  assert.deepStrictEqual(c.reactions, [{ method: 'tv', id: 5 }]);
  assert.strictEqual(c.done.length, 1);
});

test('no imdb_id completes without tmdb calls', () => {
  const c = load({ movie: { type: 'movie' } });
  assert.strictEqual(c.get.length + c.videos.length + c.reactions.length, 0);
  assert.strictEqual(c.done.length, 1);
  assert.strictEqual(c.done[0].videos, undefined);
});

test('no find match completes without videos', () => {
  const c = load({ find: { movie_results: [], tv_results: [] } });
  assert.strictEqual(c.videos.length, 0);
  assert.strictEqual(c.done.length, 1);
  assert.strictEqual(c.done[0].videos, undefined);
});

test('empty videos warns with method and id', () => {
  const c = load({ videos: { results: [] } });
  assert.strictEqual(c.warn.length, 1);
  assert.ok(c.warn[0].includes('movie') && c.warn[0].includes(77338), JSON.stringify(c.warn));
  assert.strictEqual(c.done.length, 1);
  assert.deepStrictEqual(c.done[0].reactions, REACTIONS);
});

test('missing tmdb.videos warns, reactions only', () => {
  const c = load({ videos: null });
  assert.strictEqual(c.warn.length, 1);
  assert.strictEqual(c.done.length, 1);
  assert.deepStrictEqual(c.done[0].reactions, REACTIONS);
  assert.strictEqual(c.done[0].videos, undefined);
});

test('find requested with cache life', () => {
  const c = load();
  assert.deepStrictEqual(c.get, [{ url: 'find/tt1675434?external_source=imdb_id', cache: { life: WEEK_MIN } }]);
});

test('find error warns with imdb_id, card opens', () => {
  const c = load({ find: 'error' });
  assert.strictEqual(c.warn.length, 1);
  assert.ok(c.warn[0].includes('tt1675434'), JSON.stringify(c.warn));
  assert.strictEqual(c.done.length, 1);
});
