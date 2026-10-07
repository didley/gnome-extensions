import test from 'node:test';
import assert from 'node:assert/strict';
import {clampPosition, clampSize, HEADER_H, MIN_W, MIN_H} from '../own/sticky-notes/geometry.js';

const monitor = {x: 0, y: 0, width: 1920, height: 1080};

test('positions inside the monitor are unchanged (rounded)', () => {
    assert.deepEqual(clampPosition(100.4, 200.6, 220, monitor), {x: 100, y: 201});
});

test('a note cannot be dragged fully off any edge', () => {
    assert.equal(clampPosition(5000, 0, 220, monitor).x, 1920 - 60);
    assert.equal(clampPosition(-5000, 0, 220, monitor).x, -220 + 60);
    assert.equal(clampPosition(0, -50, 220, monitor).y, 0);
    assert.equal(clampPosition(0, 5000, 220, monitor).y, 1080 - HEADER_H);
});

test('clamping respects a monitor that does not start at the origin', () => {
    const second = {x: 1920, y: 0, width: 1280, height: 720};
    assert.equal(clampPosition(0, 0, 200, second).x, 1920 - 200 + 60);
});

test('sizes have a minimum', () => {
    assert.deepEqual(clampSize(10, 10), {w: MIN_W, h: MIN_H});
    assert.deepEqual(clampSize(300.4, 250.6), {w: 300, h: 251});
});
