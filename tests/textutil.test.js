import test from 'node:test';
import assert from 'node:assert/strict';
import {firstLine, noteTitle, selectionRows, lineBounds, shiftLines, indentBefore, moveLines, enterEdit} from '../own/sticky-notes/textutil.js';

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

test('lineBounds finds the line around a position', () => {
    const text = 'one\ntwo words\nthree';
    assert.deepEqual(lineBounds(text, 5), {start: 4, end: 13});   // inside "two words"
    assert.deepEqual(lineBounds(text, 0), {start: 0, end: 3});
    assert.deepEqual(lineBounds(text, 3), {start: 0, end: 3});    // end of line 1
    assert.deepEqual(lineBounds(text, 14), {start: 14, end: 19}); // start of last line
});

test('lineBounds: -1 and out-of-range mean the end of the text', () => {
    assert.deepEqual(lineBounds('ab\ncd', -1), {start: 3, end: 5});
    assert.deepEqual(lineBounds('ab\ncd', 99), {start: 3, end: 5});
    assert.deepEqual(lineBounds('', -1), {start: 0, end: 0});
});

test('lineBounds counts characters, not UTF-16 units', () => {
    assert.deepEqual(lineBounds('a🙂b\nc', 1), {start: 0, end: 3});
});

test('shiftLines indents the caret line and moves the caret with it', () => {
    assert.deepEqual(shiftLines('one\ntwo', 5, 5), {text: 'one\n\ttwo', start: 6, end: 6});
});

test('shiftLines indents every line a selection touches', () => {
    const r = shiftLines('a\nb\nc\nd', 2, 5); // selects "b\nc"
    assert.equal(r.text, 'a\n\tb\n\tc\nd');
    assert.deepEqual([r.start, r.end], [3, 7]);
});

test('a selection ending just after a newline does not indent the next line', () => {
    assert.equal(shiftLines('a\nb\nc', 0, 4).text, '\ta\n\tb\nc'); // "a\nb\n" selected
});

test('shiftLines outdent removes one tab or up to four spaces', () => {
    assert.equal(shiftLines('\tone', 2, 2, true).text, 'one');
    assert.equal(shiftLines('      two', 0, 0, true).text, '  two');
    assert.equal(shiftLines('  x', 0, 0, true).text, 'x');
    assert.equal(shiftLines('plain', 0, 0, true).text, 'plain'); // nothing to remove
});

test('outdent never moves the selection before its line', () => {
    const r = shiftLines('\tab', 0, 0, true);
    assert.deepEqual([r.text, r.start, r.end], ['ab', 0, 0]);
});

test('shiftLines handles non-BMP characters', () => {
    assert.equal(shiftLines('🙂a\n🙂b', 0, 4).text, '\t🙂a\n\t🙂b');
});

test('indentBefore returns the leading whitespace of the caret line', () => {
    assert.equal(indentBefore('\t  hello', 9), '\t  ');
    assert.equal(indentBefore('a\n    b', 7), '    ');
    assert.equal(indentBefore('plain', 3), '');
    assert.equal(indentBefore('', -1), '');
});

test('indentBefore stops at the caret when it is inside the indent', () => {
    assert.equal(indentBefore('      x', 2), '  ');
});

test('moveLines moves a line up and keeps the caret on it', () => {
    const r = moveLines('one\ntwo\nthree', 5, 5, -1); // caret in "two"
    assert.deepEqual(r, {text: 'two\none\nthree', start: 1, end: 1});
});

test('moveLines moves a line down', () => {
    const r = moveLines('one\ntwo\nthree', 1, 1, 1); // caret in "one"
    assert.deepEqual(r, {text: 'two\none\nthree', start: 5, end: 5});
});

test('moveLines moves every line a selection touches', () => {
    const r = moveLines('a\nb\nc\nd', 2, 5, -1); // "b\nc" up past "a"
    assert.equal(r.text, 'b\nc\na\nd');
    assert.deepEqual([r.start, r.end], [0, 3]);
});

test('moveLines does nothing at the edges', () => {
    assert.equal(moveLines('one\ntwo', 0, 0, -1), null);
    assert.equal(moveLines('one\ntwo', 5, 5, 1), null);
    assert.equal(moveLines('single', 2, 2, -1), null);
});

test('moveLines handles non-BMP characters', () => {
    assert.equal(moveLines('🙂\nb', 3, 3, -1).text, 'b\n🙂');
});


test('enterEdit carries the indent of the line onto the new line', () => {
    assert.deepEqual(enterEdit('    item', 8), {remove: null, at: 8, insert: '\n    ', caret: 13});
    assert.deepEqual(enterEdit('plain', 5), {remove: null, at: 5, insert: '\n', caret: 6});
});

test('enterEdit in the middle of a line splits it and indents the rest', () => {
    assert.deepEqual(enterEdit('  ab cd', 5), {remove: null, at: 5, insert: '\n  ', caret: 8});
});

test('enterEdit on a line that is only an indent clears it', () => {
    assert.deepEqual(enterEdit('a\n    ', 6), {remove: [2, 6], at: 2, insert: '\n', caret: 3});
});

test('enterEdit on an empty line adds nothing', () => {
    assert.deepEqual(enterEdit('a\n', 2), {remove: null, at: 2, insert: '\n', caret: 3});
});

test('enterEdit: -1 means the end of the text', () => {
    assert.deepEqual(enterEdit('  x', -1), {remove: null, at: 3, insert: '\n  ', caret: 6});
});
