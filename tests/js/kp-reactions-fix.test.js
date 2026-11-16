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
const DAY_MIN = 60 * 24;
// Объекты из vm-контекста несут чужой Object.prototype — deepStrictEqual их не сравнит.
const plain = (x) => JSON.parse(JSON.stringify(x));

// opts (по умолчанию — найденный фильм с видео и реакциями): movie — ответ KP.full().movie;
// find, search — ответы find/ и search/ или 'error'; videos — ответ tmdb.videos или null
// (функции нет); reactions — ответ cub. Двойник tmdb.get отвечает по префиксу URL (design 8).
// service — ответ сервиса трейлеров: объект ответа или { status, ... } — так Lampa.Reguest
// отдаёт ошибку (jqXHR: status 0 при отказе соединения и таймауте, responseJSON при JSON-теле).
// tv — ответ tv/<id> или 'error' (по умолчанию один вышедший сезон), запросы — в calls.tv;
// season — ответ tmdb.videos для tv/<id>/season: 'never' — колбэк не приходит, 'late' — колбэк
// в calls.late, его зовёт тест. setTimeout — двойник: таймеры в calls.timers, fire() их запускает.
function load(over) {
  const opts = Object.assign({ movie: MOVIE, find: FOUND_MOVIE, search: NO_RESULTS, videos: VIDEOS, reactions: REACTIONS, tv: ONE_SEASON, season: NO_RESULTS }, over);
  const calls = { get: [], tv: [], videos: [], reactions: [], service: [], warn: [], done: [], listeners: {}, shown: [], timers: [], late: [] };
  calls.fire = () => calls.timers.splice(0).forEach((t) => t.fn());
  function Reguest() { this.ms = null; }
  Reguest.prototype.timeout = function (ms) { this.ms = ms; };
  Reguest.prototype.silent = function (url, ok, err) {
    calls.service.push({ url, timeout: this.ms });
    const s = opts.service;
    if (s && typeof s.status === 'number') err(s);
    else ok(s);
  };
  const KP = {
    full(params, ok) { ok({ movie: opts.movie }); },
  };
  const tmdb = {
    get(url, params, ok, err, cache) {
      if (/^tv\/\d+$/.test(url)) {
        calls.tv.push(plain({ url, cache }));
        return opts.tv === 'error' ? err() : ok(opts.tv);
      }
      calls.get.push(plain({ url, cache }));
      const answer = url.startsWith('find/') ? opts.find : url.startsWith('search/') ? opts.search : 'error';
      if (answer === 'error') err();
      else ok(answer);
    },
  };
  if (opts.videos !== null) {
    tmdb.videos = function (params, ok) {
      calls.videos.push(plain(params));
      if (!/\/season$/.test(params.method)) return ok(opts.videos);
      if (opts.season === 'late') calls.late.push(ok);
      else if (opts.season !== 'never') ok(opts.season);
    };
  }
  const cub = {
    reactionsGet(params, ok) {
      calls.reactions.push(plain(params));
      ok(opts.reactions);
    },
  };
  // Lampa.Select.show движка: список на экране.
  const Select = { show(params) { calls.shown.push(params); } };
  const Listener = { follow(name, fn) { calls.listeners[name] = fn; } };
  const Storage = { field(name) { return name === 'tmdb_lang' ? 'ru' : undefined; } };
  const ctx = {
    Lampa: { Api: { sources: { KP, tmdb, cub } }, Reguest, Select, Listener, Storage },
    $: element,
    console: { warn(...args) { calls.warn.push(args); }, log() {} },
    setInterval, clearInterval,
    setTimeout(fn, ms) { const t = { fn, ms }; calls.timers.push(t); return t; },
    clearTimeout(t) { const i = calls.timers.indexOf(t); if (i !== -1) calls.timers.splice(i, 1); },
  };
  ctx.window = ctx;
  calls.ctx = ctx;
  calls.originalShow = Select.show;
  vm.runInNewContext(SRC, ctx);
  KP.full({ id: 'KP_1', method: 'movie' }, (result) => calls.done.push(result), () => {});
  return calls;
}

