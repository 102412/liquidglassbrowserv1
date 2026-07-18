# Refract

A Windows desktop web browser built on Electron (real Chromium) with a browser
chrome — tabs, address bar, nav controls, titlebar — rendered as a genuine
refractive glass material instead of flat colors or a plain CSS blur.

Refract is an original interpretation of refractive glass UI. It is not a
clone of, and is not affiliated with, Apple's "Liquid Glass".

## Stack

- **Electron** — real Chromium `WebContentsView` per tab for actual page rendering
- **Node.js** main process for window + tab lifecycle, navigation, IPC
- **Vanilla HTML/CSS/JS** for the browser chrome
- **WebGL** fragment shader for the glass refraction/lensing effect
- Windows 11 **Acrylic/Mica** backdrop material as the base translucency layer

## How the glass effect is built

The chrome is layered, from back to front:

1. **Native backdrop material** — the `BrowserWindow` is created with
   `backgroundMaterial: 'acrylic'` (Windows 11+) so the OS compositor itself
   blurs whatever is behind the *window* (desktop, other apps). This is real
   translucency, not a CSS approximation. Falls back to a transparent window
   with a CSS blur panel on older Windows builds.
2. **CSS glass panel** — `backdrop-filter: blur(20px) saturate(150%)` over a
   low-alpha white fill, giving every chrome element (titlebar, tab bar,
   address bar, buttons) a working glass look immediately.
3. **WebGL refraction layer** — a full-chrome-height `<canvas>` overlays the
   HTML chrome. Every ~80ms the main process grabs a screenshot of the strip
   of the active tab's page content that sits directly under the chrome
   (`webContents.capturePage`) and streams it to the renderer as a texture.
   A fragment shader computes a signed-distance-field for each glass panel's
   rounded-rect shape and displaces the sampled texture outward near the
   panel edges (stronger displacement near the border, ~none at the center),
   producing real edge lensing driven by actual page content rather than a
   static blur.
4. **Specular + edge highlight** — a static-angle soft gradient sells the
   "light hitting glass" look, and a 1px inset highlight plus a brighter
   top-edge line sells material thickness.

## Scope (v1)

- Frameless custom titlebar with glass min/max/close buttons
- Tab bar: add/close/switch tabs, each tab backed by a real Chromium
  `WebContentsView`
- Address bar: type a URL or a search query, back/forward/reload
- No extensions, no bookmark sync, no history UI yet

## Running it

```
npm install
npm start
```

Requires Windows 11 for the native Acrylic/Mica base layer (falls back to a
CSS-only glass panel on Windows 10).

## Project layout

```
src/
  main/
    main.js       window + tab (WebContentsView) lifecycle, IPC, frame capture
    preload.js    contextBridge API surface exposed to the chrome UI
  renderer/
    index.html    chrome markup (titlebar, tab bar, address bar)
    style.css     CSS glass layers, specular + edge highlight
    renderer.js   chrome UI logic, IPC wiring
    glass.js      WebGL refraction overlay (SDF displacement)
    shaders/
      glass.vert
      glass.frag
```

## Non-goals for this build

- No motion/gyro-reactive specular highlights (static light source only)
- No shape-morphing transitions between UI states
- Not aiming for pixel parity with any specific vendor's glass UI
