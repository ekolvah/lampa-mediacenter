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
// find, search, tv могут быть функцией от URL (find, search) или id (tv), 'never' — ответа нет.
// Главная (design.md, решение 7): parts — первая порция KP.main; pages(url, page) — ответ KP.list,
// 'error' или 'never'; active — Lampa.Activity.active(); today — «сейчас» для Date; open: false —
// без KP.full в конце load().
// Рекомендации (design.md kp-history-recommendations): history — ответ Favorite.get истории;
// appready — window.appready; scan, recs — ключи recomends_scan и recomends_list. Storage.get отдаёт
// один объект на ключ, как ядро; Storage.set шлёт change в Storage.listener, записи — в calls.sets.
// seen — ключ kp_now_watching_seen (память рядов «Сейчас смотрят»), по умолчанию его нет.
// defer: find/ и search/ отвечают, когда тест зовёт колбэк из calls.late.
// Рекомендации на Главной (design.md kp-main-recommendations): Recomends.get повторяет get$4 ядра над
// recomends_list, Router.call пишет вызовы в calls.routes, Arrays.shuffle — копия без перестановки;
// Отдельные списки (design.md kp-split-recommendations): recsMovie, recsTv — сохранённые kp_recs_movie,
// kp_recs_tv (по умолчанию ключей нет); quota — ключи, запись которых падает, как QuotaExceededError в
// Storage.set ядра (callerror, значение не сохранено); Recomends.page двойника — заглушка ядра,
// Lang.translate отдаёт ключ.
// drop — что убрать из двойника, путь любой глубины от Lampa: 'Recomends', 'Recomends.get', 'Router',
// 'Api.sources.cub.full'. fireMs(ms) запускает только таймеры с этим ms.
// Карточки tmdb и cub (design.md card-trailers-any-source, решение 4): их full отвечает
// { movie, videos, reactions } из opts, открывает их openSource.
// settings — window.lampa_settings (design.md disable-dmca-block): по умолчанию DMCA-список ядра с
// «Слово пацана», null — свойства нет.
function load(over) {
  const opts = Object.assign({ movie: MOVIE, find: FOUND_MOVIE, search: NO_RESULTS, videos: VIDEOS, reactions: REACTIONS, tv: ONE_SEASON, season: NO_RESULTS, parts: HOME, pages: () => NO_RESULTS, active: null, today: TODAY, open: true, history: [], appready: false, scan: [], recs: [], defer: false, drop: [] }, over);
  const calls = { get: [], tv: [], videos: [], reactions: [], service: [], warn: [], error: [], noty: [], list: [], done: [], listeners: {}, shown: [], timers: [], late: [], sets: [], routes: [] };
  calls.fire = () => calls.timers.splice(0).forEach((t) => t.fn());
  calls.fireMs = (ms) => calls.timers.filter((t) => t.ms === ms).forEach((t) => {
    calls.timers.splice(calls.timers.indexOf(t), 1);
    t.fn();
  });
  function Reguest() { this.ms = null; }
  Reguest.prototype.timeout = function (ms) { this.ms = ms; };
  Reguest.prototype.silent = function (url, ok, err) {
    calls.service.push({ url, timeout: this.ms });
    const s = opts.service;
    if (s && typeof s.status === 'number') err(s);
    else ok(s);
  };
  const answer = (a, key) => (typeof a === 'function' ? a(key) : a);
  const reply = (a, ok, err) => { if (a === 'error') err(); else if (a !== 'never') ok(a); };
  const KP = {
    full(params, ok) { ok({ movie: opts.movie }); },
    main(params, ok) { ok(plain(opts.parts)); return NEXT; },
    list(params, ok, err) {
      calls.list.push(plain(params));
      reply(opts.pages(params.url, params.page), (json) => ok(plain(json)), err);
    },
  };
  // full источника ядра: ответ уже несёт видео и реакции источника.
  const sourceFull = (params, ok) => ok({ movie: opts.movie, videos: opts.videos, reactions: opts.reactions });
  const tmdb = {
    full: sourceFull,
    get(url, params, ok, err, cache) {
      const tv = /^tv\/(\d+)$/.exec(url);
      if (tv) {
        calls.tv.push(plain({ url, cache }));
        return reply(answer(opts.tv, +tv[1]), ok, err);
      }
      calls.get.push(plain({ url, cache }));
      const a = url.startsWith('find/') ? answer(opts.find, url) : url.startsWith('search/') ? answer(opts.search, url) : 'error';
      if (opts.defer) calls.late.push(() => reply(a, ok, err));
      else reply(a, ok, err);
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
    full: sourceFull,
    reactionsGet(params, ok) {
      calls.reactions.push(plain(params));
      ok(opts.reactions);
    },
  };
  // Lampa.Select.show движка: список на экране.
  const Select = { show(params) { calls.shown.push(params); } };
  const Listener = { follow(name, fn) { calls.listeners[name] = fn; } };
  const store = { recomends_scan: plain(opts.scan), recomends_list: plain(opts.recs) };
  if (opts.seen !== undefined) store.kp_now_watching_seen = plain(opts.seen);
  if (opts.recsMovie !== undefined) store.kp_recs_movie = plain(opts.recsMovie);
  if (opts.recsTv !== undefined) store.kp_recs_tv = plain(opts.recsTv);
  const changes = [];
  const Storage = {
    field(name) { return name === 'tmdb_lang' ? 'ru' : undefined; },
    get(name, empty) { return name in store ? store[name] : JSON.parse(empty); },
    set(name, value, nolisten, callerror) {
      if ((opts.quota || []).includes(name)) {
        if (callerror) callerror({ name: 'QuotaExceededError' });
        return;
      }
      store[name] = value;
      calls.sets.push(name);
      changes.forEach((fn) => fn({ name, value }));
    },
    listener: { follow(type, fn) { if (type === 'change') changes.push(fn); } },
  };
  const Favorite = { get(params) { return params.type === 'history' ? plain(opts.history) : []; } };
  const Noty = { show(text) { calls.noty.push(text); } };
  const Activity = { active() { return opts.active; } };
  const Recomends = {
    get(type) {
      const tv = type === 'tv';
      return store.recomends_list.filter((e) => !!(e.number_of_seasons || e.first_air_date) === tv).reverse()
        .filter((e) => !opts.history.find((h) => h.id == e.id));
    },
    page() { throw new Error('core page called'); },
  };
  const Lang = { translate(key) { return key; } };
  const Router = { call(name, params) { calls.routes.push([name, plain(params)]); } };
  const Arrays = { shuffle(list) { return list.slice(); } };
  const now = new Date(opts.today).getTime();
  class FakeDate extends Date {
    constructor(...args) { if (args.length) super(...args); else super(now); }
  }
  const ctx = {
    Lampa: { Api: { sources: { KP, tmdb, cub } }, Reguest, Select, Listener, Storage, Favorite, Noty, Activity, Recomends, Router, Arrays, Lang },
    appready: opts.appready,
    $: element,
    Date: FakeDate,
    console: { warn(...args) { calls.warn.push(args); }, error(...args) { calls.error.push(args); }, log() {} },
    setInterval, clearInterval,
    setTimeout(fn, ms) { const t = { fn, ms }; calls.timers.push(t); return t; },
    clearTimeout(t) { const i = calls.timers.indexOf(t); if (i !== -1) calls.timers.splice(i, 1); },
  };
  for (const d of opts.drop) {
    const keys = d.split('.');
    const last = keys.pop();
    delete keys.reduce((obj, key) => obj[key], ctx.Lampa)[last];
  }
  const settings = opts.settings === undefined ? { dcma: [DMCA_ENTRY], disable_features: { dmca: false } } : opts.settings;
  if (settings !== null) ctx.lampa_settings = settings;
  ctx.window = ctx;
  calls.ctx = ctx;
  calls.originalShow = Select.show;
  calls.store = store;
  calls.ready = () => calls.listeners.app({ type: 'ready' });
  vm.runInNewContext(SRC, ctx);
  if (opts.open) KP.full({ id: 'KP_1', method: 'movie' }, (result) => calls.done.push(result), () => {});
  return calls;
}

// Запись DMCA-списка CUB (tmdb.<cub_domain>/blocked).
const DMCA_ENTRY = { id: 234763, cat: 'tv', kpid: 5304403 };

// Карточка источника ядра открыта: движок зовёт full источника (design.md card-trailers-any-source,
// наблюдение 6). Результат — в c.done.
function openSource(c, source, params) {
  c.ctx.Lampa.Api.sources[source].full(params, (result) => c.done.push(result), () => {});
}

// Главная KP открыта: Lampa зовёт KP.main, порции — в c.home (c.raw — те же объекты с функциями),
// возвращённая подгрузка — c.next. По умолчанию проход по KP-истории закончен: приложение готово,
// истории нет. c.main() открывает Главную ещё раз и возвращает массив её порций.
function home(over) {
  const c = load(Object.assign({ open: false, appready: true }, over));
  const open = (sink) => c.ctx.Lampa.Api.sources.KP.main({}, sink, () => {});
  c.main = () => {
    const got = [];
    open((parts) => got.push(plain(parts)));
    return got;
  };
  c.home = [];
  c.raw = [];
  c.next = open((parts) => { c.raw.push(parts); c.home.push(plain(parts)); });
  return c;
}

// Ряд Главной по заголовку (без добавок « · …»).
function row(c, title) {
  return c.home[0].find((part) => part.title.split(' · ')[0] === title);
}

// Названия карточек ряда.
function names(part) {
  return part.results.map((card) => card.title);
}

// Двойник jQuery-элемента, который создаёт плагин: разметка и обработчики событий.
function element(html) {
  return { html, handlers: {}, on(ev, fn) { this.handlers[ev] = fn; return this; } };
}

// Карточка открыта: событие full/complite с e.body в памяти (design 5). opts: trailers — есть ли
// .view--trailer; torrent — есть ли .view--torrent без hide; play — есть ли .button--play; items —
// список, который обработчик .view--trailer движка синхронно отдаёт в Lampa.Select.show;
// intercept: false — обработчик Select.show не зовёт. Возвращает calls с after (кнопки, вставленные
// за «Смотреть», по порядку), removed (сколько раз удалён «Смотреть»), torrent (события, переданные
// «Торрентам») и played (что запустил onSelect движка).
function openCard(over) {
  const opts = Object.assign({ trailers: true, torrent: true, play: true, items: TRAILER_ITEMS, intercept: true }, over);
  const c = load();
  c.after = [];
  c.removed = 0;
  c.torrent = [];
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
      if (sel === '.view--torrent:not(.hide)') {
        return { length: opts.torrent ? 1 : 0, trigger(ev) { c.torrent.push(ev); } };
      }
      if (sel === '.button--play') {
        return {
          length: opts.play ? 1 : 0,
          after(els) { c.after.push(...els); return this; },
          remove() { c.removed++; return this; },
        };
      }
      return { length: 0 };
    },
  };
  c.listeners.full({ type: 'complite', body, data: { movie: BEAST } });
  c.button = (cls) => c.after.find((el) => el.html.includes(cls));
  c.press = () => c.button('button--kp-trailer').handlers['hover:enter']();
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

