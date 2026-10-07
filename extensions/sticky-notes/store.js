import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

const SAVE_DELAY_MS = 500;

export class Store {
    constructor(dir) {
        this._dir = dir;
        this._file = Gio.File.new_for_path(GLib.build_filenamev([dir, 'notes.json']));
        this._timeout = 0;
        this._getData = null;
    }

    load() {
        try {
            const [ok, bytes] = this._file.load_contents(null);
            if (!ok) return [];
            const data = JSON.parse(new TextDecoder().decode(bytes));
            return Array.isArray(data) ? data : [];
        } catch (e) {
            return [];
        }
    }

    /** @param {() => object[]} getData */
    schedule(getData) {
        this._getData = getData;
        if (this._timeout) return;
        this._timeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, SAVE_DELAY_MS, () => {
            this._timeout = 0;
            this.flush();
            return GLib.SOURCE_REMOVE;
        });
    }

    flush() {
        if (this._timeout) {
            GLib.source_remove(this._timeout);
            this._timeout = 0;
        }
        if (!this._getData) return;
        try {
            GLib.mkdir_with_parents(this._dir, 0o755);
            const bytes = new TextEncoder().encode(JSON.stringify(this._getData(), null, 2));
            this._file.replace_contents(bytes, null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
        } catch (e) {
            console.error(`[Sticky Notes] save failed: ${e}`);
        }
    }
}
