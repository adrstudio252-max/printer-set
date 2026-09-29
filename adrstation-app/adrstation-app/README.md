# AdrStation

Desktop companion app (Windows & macOS) for **ADR Photobooth**. Install it on
the laptop that's physically connected to your printer (built and tested
around the **Epson L8050**), and it will:

- Show a **pairing QR code** that the tablet scans from
  `Settings → Adr AirLink → Scan QR Code`.
- Receive photos sent from the tablet over the same Wi-Fi (the "Use AirLink
  to Print" toggle in `settings.html`).
- Let the operator pick the **system printer** and a **paper size** (4x6,
  5x7, 2L, square 6x6, A4, A5, Letter, 2x6 strip, or a custom size) from a
  simple settings window.
- Build a print-ready PDF sized **exactly** to the physical paper (so there's
  no extra auto-scale/crop from the OS print dialog) and send it straight to
  the printer — no popup, no confirmation click needed on the laptop.
- Keep a live **print log** so the operator can see what's printing during
  the event.

This is the "AdrStation" app that `settings.html` already links to (the
**AdrStation Download** row and the **Adr AirLink** panel) — this project is
the actual implementation of that download.

## Project layout

```
adrstation-app/
├── main.js                  Electron main process (window, tray, IPC, server bootstrap)
├── preload.js                Safe IPC bridge exposed to the renderer as window.adrstation
├── config/
│   ├── printerProfiles.js    Paper size definitions (L8050-tuned) + mm/pt/px helpers
│   └── store.js              Settings persisted to a JSON file in the OS userData folder
├── print/
│   ├── imageToPdf.js         Turns an incoming photo into a print-ready PDF at exact paper size
│   └── printService.js       Sends the PDF to the OS printer (Windows: pdf-to-printer, macOS/Linux: lp)
├── server/
│   ├── localServer.js        Express server: /, /status, /pair, /print, /paper-profiles
│   └── networkInfo.js        Finds this laptop's LAN IP for the pairing QR code
└── renderer/                 Settings window UI (Dashboard / Printer Settings / Print Log)
```

## Requirements

- Node.js 18+ and npm
- Windows 10/11 or macOS 12+
- The Epson L8050 (or any printer) driver already installed in the OS, with
  the paper size/media loaded matching what you pick in AdrStation

## Setup

```bash
cd adrstation-app
npm install
npm start          # run in development
```

## Building an installer

```bash
npm run dist:win    # produces an NSIS installer in release/ for Windows
npm run dist:mac     # produces a .dmg in release/ for macOS
```

`electron-builder` needs to run on the target OS (build the Windows
installer on Windows, the macOS one on a Mac) unless you set up
cross-compilation tooling separately.

> Icons: `renderer/icons/icon.png` is a placeholder generated for this
> scaffold. Before shipping, replace `renderer/icons/icon.ico` (Windows) and
> `renderer/icons/icon.icns` (macOS) with your real AdrStation artwork —
> `electron-builder` needs those specific formats for installer icons.

## How pairing & printing works

1. On first launch, AdrStation generates a random 6-digit **pairing code**
   and shows it (plus a QR code) on the Dashboard tab.
2. The tablet scans the QR / enters the laptop's LAN IP + port (default
   `8787`) in the app's printer settings, matching the existing
   `printerIp` / `testPrinterConnection()` flow in `js/printer.js`.
3. When the tablet sends a photo (`POST /print`, multipart field `photo`,
   plus the pairing code), AdrStation:
   - checks the pairing code,
   - builds a PDF at the exact physical paper size for the paper profile
     currently selected (or the one the request asks for),
   - sends it to the chosen system printer, silently.
4. Every step is written to the **Print Log** tab in real time.

### Endpoints exposed by AdrStation

| Method | Path              | Purpose                                             |
|--------|-------------------|------------------------------------------------------|
| GET    | `/`               | Reachability check (matches existing tablet code)    |
| GET    | `/status`         | Current printer/paper/borderless status as JSON      |
| GET    | `/paper-profiles` | List of paper sizes AdrStation currently supports    |
| POST   | `/pair`           | Verify a pairing code (`{ code }`)                    |
| POST   | `/print`          | Multipart: `photo` file + pairing code + optional overrides |

`/print` accepts optional form fields `paperProfileId`, `copies`, and
`borderless` so the tablet can override the laptop's default per photo (e.g.
a thermal-strip event vs. a 4x6 event using the same laptop).

## Notes & limitations (please read before an event)

- **Windows silent printing** uses the `pdf-to-printer` package, which wraps
  a bundled SumatraPDF binary. Test a real print on-site before the event —
  antivirus/SmartScreen on some machines flags unsigned bundled binaries on
  first run.
- **macOS/Linux** printing shells out to `lp` (CUPS), which is built in and
  needs no extra install, but the printer must already be added in
  **System Settings → Printers & Scanners** first.
- Paper size names in `config/printerProfiles.js` describe the *physical
  page size* AdrStation renders to. Make sure the paper actually loaded in
  the L8050's tray matches what's selected in AdrStation, or the driver may
  still auto-scale/crop.
- The pairing code is a lightweight "don't print from a random device on
  the same Wi-Fi" guard, not full authentication — keep the venue Wi-Fi
  private the way you already would for an event kiosk setup.
