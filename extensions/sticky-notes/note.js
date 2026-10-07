import Clutter from 'gi://Clutter';
import St from 'gi://St';
import GLib from 'gi://GLib';
import Pango from 'gi://Pango';
import Cogl from 'gi://Cogl';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as ModalDialog from 'resource:///org/gnome/shell/ui/modalDialog.js';
import * as GrabHelper from 'resource:///org/gnome/shell/ui/grabHelper.js';

const HEADER_H = 22;
const MIN_W = 140;
const MIN_H = 90;
const DOUBLE_CLICK_MS = 300;

// [body, header]
export const COLORS = {
    Yellow: ['#fff1a8', '#f5dc70'],
    Blue: ['#c4e5ff', '#92c8f2'],
    Green: ['#cbf1c3', '#9fdc94'],
    Pink: ['#ffcce0', '#f4a4c3'],
    Purple: ['#e0d0ff', '#c0a8f4'],
    Gray: ['#e6e6e6', '#c6c6c6'],
};

export class Note {
    /**
     * @param {object} manager  needs: newNote(), deleteNote(note), changed()
     * @param {object} data     {id,text,color,x,y,w,h,collapsed,minimized}
     */
    constructor(manager, data) {
        this._manager = manager;
        this.data = data;
        this._layer = null; // 'chrome' | null
        this._lastPress = 0;
        this._shown = true;
        this._stageId = 0;
        this._build();
        this._applyColor();
        this._applyCollapsed();
        this.actor.set_position(data.x, data.y);
        try {
            this._putInLayer();
        } catch (err) {
            this.destroy();
            throw err;
        }
    }

