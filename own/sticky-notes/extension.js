import St from 'gi://St';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {Note} from './note.js';
import {Store} from './store.js';
import {normalizeNote, newNoteRecord} from './model.js';

export default class StickyNotesExtension extends Extension {
    enable() {
        // Notes live in ~/.local/share/<uuid>/notes.json
        this._store = new Store(GLib.build_filenamev([GLib.get_user_data_dir(), this.uuid]));
        this._notes = [];
        this._nextId = 1;
        for (const raw of this._store.load())
            this._add(raw);
        this._addPanelButton();
    }

    disable() {
        this._store?.flush();
        for (const note of this._notes ?? []) note.destroy();
        this._notes = [];
        this._button?.destroy();
        this._button = null;
        this._store = null;
    }

    // Notes call these -------------------------------------------------------------

    changed() {
        this._store?.schedule(() => this._notes.map(n => n.data));
    }

    newNote(from = null) {
        const note = this._add(newNoteRecord(Main.layoutManager.primaryMonitor, from?.data));
        note.raise();
        this.changed();
    }

    deleteNote(note) {
        this._notes = this._notes.filter(n => n !== note);
        note.destroy();
        this.changed();
    }

    // Internals --------------------------------------------------------------------

    _add(raw) {
        const data = normalizeNote(raw, this._nextId, Main.layoutManager.primaryMonitor);
        this._nextId = Math.max(this._nextId, data.id + 1);
        const note = new Note(this, data);
        this._notes.push(note);
        return note;
    }

    _addPanelButton() {
        this._button = new PanelMenu.Button(0.0, 'Sticky Notes', false);
        this._button.add_child(new St.Icon({
            gicon: Gio.FileIcon.new(Gio.File.new_for_path(`${this.path}/icons/sticky-note-symbolic.svg`)),
            style_class: 'system-status-icon',
        }));
        // The shell opens the menu on click, but only if it is not empty, so keep it
        // filled and refresh it each time it opens.
        this._fillMenu();
        /** @type {PopupMenu.PopupMenu} */ (this._button.menu).connect('open-state-changed', (menu, open) => {
            if (open) this._fillMenu();
        });
        Main.panel.addToStatusArea(this.uuid, this._button, 0, 'right');
    }

    _fillMenu() {
        const menu = /** @type {PopupMenu.PopupMenu} */ (this._button.menu);
        const item = (label, onActivate, ornament = PopupMenu.Ornament.NONE) => {
            const it = new PopupMenu.PopupMenuItem(label);
            it.setOrnament(ornament);
            it.connect('activate', onActivate);
            menu.addMenuItem(it);
        };
        const separator = () => menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        menu.removeAll();
        item('New note', () => this.newNote());
        separator();
        // A dot marks minimized notes; activating any entry brings its note forward.
        for (const note of this._notes)
            item(note.title, () => note.restore(), note.isMinimized ? PopupMenu.Ornament.DOT : PopupMenu.Ornament.NONE);
        separator();
        const anyMinimized = this._notes.some(n => n.isMinimized);
        item(anyMinimized ? 'Show all notes' : 'Minimize all notes', () => {
            for (const note of this._notes) anyMinimized ? note.restore() : note.minimize();
        });
    }
}