// «Бегущий по лезвию: Чёрный лотос», ответ tmdb.full tv/84553 на приставке 2026-11-21
// (design.md card-trailers-any-source, наблюдение 4): у сериала TMDB нет title, type — тип сериала.
const BLACK_LOTUS = { id: 84553, type: 'Scripted', name: 'Бегущий по лезвию: Чёрный лотос', original_name: 'Blade Runner: Black Lotus', first_air_date: '2021-11-14', imdb_id: 'tt9359796' };

const q = (title) => encodeURIComponent(title);
// URL запроса к сервису трейлеров в порядке параметров плагина; series — тип карточки, всегда последним.
const serviceUrl = (title, original, year, series, season) => 'http://127.0.0.1:9118/trailer?title=' + q(title)
  + (original ? '&original_title=' + q(original) : '') + (year ? '&year=' + year : '')
  + (season ? '&season=' + season : '') + '&series=' + (series ? 1 : 0);
const SERVICE_URL = serviceUrl('Зверь', 'The Beast', '2026', false);
const LOTUS_URL = serviceUrl('Бегущий по лезвию: Чёрный лотос', 'Blade Runner: Black Lotus', '2021', true);
const NEAR_URL = serviceUrl('Буду рядом', 'Буду рядом', '2026', true);
const GENT_URL = serviceUrl('Джентльмены', 'The Gentlemen', '2024', true, 2);
// «Зверь» без imdb_id, найден поиском по названию: дальше решают видео TMDB и сервис.
const BEAST_CARD = { movie: BEAST, search: { results: [BEAST_2026] } };
// Пункты списка «Трейлеры», как их собрал движок для «Зверя» (proposal, Why): ролик сервиса,
// разделитель «Ещё», en-ролик TMDB.
const RU_ITEM = { title: PICK.title, id: PICK.video_id };
const MORE_ITEM = { title: 'Ещё', separator: true };
const EN_ITEM = { title: EN_VIDEOS.results[0].name, id: EN_VIDEOS.results[0].key };
const TRAILER_ITEMS = [RU_ITEM, MORE_ITEM, EN_ITEM];

// Главная KP (proposal, Why): части первой порции kp_source — с url, который кладёт getList.
const TODAY = '2026-11-18T12:00:00';
const MOVIES_URL = 'api/v2.2/films/collections?type=TOP_POPULAR_MOVIES';
const SERIES_URL = 'api/v2.2/films/collections?type=POPULAR_SERIES';
const MOVIES_ROW = 'Сейчас смотрят фильмы';
const SERIES_ROW = 'Сейчас смотрят сериалы';
const NEXT = function next() {};
const film = (title, year) => ({ id: 'KP_' + title, type: 'movie', title, original_title: title, imdb_id: '', release_date: year });
const show = (title, year, imdb) => ({ id: 'KP_' + title, type: 'tv', title, name: title, original_title: title, imdb_id: imdb || '', first_air_date: year });
// «Буду рядом» (KP 14897335): TMDB-тайтла нет (design.md kp-trailer-without-title, наблюдение 1).
const NEAR = show('Буду рядом', '2026');
const part = (title, url, results) => ({ title, url, results, page: 1, total_pages: 35, total_results: 0, more: true });
const AVATAR = film('Аватар: Пламя и пепел', '2025');
const ZOOTOPIA = film('Зверополис 2', '2025');
const INTERSTELLAR = film('Интерстеллар', '2014');
const PLURIBUS = show('Одна из многих', '2025');
// Старт до прошлого года: решает последний эпизод по TMDB (find по imdb_id → tv/<id>).
const THRONES = show('Игра престолов', '2011', 'tt0944947');
const STRANGER = show('Очень странные дела', '2016', 'tt4574334');
const NEVSKY = show('Невский', '2015');
const TV_ID = { tt0944947: 1399, tt4574334: 66732, tt9: 9, tt8: 8 };
const imdbOf = (url) => /find\/(tt\d+)/.exec(url)[1];
const findTv = (url) => ({ movie_results: [], tv_results: [{ id: TV_ID[imdbOf(url)] }] });
const aired = (date, n = 2) => ({ last_episode_to_air: { season_number: n, air_date: date } });
const HOME = [
  part(MOVIES_ROW, MOVIES_URL, [AVATAR, ZOOTOPIA]),
  part(SERIES_ROW, SERIES_URL, [PLURIBUS]),
  part('Топ фильмы', 'api/v2.2/films/collections?type=TOP_250_MOVIES', [INTERSTELLAR]),
];
// Главная, в коллекции фильмов на 1-й странице movies, на 2-й — page2; у сериалов — series.
function homeWith(over) {
  const o = Object.assign({ movies: [AVATAR], page2: [], series: [PLURIBUS], pages: null }, over);
  const parts = [part(MOVIES_ROW, MOVIES_URL, o.movies), part(SERIES_ROW, SERIES_URL, o.series)];
  const pages = o.pages || ((url, page) => ({ results: url === MOVIES_URL && page === 2 ? o.page2 : [] }));
  return home(Object.assign({}, over, { parts, pages }));
}

// Память рядов «Сейчас смотрят» (design.md now-watching-new-first, решение 1): ключ
// kp_now_watching_seen, { <url ряда>: { <id>: { f, s, l } } }. f — мс появления (0 — не новая),
// s — сезон или null, l — день последней сборки с карточкой.
const SEEN = 'kp_now_watching_seen';
const DAY_MS = 864e5;
const at = (iso) => new Date(iso).getTime();
const dayOf = (iso) => Math.floor(at(iso) / DAY_MS);
// t — TMDB-тайтл новой карточки 'movie/<id>' (design.md now-watching-open-any-source, решение 1).
const memo = (cards, f, s, l, t) => Object.fromEntries(cards.map((card) => [card.id, Object.assign({ f, s: s === undefined ? null : s, l: l === undefined ? dayOf(TODAY) : l }, t ? { t } : {})]));
const seenWith = (movies, series) => ({ [MOVIES_URL]: movies, [SERIES_URL]: series });
const seenOf = (c) => plain(c.store[SEEN]);
const FRESH = show('Свежий', '2026', 'tt9');
const NEWER = show('Новенький', '2025', 'tt8');
// Сериалы NEWER (tv 8) и FRESH (tv 9): сезоны по TMDB, число или 'error'/'never'.
const seasons = (newer, fresh) => (id) => {
  const n = id === 9 ? fresh : newer;
  return typeof n === 'number' ? aired('2026-11-10', n) : n;
};
const seasonWarns = (c, card) => c.warn.filter((w) => w.join(' ').includes('season unknown') && w.includes(card.title));
// Следующая сборка Главной с памятью, которую записала сборка c.
const nextHome = (c, over) => homeWith(Object.assign({ seen: seenOf(c) }, over));
// Главная только с рядом сериалов NEWER, FRESH и их сезонами по TMDB.
const seriesOnly = (newer, fresh) => ({ movies: [], series: [NEWER, FRESH], find: findTv, tv: seasons(newer, fresh) });

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

// Исход «тайтла нет»: предупреждение со всеми needles, без видео и реакций, карточка открыта.
function assertNoTmdbTitle(c, ...needles) {
  assert.ok(warnedWith(c, ...needles), JSON.stringify(c.warn));
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
  assertNoTmdbTitle(c, 'Зверь');
});

test('no title match warns with title and year', () => {
  const c = load({ movie: FOREST, search: { results: [WITCH_FOREST] } });
  assertNoTmdbTitle(c, 'Лес', '2026');
});

test('search error warns with title and year, card opens', () => {
  const c = load({ movie: FOREST, search: 'error' });
  assertNoTmdbTitle(c, 'Лес', '2026');
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
  assert.ok(c.service[0].url.endsWith('&season=2&series=1'), c.service[0].url);
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
  assert.deepStrictEqual(c.service.map((s) => s.url), [serviceUrl('Жизнь заново', '', '', true)]);
  assert.strictEqual(c.done[0].videos.results[0].published_at, '');
});

test('tv card asks service with first air date year', () => {
  const c = load({ movie: Object.assign({}, LIFE, { first_air_date: '2026-10-26' }), search: { results: [LIFE_TV] }, videos: EN_VIDEOS, service: PICK });
  assert.ok(c.service[0].url.endsWith('&year=2026&series=1'), c.service[0].url);
  assert.strictEqual(c.done[0].videos.results[0].published_at, '2026-10-26');
});

