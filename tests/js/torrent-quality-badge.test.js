'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const { focusTarget } = require(path.join(__dirname, '..', '..', 'plugins', 'torrent-quality-badge.js'));

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
