'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const { focusTarget, lineSupported, flushMisses } = require(path.join(__dirname, '..', '..', 'plugins', 'torrent-quality-badge.js'));

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
  return { items: [], data: { results: [] }, emit() {}, scroll: { render() {} } };
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