// «Огонь» (KP 8941010): без типа сервис отдавал сериалу трейлер фильма 2020 года (issue #102).
test('service asked with card type', () => {
  const series = load({ movie: show('Огонь', '2025'), search: { results: [{ id: 1, name: 'Огонь', original_name: 'Огонь', first_air_date: '2025-03-01' }] }, videos: EN_VIDEOS, service: PICK });
  assert.deepStrictEqual(series.service.map((s) => s.url), [serviceUrl('Огонь', 'Огонь', '2025', true)]);
  const movie = load({ movie: film('Огонь', '2020'), search: { results: [{ id: 2, title: 'Огонь', original_title: 'Огонь', release_date: '2020-12-24' }] }, videos: EN_VIDEOS, service: PICK });
  assert.deepStrictEqual(movie.service.map((s) => s.url), [serviceUrl('Огонь', 'Огонь', '2020', false)]);
});

// Отказы сервиса и подстрока причины в предупреждении.
const SERVICE_FAILURES = [
  [NO_PICK, 'no candidates'],
  [{ status: 502, responseJSON: { error: 'search failed', detail: 'Sign in to confirm you are not a bot' } }, 'HTTP 502 search failed: Sign in to confirm you are not a bot'],
  [{ status: 0, statusText: 'error' }, 'HTTP 0'],
  [{ status: 0, statusText: 'timeout' }, 'timeout'],
  [{ status: 500, responseText: 'Traceback' }, '500'],
];

