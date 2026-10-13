---
name: lenis
description: Set up and configure Lenis (darkroomengineering/lenis), the lightweight smooth-scroll library - vanilla JS, React (lenis/react), Vue, scroll snapping, anchor links, nested scroll containers, GSAP ScrollTrigger sync, and reduced-motion handling. Use this skill whenever the user mentions Lenis, smooth scroll, smooth scrolling, inertia scroll, scroll hijacking, buttery scroll, parallax driven by scroll position, or syncing scroll with GSAP/WebGL, even if they do not name Lenis.
---

# Lenis

Lenis ("smooth" in Latin) is a tiny, dependency-free smooth-scroll library (v1.3.x). It **wraps native scroll** instead of replacing it, so `position: sticky`, anchor links and accessibility keep working. Supports vertical, horizontal and nested scrolling. Repo: https://github.com/darkroomengineering/lenis.

## Install

```bash
npm i lenis
```

```js
import Lenis from "lenis";
import "lenis/dist/lenis.css"; // recommended CSS: include it, many "it does not scroll" bugs come from skipping it
```

CDN (pin the version):

```html
<link rel="stylesheet" href="https://unpkg.com/lenis@1.3.26/dist/lenis.css">
<script src="https://unpkg.com/lenis@1.3.26/dist/lenis.min.js"></script>
```

## Setup

Basic (Lenis runs its own rAF loop):

```js
const lenis = new Lenis({ autoRaf: true });
lenis.on("scroll", (e) => console.log(e.scroll, e.velocity, e.progress));
```

Custom loop (needed when another library owns the frame loop):

```js
const lenis = new Lenis();
function raf(time) { lenis.raf(time); requestAnimationFrame(raf); }
requestAnimationFrame(raf);
```

One-liner for static HTML sites that handles modals, anchors, nested scroll and page-change resets:

```html
<script>new Lenis({ autoRaf: true, autoToggle: true, anchors: true, allowNestedScroll: true, naiveDimensions: true, stopInertiaOnNavigate: true })</script>
```

## GSAP ScrollTrigger sync

Do **not** also use `autoRaf` here. Drive Lenis from GSAP's ticker so both update in the same frame:

```js
const lenis = new Lenis();
lenis.on("scroll", ScrollTrigger.update);
gsap.ticker.add((time) => lenis.raf(time * 1000)); // GSAP time is seconds, Lenis wants ms
gsap.ticker.lagSmoothing(0);                         // avoid GSAP smoothing out frame drops
```

## Key options

| Option | Default | Notes |
| --- | --- | --- |
| `lerp` | `0.1` | Smoothing 0..1 (lower = floatier). When set, `duration`/`easing` are ignored |
| `duration` | `1.2` | Seconds. Only used when `lerp` is not defined |
| `smoothWheel` | `true` | Smooth mouse wheel |
| `syncTouch` / `syncTouchLerp` | `false` / `0.075` | Smooth touch too. Can be unstable on iOS < 16 |
| `wheelMultiplier`, `touchMultiplier` | `1` | Scroll speed |
| `orientation`, `gestureOrientation` | `vertical` | `horizontal` or `both` for gestures |
| `anchors` | `false` | `true` or ScrollTo options so `#links` animate |
| `allowNestedScroll` | `false` | Let inner scrollable divs scroll natively (checks DOM on every event; prefer `data-lenis-prevent` if slow) |
| `prevent` | none | `(node) => node.classList.contains("modal")` |
| `autoResize` | `true` | Set false and call `lenis.resize()` yourself if needed |
| `infinite` | `false` | Infinite scroll (needs `syncTouch: true` on touch) |
| `respectReducedMotion` | `true` | Disables smoothing for users with reduced motion |
| `wrapper` / `content` | `window` / `documentElement` | For a custom scroll container |

## Methods and properties

```js
lenis.scrollTo("#section", { offset: -80, duration: 1.5, onComplete: () => {} });
lenis.scrollTo(0, { immediate: true });   // jump, no animation
lenis.stop();   // lock scroll (open a modal)
lenis.start();  // unlock
lenis.destroy();
lenis.scroll; lenis.progress; lenis.velocity; lenis.direction; lenis.isScrolling; lenis.limit;
```

`scrollTo` accepts a number, CSS selector, keyword (`"top"`, `"bottom"`, ...) or element. `lock: true` blocks user input until the target is reached; `force: true` scrolls even while stopped.

## Nested scroll, modals, dropdowns

Add attributes to elements that should scroll natively:

```html
<div data-lenis-prevent>scrollable modal content</div>
```

Variants: `data-lenis-prevent-wheel`, `-touch`, `-vertical`, `-horizontal`. When opening a full-screen modal, also call `lenis.stop()` and `lenis.start()` on close.

## React

React support ships in the same `lenis` package (`lenis/react`). Import the CSS once (`import "lenis/dist/lenis.css"`).

```jsx
import { ReactLenis, useLenis } from "lenis/react";

function App() {
  useLenis((lenis) => { /* called on every scroll */ });
  return (
    <>
      <ReactLenis root options={{ lerp: 0.1 }} />
      {/* page content */}
    </>
  );
}
```

- `root`: Lenis drives the default `<html>` scroll and `useLenis` works anywhere in the app. `root="asChild"` renders wrapper elements for a custom scroll container while still exposing the instance globally. Without `root`, `<ReactLenis>` wraps its children in a div that scrolls, and `useLenis` works only inside it.
- `options` takes the same settings as the vanilla constructor.
- `useLenis(callback, deps, priority)`: `deps` re-registers the callback, `priority` orders callbacks. Called without a callback it just returns the instance (`lenis.scrollTo(...)`, `lenis.stop()`).
- With GSAP in React, disable `autoRaf` and feed Lenis from GSAP's ticker (from the official README):

```jsx
const lenisRef = useRef();
useEffect(() => {
  const update = (time) => lenisRef.current?.lenis?.raf(time * 1000);
  gsap.ticker.add(update);
  return () => gsap.ticker.remove(update);
}, []);
return <ReactLenis root options={{ autoRaf: false }} ref={lenisRef} />;
```

  Also call `lenis.on("scroll", ScrollTrigger.update)` (e.g. via `useLenis(ScrollTrigger.update)`) so ScrollTrigger follows the smoothed scroll. Types: `import type { LenisRef } from "lenis/react"`. A Framer Motion variant using `frame.update(update, true)` / `cancelFrame(update)` is in `packages/react/README.md`.
- Vue: `lenis/vue`. Scroll snapping: `lenis/snap`. Both have their own READMEs in `packages/`.

## Limitations and gotchas

- CSS `scroll-snap` is not supported: use `lenis/snap`.
- Wheel events do not pass through `<iframe>`, so smooth scroll stops over iframes.
- Capped to 60 fps on Safari, 30 fps in low-power mode.
- `position: fixed` can lag on pre-M1 macOS Safari.
- If scrolling seems broken: confirm the recommended CSS is loaded, `autoRaf: true` or `raf()` is actually called, and test with Lenis off to rule out `overflow: hidden` on body/html.
- Respect reduced motion (default). `lenis.prefersReducedMotion` lets your own animations adapt.
