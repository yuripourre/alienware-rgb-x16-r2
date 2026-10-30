import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {QuickSlider, SystemIndicator} from 'resource:///org/gnome/shell/ui/quickSettings.js';

const ICON_FILE = 'alienware-symbolic.svg';
const SLIDER_DEBOUNCE_MS = 120;
const RESUME_DELAY_MS = 1500;

// Runs the bundled aw-lights script, one invocation at a time.
// While busy, only the most recent request is kept, so dragging the
// slider never builds up a backlog of USB writes.
class Backend {
    constructor(scriptPath) {
        this._argv = [GLib.find_program_in_path('python3') ?? 'python3', scriptPath];
        this._busy = false;
        this._pending = null;
    }

    run(args) {
        return new Promise((resolve, reject) => {
            const proc = Gio.Subprocess.new([...this._argv, ...args],
                Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE);
            proc.communicate_utf8_async(null, null, (p, res) => {
                try {
                    const [, stdout, stderr] = p.communicate_utf8_finish(res);
                    if (p.get_successful())
                        resolve(stdout);
                    else
                        reject(new Error(stderr.trim() || `exit ${p.get_exit_status()}`));
                } catch (e) {
                    reject(e);
                }
            });
        });
    }

    request(args) {
        this._pending = args;
        if (!this._busy)
            this._drain();
    }

    async _drain() {
        this._busy = true;
        while (this._pending) {
            const args = this._pending;
            this._pending = null;
            try {
                await this.run(args);
            } catch (e) {
                console.error(`aw-lights ${args.join(' ')}: ${e.message}`);
            }
        }
        this._busy = false;
    }
}

class LightsController {
    constructor(scriptPath, iconPath) {
        this._backend = new Backend(scriptPath);
        this._state = {on: true, brightness: 100};
        this._debounceId = 0;
        this._resumeId = 0;

        this._slider = new QuickSlider({
            gicon: new Gio.FileIcon({file: Gio.File.new_for_path(iconPath)}),
            iconReactive: true,
        });
        this._slider.slider.accessible_name = 'Alienware lights brightness';
        this._sliderChangedId = this._slider.slider.connect('notify::value',
            () => this._onSliderChanged());
        this._slider.connect('icon-clicked', () => this._setOn(!this._state.on));

        // The slider spans a full row, like the built-in brightness slider.
        this._indicator = new SystemIndicator();
        this._indicator.quickSettingsItems.push(this._slider);
        Main.panel.statusArea.quickSettings.addExternalIndicator(this._indicator, 2);
        this._placeBelowBrightness();

        this._sleepSignalId = Gio.DBus.system.signal_subscribe(
            'org.freedesktop.login1', 'org.freedesktop.login1.Manager',
            'PrepareForSleep', '/org/freedesktop/login1', null,
            Gio.DBusSignalFlags.NONE,
            (_conn, _sender, _path, _iface, _signal, params) => {
                const [goingToSleep] = params.deepUnpack();
                if (!goingToSleep)
                    this._scheduleRestore();
            });

        this._syncUi();
        this._loadState();
    }

    // Move our item directly below the built-in brightness slider. At login the
    // shell may still be building its own items when we get enabled, and it
    // inserts them relative to the grid's first child, which can be our slider.
    // So wait until it has added its last item (background apps) before moving.
    _placeBelowBrightness() {
        const quickSettings = Main.panel.statusArea.quickSettings;
        const grid = quickSettings.menu._grid;
        const place = () => {
            const lastItem = quickSettings._backgroundApps?.quickSettingsItems.at(-1);
            if (!lastItem || !grid.contains(lastItem))
                return false;
            grid.set_child_above_sibling(this._slider,
                quickSettings._brightness.quickSettingsItems[0]);
            return true;
        };

        if (place())
            return;
        this._gridChildAddedId = grid.connect('child-added', () => {
            if (place())
                this._stopWaitingForBrightness();
        });
    }

    _stopWaitingForBrightness() {
        if (!this._gridChildAddedId)
            return;
        Main.panel.statusArea.quickSettings.menu._grid.disconnect(this._gridChildAddedId);
        this._gridChildAddedId = 0;
    }

    async _loadState() {
        try {
            this._state = JSON.parse(await this._backend.run(['state']));
        } catch (e) {
            console.error(`aw-lights state: ${e.message}`);
        }
        if (!this._slider)
            return;
        this._syncUi();
        this._backend.request(['restore']);
    }

    _scheduleRestore() {
        if (this._resumeId)
            GLib.source_remove(this._resumeId);
        this._resumeId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, RESUME_DELAY_MS, () => {
            this._resumeId = 0;
            this._backend.request(['restore']);
            return GLib.SOURCE_REMOVE;
        });
    }

    _syncUi() {
        const {on, brightness} = this._state;
        this._slider.slider.block_signal_handler(this._sliderChangedId);
        this._slider.slider.value = on ? brightness / 100 : 0;
        this._slider.slider.unblock_signal_handler(this._sliderChangedId);
    }

    _setOn(on) {
        this._state.on = on;
        if (on && this._state.brightness === 0)
            this._state.brightness = 100;
        this._syncUi();
        this._backend.request([on ? 'on' : 'off']);
    }

    _onSliderChanged() {
        const level = Math.round(this._slider.slider.value * 100);
        this._state.on = level > 0;
        if (level > 0)
            this._state.brightness = level;

        if (this._debounceId)
            GLib.source_remove(this._debounceId);
        this._debounceId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, SLIDER_DEBOUNCE_MS, () => {
            this._debounceId = 0;
            this._backend.request(['brightness', `${level}`]);
            return GLib.SOURCE_REMOVE;
        });
    }

    destroy() {
        Gio.DBus.system.signal_unsubscribe(this._sleepSignalId);
        if (this._resumeId)
            GLib.source_remove(this._resumeId);
        if (this._debounceId)
            GLib.source_remove(this._debounceId);
        this._stopWaitingForBrightness();

        this._indicator.quickSettingsItems.forEach(item => item.destroy());
        this._indicator.destroy();
        this._slider = null;
    }
}

export default class AlienwareLightsExtension extends Extension {
    enable() {
        this._controller = new LightsController(
            GLib.build_filenamev([this.path, 'aw-lights']),
            GLib.build_filenamev([this.path, ICON_FILE]));
    }

    disable() {
        this._controller.destroy();
        this._controller = null;
    }
}
