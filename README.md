# alienware-rgb-x16-r2
Script to control Alienware Notebook RGB on Linux

Tested on an Alienware x16 R2 (AW-ELC controller `187c:0551`, platform `0x1302`, 70 zones) on Fedora 42.
Uses only the Python 3 standard library. It talks to the controller over hidraw and only sends the
volatile REPORT and DIM commands, so nothing is written to the controller's flash.

## Install (GNOME)

```
./install.sh
```

This installs the `aw-lights` command to `~/.local/bin` and the **Alienware Lights** GNOME Shell
extension (GNOME 48), which adds a brightness slider to Quick Settings (top-right menu).
The extension re-applies your last setting at login, after unlocking and after resume from suspend.

On Wayland, log out and back in after the first install, then enable it if it isn't already:

```
gnome-extensions enable alienware-lights@yuripourre.github.com
```

## Command line

```
aw-lights off              # all lights off
aw-lights on               # back on at the last brightness
aw-lights brightness 40    # brightness N percent (0 = off)
aw-lights dim 50           # dim by N percent (100 = off)
aw-lights restore          # re-apply the last saved state
aw-lights state            # print the saved state
aw-lights info             # firmware / platform / zone count
```

The controller itself forgets the setting on reboot; the last state is saved to
`~/.config/aw-lights/state.json` and re-applied by the extension (or by `aw-lights restore`).
Your user needs read/write access to the controller's `/dev/hidrawN` node, which logged-in desktop
users usually get through a uaccess ACL.

Protocol details are based on OpenRGB's `AlienwareController`.
