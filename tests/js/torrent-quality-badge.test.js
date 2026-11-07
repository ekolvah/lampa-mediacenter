'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const {
  focusTarget, lineSupported, gridSupported, gridShortage, flushMisses, applyVerdict, refill, onActivity, LINE, GRID,
} = require(path.join(__dirname, '..', '..', 'plugins', 'torrent-quality-badge.js'));

// Индексы — в ряду до удаления: удаляется элемент `index` из `count`.
test('focusTarget picks next', () => {
  assert.strictEqual(focusTarget(2, 5), 3);
});

test('focusTarget falls back to previous', () => {
  assert.strictEqual(focusTarget(4, 5), 3);
});

test('focusTarget none in empty row', () => {
  assert.strictEqual(focusTarget(0, 1), -1);
});

// Всё, что removeMisses/removeItem берут у ряда; без любого из них — серый fallback (§IV).
function fullLine() {
  return { items: [], data: { results: [] }, emit() {}, scroll: { render() {} }, torrent_badge_kind: LINE };
}

test('lineSupported accepts full row', () => {
  assert.strictEqual(lineSupported(fullLine()), true);
});

test('lineSupported rejects row missing any member', () => {
  const drops = {
    items: (l) => { delete l.items; },
    results: (l) => { delete l.data.results; },
    data: (l) => { delete l.data; },
    emit: (l) => { delete l.emit; },
    scroll: (l) => { delete l.scroll; },
    'scroll.render': (l) => { delete l.scroll.render; },
  };
  for (const [name, drop] of Object.entries(drops)) {
    const line = fullLine();
    drop(line);
    assert.strictEqual(lineSupported(line), false, name);
  }
  assert.strictEqual(lineSupported(null), false, 'null');
});

// §IV: снятие карточек упало — ERROR в консоль и серая метка на каждой отложенной.
test('flushMisses falls back to badge on failure', (t) => {
  global.Lampa = {
    Storage: { get: (_key, def) => def },
    Controller: { own() { throw new Error('boom'); } },
  };
  t.after(() => { delete global.Lampa; });
  const errors = t.mock.method(console, 'error', () => {});
  const badged = [];
  const item = (name) => ({ render: (js) => { if (js) badged.push(name); return null; } });
  flushMisses(fullLine(), [item('a'), item('b')]);
  assert.strictEqual(errors.mock.callCount(), 1);
  assert.deepStrictEqual(badged, ['a', 'b']);
});

// Метка на уже уничтоженной карточке бросает — остальные всё равно метятся, каждый сбой в ERROR.
test('flushMisses badges rest when one badge throws', (t) => {
  global.Lampa = {
    Storage: { get: (_key, def) => def },
    Controller: { own() { throw new Error('boom'); } },
  };
  t.after(() => { delete global.Lampa; });
  const errors = t.mock.method(console, 'error', () => {});
  const badged = [];
  const destroyed = { render() { throw new Error('destroyed'); } };
  const alive = { render: (js) => { if (js) badged.push('b'); return null; } };
  flushMisses(fullLine(), [destroyed, alive]);
  assert.strictEqual(errors.mock.callCount(), 2);
  assert.deepStrictEqual(badged, ['b']);
});

// --- Общие дубли для прохода снятия ---

// Карточка: render(true) — корень с .card__view; серая метка видна по классу и счётчику.
function card(name) {
  const root = { name, classes: new Set(), badges: 0 };
  const view = { appendChild() { root.badges += 1; } };
  root.querySelector = (sel) => {
    if (sel === '.card__view') return view;
    return root.badges ? {} : null;
  };
  root.classList = { add: (c) => root.classes.add(c) };
  return { name, data: { id: name }, render: () => root, destroy() { this.destroyed = true; } };
}

function grey(item) {
  return item.render().classes.has('card--quality-miss');
}

// Lampa: фильтр, кэш вердиктов (все — «есть раздачи»), контроллер с записью фокуса.
function lampa(t, { filter = {}, own = false } = {}) {
  const calls = { filterReads: 0, cacheReads: 0, focus: [] };
  global.Lampa = {
    Storage: {
      get(key, def) {
        if (key === 'torrents_filter') { calls.filterReads += 1; return filter; }
        return def;
      },
      cache() {
        calls.cacheReads += 1;
        return new Proxy({}, { get: () => ({ ts: Date.now(), miss: false }) });
      },
      set() {},
    },
    Controller: {
      own: () => own,
      collectionSet() {},
      collectionFocus(target) { calls.focus.push(target); },
    },
  };
  global.document = { createElement: () => ({ appendChild() {} }), body: { contains: () => true } };
  t.after(() => { delete global.Lampa; delete global.document; });
  return calls;
}

const tick = () => new Promise((resolve) => { setImmediate(resolve); });

// --- Проход по ряду: характеристика до рефакторинга (design 3) ---

function rowWith(names) {
  const line = fullLine();
  const cards = names.map(card);
  const more = { render: () => ({ more: true }), destroy() {} };
  line.items = cards.concat([more]);
  line.data.results = cards.map((c) => c.data);
  return { line, cards, more };
}

