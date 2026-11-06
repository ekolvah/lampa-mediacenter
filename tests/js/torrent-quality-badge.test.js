'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const { focusTarget, lineSupported } = require(path.join(__dirname, '..', '..', 'plugins', 'torrent-quality-badge.js'));

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
