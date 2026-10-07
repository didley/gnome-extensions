import test from 'node:test';
import assert from 'node:assert/strict';
import {COLORS, DEFAULT_COLOR, colorPair, nextColor} from '../extensions/sticky-notes/colors.js';

test('the default colour exists and is the first one', () => {
    assert.equal(Object.keys(COLORS)[0], DEFAULT_COLOR);
});

test('nextColor cycles through every colour and wraps', () => {
    const names = Object.keys(COLORS);
    let name = names[0];
    const seen = [];
    for (let i = 0; i < names.length; i++) {
        seen.push(name);
        name = nextColor(name);
    }
    assert.deepEqual(seen, names);
    assert.equal(name, names[0]);
});

test('unknown colour names fall back to the default', () => {
    assert.deepEqual(colorPair('Chartreuse'), COLORS[DEFAULT_COLOR]);
    assert.equal(nextColor('Chartreuse'), Object.keys(COLORS)[0]);
});

test('every colour is a [body, header] pair of hex strings', () => {
    for (const pair of Object.values(COLORS)) {
        assert.equal(pair.length, 2);
        for (const c of pair) assert.match(c, /^#[0-9a-f]{6}$/);
    }
});