test('row pass removes card from results and items', (t) => {
  lampa(t);
  const errors = t.mock.method(console, 'error', () => {});
  const { line, cards, more } = rowWith(['a', 'b', 'c']);
  flushMisses(line, [cards[1]]);
  assert.deepStrictEqual(line.items, [cards[0], cards[2], more]);
  assert.deepStrictEqual(line.data.results, [cards[0].data, cards[2].data]);
  assert.strictEqual(cards[1].destroyed, true);
  assert.strictEqual(errors.mock.callCount(), 0);
});

test('row pass moves focus to neighbour', (t) => {
  const calls = lampa(t, { own: true });
  const errors = t.mock.method(console, 'error', () => {});
  const { line, cards } = rowWith(['a', 'b', 'c']);
  line.last = cards[1].render(true);
  line.active = 1;
  flushMisses(line, [cards[1]]);
  assert.strictEqual(line.last, cards[2].render(true));
  assert.strictEqual(line.active, 1);
  assert.deepStrictEqual(calls.focus, [cards[2].render(true)]);
  assert.strictEqual(errors.mock.callCount(), 0);
});

// --- Сетка категории ---

// Всё, что проход и добор берут у сетки (src/interaction/items/category/module/
// items.js, next.js). `scroll` подаёт кусок из loaded, `loadNext` — с защитой 1000 мс.
function fullGrid({ count = 0, totalPages = 1, builded = 0 } = {}) {
  const grid = {
    items: [], pages: {}, last: null, active: 0, loaded: [],
    object: { page: 1 }, total_pages: totalPages, builded_time: builded,
    params: { items: { cols: 6 } },
    events: [], modules: [],
    torrent_badge_kind: GRID,
    use(module) { this.modules.push(module); },
    emit(name) {
      this.events.push(name);
      if (name === 'scroll' && this.loaded.length) this.loaded.shift().forEach((c) => this.add(c));
      if (name === 'loadNext' && this.builded_time < Date.now() - 1000 && this.object.page < this.total_pages) {
        this.object.page += 1;
      }
    },
    add(item) {
      this.items.push(item);
      const page = Math.ceil(this.items.length / 60);
      if (!this.pages[page]) this.pages[page] = { items: [] };
      this.pages[page].items.push(item);
    },
    scroll: { render() { return 'html'; } },
  };
  for (let i = 0; i < count; i += 1) grid.add(card(`c${i}`));
  return grid;
}

function inPages(grid, item) {
  return Object.values(grid.pages).some((p) => p.items.includes(item));
}

test('gridSupported accepts full grid', () => {
  assert.strictEqual(gridSupported(fullGrid()), true);
});

test('gridSupported rejects grid missing any member', () => {
  const drops = {
    items: (g) => { delete g.items; },
    pages: (g) => { delete g.pages; },
    loaded: (g) => { delete g.loaded; },
    emit: (g) => { delete g.emit; },
    scroll: (g) => { delete g.scroll; },
    'scroll.render': (g) => { delete g.scroll.render; },
    object: (g) => { delete g.object; },
    'object.page': (g) => { delete g.object.page; },
    total_pages: (g) => { delete g.total_pages; },
    builded_time: (g) => { delete g.builded_time; },
    'params.items.cols': (g) => { delete g.params.items.cols; },
  };
  for (const [name, drop] of Object.entries(drops)) {
    const grid = fullGrid();
    drop(grid);
    assert.strictEqual(gridSupported(grid), false, name);
  }
  assert.strictEqual(gridSupported(null), false, 'null');
});

test('gridShortage counts from active row start', () => {
  assert.strictEqual(gridShortage(17, 6, 6), true);
  assert.strictEqual(gridShortage(18, 11, 6), false);
  assert.strictEqual(gridShortage(17, 11, 6), true);
});

test('gridShortage false with two full rows', () => {
  assert.strictEqual(gridShortage(12, 5, 6), false);
  assert.strictEqual(gridShortage(11, 0, 6), true);
});

test('grid pass removes card from items and pages', (t) => {
  lampa(t);
  const grid = fullGrid({ count: 13 });
  const gone = grid.items[3];
  flushMisses(grid, [gone]);
  assert.strictEqual(grid.items.includes(gone), false);
  assert.strictEqual(inPages(grid, gone), false);
  assert.strictEqual(gone.destroyed, true);
  assert.strictEqual(grid.items.length, 12);
});

test('grid pass moves last and active to neighbour', (t) => {
  const calls = lampa(t, { own: true });
  const grid = fullGrid({ count: 14 });
  const [next, prev] = [grid.items[4], grid.items[12]];
  grid.last = grid.items[3].render(true);
  grid.active = 3;
  flushMisses(grid, [grid.items[3]]);
  assert.strictEqual(grid.last, next.render(true));
  assert.strictEqual(grid.active, 3);
  grid.last = grid.items[12].render(true);
  grid.active = 12;
  flushMisses(grid, [grid.items[12]]);
  assert.strictEqual(grid.last, prev.render(true));
  assert.strictEqual(grid.active, 11);
  assert.deepStrictEqual(calls.focus, [next.render(true), prev.render(true)]);
});

