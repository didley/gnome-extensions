// Undo/redo for a text field. Rapid typing is grouped into one undo step.
export class History {
    /**
     * @param {string} initial  starting text
     * @param {{groupMs?: number, limit?: number}} [opts]
     */
    constructor(initial = '', {groupMs = 800, limit = 200} = {}) {
        this._groupMs = groupMs;
        this._limit = limit;
        this._undo = [];
        this._redo = [];
        this._reset(initial);
    }

    get canUndo() { return this._undo.length > 0; }
    get canRedo() { return this._redo.length > 0; }

    /** Call after each user edit with the new text and the current time in ms. */
    record(text, nowMs) {
        if (nowMs - this._lastAt > this._groupMs || this._undo.length === 0)
            this._undo.push(this._last);
        if (this._undo.length > this._limit) this._undo.shift();
        this._redo = [];
        this._last = text;
        this._lastAt = nowMs;
    }

    /** @returns {string|null} the text to show, or null if there is nothing to undo */
    undo(current) {
        if (!this.canUndo) return null;
        this._redo.push(current);
        return this._reset(this._undo.pop());
    }

    /** @returns {string|null} the text to show, or null if there is nothing to redo */
    redo(current) {
        if (!this.canRedo) return null;
        this._undo.push(current);
        return this._reset(this._redo.pop());
    }

    // After undo/redo the next edit starts a fresh undo step.
    _reset(text) {
        this._last = text;
        this._lastAt = -Infinity;
        return text;
    }
}
