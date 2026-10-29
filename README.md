# alienware-rgb-x16-r2
Script to control Alienware Notebook RGB on Linux

Tested on an Alienware x16 R2 (AW-ELC controller `187c:0551`, platform `0x1302`, 70 zones) on Fedora 42.
Uses only the Python 3 standard library. It talks to the controller over hidraw and only sends the
volatile REPORT and DIM commands, so nothing is written to the controller's flash.

## Usage

```
./aw-lights off       # all lights off
./aw-lights on        # full brightness
./aw-lights dim 50    # dim by N percent (100 = off)
./aw-lights info      # firmware / platform / zone count
```

The lights come back after a reboot (and possibly after suspend); run `aw-lights off` again.
Your user needs read/write access to the controller's `/dev/hidrawN` node, which logged-in desktop
users usually get through a uaccess ACL.

Protocol details are based on OpenRGB's `AlienwareController`.