test('grid pass keeps last card grey', (t) => {
  lampa(t, { filter: { quality: ['4k'] } });
  const grid = fullGrid({ count: 2 });
  const [first, second] = grid.items;
  flushMisses(grid, [first, second]);
  assert.deepStrictEqual(grid.items, [second]);
  assert.strictEqual(first.destroyed, true);
  assert.strictEqual(grey(second), true);
  assert.strictEqual(grid.torrent_badge_held, second);
});

test('applyVerdict without kind greys and warns once', async (t) => {
  lampa(t, { filter: { quality: ['4k'] } });
  const warns = t.mock.method(console, 'warn', () => {});
  const owner = {};
  const [a, b] = [card('a'), card('b')];
  applyVerdict(owner, a, true);
  applyVerdict(owner, b, true);
  await tick();
  assert.strictEqual(grey(a), true);
  assert.strictEqual(grey(b), true);
  assert.strictEqual(warns.mock.callCount(), 1);
});

function initEvent(component, comp, type = 'init') {
  return { type, component, object: { activity: { component: comp } } };
}

test('activity attaches only to category_full init', (t) => {
  lampa(t);
  const grid = fullGrid();
  delete grid.torrent_badge_kind;
  onActivity(initEvent('category_full', grid, 'create'));
  onActivity(initEvent('favorite', grid));
  assert.strictEqual(grid.modules.length, 0);
  assert.strictEqual(grid.torrent_badge_kind, undefined);
  onActivity(initEvent('category_full', grid));
  assert.strictEqual(grid.modules.length, 1);
  assert.strictEqual(grid.torrent_badge_kind, GRID);
});

test('activity warns once without use', (t) => {
  lampa(t);
  const warns = t.mock.method(console, 'warn', () => {});
  const comp = {};
  onActivity(initEvent('category_full', comp));
  onActivity(initEvent('category_full', comp));
  assert.strictEqual(warns.mock.callCount(), 1);
  assert.strictEqual(comp.torrent_badge_kind, undefined);
});

// Подключённый модуль сетки: onAppend зовётся Emit'ом с this = сетка, после Items.onAppend.
function attached(grid) {
  onActivity(initEvent('category_full', grid));
  const module = grid.modules[0];
  return (item) => { grid.add(item); module.onAppend.call(grid, item); };
}

test('grid appends batched into one onLineEvent', async (t) => {
  const calls = lampa(t, { filter: { quality: ['4k'] } });
  const grid = fullGrid();
  const append = attached(grid);
  ['x', 'y', 'z'].forEach((n) => append(card(n)));
  assert.strictEqual(calls.filterReads, 0);
  await tick();
  assert.strictEqual(calls.filterReads, 1);
  assert.strictEqual(calls.cacheReads, 3);
});

test('grid append with filter off enqueues nothing and loads no page', async (t) => {
  const calls = lampa(t);
  const grid = fullGrid({ totalPages: 5 });
  const append = attached(grid);
  append(card('q'));
  await tick();
  assert.strictEqual(calls.cacheReads, 0);
  assert.strictEqual(grid.events.includes('loadNext'), false);
});

test('grid held card resubmitted on next append', async (t) => {
  lampa(t, { filter: { quality: ['4k'] } });
  const grid = fullGrid({ count: 1 });
  const append = attached(grid);
  const held = grid.items[0];
  flushMisses(grid, [held]);
  assert.strictEqual(grid.torrent_badge_held, held);
  const fresh = card('fresh');
  append(fresh);
  await tick();
  assert.deepStrictEqual(grid.items, [fresh]);
  assert.strictEqual(held.destroyed, true);
});

test('grid refill feeds loaded then loadNext', (t) => {
  lampa(t);
  const grid = fullGrid({ count: 6, totalPages: 3 });
  grid.loaded = [[card('l1')], [card('l2')]];
  refill(grid);
  assert.deepStrictEqual(grid.events, ['scroll', 'scroll', 'loadNext']);
  assert.strictEqual(grid.items.length, 8);
  assert.strictEqual(grid.object.page, 2);
});

test('grid refill waits out loadNext guard', (t) => {
  lampa(t);
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 10000 });
  const grid = fullGrid({ count: 6, totalPages: 3, builded: 10000 });
  refill(grid);
  refill(grid);
  assert.strictEqual(grid.object.page, 1);
  t.mock.timers.tick(1001);
  assert.strictEqual(grid.object.page, 2);
  assert.deepStrictEqual(grid.events, ['loadNext', 'loadNext', 'loadNext']);
});

test('grid refill stops at auto page limit', (t) => {
  lampa(t);
  const grid = fullGrid({ count: 6, totalPages: 10 });
  for (let i = 0; i < 5; i += 1) refill(grid);
  assert.strictEqual(grid.object.page, 4);
  assert.strictEqual(grid.events.filter((e) => e === 'loadNext').length, 3);
});