// Двойник jQuery-элемента, который создаёт плагин: разметка и обработчики событий.
function element(html) {
  return { html, handlers: {}, on(ev, fn) { this.handlers[ev] = fn; return this; } };
}

// Карточка открыта: событие full/complite с e.body в памяти (design 6). opts: trailers — есть ли
// .view--trailer; play — есть ли .button--play; items — список, который обработчик .view--trailer
// движка синхронно отдаёт в Lampa.Select.show; intercept: false — обработчик Select.show не зовёт.
// Возвращает calls с after (что вставлено за «Смотреть») и played (что запустил onSelect движка).
function openCard(over) {
  const opts = Object.assign({ trailers: true, play: true, items: TRAILER_ITEMS, intercept: true }, over);
  const c = load();
  c.after = [];
  c.played = [];
  const engine = { title: 'YouTube - Зверь', items: opts.items, onSelect(item) { c.played.push(item); } };
  c.engine = engine;
  const body = {
    find(sel) {
      if (sel === '.view--trailer') {
        return {
          length: opts.trailers ? 1 : 0,
          trigger(ev) { if (ev === 'hover:enter' && opts.intercept) c.ctx.Lampa.Select.show(engine); },
        };
      }
      if (sel === '.button--play') {
        return { length: opts.play ? 1 : 0, after(el) { c.after.push(el); return this; } };
      }
      return { length: 0 };
    },
  };
  c.listeners.full({ type: 'complite', body, data: { movie: BEAST } });
  c.press = () => c.after[0].handlers['hover:enter']();
  return c;
}

// Поля карточек сняты с приставки, ответы поиска — с TMDB, 2026-11-07 (proposal, Why).
const MOVIE = { imdb_id: 'tt1675434', type: 'movie', title: '1+1', original_title: 'Intouchables', release_date: '2011-09-23' };
const FOUND_MOVIE = { movie_results: [{ id: 77338 }], tv_results: [] };
const NOT_FOUND = { movie_results: [], tv_results: [] };
const NO_RESULTS = { results: [] };
const VIDEOS = { results: [{ key: 'dvdJ--DV0Uo', site: 'YouTube', type: 'Trailer', iso_639_1: 'ru' }] };
const EN_VIDEOS = { results: [{ key: 'aB3xQ9zLk2w', site: 'YouTube', type: 'Trailer', iso_639_1: 'en', name: 'The Beast | Official Trailer' }] };
const PICK = { video_id: 'J2VS_OlUJtA', title: 'Зверь (2026)#трейлер в русской озвучке#The Beast', confidence: 0.3, reason: 'ambiguous: 2' };
const NO_PICK = { video_id: null, title: null, confidence: 0, reason: 'no candidates' };
const PICK_VIDEO = { site: 'YouTube', key: 'J2VS_OlUJtA', name: PICK.title, iso_639_1: 'ru', type: 'Trailer', published_at: '2026' };
const REACTIONS = { result: [{ type: 'fire', counter: 3 }] };
const ONE_SEASON = { number_of_seasons: 1, last_episode_to_air: { season_number: 1, air_date: '2026-10-26' } };

