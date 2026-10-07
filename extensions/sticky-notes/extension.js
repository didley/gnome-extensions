import Clutter from 'gi://Clutter';
import St from 'gi://St';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {Note} from './note.js';
import {Store} from './store.js';

export default class StickyNotesExtension extends Extension {
    enable() {
        // Notes live in ~/.local/share/<uuid>/notes.json
        const baseUuid = this.uuid;
        this._store = new Store(GLib.build_filenamev([GLib.get_user_data_dir(), baseUuid]));
        this._sweepStale();
        this._notes = [];
        this._visible = true;
        this._nextId = 1;

        for (const d of this._store.load())
            this._add(d);

        // Panel icon. GNOME 50's PanelMenu.Button swallows the press, so
        // neither button-press-event nor 'clicked' fire; captured-event does.
        this._button = new PanelMenu.Button(0.0, 'Sticky Notes', false);
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
            this._onPanelClick();
            return Clutter.EVENT_STOP;
        });
        this._button.menu.connect('open-state-changed', (menu, open) => {
            if (open) this._rebuildMenu();
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

    // After a hot reload a previous instance may have left note actors behind.
    _sweepStale() {
        for (const group of [Main.layoutManager.uiGroup, Main.layoutManager._backgroundGroup]) {
            for (const child of group.get_children()) {
                if (child.name !== 'sticky-note-actor' && !child.has_style_class_name?.('sticky-note')) continue;
                try { Main.layoutManager.removeChrome(child); } catch (e) { /* not chrome */ }
                try { child.destroy(); } catch (e) { /* already gone */ }
            }
        }
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
            minimized: !!data.minimized,
        };
        this._nextId = Math.max(this._nextId, d.id + 1);
        const note = new Note(this, d);
        note.setVisible(this._visible);
        this._notes.push(note);
        return note;
    }

    // Panel icon: no notes yet -> make one; otherwise open the menu.
    _onPanelClick() {
        if (this._notes.length === 0) {
            this._visible = true;
            this.newNote();
            return;
        }
        // PopupMenu refuses to open while empty, so fill it before toggling
        this._rebuildMenu();
        this._button.menu.toggle();
    }

    _rebuildMenu() {
        const menu = this._button.menu;
        menu.removeAll();

        const add = new PopupMenu.PopupMenuItem('New note');
        add.connect('activate', () => this.newNote());
        menu.addMenuItem(add);

        const anyHidden = this._notes.some(n => n.isMinimized);
        if (this._notes.length > 0) {
            menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
            for (const note of this._notes) {
                const item = new PopupMenu.PopupMenuItem(note.title);
                // dot = minimized (click to restore); no dot = on screen (click to bring forward)
                item.setOrnament(note.isMinimized ? PopupMenu.Ornament.DOT : PopupMenu.Ornament.NONE);
                item.connect('activate', () => note.restore());
                menu.addMenuItem(item);
            }
            menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
            const all = new PopupMenu.PopupMenuItem(anyHidden ? 'Show all notes' : 'Minimize all notes');
            all.connect('activate', () => {
                for (const n of this._notes) anyHidden ? n.restore() : n.minimize();
            });
            menu.addMenuItem(all);
        }
    }
}
