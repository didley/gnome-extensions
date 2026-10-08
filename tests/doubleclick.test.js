import test from 'node:test';
import assert from 'node:assert/strict';
import {DoubleClick} from '../own/sticky-notes/doubleclick.js';

test('two quick presses are a double click', () => {
    const d = new DoubleClick(300);
    assert.equal(d.press(1000), false);
    assert.equal(d.press(1200), true);
});

test('slow presses are not', () => {
    const d = new DoubleClick(300);
    assert.equal(d.press(1000), false);
    assert.equal(d.press(1400), false);
});

test('a third quick press starts a new pair', () => {
    const d = new DoubleClick(300);
    d.press(1000);
    assert.equal(d.press(1100), true);
    assert.equal(d.press(1200), false);
    assert.equal(d.press(1300), true);
});

test('the very first press is never a double click', () => {
    assert.equal(new DoubleClick().press(0), false);
});
