import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeNote, newNoteRecord} from '../extensions/sticky-notes/model.js';

const monitor = {x: 0, y: 0, width: 1920, height: 1080};

test('normalizeNote fills in defaults for a bare record', () => {
    const n = normalizeNote({}, 7, monitor);
    assert.deepEqual(n, {
        id: 7, text: '', color: 'Yellow', x: 100, y: 100, w: 220, h: 200,
        collapsed: false, minimized: false,
    });
});

test('normalizeNote keeps valid values and drops junk', () => {
    const n = normalizeNote({id: 3, text: 'hi', color: 'Pink', x: 5, y: 6, w: 300, h: 150,
        collapsed: 1, minimized: 'yes', extra: 'ignored'}, 9, monitor);
    assert.equal(n.id, 3);
    assert.equal(n.text, 'hi');
    assert.equal(n.color, 'Pink');
    assert.equal(n.collapsed, true);
    assert.equal(n.minimized, true);
    assert.equal('extra' in n, false);
});

test('normalizeNote survives non-numeric and null input', () => {
    const n = normalizeNote({x: 'left', w: NaN, text: 42}, 1, monitor);
    assert.equal(n.x, 100);
    assert.equal(n.w, 220);
    assert.equal(n.text, '');
    assert.equal(normalizeNote(null, 2, monitor).id, 2);
});

test('a new note starts top-centre, empty and yellow', () => {
    const n = newNoteRecord(monitor);
    assert.equal(n.text, '');
    assert.equal(n.color, 'Yellow');
    assert.equal(n.x, 960 - 110);
    assert.equal(n.y, 80);
});

test('a note created from another is offset and shares its colour', () => {
    const n = newNoteRecord(monitor, {x: 500, y: 300, color: 'Blue'});
    assert.deepEqual([n.x, n.y, n.color], [528, 328, 'Blue']);
});
