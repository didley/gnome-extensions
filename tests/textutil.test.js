import test from 'node:test';
import assert from 'node:assert/strict';
import {firstLine, noteTitle, selectionRows} from '../extensions/sticky-notes/textutil.js';

test('firstLine skips blank lines and trims', () => {
    assert.equal(firstLine('\n  \n  hello world  \nsecond'), 'hello world');
    assert.equal(firstLine(''), '');
    assert.equal(firstLine(undefined), '');
    assert.equal(firstLine('   \n\t'), '');
});

test('noteTitle labels empty notes', () => {
    assert.equal(noteTitle(''), 'Empty note');
    assert.equal(noteTitle('  \n '), 'Empty note');
});

test('noteTitle truncates long first lines with an ellipsis', () => {
    const title = noteTitle('x'.repeat(100));
    assert.equal(title.length, 32);
    assert.ok(title.endsWith('…'));
    assert.equal(noteTitle('short'), 'short');
});

test('selectionRows: a single line becomes one rectangle', () => {
    const points = [0, 7, 14, 21].map(x => ({x, y: 0, h: 16}));
    assert.deepEqual(selectionRows(points), [{x1: 0, x2: 21, y: 0, h: 16}]);
});

test('selectionRows: a selection across lines gives one rectangle per line', () => {
    const points = [
        {x: 30, y: 0, h: 16}, {x: 37, y: 0, h: 16}, {x: 44, y: 0, h: 16},
        {x: 0, y: 16, h: 16}, {x: 7, y: 16, h: 16},
    ];
    const rows = selectionRows(points);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].x1, 30);
    assert.ok(rows[0].x2 > 44, 'first line runs on to its end');
    assert.deepEqual(rows[1], {x1: 0, x2: 7, y: 16, h: 16});
});

test('selectionRows: an empty selection draws nothing', () => {
    assert.deepEqual(selectionRows([{x: 10, y: 0, h: 16}]), []);
    assert.deepEqual(selectionRows([]), []);
});