test('service null, error or timeout: TMDB videos, warning', () => {
  for (const [service, needle] of SERVICE_FAILURES) {
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
  const c = load({ find: 'error', service: PICK });
  assert.strictEqual(c.warn.length, 1);
  assert.ok(c.warn[0].includes('tt1675434'), JSON.stringify(c.warn));
  assert.strictEqual(c.get.length, 1);
  assert.strictEqual(c.done.length, 1);
  assert.strictEqual(c.done[0].videos.results[0].key, PICK.video_id);
});

// --- Трейлер без TMDB-тайтла (spec kp-card-trailers, «Трейлер без TMDB-тайтла») ---

test('no title: service video only, no tmdb videos or reactions', () => {
  const c = load({ movie: NEAR, service: PICK });
  assert.deepStrictEqual(c.service, [{ url: NEAR_URL, timeout: 10000 }]);
  assert.strictEqual(c.done.length, 1);
  assert.deepStrictEqual(plain(c.done[0].videos.results), [PICK_VIDEO]);
  assert.ok(!('reactions' in c.done[0]));
  assert.strictEqual(c.videos.length + c.reactions.length, 0);
});

test('no title, service gave nothing: answer as is, warning', () => {
  for (const [service, needle] of SERVICE_FAILURES) {
    assertNoTmdbTitle(load({ movie: NEAR, service }), 'Буду рядом', '2026', needle);
  }
});

// --- Трейлеры карточек tmdb и cub (spec kp-card-trailers, «Трейлеры карточки TMDB») ---

test('tmdb and cub card: service video first, no title search', () => {
  for (const source of ['tmdb', 'cub']) {
    const c = load({ open: false, movie: BLACK_LOTUS, videos: EN_VIDEOS, service: PICK });
    openSource(c, source, { id: 84553, method: 'tv' });
    assert.deepStrictEqual(c.service, [{ url: LOTUS_URL, timeout: 10000 }], source);
    assert.strictEqual(c.done.length, 1, source);
    const list = plain(c.done[0].videos.results);
    assert.deepStrictEqual(list.slice(1), EN_VIDEOS.results, source);
    assert.strictEqual(list[0].key, PICK.video_id, source);
    assert.strictEqual(list[0].iso_639_1, 'ru', source);
    assert.deepStrictEqual(plain(c.done[0].reactions), REACTIONS, source);
    assert.deepStrictEqual(c.get, [], source);
    assert.deepStrictEqual(c.videos, [], source);
    assert.deepStrictEqual(c.reactions, [], source);
    assert.deepStrictEqual(c.tv, [{ url: 'tv/84553', cache: { life: DAY_MIN } }], source);
    assert.strictEqual(c.warn.length + c.error.length, 0, source);
  }
});

test('tmdb series season 2: service asked with season', () => {
  const c = load({ open: false, movie: BLACK_LOTUS, videos: EN_VIDEOS, tv: GENT_TV, service: GENT_PICK });
  openSource(c, 'tmdb', { id: 84553, method: 'tv' });
  assert.strictEqual(c.service.length, 1);
  assert.strictEqual(c.service[0].url, serviceUrl('Бегущий по лезвию: Чёрный лотос', 'Blade Runner: Black Lotus', '2021', true, 2));
  const list = plain(c.done[0].videos.results);
  assert.strictEqual(list[0].key, GENT_PICK.video_id);
  assert.deepStrictEqual(list.slice(1), EN_VIDEOS.results);
  assert.strictEqual(list[0].iso_639_1, 'ru');
  assert.strictEqual(c.done.length, 1);
});

test('no cub.full: one error, tmdb card as is, KP card unchanged', () => {
  const c = load({ ...BEAST_CARD, videos: EN_VIDEOS, service: PICK, drop: ['Api.sources.cub.full'] });
  assert.strictEqual(c.error.length, 1);
  assert.ok(c.error[0].join(' ').includes('cub.full'), JSON.stringify(c.error));
  assert.deepStrictEqual(plain(c.done[0].videos.results), [PICK_VIDEO].concat(EN_VIDEOS.results));
  c.service.length = 0;
  openSource(c, 'tmdb', { id: 84553, method: 'tv' });
  assert.strictEqual(c.done.length, 2);
  assert.deepStrictEqual(c.done[1].videos, EN_VIDEOS);
  assert.deepStrictEqual(c.service, []);
  assert.strictEqual(c.error.length, 1);
});

// --- Кнопки карточки вместо «Смотреть» (spec card-buttons) ---

// Разметка кнопки плагина: класс, подпись и спрайт.
function assertButton(el, cls, text, sprite) {
  for (const part of [cls, text, '#sprite-' + sprite]) assert.ok(el.html.includes(part), el.html);
}

test('torrent button first, opens torrents', () => {
  const c = openCard();
  assertButton(c.after[0], 'button--kp-torrent', 'Торренты', 'torrent');
  assert.deepStrictEqual(c.torrent, []);
  c.after[0].handlers['hover:enter']();
  assert.deepStrictEqual(c.torrent, ['hover:enter']);
  assert.strictEqual(c.warn.length, 0);
});

test('no torrent button without enabled source', () => {
  const c = openCard({ torrent: false });
  assert.strictEqual(c.button('button--kp-torrent'), undefined);
  assert.strictEqual(c.warn.length, 0);
});

test('play removed', () => {
  for (const over of [{}, { torrent: false, trailers: false }]) {
    const c = openCard(over);
    assert.strictEqual(c.removed, 1, JSON.stringify(over));
  }
});

test('watch item first in options, emits watch', () => {
  const c = load();
  const emitted = [];
  // Пункт другого плагина уже в меню: «Смотреть» всё равно первый.
  const options = [{ title: 'Другой плагин' }];
  c.listeners.full({ type: 'options', options, link: { emit(name, args) { emitted.push([name, args]); } } });
  assert.deepStrictEqual(options.map((o) => o.title), ['Смотреть', 'Другой плагин']);
  assert.deepStrictEqual(emitted, []);
  options[0].onSelect();
  assert.deepStrictEqual(plain(emitted), [['watch', {}]]);
});

test('no play button, warning', () => {
  for (const over of [{ play: false }, { play: false, trailers: false }]) {
    const c = openCard(over);
    assert.strictEqual(c.after.length, 0, JSON.stringify(over));
    assertWarned(c, 'Зверь');
  }
});

// --- Кнопка «Трейлер» (spec kp-card-trailers) ---

test('trailer after torrent', () => {
  const c = openCard();
  assert.strictEqual(c.after.length, 2);
  assert.ok(c.after[0].html.includes('button--kp-torrent'), c.after[0].html);
  assertButton(c.after[1], 'button--kp-trailer', 'Трейлер', 'trailer');
  assert.strictEqual(c.warn.length, 0);
});

test('trailer first without torrents', () => {
  const c = openCard({ torrent: false });
  assert.strictEqual(c.after.length, 1);
  assert.ok(c.after[0].html.includes('button--kp-trailer'), c.after[0].html);
});

test('no button without trailers', () => {
  const c = openCard({ trailers: false });
  assert.strictEqual(c.button('button--kp-trailer'), undefined);
  assert.strictEqual(c.warn.length, 0);
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

// --- Новинки в штатных рядах Главной KP (spec now-watching-new-releases) ---

test('original row filtered in place', () => {
  const parts = [part(MOVIES_ROW, MOVIES_URL, [AVATAR, INTERSTELLAR, ZOOTOPIA])].concat(HOME.slice(1));
  const c = home({ parts });
  assert.deepStrictEqual(c.home[0].map((p) => [p.title, p.url]), plain(parts).map((p) => [p.title, p.url]));
  assert.deepStrictEqual(names(row(c, MOVIES_ROW)), [AVATAR.title, ZOOTOPIA.title]);
  assert.deepStrictEqual(names(row(c, SERIES_ROW)), [PLURIBUS.title]);
  assert.strictEqual(c.home.length, 1);
});

test('other rows unchanged', () => {
  const parts = HOME.concat([part('Сейчас смотрят ещё', MOVIES_URL + 'x', [INTERSTELLAR])]);
  const c = home({ parts });
  const others = (list) => list.filter((p) => p.url !== MOVIES_URL && p.url !== SERIES_URL);
  assert.deepStrictEqual(others(c.home[0]), others(plain(parts)));
  assert.strictEqual(c.next, NEXT);
});

test('more button kept', () => {
  const c = home();
  for (const title of [MOVIES_ROW, SERIES_ROW]) {
    const r = row(c, title);
    assert.deepStrictEqual([r.total_pages, r.page, r.more], [7, 1, true], title);
  }
});

test('new items from later pages', () => {
  const old = film('Начало', '2010');
  const late = film('Грешники', '2025');
  const c = homeWith({ movies: [AVATAR, ZOOTOPIA], page2: [INTERSTELLAR, late, old] });
  assert.deepStrictEqual(names(row(c, MOVIES_ROW)), [AVATAR.title, ZOOTOPIA.title, late.title]);
  assert.deepStrictEqual(c.list.filter((l) => l.url === MOVIES_URL).map((l) => l.page), [2, 3, 4, 5]);
  assert.deepStrictEqual(c.list.filter((l) => l.url === SERIES_URL).map((l) => l.page), [2, 3, 4, 5]);
});

test('empty row skipped, warning', () => {
  const c = homeWith({ movies: [INTERSTELLAR] });
  assert.strictEqual(row(c, MOVIES_ROW), undefined);
  assert.ok(row(c, SERIES_ROW));
  assert.ok(warnedWith(c, 'no new releases', MOVIES_ROW), JSON.stringify(c.warn));
});

test('january keeps last year', () => {
  const c = homeWith({ today: '2027-01-15T12:00:00', movies: [film('Прошлогодний', '2026')] });
  assert.deepStrictEqual(names(row(c, MOVIES_ROW)), ['Прошлогодний']);
});

test('year before last is old', () => {
  const c = homeWith({ movies: [AVATAR, film('Позапрошлый', '2024')] });
  assert.deepStrictEqual(names(row(c, MOVIES_ROW)), [AVATAR.title]);
});

test('future year is new', () => {
  const c = homeWith({ movies: [film('Будущий', '2027')] });
  assert.deepStrictEqual(names(row(c, MOVIES_ROW)), ['Будущий']);
});

test('empty year is unknown', () => {
  const c = homeWith({ movies: [AVATAR, film('Без года', '')] });
  assert.deepStrictEqual(names(row(c, MOVIES_ROW)), [AVATAR.title, 'Без года']);
  assert.ok(warnedWith(c, 'Без года'), JSON.stringify(c.warn));
});

test('new series new despite tmdb error', () => {
  const seen = seenWith({}, memo([PLURIBUS, FRESH], 0, 1));
  const c = homeWith({ series: [PLURIBUS, FRESH], seen, find: 'error', search: 'error', tv: 'error' });
  assert.deepStrictEqual(names(row(c, SERIES_ROW)), [PLURIBUS.title, FRESH.title]);
  assert.ok(!warnedWith(c, 'new release not checked'), JSON.stringify(c.warn));
});

test('new season of old series', () => {
  const c = homeWith({ series: [THRONES], find: findTv, tv: () => aired('2026-10-01') });
  assert.deepStrictEqual(names(row(c, SERIES_ROW)), [THRONES.title]);
  assert.deepStrictEqual(c.tv, [{ url: 'tv/1399', cache: { life: DAY_MIN } }]);
});

test('last episode boundary 365 days', () => {
  const dates = { 1399: '2025-11-18', 66732: '2025-11-17' };
  const c = homeWith({ series: [THRONES, STRANGER], find: findTv, tv: (id) => aired(dates[id]) });
  assert.deepStrictEqual(names(row(c, SERIES_ROW)), [THRONES.title]);
});

test('old series without new episodes', () => {
  const c = homeWith({ series: [PLURIBUS, STRANGER], find: findTv, tv: () => aired('2025-06-01') });
  assert.deepStrictEqual(names(row(c, SERIES_ROW)), [PLURIBUS.title]);
});

test('no tmdb pair is unknown', () => {
  const c = homeWith({ series: [NEVSKY], search: NO_RESULTS });
  assert.deepStrictEqual(names(row(c, SERIES_ROW)), [NEVSKY.title]);
  assert.ok(warnedWith(c, 'new release not checked', NEVSKY.title), JSON.stringify(c.warn));
});

test('tmdb error is unknown', () => {
  const c = homeWith({ series: [THRONES], find: findTv, tv: 'error' });
  assert.deepStrictEqual(names(row(c, SERIES_ROW)), [THRONES.title]);
  assert.ok(warnedWith(c, 'new release not checked', THRONES.title), JSON.stringify(c.warn));
});

test('no last episode is unknown', () => {
  for (const tv of [{}, { last_episode_to_air: null }, { last_episode_to_air: { season_number: 3 } }]) {
    const c = homeWith({ series: [THRONES], find: findTv, tv });
    assert.deepStrictEqual(names(row(c, SERIES_ROW)), [THRONES.title], JSON.stringify(tv));
    assert.ok(warnedWith(c, 'new release not checked', THRONES.title), JSON.stringify(c.warn));
  }
});

test('unchecked without title suffix', () => {
  const c = homeWith({ series: [PLURIBUS, NEVSKY, THRONES], find: findTv, search: NO_RESULTS, tv: 'error' });
  assert.deepStrictEqual(names(row(c, SERIES_ROW)), [PLURIBUS.title, NEVSKY.title, THRONES.title]);
  assert.strictEqual(row(c, SERIES_ROW).title, SERIES_ROW);
  assert.ok(warnedWith(c, 'new release not checked', NEVSKY.title), JSON.stringify(c.warn));
  assert.ok(warnedWith(c, 'new release not checked', THRONES.title), JSON.stringify(c.warn));
});

test('page error marks incomplete', () => {
  const byPage = { 2: [film('Два', '2026')], 4: [film('Четыре', '2026')], 5: [film('Пять', '2026')] };
  const pages = (url, page) => (url !== MOVIES_URL ? NO_RESULTS : page === 3 ? 'error' : { results: byPage[page] });
  const c = homeWith({ pages });
  assert.deepStrictEqual(names(row(c, MOVIES_ROW)), [AVATAR.title, 'Два', 'Четыре', 'Пять']);
  assert.strictEqual(row(c, MOVIES_ROW).title, MOVIES_ROW + ' · неполный');
  assert.strictEqual(row(c, SERIES_ROW).title, SERIES_ROW);
  assert.ok(warnedWith(c, MOVIES_ROW, 'page 3'), JSON.stringify(c.warn));
});

test('timeout builds partial row', () => {
  const pages = (url, page) => (url !== MOVIES_URL ? NO_RESULTS : page === 4 ? 'never' : { results: page === 2 ? [ZOOTOPIA] : [] });
  const c = homeWith({ pages });
  assert.strictEqual(c.home.length, 0);
  assert.deepStrictEqual(c.timers.map((t) => t.ms), [5000]);
  c.fire();
  assert.strictEqual(c.home.length, 1);
  assert.deepStrictEqual(names(row(c, MOVIES_ROW)), [AVATAR.title, ZOOTOPIA.title]);
  assert.strictEqual(row(c, MOVIES_ROW).title, MOVIES_ROW + ' · неполный');
  assert.ok(warnedWith(c, MOVIES_ROW, 'page 4'), JSON.stringify(c.warn));
});

test('tmdb timeout is unknown', () => {
  const c = homeWith({ series: [THRONES], find: findTv, tv: 'never' });
  assert.strictEqual(c.home.length, 0);
  c.fire();
  assert.strictEqual(c.home.length, 1);
  assert.deepStrictEqual(names(row(c, SERIES_ROW)), [THRONES.title]);
  assert.ok(warnedWith(c, 'new release not checked', THRONES.title, 'timeout'), JSON.stringify(c.warn));
});

test('missing original row, noty', () => {
  const parts = [HOME[0], HOME[2]];
  const c = home({ parts });
  assert.deepStrictEqual(c.home, [plain(parts)]);
  assert.strictEqual(c.noty.length, 1);
  assert.ok(c.noty[0].includes('Ряды новинок не построены'), c.noty[0]);
  assert.strictEqual(c.error.length, 1);
  assert.ok(c.error[0].join(' ').includes(SERIES_ROW), JSON.stringify(c.error));
  assert.deepStrictEqual(c.list, []);
});

test('late patch, noty', () => {
  const c = load({ open: false, active: { component: 'main', source: 'KP' } });
  assert.strictEqual(c.noty.length, 1);
  assert.ok(c.noty[0].includes('Ряды новинок не построены'), c.noty[0]);
  assert.strictEqual(c.error.length, 1);
  for (const active of [null, { component: 'main', source: 'tmdb' }, { component: 'full', source: 'KP' }]) {
    const quiet = load({ open: false, active });
    assert.deepStrictEqual([quiet.noty, quiet.error], [[], []], JSON.stringify(active));
  }
});

// --- Новые карточки первыми (spec now-watching-new-releases, change now-watching-new-first) ---

const FILM_A = film('Фильм А', '2026');
const FILM_B = film('Фильм Б', '2026');
const FILM_C = film('Фильм В', '2025');
const SERIES_SEEN = memo([PLURIBUS], 0);

test('new card first', () => {
  const seen = seenWith(memo([AVATAR, FILM_C], 0), SERIES_SEEN);
  const c = homeWith({ movies: [AVATAR, ZOOTOPIA, FILM_C], seen });
  assert.deepStrictEqual(names(row(c, MOVIES_ROW)), [ZOOTOPIA.title, AVATAR.title, FILM_C.title]);
  assert.strictEqual(seenOf(c)[MOVIES_URL][ZOOTOPIA.id].f, at(TODAY));
});

test('newest appearance first', () => {
  const movies = Object.assign(memo([AVATAR], 0), memo([FILM_A], at('2026-11-18T12:00:00')), memo([FILM_B], at('2026-11-20T12:00:00')));
  const c = homeWith({ today: '2026-11-21T12:00:00', movies: [AVATAR, FILM_A, FILM_B], seen: seenWith(movies, SERIES_SEEN) });
  assert.deepStrictEqual(names(row(c, MOVIES_ROW)), [FILM_B.title, FILM_A.title, AVATAR.title]);
});

test('same build keeps collection order', () => {
  const seen = seenWith(memo([AVATAR], 0), SERIES_SEEN);
  const c = homeWith({ movies: [AVATAR, FILM_A, FILM_B], seen });
  assert.deepStrictEqual(names(row(c, MOVIES_ROW)), [FILM_A.title, FILM_B.title, AVATAR.title]);
  const next = nextHome(c, { today: '2026-11-18T13:00:00', movies: [AVATAR, FILM_A, FILM_B] });
  assert.deepStrictEqual(names(row(next, MOVIES_ROW)), [FILM_A.title, FILM_B.title, AVATAR.title]);
});

test('new card back after five days', () => {
  const movies = Object.assign(memo([AVATAR], 0), memo([FILM_A], at('2026-11-15T10:00:00')));
  const build = (today) => homeWith({ today, movies: [AVATAR, FILM_A], seen: seenWith(movies, SERIES_SEEN) });
  assert.deepStrictEqual(names(row(build('2026-11-20T09:59:00'), MOVIES_ROW)), [FILM_A.title, AVATAR.title]);
  assert.deepStrictEqual(names(row(build('2026-11-20T10:01:00'), MOVIES_ROW)), [AVATAR.title, FILM_A.title]);
});

test('opened card back in place', () => {
  const c = homeWith({ movies: [AVATAR, ZOOTOPIA], seen: seenWith(memo([AVATAR], 0), SERIES_SEEN) });
  assert.deepStrictEqual(names(row(c, MOVIES_ROW)), [ZOOTOPIA.title, AVATAR.title]);
  c.ctx.Lampa.Api.sources.KP.full({ card: { id: ZOOTOPIA.id, source: 'KP' } }, () => {}, () => {});
  assert.strictEqual(seenOf(c)[MOVIES_URL][ZOOTOPIA.id].f, 0);
  const next = nextHome(c, { movies: [AVATAR, ZOOTOPIA] });
  assert.deepStrictEqual(names(row(next, MOVIES_ROW)), [AVATAR.title, ZOOTOPIA.title]);
});

// Карточка TMDB того же тайтла (spec now-watching-new-releases, «Открыта карточка TMDB», «Другой тип с
// тем же id»): тайтл новой карточки ищется после сборки, ключ — метод и id.
const PREMIERE = Object.assign(film('Премьера', '2026'), { imdb_id: 'tt7' });
const findPremiere = (url) => (url.includes('tt7') ? { movie_results: [{ id: 1399 }], tv_results: [] } : NOT_FOUND);
const premiereHome = (over) => Object.assign({ movies: [AVATAR, PREMIERE], series: [], find: findPremiere }, over);

test('opened tmdb card back in place', () => {
  for (const source of ['tmdb', 'cub']) {
    const c = homeWith(premiereHome({ seen: seenWith(memo([AVATAR], 0), {}), defer: true }));
    assert.strictEqual(c.home.length, 1, source);
    assert.deepStrictEqual(names(row(c, MOVIES_ROW)), [PREMIERE.title, AVATAR.title], source);
    assert.strictEqual(seenOf(c)[MOVIES_URL][PREMIERE.id].t, undefined, source);
    c.late.splice(0).forEach((fn) => fn());
    assert.deepStrictEqual(seenOf(c)[MOVIES_URL][PREMIERE.id], memo([PREMIERE], at(TODAY), null, undefined, 'movie/1399')[PREMIERE.id], source);
    openSource(c, source, { method: 'tv', id: 1399 });
    assert.notStrictEqual(seenOf(c)[MOVIES_URL][PREMIERE.id].f, 0, source);

    const next = nextHome(c, premiereHome());
    assert.deepStrictEqual(names(row(next, MOVIES_ROW)), [PREMIERE.title, AVATAR.title], source);
    assert.strictEqual(seenOf(next)[MOVIES_URL][PREMIERE.id].t, 'movie/1399', source);
    assert.ok(!next.get.some((g) => g.url.includes('tt7')), JSON.stringify(next.get));
    openSource(next, source, { method: 'movie', id: 1399 });
    assert.strictEqual(seenOf(next)[MOVIES_URL][PREMIERE.id].f, 0, source);

    const third = nextHome(next, premiereHome());
    assert.deepStrictEqual(names(row(third, MOVIES_ROW)), [AVATAR.title, PREMIERE.title], source);
  }
});

test('no tmdb title warns, kp open still works', () => {
  const seen = seenWith(memo([AVATAR], 0), {});
  const c = homeWith({ movies: [AVATAR, FILM_A], series: [], seen, search: NO_RESULTS });
  assert.ok(warnedWith(c, 'no title match', FILM_A.title), JSON.stringify(c.warn));
  assert.strictEqual(seenOf(c)[MOVIES_URL][FILM_A.id].t, undefined);
  openSource(c, 'tmdb', { method: 'movie', id: 1399 });
  assert.notStrictEqual(seenOf(c)[MOVIES_URL][FILM_A.id].f, 0);
  c.ctx.Lampa.Api.sources.KP.full({ card: { id: FILM_A.id, source: 'KP' } }, () => {}, () => {});
  assert.strictEqual(seenOf(c)[MOVIES_URL][FILM_A.id].f, 0);

  const failed = homeWith(premiereHome({ seen, find: 'error' }));
  assert.ok(warnedWith(failed, 'find failed', PREMIERE.title), JSON.stringify(failed.warn));
  assert.strictEqual(seenOf(failed)[MOVIES_URL][PREMIERE.id].t, undefined);
});

test('full list keeps collection order', () => {
  const pages = (url, page) => ({ results: url === MOVIES_URL && page === 1 ? [AVATAR, ZOOTOPIA] : [] });
  const c = homeWith({ movies: [AVATAR, ZOOTOPIA], pages, seen: seenWith(memo([AVATAR], 0), SERIES_SEEN) });
  assert.deepStrictEqual(names(row(c, MOVIES_ROW)), [ZOOTOPIA.title, AVATAR.title]);
  const { got } = fullList(c, MOVIES_URL, 1);
  assert.deepStrictEqual(got[0].results.map((card) => card.title), [AVATAR.title, ZOOTOPIA.title]);
});

test('new season raises opened series', () => {
  const seen = seenWith({}, memo([NEWER, FRESH], 0, 1));
  const c = homeWith(Object.assign({ seen }, seriesOnly(1, 2)));
  assert.deepStrictEqual(names(row(c, SERIES_ROW)), [FRESH.title, NEWER.title]);
  assert.strictEqual(seenOf(c)[SERIES_URL][FRESH.id].s, 2);
});

test('same season stays', () => {
  const seen = seenWith({}, Object.assign(memo([NEWER], 0, 2), memo([FRESH], 0, 3)));
  const c = homeWith(Object.assign({ seen }, seriesOnly(2, 2)));
  assert.deepStrictEqual(names(row(c, SERIES_ROW)), [NEWER.title, FRESH.title]);
  assert.strictEqual(seenOf(c)[SERIES_URL][FRESH.id].s, 3);
});

test('season unknown keeps place, one warning', () => {
  const seen = seenWith({}, memo([NEWER, FRESH], 0, 1));
  const c = homeWith(Object.assign({ seen }, seriesOnly(1, 'error')));
  assert.deepStrictEqual(names(row(c, SERIES_ROW)), [NEWER.title, FRESH.title]);
  assert.strictEqual(seasonWarns(c, FRESH).length, 1, JSON.stringify(c.warn));
  assert.strictEqual(seasonWarns(c, NEWER).length, 0, JSON.stringify(c.warn));
  assert.strictEqual(seenOf(c)[SERIES_URL][FRESH.id].s, 1);
  const next = nextHome(c, seriesOnly(1, 2));
  assert.deepStrictEqual(names(row(next, SERIES_ROW)), [FRESH.title, NEWER.title]);
});

test('tmdb season timeout builds home', () => {
  const seen = seenWith({}, memo([NEWER, FRESH], 0, 1));
  const c = homeWith(Object.assign({ seen }, seriesOnly(1, 'never')));
  assert.strictEqual(c.home.length, 0);
  assert.deepStrictEqual(c.timers.map((t) => t.ms), [5000]);
  c.fire();
  assert.strictEqual(c.home.length, 1);
  assert.deepStrictEqual(names(row(c, SERIES_ROW)), [NEWER.title, FRESH.title]);
  assert.strictEqual(seasonWarns(c, FRESH).length, 1, JSON.stringify(c.warn));
  assert.ok(warnedWith(c, 'season unknown', FRESH.title, 'timeout'), JSON.stringify(c.warn));
});

test('season learned without raise', () => {
  const seen = seenWith({}, Object.assign(memo([NEWER], 0, 1), memo([FRESH], 0, null)));
  const c = homeWith(Object.assign({ seen }, seriesOnly(1, 3)));
  assert.deepStrictEqual(names(row(c, SERIES_ROW)), [NEWER.title, FRESH.title]);
  assert.strictEqual(seenOf(c)[SERIES_URL][FRESH.id].s, 3);
  const next = nextHome(c, seriesOnly(1, 4));
  assert.deepStrictEqual(names(row(next, SERIES_ROW)), [FRESH.title, NEWER.title]);
});

test('unseen series raised without season request', () => {
  const seen = seenWith({}, memo([NEWER], 0, 1));
  const c = homeWith(Object.assign({ seen }, seriesOnly(1, 1)));
  assert.deepStrictEqual(names(row(c, SERIES_ROW)), [FRESH.title, NEWER.title]);
  assert.deepStrictEqual(c.tv.map((t) => t.url), ['tv/8']);
  // Один find — поиск тайтла новой карточки после сборки (design.md now-watching-open-any-source, решение 2).
  assert.strictEqual(c.get.filter((g) => g.url.includes('tt9')).length, 1, JSON.stringify(c.get));
  assert.strictEqual(seenOf(c)[SERIES_URL][FRESH.id].s, null);
  assert.strictEqual(seenOf(c)[SERIES_URL][FRESH.id].t, 'tv/9');
});

test('first run seeds memory', () => {
  const c = homeWith({ movies: [AVATAR, ZOOTOPIA], series: [PLURIBUS] });
  assert.deepStrictEqual(names(row(c, MOVIES_ROW)), [AVATAR.title, ZOOTOPIA.title]);
  assert.strictEqual(setsOf(c, SEEN), 1);
  assert.deepStrictEqual(seenOf(c), seenWith(memo([AVATAR, ZOOTOPIA], 0), memo([PLURIBUS], 0)));
  const next = nextHome(c, { movies: [ZOOTOPIA, AVATAR], series: [PLURIBUS] });
  assert.deepStrictEqual(names(row(next, MOVIES_ROW)), [ZOOTOPIA.title, AVATAR.title]);
});

test('incomplete first run not seeded', () => {
  const pages = (url, page) => (url === MOVIES_URL && page === 3 ? 'error' : { results: url === MOVIES_URL && page === 2 ? [FILM_A] : [] });
  const c = homeWith({ movies: [AVATAR], pages });
  assert.deepStrictEqual(names(row(c, MOVIES_ROW)), [AVATAR.title, FILM_A.title]);
  assert.strictEqual(seenOf(c)[MOVIES_URL], undefined);
  const next = nextHome(c, { movies: [AVATAR], page2: [FILM_A] });
  assert.deepStrictEqual(names(row(next, MOVIES_ROW)), [AVATAR.title, FILM_A.title]);
  assert.deepStrictEqual(seenOf(next)[MOVIES_URL], memo([AVATAR, FILM_A], 0));
});

test('returning card not new', () => {
  const movies = Object.assign(memo([AVATAR], 0, null, dayOf(TODAY) - 1), memo([ZOOTOPIA], 0, null, dayOf(TODAY) - 3));
  const c = homeWith({ movies: [AVATAR, ZOOTOPIA], seen: seenWith(movies, SERIES_SEEN) });
  assert.deepStrictEqual(names(row(c, MOVIES_ROW)), [AVATAR.title, ZOOTOPIA.title]);
  assert.deepStrictEqual(seenOf(c)[MOVIES_URL], memo([AVATAR, ZOOTOPIA], 0));
});

test('absent 31 days forgotten, 29 days remembered', () => {
  for (const [days, kept] of [[31, false], [30, true], [29, true]]) {
    const gone = film('Ушедший', '2026');
    const movies = Object.assign(memo([AVATAR], 0), memo([ZOOTOPIA, gone], 0, null, dayOf(TODAY) - days));
    const c = homeWith({ movies: [AVATAR, ZOOTOPIA], seen: seenWith(movies, SERIES_SEEN) });
    const order = kept ? [AVATAR.title, ZOOTOPIA.title] : [ZOOTOPIA.title, AVATAR.title];
    assert.deepStrictEqual(names(row(c, MOVIES_ROW)), order, String(days));
    assert.strictEqual(gone.id in seenOf(c)[MOVIES_URL], kept, String(days));
  }
});

test('corrupt memory reseeded, warning', () => {
  for (const seen of ['garbage', [], { [MOVIES_URL]: 5, [SERIES_URL]: {} }]) {
    const c = homeWith({ movies: [AVATAR, ZOOTOPIA], seen });
    assert.deepStrictEqual(names(row(c, MOVIES_ROW)), [AVATAR.title, ZOOTOPIA.title], JSON.stringify(seen));
    assert.ok(warnedWith(c, SEEN), JSON.stringify(c.warn));
    const next = nextHome(c, { movies: [ZOOTOPIA, AVATAR] });
    assert.deepStrictEqual(names(row(next, MOVIES_ROW)), [ZOOTOPIA.title, AVATAR.title], JSON.stringify(seen));
  }
});

test('unchanged memory not rewritten', () => {
  const seen = seenWith(memo([AVATAR], 0), SERIES_SEEN);
  assert.strictEqual(setsOf(homeWith({ seen }), SEEN), 0);
  assert.strictEqual(setsOf(homeWith({ seen, today: '2026-11-19T12:00:00' }), SEEN), 1);
});

// --- Полный список новинок по «Ещё» (spec now-watching-new-releases) ---

// Коллекция фильмов из total страниц: byPage[n] — карточки страницы n или 'error'/'never'.
function collection(total, byPage) {
  return (url, page) => {
    const p = url === MOVIES_URL ? byPage[page] : undefined;
    return p === 'error' || p === 'never' ? p : { results: p || [], page, total_pages: total };
  };
}

// «Ещё»: Lampa просит страницу page полного списка url. got — ответы ('error' — ошибка списка),
// asked — страницы коллекции, которые запросил этот вызов.
function fullList(c, url, page) {
  const from = c.list.length;
  const got = [];
  c.ctx.Lampa.Api.sources.KP.list({ url, page }, (json) => got.push(plain(json)), () => got.push('error'));
  return { got, asked: c.list.slice(from).map((l) => l.page) };
}

const LATE = film('Грешники', '2025');
const OLD = film('Начало', '2010');

test('list page is batch of five', () => {
  const c = home({ pages: collection(35, { 6: [OLD, AVATAR], 8: [ZOOTOPIA, INTERSTELLAR] }) });
  const r = fullList(c, MOVIES_URL, 2);
  assert.deepStrictEqual(r.asked, [6, 7, 8, 9, 10]);
  assert.strictEqual(r.got.length, 1);
  assert.deepStrictEqual(names(r.got[0]), [AVATAR.title, ZOOTOPIA.title]);
  assert.deepStrictEqual([r.got[0].page, r.got[0].total_pages], [2, 7]);
});

test('last batch stops at collection end', () => {
  const parts = [Object.assign(part(MOVIES_ROW, MOVIES_URL, [AVATAR]), { total_pages: 33 }), HOME[1]];
  const c = home({ parts, pages: collection(33, { 31: [LATE] }) });
  const r = fullList(c, MOVIES_URL, 7);
  assert.deepStrictEqual(r.asked, [31, 32, 33]);
  assert.deepStrictEqual(names(r.got[0]), [LATE.title]);
  assert.deepStrictEqual([r.got[0].page, r.got[0].total_pages], [7, 7]);
});

test('empty batch skipped', () => {
  const c = home({ pages: collection(35, { 7: [OLD], 12: [LATE] }) });
  const r = fullList(c, MOVIES_URL, 2);
  assert.deepStrictEqual(r.asked, [6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
  assert.strictEqual(r.got.length, 1);
  assert.deepStrictEqual(names(r.got[0]), [LATE.title]);
  assert.deepStrictEqual([r.got[0].page, r.got[0].total_pages], [3, 7]);
});

test('failed batch calls onerror', () => {
  const byPage = { 6: 'error', 7: 'error', 8: 'error', 9: 'error', 10: 'error' };
  const c = home({ pages: collection(35, byPage) });
  assert.deepStrictEqual(fullList(c, MOVIES_URL, 2).got, ['error']);
});

test('partial batch warns', () => {
  for (const broken of ['error', 'never']) {
    const c = home({ pages: collection(35, { 6: [AVATAR], 7: broken, 9: [LATE] }) });
    const r = fullList(c, MOVIES_URL, 2);
    if (broken === 'never') {
      assert.deepStrictEqual(r.got, [], broken);
      assert.deepStrictEqual(c.timers.map((t) => t.ms), [5000], broken);
      c.fire();
    }
    assert.strictEqual(r.got.length, 1, broken);
    assert.deepStrictEqual(names(r.got[0]), [AVATAR.title, LATE.title], broken);
    assert.ok(warnedWith(c, MOVIES_ROW, 'page 7'), broken + ' ' + JSON.stringify(c.warn));
  }
});

test('other lists untouched', () => {
  const TOP_URL = 'api/v2.2/films/collections?type=TOP_250_MOVIES';
  const answer = { results: [INTERSTELLAR], page: 3, total_pages: 9 };
  const c = home({ pages: (url) => (url === TOP_URL ? answer : NO_RESULTS) });
  const r = fullList(c, TOP_URL, 3);
  assert.deepStrictEqual(r.asked, [3]);
  assert.deepStrictEqual(r.got, [answer]);
});

// --- KP-история в рекомендациях (spec kp-history-recommendations) ---

// Записи истории KP — в форме, снятой с приставки 2026-11-20 (design.md, Standard approach): без type,
// сериал — по number_of_seasons / first_air_date.
const kp = (n, fields) => Object.assign({ id: 'KP_' + n, source: 'KP' }, fields);
const KP_FIGHT = kp(361, { title: 'Бойцовский клуб', original_title: 'Fight Club', imdb_id: 'tt0137523', release_date: '1999-10-15' });
const KP_THRONES = kp(464963, { title: 'Игра престолов', original_title: 'Game of Thrones', imdb_id: 'tt0944947', number_of_seasons: 8, first_air_date: '2011-04-17' });
const KP_PULP = kp(342, { title: 'Криминальное чтиво', original_title: 'Pulp Fiction', imdb_id: 'tt0110912', release_date: '1994-05-21' });
const KP_LOST = kp(5146946, { title: 'Операция «Возмездие»', original_title: 'The Fix', imdb_id: 'tt9999999', release_date: '2026-09-11' });
const KP_FAIL = kp(1, { title: 'Сбой', original_title: 'Failure', imdb_id: 'tt0000001', release_date: '2020-01-01' });
const TMDB_MATRIX = { id: 603, source: 'tmdb', title: 'Матрица' };
const FIND_BY_IMDB = {
  tt0137523: { movie_results: [{ id: 550 }], tv_results: [] },
  tt0944947: { movie_results: [{ id: 999001 }], tv_results: [{ id: 1399 }] },
  tt0110912: { movie_results: [{ id: 680 }], tv_results: [] },
  tt9999999: NOT_FOUND,
  tt0000001: 'error',
};
const findByImdb = (url) => FIND_BY_IMDB[imdbOf(url)];

// Приложение уже готово: проход по KP-истории идёт при загрузке плагина.
function recs(over) {
  return load(Object.assign({ open: false, appready: true, find: findByImdb }, over));
}

const scanOf = (c) => plain(c.store.recomends_scan);
const listIds = (c) => plain(c.store.recomends_list).map((e) => e.id);
const setsOf = (c, name) => c.sets.filter((n) => n === name).length;
const RECS_WARN = 'kp-reactions-fix: recommendations:';

test('kp movie queued first', () => {
  const c = recs({ history: [KP_FIGHT, TMDB_MATRIX], scan: [{ id: 603, tv: 0, scan: 1 }] });
  assert.deepStrictEqual(scanOf(c), [{ id: 550, tv: false }, { id: 603, tv: 0, scan: 1 }]);
  assert.deepStrictEqual(c.get.map((g) => g.url), ['find/tt0137523?external_source=imdb_id']);
  assert.strictEqual(setsOf(c, 'recomends_scan'), 1);
  assert.deepStrictEqual(c.warn, []);
});

test('kp series queued as tv', () => {
  const c = recs({ history: [KP_THRONES] });
  assert.deepStrictEqual(scanOf(c), [{ id: 1399, tv: true }]);
  assert.deepStrictEqual(plain(c.ctx.Lampa.Api.sources.KP.__history_recs), ['1399:tv']);
});

test('core queue kept, no duplicate', () => {
  const core = [{ id: 100, tv: 0 }, { id: 550, tv: 0, scan: 1 }, { id: 1399, tv: 8 }];
  const c = recs({ history: [KP_THRONES, KP_FIGHT, KP_PULP], scan: core });
  assert.deepStrictEqual(scanOf(c), [{ id: 680, tv: false }].concat(core));
});

test('queue filled once after app ready', () => {
  const c = load({ open: false, find: findByImdb, history: [KP_FIGHT, KP_THRONES], defer: true });
  assert.strictEqual(c.get.length, 0);
  c.ready();
  assert.strictEqual(c.get.length, 1);
  c.late.shift()();
  assert.strictEqual(c.get.length, 2);
  assert.strictEqual(setsOf(c, 'recomends_scan'), 0);
  c.late.shift()();
  c.ready();
  assert.strictEqual(c.get.length, 2);
  assert.strictEqual(setsOf(c, 'recomends_scan'), 1);
  assert.deepStrictEqual(scanOf(c), [{ id: 550, tv: false }, { id: 1399, tv: true }]);
});

test('queue insert survives core write', () => {
  const c = load({ open: false, find: findByImdb, history: [KP_FIGHT], scan: [{ id: 603, tv: 0 }] });
  const core = c.ctx.Lampa.Storage.get('recomends_scan', '[]');
  c.ready();
  core.push({ id: 604, tv: 0 });
  c.ctx.Lampa.Storage.set('recomends_scan', core);
  assert.deepStrictEqual(scanOf(c), [{ id: 550, tv: false }, { id: 603, tv: 0 }, { id: 604, tv: 0 }]);
  assert.deepStrictEqual(c.warn, []);
});

test('replaced core queue warns', () => {
  const c = recs({ history: [KP_FIGHT], scan: [{ id: 603, tv: 0 }] });
  assert.deepStrictEqual(c.warn, []);
  c.ctx.Lampa.Storage.set('recomends_scan', [{ id: 603, tv: 0 }]);
  assertWarned(c, RECS_WARN + ' core rewrote recomends_scan without KP history titles');
  c.ctx.Lampa.Storage.set('recomends_scan', [{ id: 603, tv: 0 }]);
  assert.strictEqual(c.warn.length, 1);
});

test('watched kp movie removed, order kept', () => {
  const list = [{ id: 1, title: 'A' }, { id: 550, title: 'Бойцовский клуб' }, { id: 2, title: 'B' }, { id: 1399, number_of_seasons: 8 }];
  const c = recs({ history: [KP_FIGHT, KP_THRONES], recs: list });
  assert.deepStrictEqual(listIds(c), [1, 2]);
  assert.strictEqual(setsOf(c, 'recomends_list'), 1);
});

test('same id other type kept in list', () => {
  const list = [{ id: 550, name: 'Сериал', first_air_date: '2020-01-01' }, { id: 550, number_of_seasons: 1 }, { id: 1399, title: 'Фильм' }];
  const c = recs({ history: [KP_FIGHT, KP_THRONES], recs: list });
  assert.deepStrictEqual(plain(c.store.recomends_list), list);
});

test('list cleaned after core write', () => {
  const c = recs({ history: [KP_FIGHT] });
  c.ctx.Lampa.Storage.set('recomends_list', [{ id: 1 }, { id: 550 }, { id: 2 }]);
  assert.deepStrictEqual(listIds(c), [1, 2]);
  assert.strictEqual(setsOf(c, 'recomends_list'), 1);
});

test('clean list not rewritten', () => {
  const c = recs({ history: [KP_FIGHT], recs: [{ id: 1 }, { id: 2 }] });
  assert.deepStrictEqual(listIds(c), [1, 2]);
  assert.strictEqual(setsOf(c, 'recomends_list'), 0);
});

test('unresolved and failed kp counted in warning', () => {
  const c = recs({ history: [KP_FIGHT, KP_LOST, KP_FAIL, KP_THRONES] });
  assert.deepStrictEqual(scanOf(c), [{ id: 550, tv: false }, { id: 1399, tv: true }]);
  assert.ok(warnedWith(c, RECS_WARN, '2 of 4'), JSON.stringify(c.warn));
});

test('pass deadline counts rest as unresolved', () => {
  const find = (url) => (url.includes('tt0944947') ? 'never' : findByImdb(url));
  const c = recs({ history: [KP_FIGHT, KP_THRONES, KP_PULP], find });
  assert.deepStrictEqual(c.timers.map((t) => t.ms), [60000]);
  assert.strictEqual(setsOf(c, 'recomends_scan'), 0);
  c.fire();
  assert.deepStrictEqual(scanOf(c), [{ id: 550, tv: false }]);
  assert.ok(warnedWith(c, RECS_WARN, '2 of 3'), JSON.stringify(c.warn));
});

// --- Рекомендации на Главной (spec kp-main-recommendations) ---

const REC_MOVIES = 'Рекомендуем посмотреть фильмы';
const REC_SERIES = 'Рекомендуем посмотреть сериалы';
const TOP_ROW = HOME[2].title;
const recMovie = (n) => ({ id: n, source: 'tmdb', title: 'Фильм ' + n, release_date: '2020-01-01' });
const recShow = (n) => ({ id: n, source: 'tmdb', title: 'Сериал ' + n, name: 'Сериал ' + n, first_air_date: '2020-01-01' });
const BOTH_RECS = [recMovie(1), recShow(2)];
const titlesOf = (portion) => portion.map((p) => p.title);
const recIds = (part) => part.results.map((card) => card.id);
const MAIN_WARN = 'kp-reactions-fix: recommendations: KP history not resolved before main';

test('recs rows after now watching', () => {
  const c = home({ recs: BOTH_RECS });
  assert.strictEqual(c.home.length, 1);
  assert.deepStrictEqual(titlesOf(c.home[0]), [MOVIES_ROW, SERIES_ROW, REC_MOVIES, REC_SERIES, TOP_ROW]);
  assert.deepStrictEqual(recIds(row(c, REC_MOVIES)), [1]);
  assert.deepStrictEqual(recIds(row(c, REC_SERIES)), [2]);
});

test('recs rows keep place of hidden row', () => {
  const parts = [part(MOVIES_ROW, MOVIES_URL, [AVATAR]), part(SERIES_ROW, SERIES_URL, [STRANGER]), HOME[2]];
  const c = home({ parts, recs: BOTH_RECS, find: findTv, tv: () => aired('2025-06-01') });
  assert.deepStrictEqual(titlesOf(c.home[0]), [MOVIES_ROW, REC_MOVIES, REC_SERIES, TOP_ROW]);
});

test('recs rows first without now watching', () => {
  const parts = [HOME[2], part('Популярные фильмы', 'api/v2.2/films/collections?type=POPULAR', [INTERSTELLAR])];
  const c = home({ parts, recs: BOTH_RECS });
  assert.deepStrictEqual(titlesOf(c.home[0]), [REC_MOVIES, REC_SERIES, TOP_ROW, 'Популярные фильмы']);
});

test('recs row capped at 40, pages counted', () => {
  const list = Array.from({ length: 50 }, (_, i) => recMovie(i + 1));
  const c = home({ recs: list });
  const r = row(c, REC_MOVIES);
  assert.deepStrictEqual(recIds(r), list.map((e) => e.id).reverse().slice(0, 40));
  assert.deepStrictEqual([r.total_pages, r.page], [3, 1]);
});

test('recs tv more opens core screen', () => {
  const c = home({ recs: BOTH_RECS });
  const tv = c.raw[0].find((p) => p.title === REC_SERIES);
  tv.params.emit.onlyMore();
  assert.deepStrictEqual(c.routes, [['recomend', { media: 'tv', total_pages: 1 }]]);
});

test('main waits for history pass', () => {
  const c = home({ history: [KP_FIGHT], find: findByImdb, defer: true, recs: [recMovie(1), recMovie(550)] });
  assert.strictEqual(c.home.length, 0);
  c.late.shift()();
  assert.strictEqual(c.home.length, 1);
  assert.deepStrictEqual(recIds(row(c, REC_MOVIES)), [1]);
  assert.strictEqual(row(c, REC_MOVIES).title, REC_MOVIES);
  assert.ok(!warnedWith(c, MAIN_WARN), JSON.stringify(c.warn));
});

test('two mains wait for one pass', () => {
  // Без сериалов в ряду: третья Главная иначе ждёт отложенный поиск сезона запомненного сериала.
  const parts = [HOME[0], part(SERIES_ROW, SERIES_URL, [AVATAR]), HOME[2]];
  const c = home({ parts, history: [KP_FIGHT], find: findByImdb, defer: true, recs: [recMovie(1), recMovie(550)] });
  const second = c.main();
  assert.deepStrictEqual([c.home.length, second.length], [0, 0]);
  c.late.shift()();
  assert.deepStrictEqual([c.home.length, second.length], [1, 1]);
  assert.deepStrictEqual(recIds(second[0].find((p) => p.title === REC_MOVIES)), [1]);
  assert.strictEqual(c.main().length, 1);
});

test('main not delayed after pass', () => {
  const c = home({ history: [KP_FIGHT], find: findByImdb, recs: [recMovie(1), recMovie(550)] });
  assert.strictEqual(c.home.length, 1);
  assert.deepStrictEqual(recIds(row(c, REC_MOVIES)), [1]);
  assert.deepStrictEqual(c.timers, []);
});

test('recs incomplete after deadline', () => {
  const c = home({ history: [KP_FIGHT], find: findByImdb, defer: true, recs: BOTH_RECS.concat([recMovie(550)]) });
  assert.strictEqual(c.home.length, 0);
  c.fireMs(5000);
  assert.strictEqual(c.home.length, 1);
  assert.strictEqual(row(c, REC_MOVIES).title, REC_MOVIES + ' · неполный');
  assert.strictEqual(row(c, REC_SERIES).title, REC_SERIES + ' · неполный');
  assert.deepStrictEqual(recIds(row(c, REC_MOVIES)), [550, 1]);
  assert.ok(warnedWith(c, MAIN_WARN), JSON.stringify(c.warn));
});

test('no tv recs warns', () => {
  const c = home({ recs: [recMovie(1)] });
  assert.deepStrictEqual(titlesOf(c.home[0]), [MOVIES_ROW, SERIES_ROW, REC_MOVIES, TOP_ROW]);
  assert.ok(warnedWith(c, 'kp-reactions-fix: no recommendations', 'tv'), JSON.stringify(c.warn));
  assert.ok(!warnedWith(c, 'kp-reactions-fix: no recommendations', 'movie'), JSON.stringify(c.warn));
});

test('missing recomends get fails visibly', () => {
  const cases = [
    [['Recomends'], ['Lampa.Recomends.get']],
    [['Recomends.get'], ['Lampa.Recomends.get']],
    [['Recomends.page'], ['Lampa.Recomends.page']],
    [['Router', 'Arrays'], ['Lampa.Router.call', 'Lampa.Arrays.shuffle']],
  ];
  for (const [drop, missing] of cases) {
    const c = home({ drop, recs: BOTH_RECS });
    assert.deepStrictEqual(titlesOf(c.home[0]), [MOVIES_ROW, SERIES_ROW, TOP_ROW], drop.join());
    assert.deepStrictEqual(names(row(c, MOVIES_ROW)), [AVATAR.title, ZOOTOPIA.title], drop.join());
    assert.strictEqual(c.noty.length, 1, drop.join());
    assert.ok(c.noty[0].includes('Ряды рекомендаций не построены'), c.noty[0]);
    assert.strictEqual(c.error.length, 1, drop.join());
    for (const m of missing) {
      assert.ok(c.noty[0].includes(m), c.noty[0]);
      assert.ok(c.error[0].join(' ').includes(m), JSON.stringify(c.error));
    }
  }
});

// --- Отдельные списки фильмов и сериалов (spec kp-main-recommendations) ---

const movies = (from, n) => Array.from({ length: n }, (_, i) => recMovie(from + i));
const shows = (from, n) => Array.from({ length: n }, (_, i) => recShow(from + i));
const range = (from, n) => Array.from({ length: n }, (_, i) => from + i);
const idsOf = (c, key) => plain(c.store[key]).map((e) => e.id);
const coreWrite = (c, list) => c.ctx.Lampa.Storage.set('recomends_list', list);
const recIdsOf = (list) => plain(list).map((e) => e.id);

test('recs lists keep movies when core writes series', () => {
  const c = recs({ recsMovie: movies(1, 30) });
  coreWrite(c, shows(1001, 100));
  assert.deepStrictEqual(idsOf(c, 'kp_recs_movie'), range(1, 30));
  assert.deepStrictEqual(idsOf(c, 'kp_recs_tv'), range(1001, 100));
  assert.strictEqual(c.ctx.Lampa.Recomends.get('movie').length, 30);
});

test('recs list capped at 500 per type', () => {
  const c = recs({ recsMovie: movies(1, 490) });
  coreWrite(c, movies(1001, 20));
  assert.deepStrictEqual(idsOf(c, 'kp_recs_movie'), range(11, 480).concat(range(1001, 20)));
});

test('recs list not saved warns', () => {
  const c = recs({ quota: ['kp_recs_movie'], recs: movies(1, 3).concat(shows(1001, 2)) });
  assert.deepStrictEqual(idsOf(c, 'kp_recs_tv'), [1001, 1002]);
  assertWarned(c, RECS_WARN + ' kp_recs_movie not saved', 'QuotaExceededError');
});

test('recs repeated title moves to end', () => {
  const c = recs({ recsMovie: [recMovie(550), recMovie(1), recMovie(2)] });
  coreWrite(c, [recMovie(3), recMovie(550)]);
  assert.deepStrictEqual(idsOf(c, 'kp_recs_movie'), [1, 2, 3, 550]);
});

test('recs lists seeded from core list', () => {
  const c = recs({ recs: movies(1, 3).concat(shows(1001, 100), movies(4, 12)) });
  assert.deepStrictEqual(idsOf(c, 'kp_recs_movie'), range(1, 15));
  assert.deepStrictEqual(idsOf(c, 'kp_recs_tv'), range(1001, 100));
  assert.deepStrictEqual(c.warn, []);
});

test('recs lists merged on restart', () => {
  const c = recs({ recsMovie: movies(1, 30), recs: movies(101, 10) });
  assert.deepStrictEqual(idsOf(c, 'kp_recs_movie'), range(1, 30).concat(range(101, 10)));
});

test('recs broken stored list warns', () => {
  const c = recs({ recsMovie: 'строка', recsTv: [{ title: 'без id' }], recs: movies(1, 5).concat(shows(1001, 3)) });
  assert.deepStrictEqual(idsOf(c, 'kp_recs_movie'), range(1, 5));
  assert.deepStrictEqual(idsOf(c, 'kp_recs_tv'), range(1001, 3));
  assert.strictEqual(c.warn.length, 2, JSON.stringify(c.warn));
  assert.ok(warnedWith(c, RECS_WARN, 'bad kp_recs_movie') && warnedWith(c, RECS_WARN, 'bad kp_recs_tv'), JSON.stringify(c.warn));
});

test('recs get drops watched', () => {
  const history = [
    { id: 550, source: 'tmdb', title: 'Фильм 550' },
    { id: 553, source: 'tmdb', name: 'Сериал 553', number_of_seasons: 1 },
    KP_FIGHT,
  ];
  const find = () => ({ movie_results: [{ id: 551 }], tv_results: [] });
  const c = recs({ history, find, recsMovie: [recMovie(550), recMovie(551), recMovie(552)], recsTv: [recShow(553), recShow(554)] });
  const R = c.ctx.Lampa.Recomends;
  assert.deepStrictEqual(recIdsOf(R.get('movie')), [552]);
  assert.deepStrictEqual(recIdsOf(R.get()), [552]);
  assert.deepStrictEqual(recIdsOf(R.get('tv')), [554]);
});

test('recs get keeps other type with watched id', () => {
  const c = recs({ history: [{ id: 550, source: 'tmdb', title: 'Фильм 550' }], recsTv: [recShow(550)] });
  assert.deepStrictEqual(recIdsOf(c.ctx.Lampa.Recomends.get('tv')), [550]);
});

test('recs page slices list', () => {
  const c = recs({ recsMovie: movies(1, 30) });
  const R = c.ctx.Lampa.Recomends;
  assert.strictEqual(R.get.__kp_split, true);
  const got = [];
  const empty = [];
  for (const page of [1, 2, 3]) R.page({ media: 'movie', page }, (data) => got.push(plain(data)), (e) => empty.push(plain(e)));
  assert.deepStrictEqual(got.map((d) => d.results.map((e) => e.id)), [range(11, 20).reverse(), range(1, 10).reverse()]);
  assert.deepStrictEqual(got.map((d) => [d.total_pages, d.page, d.title]), [[2, 1, 'title_recomend_watch'], [2, 2, 'title_recomend_watch']]);
  assert.deepStrictEqual(empty, [{ status: 404 }]);
});

// --- DMCA-список CUB не действует (spec tmdb-access, design.md disable-dmca-block) ---

test('dmca list before and after start reads false', () => {
  const c = load();
  assert.strictEqual(c.ctx.lampa_settings.dcma, false);
  c.ctx.lampa_settings.dcma = [DMCA_ENTRY];
  assert.strictEqual(c.ctx.lampa_settings.dcma, false);
  assert.deepStrictEqual(c.noty, []);
  assert.deepStrictEqual(c.error, []);
});

test('dmca not disabled: noty and error', () => {
  for (const settings of [Object.freeze({ dcma: [DMCA_ENTRY] }), null]) {
    const c = load({ settings });
    const noty = c.noty.filter((t) => t.startsWith('DMCA-блокировка не отключена'));
    assert.strictEqual(noty.length, 1, JSON.stringify(c.noty));
    const errors = c.error.filter((args) => args[0] === 'kp-reactions-fix: DMCA block not disabled');
    assert.strictEqual(errors.length, 1, JSON.stringify(c.error));
    assert.strictEqual(c.ctx.Lampa.Api.sources.KP.__reactions_patched, true);
  }
});
