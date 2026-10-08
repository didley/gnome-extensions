/** Detects a double click from successive press timestamps (ms). */
export class DoubleClick {
    constructor(intervalMs = 300) {
        this._interval = intervalMs;
        this._last = -Infinity;
    }

    /** @returns {boolean} true if this press completes a double click */
    press(nowMs) {
        if (nowMs - this._last < this._interval) {
            this._last = -Infinity; // a third quick press starts a new pair
            return true;
        }
        this._last = nowMs;
        return false;
    }
}