// «Джентльмены» (KP 1435343, TMDB tv/236235), ответы TMDB 2026-11-16 (proposal, Why).
const GENTLEMEN = { imdb_id: 'tt13210838', type: 'tv', title: 'Джентльмены', original_title: 'The Gentlemen', first_air_date: '2024-03-07' };
const FIND_BOTH = { movie_results: [{ id: 1823885 }], tv_results: [{ id: 236235 }] };
const GENT_TV = { number_of_seasons: 3, last_episode_to_air: { season_number: 2, air_date: '2026-10-22' } };
const GENT_VIDEOS = { results: [
  { key: 'ru-s1-trailer', site: 'YouTube', type: 'Trailer', iso_639_1: 'ru', name: 'ДЖЕНТЛЬМЕНЫ Сезон 1 - Русский трейлер 2', published_at: '2024-02-26T15:00:00.000Z' },
  { key: 'en-s1-trailer', site: 'YouTube', type: 'Trailer', iso_639_1: 'en', name: 'The Gentlemen | Official Trailer', published_at: '2024-02-22T16:00:00.000Z' },
  { key: 'en-s1-clip', site: 'YouTube', type: 'Clip', iso_639_1: 'en', name: 'The Gentlemen | Clip', published_at: '2024-03-07T08:00:00.000Z' },
] };
// Видео TMDB новее даты сезона N: первым ролик ставит сдвиг даты, а не дата сезона.
const NEWER_CLIP = { key: 'en-new-clip', site: 'YouTube', type: 'Clip', iso_639_1: 'en', name: 'Behind the scenes', published_at: '2026-11-01T10:00:00.000Z' };
// Два трейлера 2-го сезона, старший — первым в ответе.
const SEASON2 = { results: [
  { key: 's2-date-trailer', site: 'YouTube', type: 'Trailer', iso_639_1: 'en', name: 'Season 2 Date Announcement Trailer', published_at: '2026-07-30T16:00:00.000Z' },
  { key: 's2-teaser', site: 'YouTube', type: 'Teaser', iso_639_1: 'en', name: 'Season 2 Teaser', published_at: '2026-07-09T16:00:00.000Z' },
  { key: 's2-trailer', site: 'YouTube', type: 'Trailer', iso_639_1: 'en', name: 'Season 2 Official Trailer', published_at: '2026-08-24T16:00:00.000Z' },
  { key: 's2-featurette', site: 'YouTube', type: 'Featurette', iso_639_1: 'en', name: 'Featurette', published_at: '2024-08-14T16:00:00.000Z' },
] };
const GENT_PICK = { video_id: '3xow3-n2VQM', title: 'Джентльмены (2 сезон) - Русский трейлер (Дубляж, 2026) Гай Ричи', confidence: 0.9, reason: 'ru language' };
const GENT_FALLBACK = { video_id: null, title: null, confidence: 0, reason: 'ru language; season 2 fallback' };
const GENT_CARD = { movie: GENTLEMEN, find: FIND_BOTH, videos: GENT_VIDEOS, tv: GENT_TV };

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
const SERVICE_URL = 'http://127.0.0.1:9118/trailer?title=' + q('Зверь') + '&original_title=The%20Beast&year=2026';
const GENT_URL = 'http://127.0.0.1:9118/trailer?title=' + q('Джентльмены') + '&original_title=The%20Gentlemen&year=2024&season=2';
// «Зверь» без imdb_id, найден поиском по названию: дальше решают видео TMDB и сервис.
const BEAST_CARD = { movie: BEAST, search: { results: [BEAST_2026] } };
// Пункты списка «Трейлеры», как их собрал движок для «Зверя» (proposal, Why): ролик сервиса,
// разделитель «Ещё», en-ролик TMDB.
const RU_ITEM = { title: PICK.title, id: PICK.video_id };
const MORE_ITEM = { title: 'Ещё', separator: true };
const EN_ITEM = { title: EN_VIDEOS.results[0].name, id: EN_VIDEOS.results[0].key };
const TRAILER_ITEMS = [RU_ITEM, MORE_ITEM, EN_ITEM];

// Вставленный ролик стоит первым по обоим ключам сортировки движка: язык tmdb_lang и дата строго
// позже всех прочих (design.md, решение 4).
function assertFirstByEngine(list) {
  assert.strictEqual(list[0].iso_639_1, 'ru');
  const first = new Date(list[0].published_at).getTime();
  for (const v of list.slice(1)) {
    assert.ok(first > new Date(v.published_at).getTime(), JSON.stringify(list));
  }
}

// Есть предупреждение, в тексте которого все needles.
function warnedWith(c, ...needles) {
  return c.warn.some((w) => needles.every((n) => w.join(' ').includes(n)));
}

// Ровно одно предупреждение, и в нём все needles.
function assertWarned(c, ...needles) {
  assert.strictEqual(c.warn.length, 1);
  assert.ok(needles.every((n) => c.warn[0].includes(n)), JSON.stringify(c.warn));
}

// Исход «тайтла нет»: одно предупреждение со всеми needles, без видео и реакций, карточка открыта.
function assertWarnedNoTrailers(c, ...needles) {
  assertWarned(c, ...needles);
  assert.strictEqual(c.videos.length + c.reactions.length, 0);
  assert.strictEqual(c.done.length, 1);
  assert.strictEqual(c.done[0].videos, undefined);
}

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
  assertWarnedNoTrailers(c, 'Зверь');
});

