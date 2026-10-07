import Clutter from 'gi://Clutter';
import St from 'gi://St';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Note} from './note.js';
import {Store} from './store.js';

export default class StickyNotesExtension extends Extension {
    enable() {
        // Notes live in ~/.local/share/<uuid>/notes.json
        const baseUuid = this.uuid;
        this._store = new Store(GLib.build_filenamev([GLib.get_user_data_dir(), baseUuid]));
        this._notes = [];
        this._visible = true;
        this._nextId = 1;

        for (const d of this._store.load())
            this._add(d);

        // Panel icon. GNOME 50's PanelMenu.Button swallows the press, so
        // neither button-press-event nor 'clicked' fire; captured-event does.
        this._button = new PanelMenu.Button(0.0, 'Sticky Notes', true);
        this._button.add_child(new St.Icon({
            gicon: Gio.FileIcon.new(Gio.File.new_for_path(`${this.path}/icons/sticky-note-symbolic.svg`)),
            style_class: 'system-status-icon',
        }));
        this._button.connect('captured-event', (actor, event) => {
            const t = event.type();
            if (t !== Clutter.EventType.BUTTON_PRESS && t !== Clutter.EventType.TOUCH_BEGIN)
                return Clutter.EVENT_PROPAGATE;
            if (t === Clutter.EventType.BUTTON_PRESS && event.get_button() !== Clutter.BUTTON_PRIMARY)
                return Clutter.EVENT_PROPAGATE;
            this._togglePanel();
            return Clutter.EVENT_STOP;
        });
        Main.panel.addToStatusArea(this.uuid, this._button, 0, 'right');
    }

    disable() {
        this._store?.flush();
        for (const n of this._notes ?? []) {
            try { n.destroy(); } catch (err) { console.error(`[Sticky Notes] destroy: ${err}`); }
        }
        this._notes = [];
        this._button?.destroy();
        this._button = null;
        this._store = null;
    }

    // Manager API used by notes -------------------------------------------------

    changed() {
        this._store?.schedule(() => this._notes.map(n => n.data));
    }

    newNote(from = null) {
        const m = Main.layoutManager.primaryMonitor;
        const x = from ? from.data.x + 28 : m.x + Math.round(m.width / 2) - 110;
        const y = from ? from.data.y + 28 : m.y + 80;
        const note = this._add({
            text: '', color: from?.data.color ?? 'Yellow',
            x, y, w: 220, h: 200, collapsed: false,
            pinned: from?.data.pinned ?? true,
        });
        note.raise();
        this.changed();
    }

    deleteNote(note) {
        this._notes = this._notes.filter(n => n !== note);
        note.destroy();
        this.changed();
    }

    // ----------------------------------------------------------------------------

    _add(data) {
        const m = Main.layoutManager.primaryMonitor;
        const d = {
            id: data.id ?? this._nextId,
            text: data.text ?? '',
            color: data.color ?? 'Yellow',
            x: data.x ?? m.x + 100, y: data.y ?? m.y + 100,
            w: data.w ?? 220, h: data.h ?? 200,
            collapsed: !!data.collapsed,
            pinned: data.pinned ?? true,
        };
        this._nextId = Math.max(this._nextId, d.id + 1);
        const note = new Note(this, d);
        note.setVisible(this._visible);
        this._notes.push(note);
        return note;
    }

    _togglePanel() {
        if (this._notes.length === 0) {
            this._visible = true;
            this.newNote();
            return;
        }
        this._visible = !this._visible;
        for (const n of this._notes) n.setVisible(this._visible);
    }
}
