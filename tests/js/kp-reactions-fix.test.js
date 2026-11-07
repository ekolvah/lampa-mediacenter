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
// find, search — ответы find/ и search/ или 'error'; videos — ответ tmdb.videos или null
// (функции нет); reactions — ответ cub. Двойник tmdb.get отвечает по префиксу URL (design 8).
function load(over) {
  const opts = Object.assign({ movie: MOVIE, find: FOUND_MOVIE, search: NO_RESULTS, videos: VIDEOS, reactions: REACTIONS }, over);
  const calls = { get: [], videos: [], reactions: [], warn: [], done: [] };
  const KP = {
    full(params, ok) { ok({ movie: opts.movie }); },
  };
  const tmdb = {
    get(url, params, ok, err, cache) {
      calls.get.push(plain({ url, cache }));
      const answer = url.startsWith('find/') ? opts.find : url.startsWith('search/') ? opts.search : 'error';
      if (answer === 'error') err();
      else ok(answer);
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

// Поля карточек сняты с приставки, ответы поиска — с TMDB, 2026-11-07 (proposal, Why).
const MOVIE = { imdb_id: 'tt1675434', type: 'movie', title: '1+1', original_title: 'Intouchables', release_date: '2011-09-23' };
const FOUND_MOVIE = { movie_results: [{ id: 77338 }], tv_results: [] };
const NOT_FOUND = { movie_results: [], tv_results: [] };
const NO_RESULTS = { results: [] };
const VIDEOS = { results: [{ key: 'dvdJ--DV0Uo', site: 'YouTube', type: 'Trailer' }] };
const REACTIONS = { result: [{ type: 'fire', counter: 3 }] };

const BEAST = { imdb_id: '', type: 'movie', title: 'Зверь', original_title: 'The Beast', release_date: '2026' };
const BEAST_2026 = { id: 1185344, title: 'Зверь', original_title: 'The Beast', release_date: '2026-09-17' };
const BEAST_2022 = { id: 760741, title: 'Зверь', original_title: 'Beast', release_date: '2022-08-11' };
const HIGHER = { id: 1588838, title: 'Всё выше, и выше', original_title: 'Всё выше, и выше', release_date: '2026-05-01' };
const FOREST = { imdb_id: '', type: 'movie', title: 'Лес', original_title: 'Лес', release_date: '2026' };
const WITCH_FOREST = { id: 791523, title: 'Ведьмин лес', original_title: 'Hexenwald', release_date: '2026-03-12' };
const FOREST_2026 = { id: 1545966, title: 'Лес', original_title: 'Лес', release_date: '2026-10-01' };
const LIFE = { imdb_id: '', type: 'tv', title: 'Жизнь заново', original_title: 'Жизнь заново', first_air_date: '' };
const LIFE_TV = { id: 318582, name: 'Жизнь заново', original_name: 'Жизнь заново', first_air_date: '2026-10-26' };

const q = (title) => encodeURIComponent(title);

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

test('no imdb_id searches by title and year', () => {
  const c = load({ movie: BEAST, search: { results: [BEAST_2026, HIGHER] } });
  assert.deepStrictEqual(c.get, [{ url: 'search/movie?query=' + q('Зверь') + '&primary_release_year=2026', cache: { life: WEEK_MIN } }]);
  assert.deepStrictEqual(c.videos, [{ method: 'movie', id: 1185344 }]);
  assert.deepStrictEqual(c.reactions, [{ method: 'movie', id: 1185344 }]);
  assert.strictEqual(c.done.length, 1);
  assert.deepStrictEqual(c.done[0].videos, VIDEOS);
});

test('empty find falls back to title search', () => {
  const c = load({ find: NOT_FOUND, search: { results: [{ id: 77338, title: '1+1', original_title: 'Intouchables' }] } });
  assert.deepStrictEqual(c.get.map((g) => g.url), [
    'find/tt1675434?external_source=imdb_id',
    'search/movie?query=' + q('1+1') + '&primary_release_year=2011',
  ]);
  assert.deepStrictEqual(c.videos, [{ method: 'movie', id: 77338 }]);
  assert.strictEqual(c.done.length, 1);
});

test('title match skips first result with other title', () => {
  const c = load({ movie: FOREST, search: { results: [WITCH_FOREST, FOREST_2026] } });
  assert.deepStrictEqual(c.videos, [{ method: 'movie', id: 1545966 }]);
  assert.deepStrictEqual(c.reactions, [{ method: 'movie', id: 1545966 }]);
});

test('original title matches when russian differs', () => {
  const movie = { imdb_id: '', type: 'movie', title: 'Цикл зверя', original_title: 'The Cycle', release_date: '2026-10-23' };
  const c = load({ movie, search: { results: [{ id: 1290418, title: 'Цикл', original_title: 'THE CYCLE' }] } });
  assert.deepStrictEqual(c.videos, [{ method: 'movie', id: 1290418 }]);
});

test('title match ignores case, yo and punctuation', () => {
  const knight = { imdb_id: '', type: 'movie', title: 'Темный рыцарь', original_title: 'Batman', release_date: '2008-07-14' };
  const c1 = load({ movie: knight, search: { results: [{ id: 155, title: 'Тёмный рыцарь', original_title: 'The Dark Knight' }] } });
  assert.deepStrictEqual(c1.videos, [{ method: 'movie', id: 155 }]);
  const odd = Object.assign({}, FOREST, { title: 'Жизнь, заново!', original_title: 'X' });
  const c2 = load({ movie: odd, search: { results: [{ id: 7, title: 'жизнь  заново', original_title: 'Y' }] } });
  assert.deepStrictEqual(c2.videos, [{ method: 'movie', id: 7 }]);
});

test('tv card searches tv by first air date year', () => {
  const c = load({ movie: Object.assign({}, LIFE, { first_air_date: '2026-10-26' }), search: { results: [LIFE_TV] } });
  assert.deepStrictEqual(c.get.map((g) => g.url), ['search/tv?query=' + q('Жизнь заново') + '&first_air_date_year=2026']);
  assert.deepStrictEqual(c.videos, [{ method: 'tv', id: 318582 }]);
  assert.deepStrictEqual(c.reactions, [{ method: 'tv', id: 318582 }]);
});

test('no year single match searches without year', () => {
  const c = load({ movie: LIFE, search: { results: [LIFE_TV] } });
  assert.deepStrictEqual(c.get.map((g) => g.url), ['search/tv?query=' + q('Жизнь заново')]);
  assert.deepStrictEqual(c.videos, [{ method: 'tv', id: 318582 }]);
});

test('no year ambiguous title warns, no videos', () => {
  const c = load({ movie: Object.assign({}, BEAST, { release_date: '' }), search: { results: [BEAST_2026, BEAST_2022] } });
  assert.deepStrictEqual(c.get.map((g) => g.url), ['search/movie?query=' + q('Зверь')]);
  assert.strictEqual(c.warn.length, 1);
  assert.ok(c.warn[0].includes('Зверь'), JSON.stringify(c.warn));
  assert.strictEqual(c.videos.length + c.reactions.length, 0);
  assert.strictEqual(c.done.length, 1);
  assert.strictEqual(c.done[0].videos, undefined);
});

test('no title match warns with title and year', () => {
  const c = load({ movie: FOREST, search: { results: [WITCH_FOREST] } });
  assert.strictEqual(c.warn.length, 1);
  assert.ok(c.warn[0].includes('Лес') && c.warn[0].includes('2026'), JSON.stringify(c.warn));
  assert.strictEqual(c.videos.length + c.reactions.length, 0);
  assert.strictEqual(c.done.length, 1);
  assert.strictEqual(c.done[0].videos, undefined);
});

test('search error warns with title and year, card opens', () => {
  const c = load({ movie: FOREST, search: 'error' });
  assert.strictEqual(c.warn.length, 1);
  assert.ok(c.warn[0].includes('Лес') && c.warn[0].includes('2026'), JSON.stringify(c.warn));
  assert.strictEqual(c.videos.length + c.reactions.length, 0);
  assert.strictEqual(c.done.length, 1);
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
  assert.strictEqual(c.get.length, 1);
  assert.strictEqual(c.done.length, 1);
});
