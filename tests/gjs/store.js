// Run with: gjs -m tests/gjs/store.js   (needs GLib/Gio only, not GNOME Shell)
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import {Store} from '../../own/sticky-notes/store.js';

let failures = 0;
function check(name, ok, detail = '') {
    console.log(`${ok ? 'ok     ' : 'FAILED '} ${name}${ok ? '' : ` ${detail}`}`);
    if (!ok) failures++;
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const dir = GLib.dir_make_tmp('sticky-store-XXXXXX');
const file = GLib.build_filenamev([dir, 'notes.json']);

check('a missing file loads as an empty list', same(new Store(dir).load(), []));

const notes = [{id: 1, text: 'héllo 🙂\nline two', color: 'Blue'}, {id: 2, text: ''}];
const writer = new Store(dir);
writer.schedule(() => notes);
writer.flush();
check('flush writes the file', GLib.file_test(file, GLib.FileTest.EXISTS));
check('notes round-trip, including unicode', same(new Store(dir).load(), notes));

notes[0].text = 'changed';
writer.schedule(() => notes);
writer.flush();
check('a later flush overwrites', new Store(dir).load()[0].text === 'changed');

check('flush without scheduled data is a no-op', (() => { new Store(dir).flush(); return true; })());

GLib.file_set_contents(file, '{ not json');
check('corrupt JSON loads as an empty list', same(new Store(dir).load(), []));

GLib.file_set_contents(file, '{"id": 1}');
check('a non-array document loads as an empty list', same(new Store(dir).load(), []));

const nested = GLib.build_filenamev([dir, 'a', 'b']);
const deep = new Store(nested);
deep.schedule(() => [{id: 1}]);
deep.flush();
check('flush creates missing parent directories', same(new Store(nested).load(), [{id: 1}]));

// cleanup
function rmrf(path) {
    const f = Gio.File.new_for_path(path);
    if (f.query_file_type(Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null) === Gio.FileType.DIRECTORY) {
        const en = f.enumerate_children('standard::name', Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null);
        for (let i = en.next_file(null); i; i = en.next_file(null)) rmrf(GLib.build_filenamev([path, i.get_name()]));
    }
    f.delete(null);
}
rmrf(dir);
if (failures > 0) imports.system.exit(1);