    _build() {
        const d = this.data;
        this.actor = new St.BoxLayout({
            name: 'sticky-note-actor',
            style_class: 'sticky-note',
            orientation: Clutter.Orientation.VERTICAL,
            reactive: true,
            track_hover: true,
        });

        // Header --------------------------------------------------------
        this._header = new St.BoxLayout({
            style_class: 'sticky-header',
            reactive: true,
            x_expand: true,
        });
        this._closeBtn = this._makeButton('window-close-symbolic', () => this.requestDelete());
        this._plusBtn = this._makeButton('list-add-symbolic', () => this._manager.newNote(this));
        this._minBtn = this._makeButton('window-minimize-symbolic', () => this.minimize());
        this._collapseBtn = this._makeButton('pan-down-symbolic', () => this.toggleCollapsed());
        this._colorBtn = this._makeButton('color-select-symbolic', () => this.cycleColor());
        this._tooltip(this._closeBtn, () => 'Delete note');
        this._tooltip(this._minBtn, () => 'Minimize to the panel menu');
        this._tooltip(this._collapseBtn, () => (this.data.collapsed ? 'Expand note' : 'Collapse note'));
        this._tooltip(this._colorBtn, () => `Change color (${this.data.color})`);
        this._tooltip(this._plusBtn, () => 'New note');
        this._preview = new St.Label({
            style_class: 'sticky-preview',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._preview.clutter_text.set_ellipsize(Pango.EllipsizeMode.END);
        this._preview.clutter_text.set_single_line_mode(true);
        // GNOME window styling: actions on the left, window controls on the right
        this._header.add_child(this._plusBtn);
        this._header.add_child(this._colorBtn);
        this._header.add_child(this._preview);
        this._header.add_child(this._minBtn);
        this._header.add_child(this._collapseBtn);
        this._header.add_child(this._closeBtn);
        this._header.connect('captured-event', this._onHeaderEvent.bind(this));
        this.actor.connect('notify::hover', () => this._updateButtons());
        this.actor.add_child(this._header);

        // Body ----------------------------------------------------------
        this._body = new St.ScrollView({
            x_expand: true,
            y_expand: true,
            overlay_scrollbars: true,
            clip_to_allocation: true,
        });
        // A bare Clutter.Text (not St.Entry): it fills the whole note and draws
        // from the top, whereas St.Entry centres its text vertically.
        const text = new Clutter.Text({
            editable: true,
            reactive: true,
            selectable: true,
            single_line_mode: false,
            activatable: false,
            line_wrap: true,
            line_wrap_mode: Pango.WrapMode.WORD_CHAR,
            font_name: 'Sans 10',
            x_expand: true,
            y_expand: true,
            x_align: Clutter.ActorAlign.FILL,
            y_align: Clutter.ActorAlign.FILL,
        });
        const rgba = (r, g, b, a) => {
            const c = new Cogl.Color();
            c.init_from_4f(r, g, b, a);
            return c;
        };
        text.color = rgba(0.17, 0.17, 0.17, 1);
        text.cursor_color = rgba(0.17, 0.17, 0.17, 1);
        text.selection_color = rgba(0, 0, 0, 0.2);
        text.set_text(d.text ?? '');
        text.connect('text-changed', () => {
            this.data.text = text.get_text();
            this._updatePreview();
            this._manager.changed();
        });
        this._entry = text;
        // Clutter.Text has no clipboard or undo support (St.Entry adds the
        // former), so provide copy / cut / paste / select-all / undo / redo here.
        this._undoStack = [];
        this._redoStack = [];
        this._lastText = d.text ?? '';
        this._lastEditAt = 0;
        this._applying = false;
        text.connect('text-changed', () => {
            const now = GLib.get_monotonic_time() / 1000;
            if (!this._applying) {
                // typing within 800 ms is one undo step
                if (now - this._lastEditAt > 800 || this._undoStack.length === 0)
                    this._undoStack.push(this._lastText);
                if (this._undoStack.length > 200) this._undoStack.shift();
                this._redoStack = [];
                this._lastEditAt = now;
            }
            this._lastText = text.get_text();
        });
        text.connect('captured-event', (actor, event) => {
            if (event.type() !== Clutter.EventType.KEY_PRESS) return Clutter.EVENT_PROPAGATE;
            const state = event.get_state();
            if (!(state & Clutter.ModifierType.CONTROL_MASK)) return Clutter.EVENT_PROPAGATE;
            const shift = !!(state & Clutter.ModifierType.SHIFT_MASK);
            switch (event.get_key_symbol()) {
            case Clutter.KEY_c: case Clutter.KEY_C: this.copy(); return Clutter.EVENT_STOP;
            case Clutter.KEY_x: case Clutter.KEY_X: this.cut(); return Clutter.EVENT_STOP;
            case Clutter.KEY_v: case Clutter.KEY_V: this.paste(); return Clutter.EVENT_STOP;
            case Clutter.KEY_a: case Clutter.KEY_A: this.selectAll(); return Clutter.EVENT_STOP;
            case Clutter.KEY_y: case Clutter.KEY_Y: this.redo(); return Clutter.EVENT_STOP;
            case Clutter.KEY_z: case Clutter.KEY_Z:
                if (shift) this.redo(); else this.undo();
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });
        const entryBox = new St.BoxLayout({
            x_expand: true,
            y_expand: true,
            style: 'padding: 6px 10px;',
        });
        entryBox.add_child(text);
        this._body.set_child(entryBox);
        this.actor.add_child(this._body);

        // Resize grip (bottom-right) ----------------------------------------
        this._footer = new St.BoxLayout({x_expand: true});
        this._footer.add_child(new St.Widget({x_expand: true}));
        this._grip = new St.Label({text: '\u25e2', style_class: 'sticky-grip', reactive: true});
        this._grip.connect('captured-event', this._onGripEvent.bind(this));
        this._grip.set_cursor_type(Clutter.CursorType.NWSE_RESIZE);
        this._footer.add_child(this._grip);
        this.actor.add_child(this._footer);

        // Keyboard focus: a note is not a window, so take a grab on click.
        this._grabHelper = new GrabHelper.GrabHelper(this.actor);
        this._body.connect('captured-event', (a, event) => {
            if (event.type() === Clutter.EventType.BUTTON_PRESS) this.raise();
            if (event.type() === Clutter.EventType.BUTTON_PRESS &&
                event.get_button() === Clutter.BUTTON_SECONDARY) {
                const [ex, ey] = event.get_coords();
                this._openTextMenu(ex, ey);
                return Clutter.EVENT_STOP;
            }
            if (event.type() === Clutter.EventType.BUTTON_PRESS && !this._grabbed) {
                this._grabbed = true;
                this._grabHelper.grab({
                    actor: this.actor,
                    focus: this._entry,
                    onUngrab: () => { this._grabbed = false; },
                });
                this._entry.grab_key_focus();
            }
            return Clutter.EVENT_PROPAGATE;
        });

        this._updateButtons();
    }

    _makeButton(iconName, onClick) {
        const btn = new St.Button({
            style_class: 'sticky-btn',
            can_focus: false,
            child: new St.Icon({icon_name: iconName, icon_size: 12}),
        });
        btn.connect('clicked', onClick);
        return btn;
    }

    _updatePreview() {
        const first = (this.data.text ?? '').split('\n').find(l => l.trim() !== '') ?? '';
        this._preview.text = this.data.collapsed ? first.trim() : '';
    }

    _updateButtons() {
        const show = this.actor.hover;
        // hidden (not just transparent) so the collapsed preview gets the width
        for (const b of [this._closeBtn, this._minBtn, this._collapseBtn, this._colorBtn, this._plusBtn])
            b.visible = show;
        this._collapseBtn.child.icon_name = this.data.collapsed ? 'pan-end-symbolic' : 'pan-down-symbolic';
    }

    // Style / state ------------------------------------------------------------

    _applyColor() {
        const [body, header] = COLORS[this.data.color] ?? COLORS.Yellow;
        this.actor.style = `background-color: ${body};`;
        this._header.style = `background-color: ${header};`;
    }

    _applyCollapsed() {
        const d = this.data;
        this._body.visible = !d.collapsed;
        this._footer.visible = !d.collapsed;
        if (d.collapsed) this.actor.add_style_class_name('collapsed');
        else this.actor.remove_style_class_name('collapsed');
        this.actor.set_size(d.w, d.collapsed ? -1 : d.h);
        this._updatePreview();
    }

    setColor(name) {
        this.data.color = name;
        this._applyColor();
        this._manager.changed();
    }

    cycleColor() {
        const names = Object.keys(COLORS);
        const i = names.indexOf(this.data.color);
        this.setColor(names[(i + 1) % names.length]);
    }

    // Tooltips: St has none built in, so show a small label after a short hover.
    _tooltip(widget, getText) {
        let timeout = 0;
        const hide = () => {
            if (timeout) { GLib.source_remove(timeout); timeout = 0; }
            this._tip?.destroy();
            this._tip = null;
        };
        widget.connect('notify::hover', () => {
            hide();
            if (!widget.hover) return;
            timeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 450, () => {
                timeout = 0;
                this._tip = new St.Label({text: getText(), style_class: 'sticky-tooltip'});
                Main.uiGroup.add_child(this._tip);
                const [x, y] = widget.get_transformed_position();
                const m = Main.layoutManager.primaryMonitor;
                const tx = Math.min(Math.max(m.x, x + widget.width / 2 - this._tip.width / 2),
                    m.x + m.width - this._tip.width);
                this._tip.set_position(Math.round(tx), Math.round(y + widget.height + 4));
                return GLib.SOURCE_REMOVE;
            });
        });
        widget.connect('destroy', hide);
        this._tipHiders = (this._tipHiders ?? []).concat(hide);
    }

    toggleCollapsed() {
        this.data.collapsed = !this.data.collapsed;
        this._applyCollapsed();
        this._updateButtons();
        this._manager.changed();
    }

    // Notes always sit above app windows.
    _putInLayer() {
        if (this._layer) return;
        // always above windows, like an always-on-top window
        Main.layoutManager.addChrome(this.actor);
        this._layer = 'chrome';
    }

    _removeFromLayer() {
        if (this._layer === 'chrome') Main.layoutManager.removeChrome(this.actor);
        this._layer = null;
    }

    raise() {
        const parent = this.actor.get_parent();
        parent?.set_child_above_sibling(this.actor, null);
    }

    /** Manager-level show/hide (panel toggle); minimized notes stay hidden. */
    setVisible(v) {
        this._shown = v;
        this.actor.visible = v && !this.data.minimized;
    }

    minimize() {
        this.data.minimized = true;
        this.actor.visible = false;
        this._manager.changed();
    }

    restore() {
        this.data.minimized = false;
        this._shown = true;
        this.actor.visible = true;
        this.raise();
        this._manager.changed();
    }

    get isMinimized() {
        return !!this.data.minimized;
    }

    /** First non-empty line, for menus. */
    get title() {
        const first = (this.data.text ?? '').split('\n').find(l => l.trim() !== '')?.trim() ?? '';
        return first === '' ? 'Empty note' : (first.length > 32 ? first.slice(0, 31) + '\u2026' : first);
    }

    // Header events: drag, double-click, right-click menu ------------------------

    _isOnButton(event) {
        const src = global.stage.get_event_actor(event);
        if (!src) return false;
        return [this._closeBtn, this._minBtn, this._collapseBtn, this._colorBtn, this._plusBtn].some(b => src === b || b.contains(src));
    }

    _onHeaderEvent(actor, event) {
        const type = event.type();
        if (type !== Clutter.EventType.BUTTON_PRESS) return Clutter.EVENT_PROPAGATE;
        if (this._isOnButton(event)) return Clutter.EVENT_PROPAGATE;

        const button = event.get_button();
        if (button === Clutter.BUTTON_SECONDARY) {
            this._openMenu();
            return Clutter.EVENT_STOP;
        }
        if (button !== Clutter.BUTTON_PRIMARY) return Clutter.EVENT_PROPAGATE;

        const now = GLib.get_monotonic_time() / 1000;
        if (now - this._lastPress < DOUBLE_CLICK_MS) {
            this._lastPress = 0;
            this._endDrag();
            this.toggleCollapsed();
            return Clutter.EVENT_STOP;
        }
        this._lastPress = now;
        this.raise();
        const [px, py] = event.get_coords();
        this._beginDrag(this._header, px, py, (dx, dy, ox, oy) => {
            this._moveTo(ox + dx, oy + dy);
        }, () => {
            this._manager.changed();
        });
        return Clutter.EVENT_STOP;
    }

    _moveTo(x, y) {
        const m = Main.layoutManager.primaryMonitor;
        const w = this.actor.width;
        x = Math.max(m.x - w + 60, Math.min(m.x + m.width - 60, x));
        y = Math.max(m.y, Math.min(m.y + m.height - HEADER_H, y));
        this.actor.set_position(Math.round(x), Math.round(y));
        this.data.x = Math.round(x);
        this.data.y = Math.round(y);
    }

    // Resize grip ------------------------------------------------------------------

    _onGripEvent(actor, event) {
        if (event.type() !== Clutter.EventType.BUTTON_PRESS ||
            event.get_button() !== Clutter.BUTTON_PRIMARY)
            return Clutter.EVENT_PROPAGATE;
        const startW = this.actor.width;
        const startH = this.actor.height;
        const [px, py] = event.get_coords();
        this._beginDrag(this._grip, px, py, (dx, dy) => {
            this.data.w = Math.round(Math.max(MIN_W, startW + dx));
            this.data.h = Math.round(Math.max(MIN_H, startH + dy));
            this.actor.set_size(this.data.w, this.data.h);
        }, () => this._manager.changed());
        return Clutter.EVENT_STOP;
    }

    // Shared drag helper: grab the pointer on `source` until button release.
    _beginDrag(source, px, py, onMove, onEnd) {
        this._endDrag();
        const ox = this.actor.x;
        const oy = this.actor.y;
        this._dragEnd = onEnd;
        this._dragSource = source;
        this._dragGrab = global.stage.grab(source);
        this._stageId = source.connect('captured-event', (a, ev) => {
            const t = ev.type();
            if (t === Clutter.EventType.MOTION) {
                const [x, y] = ev.get_coords();
                onMove(x - px, y - py, ox, oy);
                return Clutter.EVENT_STOP;
            }
            if (t === Clutter.EventType.BUTTON_RELEASE || t === Clutter.EventType.TOUCH_END
                || t === Clutter.EventType.TOUCH_CANCEL) {
                this._endDrag();
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });
    }

    _endDrag() {
        if (!this._stageId) return;
        const id = this._stageId;
        this._stageId = 0;
        try { this._dragSource.disconnect(id); } catch (e) { /* source gone */ }
        try { this._dragGrab?.dismiss(); } catch (e) { /* already dismissed */ }
        this._dragGrab = null;
        this._dragSource = null;
        const cb = this._dragEnd;
        this._dragEnd = null;
        cb?.();
    }

    /** Ask before deleting a note that has content; empty notes go straight away. */
    requestDelete() {
        if ((this.data.text ?? '').trim() === '') {
            this._manager.deleteNote(this);
            return;
        }
        const dialog = new ModalDialog.ModalDialog({destroyOnClose: true});
        dialog.contentLayout.add_child(new St.Label({
            text: 'Delete this note?\nThis can\u2019t be undone.',
            style: 'text-align: center; font-size: 13px; padding: 8px 12px;',
        }));
        dialog.addButton({
            label: 'Cancel',
            action: () => dialog.close(),
            key: Clutter.KEY_Escape,
        });
        dialog.addButton({
            label: 'Delete',
            action: () => {
                dialog.close();
                this._manager.deleteNote(this);
            },
            default: true,
        });
        dialog.open();
    }

    // Text actions ----------------------------------------------------------------

    copy() {
        const sel = this._entry.get_selection();
        if (sel) St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, sel);
    }

    cut() {
        const sel = this._entry.get_selection();
        if (!sel) return;
        St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, sel);
        this._entry.delete_selection();
    }

    paste() {
        const text = this._entry;
        St.Clipboard.get_default().get_text(St.ClipboardType.CLIPBOARD, (c, str) => {
            if (!str) return;
            text.delete_selection();
            const pos = text.get_cursor_position();
            text.insert_text(str, pos);
            text.set_cursor_position(pos < 0 ? -1 : pos + [...str].length);
        });
    }

    selectAll() {
        this._entry.set_selection(0, -1);
    }

    _applyText(str) {
        this._applying = true;
        this._entry.set_text(str);
        this._applying = false;
        this._lastText = str;
        this._lastEditAt = 0; // the next edit starts a new undo step
        this._entry.set_cursor_position(-1);
    }

    undo() {
        if (this._undoStack.length === 0) return;
        this._redoStack.push(this._entry.get_text());
        this._applyText(this._undoStack.pop());
    }

    redo() {
        if (this._redoStack.length === 0) return;
        this._undoStack.push(this._entry.get_text());
        this._applyText(this._redoStack.pop());
    }

    /** Right-click menu for the text body. */
    _openTextMenu(x, y) {
        if (!this._textMenu) {
            this._anchor = new St.Widget({width: 1, height: 1});
            Main.uiGroup.add_child(this._anchor);
            this._textMenu = new PopupMenu.PopupMenu(this._anchor, 0.0, St.Side.TOP);
            this._textMenu.actor.add_style_class_name('app-well-menu');
            Main.uiGroup.add_child(this._textMenu.actor);
            this._textMenu.actor.hide();
            this._textMenuManager = new PopupMenu.PopupMenuManager(this._anchor);
            this._textMenuManager.addMenu(this._textMenu);
            this._textMenu.connect('open-state-changed', (m, open) => {
                if (!open) this._entry.grab_key_focus();
            });
        }
        this._anchor.set_position(Math.round(x), Math.round(y));
        const menu = this._textMenu;
        menu.removeAll();
        const hasSel = !!this._entry.get_selection();
        const item = (label, fn, enabled = true) => {
            const it = new PopupMenu.PopupMenuItem(label);
            it.setSensitive(enabled);
            it.connect('activate', fn);
            menu.addMenuItem(it);
        };
        item('Undo', () => this.undo(), this._undoStack.length > 0);
        item('Redo', () => this.redo(), this._redoStack.length > 0);
        menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        item('Cut', () => this.cut(), hasSel);
        item('Copy', () => this.copy(), hasSel);
        item('Paste', () => this.paste());
        menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        item('Select All', () => this.selectAll(), (this._entry.get_text() ?? '') !== '');
        menu.open();
    }

    // Context menu -------------------------------------------------------------------

    _openMenu() {
        if (!this._menu) {
            this._menu = new PopupMenu.PopupMenu(this._header, 0.5, St.Side.TOP);
            this._menu.actor.add_style_class_name('app-well-menu');
            Main.uiGroup.add_child(this._menu.actor);
            this._menu.actor.hide();
            this._menuManager = new PopupMenu.PopupMenuManager(this._header);
            this._menuManager.addMenu(this._menu);
        }
        const menu = this._menu;
        menu.removeAll();

        const colorMenu = new PopupMenu.PopupSubMenuMenuItem('Color');
        for (const name of Object.keys(COLORS)) {
            const item = new PopupMenu.PopupMenuItem(name);
            item.setOrnament(this.data.color === name
                ? PopupMenu.Ornament.DOT : PopupMenu.Ornament.NONE);
            item.connect('activate', () => this.setColor(name));
            colorMenu.menu.addMenuItem(item);
        }
        menu.addMenuItem(colorMenu);

        const collapse = new PopupMenu.PopupMenuItem(this.data.collapsed ? 'Expand' : 'Collapse');
        collapse.connect('activate', () => this.toggleCollapsed());
        menu.addMenuItem(collapse);

        menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        const del = new PopupMenu.PopupMenuItem('Delete note');
        del.connect('activate', () => this.requestDelete());
        menu.addMenuItem(del);

        menu.open();
    }

    destroy() {
        // each step guarded so one failure can never leave the actor on screen
        const safe = fn => { try { fn(); } catch (e) { console.error(`[Sticky Notes] destroy: ${e}`); } };
        safe(() => this._endDrag());
        safe(() => this._tipHiders?.forEach(h => h()));
        safe(() => this._grabHelper?.ungrab({actor: this.actor}));
        safe(() => this._menu?.destroy());
        safe(() => this._textMenu?.destroy());
        safe(() => this._anchor?.destroy());
        this._menu = null;
        safe(() => this._removeFromLayer());
        safe(() => this.actor.destroy());
    }
}