test('no title match warns with title and year', () => {
  const c = load({ movie: FOREST, search: { results: [WITCH_FOREST] } });
  assertWarnedNoTrailers(c, 'Лес', '2026');
});

test('search error warns with title and year, card opens', () => {
  const c = load({ movie: FOREST, search: 'error' });
  assertWarnedNoTrailers(c, 'Лес', '2026');
});

test('empty videos, service gave nothing: no trailers, warning', () => {
  const c = load({ videos: { results: [] }, service: NO_PICK });
  assert.ok(c.warn.some((w) => w.includes('movie') && w.includes(77338)), JSON.stringify(c.warn));
  assert.ok(c.warn.some((w) => w.includes('1+1') && w.includes('2011') && w.includes('no candidates')), JSON.stringify(c.warn));
  assert.strictEqual(c.done.length, 1);
  assert.deepStrictEqual(plain(c.done[0].videos.results), []);
  assert.deepStrictEqual(c.done[0].reactions, REACTIONS);
});

test('ru video in TMDB: no service request', () => {
  const c = load();
  assert.deepStrictEqual(c.service, []);
  assert.deepStrictEqual(c.done[0].videos, VIDEOS);
  const tv = load({ movie: GENTLEMEN, find: { movie_results: [], tv_results: [{ id: 236235 }] } });
  assert.deepStrictEqual(tv.tv.map((t) => t.url), ['tv/236235']);
  assert.deepStrictEqual(tv.service, []);
  assert.deepStrictEqual(tv.done[0].videos, VIDEOS);
  assert.strictEqual(tv.warn.length, 0);
  assert.strictEqual(tv.done.length, 1);
});

test('find with movie and tv picks card type', () => {
  const tv = load({ movie: GENTLEMEN, find: FIND_BOTH });
  assert.deepStrictEqual(tv.videos, [{ method: 'tv', id: 236235 }]);
  assert.deepStrictEqual(tv.reactions, [{ method: 'tv', id: 236235 }]);
  const movie = load({ movie: Object.assign({}, GENTLEMEN, { type: 'movie' }), find: FIND_BOTH });
  assert.deepStrictEqual(movie.videos, [{ method: 'movie', id: 1823885 }]);
  assert.deepStrictEqual(movie.reactions, [{ method: 'movie', id: 1823885 }]);
  assert.deepStrictEqual(movie.tv, []);
});

test('last season 2: service asked with season despite ru video, its video first', () => {
  for (const videos of [GENT_VIDEOS, { results: GENT_VIDEOS.results.concat([NEWER_CLIP]) }]) {
    const c = load({ ...GENT_CARD, videos, service: GENT_PICK });
    assert.deepStrictEqual(c.service, [{ url: GENT_URL, timeout: 10000 }]);
    const list = plain(c.done[0].videos.results);
    assert.deepStrictEqual(list.slice(1), videos.results);
    assert.strictEqual(list[0].key, '3xow3-n2VQM');
    assert.strictEqual(list[0].name, GENT_PICK.title);
    assertFirstByEngine(list);
    const expected = videos === GENT_VIDEOS ? '2026-10-22' : '2026-11-01T10:00:01.000Z';
    assert.strictEqual(list[0].published_at, expected);
    assert.deepStrictEqual(c.videos, [{ method: 'tv', id: 236235 }]);
    assert.strictEqual(c.warn.length, 0);
    assert.strictEqual(c.done.length, 1);
  }
});

test('last season from last episode, not number of seasons', () => {
  const c = load({ ...GENT_CARD, service: GENT_PICK });
  assert.deepStrictEqual(c.tv, [{ url: 'tv/236235', cache: { life: DAY_MIN } }]);
  assert.ok(c.service[0].url.endsWith('&season=2'), c.service[0].url);
});

