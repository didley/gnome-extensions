import test from 'node:test';
import assert from 'node:assert/strict';
import {History} from '../extensions/sticky-notes/history.js';

test('nothing to undo or redo initially', () => {
    const h = new History('a');
    assert.equal(h.canUndo, false);
    assert.equal(h.canRedo, false);
    assert.equal(h.undo('a'), null);
    assert.equal(h.redo('a'), null);
});

test('rapid typing is one undo step', () => {
    const h = new History('');
    h.record('h', 1000);
    h.record('he', 1100);
    h.record('hel', 1200);
    assert.equal(h.undo('hel'), '');
    assert.equal(h.canUndo, false);
});

test('a pause starts a new undo step', () => {
    const h = new History('');
    h.record('one', 1000);
    h.record('one two', 3000); // > 800 ms later
    assert.equal(h.undo('one two'), 'one');
    assert.equal(h.undo('one'), '');
});

test('redo restores what undo removed', () => {
    const h = new History('');
    h.record('one', 1000);
    h.record('one two', 3000);
    assert.equal(h.undo('one two'), 'one');
    assert.equal(h.canRedo, true);
    assert.equal(h.redo('one'), 'one two');
    assert.equal(h.canRedo, false);
});

test('a new edit clears redo', () => {
    const h = new History('');
    h.record('a', 1000);
    h.undo('a');
    h.record('b', 5000);
    assert.equal(h.canRedo, false);
});

test('the edit after an undo starts a fresh step even if it is quick', () => {
    const h = new History('');
    h.record('one', 1000);
    h.record('one two', 3000);
    h.undo('one two');          // text is now 'one'
    h.record('one x', 3010);    // 10 ms later: must still be its own step
    assert.equal(h.undo('one x'), 'one');
});

test('history is capped', () => {
    const h = new History('', {limit: 3});
    for (let i = 1; i <= 10; i++) h.record(String(i), i * 10_000);
    let steps = 0;
    let current = '10';
    for (let t = h.undo(current); t !== null; t = h.undo(current)) {
        current = t;
        steps++;
    }
    assert.equal(steps, 3);
});
