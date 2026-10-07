import Clutter from 'gi://Clutter';
import St from 'gi://St';
import GLib from 'gi://GLib';
import Pango from 'gi://Pango';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
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
     * @param {object} data     {id,text,color,x,y,w,h,collapsed,pinned}
     */
    constructor(manager, data) {
        this._manager = manager;
        this.data = data;
        this._layer = null; // 'chrome' | 'background' | null
        this._lastPress = 0;
        this._stageId = 0;
        this._build();
        this._applyColor();
        this._applyCollapsed();
        this.actor.set_position(data.x, data.y);
        this._putInLayer();
    }

    _build() {
        const d = this.data;
        this.actor = new St.BoxLayout({
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
        this._closeBtn = this._makeButton('window-close-symbolic', () => this._manager.deleteNote(this));
        this._plusBtn = this._makeButton('list-add-symbolic', () => this._manager.newNote(this));
        const spacer = new St.Widget({x_expand: true});
        this._header.add_child(this._closeBtn);
        this._header.add_child(spacer);
        this._header.add_child(this._plusBtn);
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
        this._entry = new St.Entry({
            style_class: 'sticky-entry',
            can_focus: true,
            x_expand: true,
            hint_text: '',
        });
        const text = this._entry.get_clutter_text();
        text.set_single_line_mode(false);
        text.set_activatable(false);
        text.set_line_wrap(true);
        text.set_line_wrap_mode(Pango.WrapMode.WORD_CHAR);
        text.set_text(d.text ?? '');
        text.connect('text-changed', () => {
            this.data.text = text.get_text();
            this._manager.changed();
        });
        const entryBox = new St.BoxLayout({x_expand: true, y_expand: true});
        entryBox.add_child(this._entry);
        this._body.set_child(entryBox);
        this.actor.add_child(this._body);

        // Resize grip (bottom-right) ----------------------------------------
        this._footer = new St.BoxLayout({x_expand: true});
        this._footer.add_child(new St.Widget({x_expand: true}));
        this._grip = new St.Widget({style_class: 'sticky-grip', reactive: true});
        this._grip.connect('captured-event', this._onGripEvent.bind(this));
        this._footer.add_child(this._grip);
        this.actor.add_child(this._footer);

        // Keyboard focus: a note is not a window, so take a grab on click.
        this._grabHelper = new GrabHelper.GrabHelper(this.actor);
        this._body.connect('captured-event', (a, event) => {
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

    _updateButtons() {
        const show = this.actor.hover;
        this._closeBtn.opacity = show ? 255 : 0;
        this._plusBtn.opacity = show ? 255 : 0;
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
    }

    setColor(name) {
        this.data.color = name;
        this._applyColor();
        this._manager.changed();
    }

    toggleCollapsed() {
        this.data.collapsed = !this.data.collapsed;
        this._applyCollapsed();
        this._manager.changed();
    }

    setPinned(pinned) {
        this.data.pinned = pinned;
        this._removeFromLayer();
        this._putInLayer();
        this._manager.changed();
    }

    // Layers: pinned => above windows (chrome), else on the desktop background.
    _putInLayer() {
        if (this._layer) return;
        if (this.data.pinned) {
            Main.layoutManager.addChrome(this.actor, {affectsInputRegion: true});
            this._layer = 'chrome';
        } else {
            Main.layoutManager._backgroundGroup.add_child(this.actor);
            this._layer = 'background';
        }
    }

    _removeFromLayer() {
        if (this._layer === 'chrome') Main.layoutManager.removeChrome(this.actor);
        else if (this._layer === 'background') Main.layoutManager._backgroundGroup.remove_child(this.actor);
        this._layer = null;
    }

    raise() {
        const parent = this.actor.get_parent();
        parent?.set_child_above_sibling(this.actor, null);
    }

    setVisible(v) {
        this.actor.visible = v;
    }

    // Header events: drag, double-click, right-click menu ------------------------

    _isOnButton(event) {
        const src = event.get_source();
        return [this._closeBtn, this._plusBtn].some(b => src === b || b.contains(src));
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
        this._beginDrag(px, py, (dx, dy, ox, oy) => {
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
        this._beginDrag(px, py, (dx, dy) => {
            this.data.w = Math.round(Math.max(MIN_W, startW + dx));
            this.data.h = Math.round(Math.max(MIN_H, startH + dy));
            this.actor.set_size(this.data.w, this.data.h);
        }, () => this._manager.changed());
        return Clutter.EVENT_STOP;
    }

    // Shared drag helper: tracks pointer on the stage until button release.
    _beginDrag(px, py, onMove, onEnd) {
        this._endDrag();
        const ox = this.actor.x;
        const oy = this.actor.y;
        this._dragEnd = onEnd;
        this._stageId = global.stage.connect('captured-event', (stage, ev) => {
            const t = ev.type();
            if (t === Clutter.EventType.MOTION) {
                const [x, y] = ev.get_coords();
                onMove(x - px, y - py, ox, oy);
                return Clutter.EVENT_STOP;
            }
            if (t === Clutter.EventType.BUTTON_RELEASE) {
                this._endDrag();
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });
    }

    _endDrag() {
        if (this._stageId) {
            global.stage.disconnect(this._stageId);
            this._stageId = 0;
            const cb = this._dragEnd;
            this._dragEnd = null;
            cb?.();
        }
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

        const pin = new PopupMenu.PopupMenuItem('Float on top');
        pin.setOrnament(this.data.pinned ? PopupMenu.Ornament.CHECK : PopupMenu.Ornament.NONE);
        pin.connect('activate', () => this.setPinned(!this.data.pinned));
        menu.addMenuItem(pin);

        const collapse = new PopupMenu.PopupMenuItem(this.data.collapsed ? 'Expand' : 'Collapse');
        collapse.connect('activate', () => this.toggleCollapsed());
        menu.addMenuItem(collapse);

        menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        const del = new PopupMenu.PopupMenuItem('Delete note');
        del.connect('activate', () => this._manager.deleteNote(this));
        menu.addMenuItem(del);

        menu.open();
    }

    destroy() {
        this._endDrag();
        this._grabHelper?.ungrab({actor: this.actor});
        this._menu?.destroy();
        this._menu = null;
        this._removeFromLayer();
        this.actor.destroy();
    }
}