test('service gave nothing: newest TMDB season trailer first, warning', () => {
  const outcomes = [
    [GENT_FALLBACK, 'season 2 fallback'],
    [{ status: 502, responseJSON: { error: 'search failed' } }, 'HTTP 502'],
    [{ status: 0, statusText: 'timeout' }, 'timeout'],
  ];
  for (const [service, needle] of outcomes) {
    const videos = { results: GENT_VIDEOS.results.concat([NEWER_CLIP]) };
    const c = load({ ...GENT_CARD, videos, service, season: SEASON2 });
    assert.deepStrictEqual(c.videos, [{ method: 'tv', id: 236235 }, { method: 'tv/236235/season', id: 2 }], needle);
    const list = plain(c.done[0].videos.results);
    assert.strictEqual(list[0].key, 's2-trailer', needle);
    assert.strictEqual(list[0].name, 'Season 2 Official Trailer', needle);
    assert.deepStrictEqual(list.slice(1), videos.results, needle);
    assertFirstByEngine(list);
    assert.strictEqual(list[0].published_at, '2026-11-01T10:00:01.000Z', needle);
    assert.strictEqual(c.warn.length, 1, JSON.stringify(c.warn));
    assert.ok(warnedWith(c, 'Джентльмены', 'season 2', needle), JSON.stringify(c.warn));
    c.fire();
    assert.strictEqual(c.done.length, 1, needle);
  }
});

test('no season trailer, error or timeout: TMDB videos, warning', () => {
  const outcomes = [
    [{ results: [SEASON2.results[1], SEASON2.results[3]] }, 'teaser only'],
    [NO_RESULTS, 'empty'],
    [undefined, 'undefined'],
    ['garbage', 'not results'],
    [{ results: 'x' }, 'results not a list'],
  ];
  for (const [season, label] of outcomes) {
    const c = load({ ...GENT_CARD, service: GENT_FALLBACK, season });
    assert.deepStrictEqual(c.done[0].videos, GENT_VIDEOS, label);
    assert.strictEqual(c.done.length, 1, label);
    assert.ok(warnedWith(c, 'Джентльмены', 'season 2', 'no season trailer'), label + JSON.stringify(c.warn));
  }
  for (const season of ['never', 'late']) {
    const c = load({ ...GENT_CARD, service: GENT_FALLBACK, season });
    assert.strictEqual(c.done.length, 0, season);
    assert.deepStrictEqual(c.timers.map((t) => t.ms), [10000], season);
    c.fire();
    assert.strictEqual(c.done.length, 1, season);
    assert.deepStrictEqual(c.done[0].videos, GENT_VIDEOS, season);
    assert.ok(warnedWith(c, 'Джентльмены', 'season 2', 'timeout'), season + JSON.stringify(c.warn));
    c.late.forEach((ok) => ok(SEASON2));
    assert.strictEqual(c.done.length, 1, season);
    assert.deepStrictEqual(c.done[0].videos, GENT_VIDEOS, season);
  }
});

test('tv details error: film behaviour, warning with id', () => {
  for (const tv of ['error', {}, { last_episode_to_air: null }]) {
    const c = load({ ...GENT_CARD, tv });
    assert.deepStrictEqual(c.service, [], JSON.stringify(tv));
    assert.deepStrictEqual(c.done[0].videos, GENT_VIDEOS);
    assert.strictEqual(c.done.length, 1);
    assertWarned(c, 236235);
  }
  const en = load({ ...GENT_CARD, tv: 'error', videos: EN_VIDEOS, service: GENT_PICK });
  assert.ok(!en.service[0].url.includes('season'), en.service[0].url);
  assert.strictEqual(en.done[0].videos.results[0].key, '3xow3-n2VQM');
});

test('en-only videos: service video first', () => {
  const c = load({ ...BEAST_CARD, videos: EN_VIDEOS, service: PICK });
  assert.deepStrictEqual(c.service, [{ url: SERVICE_URL, timeout: 10000 }]);
  assert.deepStrictEqual(plain(c.done[0].videos.results), [PICK_VIDEO].concat(EN_VIDEOS.results));
  assert.strictEqual(c.warn.length, 0);
  assert.strictEqual(c.done.length, 1);
});

test('empty or missing videos: service video only', () => {
  for (const videos of [{ results: [] }, undefined]) {
    const c = load({ ...BEAST_CARD, videos, service: PICK });
    assert.deepStrictEqual(plain(c.done[0].videos.results), [PICK_VIDEO]);
    assert.strictEqual(c.done.length, 1);
  }
});

test('service request without optional params', () => {
  const movie = { imdb_id: '', type: 'tv', title: 'Жизнь заново', original_title: '', first_air_date: '' };
  const c = load({ movie, search: { results: [LIFE_TV] }, videos: { results: [] }, service: PICK });
  assert.deepStrictEqual(c.service.map((s) => s.url), ['http://127.0.0.1:9118/trailer?title=' + q('Жизнь заново')]);
  assert.strictEqual(c.done[0].videos.results[0].published_at, '');
});

test('tv card asks service with first air date year', () => {
  const c = load({ movie: Object.assign({}, LIFE, { first_air_date: '2026-10-26' }), search: { results: [LIFE_TV] }, videos: EN_VIDEOS, service: PICK });
  assert.ok(c.service[0].url.endsWith('&year=2026'), c.service[0].url);
  assert.strictEqual(c.done[0].videos.results[0].published_at, '2026-10-26');
});

test('service null, error or timeout: TMDB videos, warning', () => {
  const outcomes = [
    [NO_PICK, 'no candidates'],
    [{ status: 502, responseJSON: { error: 'search failed', detail: 'Sign in to confirm you are not a bot' } }, 'HTTP 502 search failed: Sign in to confirm you are not a bot'],
    [{ status: 0, statusText: 'error' }, 'HTTP 0'],
    [{ status: 0, statusText: 'timeout' }, 'timeout'],
    [{ status: 500, responseText: 'Traceback' }, '500'],
  ];
  for (const [service, needle] of outcomes) {
    const c = load({ ...BEAST_CARD, videos: EN_VIDEOS, service });
    assert.deepStrictEqual(c.done[0].videos, EN_VIDEOS, needle);
    assert.strictEqual(c.done.length, 1, needle);
    assert.strictEqual(c.warn.length, 1, needle);
    const text = c.warn[0].join(' ');
    assert.ok(['Зверь', '2026', needle].every((n) => text.includes(n)), text);
  }
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

test('button inserted after play', () => {
  const c = openCard();
  assert.strictEqual(c.after.length, 1);
  assert.ok(c.after[0].html.includes('button--kp-trailer'), c.after[0].html);
  assert.ok(c.after[0].html.includes('Трейлер'), c.after[0].html);
  assert.ok(c.after[0].html.includes('#sprite-trailer'), c.after[0].html);
  assert.strictEqual(c.warn.length, 0);
});

test('no button without trailers', () => {
  const c = openCard({ trailers: false });
  assert.strictEqual(c.after.length, 0);
  assert.strictEqual(c.warn.length, 0);
});

test('no play button, warning', () => {
  const c = openCard({ play: false });
  assert.strictEqual(c.after.length, 0);
  assertWarned(c, 'Зверь');
});

test('button plays first item via engine onSelect', () => {
  const c = openCard();
  c.press();
  assert.deepStrictEqual(c.played, [RU_ITEM]);
  assert.strictEqual(c.shown.length, 0);
  assert.strictEqual(c.warn.length, 0);
});

test('separator first plays next item', () => {
  const c = openCard({ items: [MORE_ITEM, EN_ITEM] });
  c.press();
  assert.deepStrictEqual(c.played, [EN_ITEM]);
  assert.strictEqual(c.shown.length, 0);
});

test('Select.show restored', () => {
  for (const over of [{}, { items: [] }, { intercept: false }]) {
    const c = openCard(over);
    c.press();
    assert.strictEqual(c.ctx.Lampa.Select.show, c.originalShow, JSON.stringify(over));
  }
});

test('empty list shows list, warning', () => {
  for (const items of [[], [MORE_ITEM]]) {
    const c = openCard({ items });
    c.press();
    assert.strictEqual(c.played.length, 0);
    assert.strictEqual(c.shown.length, 1);
    assert.strictEqual(c.shown[0], c.engine);
    assertWarned(c, 'Зверь');
  }
});

test('not intercepted, warning', () => {
  const c = openCard({ intercept: false });
  c.press();
  assert.strictEqual(c.played.length, 0);
  assertWarned(c, 'Зверь');
});
