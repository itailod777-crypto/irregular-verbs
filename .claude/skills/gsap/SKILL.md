---
name: gsap
description: Write correct GSAP (GreenSock Animation Platform) animation code - tweens, timelines, ScrollTrigger, SplitText, Flip, Draggable, MotionPath, React's useGSAP hook, and gsap.matchMedia for responsive/reduced-motion animation. Use this skill whenever the user mentions GSAP, GreenSock, gsap.to/from/fromTo, timelines, ScrollTrigger, scroll-driven or scrub animation, text-splitting animation, card flips, staggered entrances, or wants to add polished JS animation to a page or React app, even if they do not name GSAP explicitly.
---

# GSAP

GSAP is a framework-agnostic, zero-dependency JS animation library. Since the Webflow acquisition the whole toolset, including the former "Club" plugins (SplitText, MorphSVG, ScrollSmoother, etc.), is **free, including for commercial use**. Current version at time of writing: 3.15. Docs: https://gsap.com/docs, cheat sheet: https://gsap.com/cheatsheet.

## Install

```bash
npm install gsap
npm install @gsap/react   # only for React
```

```js
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
gsap.registerPlugin(ScrollTrigger, SplitText); // always register plugins, once, before use
```

CDN (no build step): `<script src="https://cdn.jsdelivr.net/npm/gsap@3.15/dist/gsap.min.js"></script>` plus a separate `<script>` per plugin (e.g. `dist/ScrollTrigger.min.js`).

## Core API

```js
gsap.to(".box", { x: 200, rotation: 360, duration: 1, ease: "power2.out" });
gsap.from(".card", { opacity: 0, y: 40, stagger: 0.1 });       // animate FROM these values
gsap.fromTo(".box", { opacity: 0 }, { opacity: 1 });            // explicit start and end
gsap.set(".box", { xPercent: -50 });                            // instant, no animation
```

- Prefer GSAP's transform aliases (`x`, `y`, `scale`, `rotation`, `xPercent`) over animating `left/top/width`. They are GPU-friendly and GSAP tracks them correctly.
- `duration` is in seconds. Default ease is `power1.out`. Use `gsap.defaults({ ease, duration })` for project-wide defaults.
- `stagger` can be a number or an object: `{ each: 0.1, from: "center", grid: "auto" }`.
- Function-based values: `x: (i, el) => i * 50`. Relative values: `x: "+=100"`.
- Control: `tween.pause() / play() / reverse() / progress(0.5) / timeScale(2) / kill()`.
- `easeReverse` (3.15+) sets a different ease when the animation plays backwards. `yoyoEase` is deprecated in favor of it.

## Timelines: sequence instead of stacking delays

```js
const tl = gsap.timeline({ defaults: { duration: 0.6, ease: "power3.out" } });
tl.from(".title", { y: 30, opacity: 0 })
  .from(".card", { y: 40, opacity: 0, stagger: 0.1 }, "-=0.3") // overlap previous by 0.3s
  .add("done")                                                   // label
  .to(".cta", { scale: 1.05, repeat: 1, yoyo: true }, "done");
```

Position parameter (3rd argument): `"<"` start of previous, `">"` end of previous, `"+=0.5"` gap, `"label"`, or an absolute number. Chaining with position params beats chains of `delay:` values because changing one duration does not break everything after it.

## ScrollTrigger

```js
gsap.to(".panel", {
  x: 400,
  scrollTrigger: {
    trigger: ".panel",
    start: "top 80%",    // "<trigger edge> <viewport edge>"
    end: "bottom 20%",
    scrub: true,         // or a number for smoothing lag
    pin: true,
    toggleActions: "play none none reverse",
    markers: true,       // dev only, remove before shipping
  },
});
```

- Put the `scrollTrigger` on the **timeline** (not its child tweens) when sequencing, otherwise each child gets its own trigger.
- Create ScrollTriggers in page order, or set `refreshPriority`, so pin spacing is computed right.
- After content/layout changes (images load, fonts, accordion open) call `ScrollTrigger.refresh()`.
- Do not animate the trigger element itself with `start` depending on its own transform. Animate a child, or use a wrapper as trigger.
- `ScrollTrigger.batch(".item", { onEnter: (els) => gsap.from(els, { y: 30, opacity: 0, stagger: 0.1 }) })` is the efficient pattern for lists of reveal-on-scroll items.

## Responsive and accessible: gsap.matchMedia

```js
const mm = gsap.matchMedia();
mm.add(
  { desktop: "(min-width: 800px)", reduce: "(prefers-reduced-motion: reduce)" },
  (ctx) => {
    const { desktop, reduce } = ctx.conditions;
    if (reduce) return;            // skip motion entirely, or use a simple fade
    gsap.from(".hero", { y: desktop ? 80 : 30, opacity: 0 });
  }
);
// mm.revert() cleans everything up
```

Always honor `prefers-reduced-motion`. Everything created inside the callback is auto-reverted when the query stops matching.

## React

Use the `useGSAP` hook from `@gsap/react` instead of `useEffect`. It handles cleanup (via `gsap.context`) and StrictMode double-invocation.

```jsx
import { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
gsap.registerPlugin(useGSAP);

function Cards() {
  const container = useRef(null);
  useGSAP(() => {
    gsap.from(".card", { y: 40, opacity: 0, stagger: 0.1 }); // selectors are scoped to container
  }, { scope: container });
  return <div ref={container}>{/* .card elements */}</div>;
}
```

- Pass `scope` so string selectors only match inside the component.
- Animations created later (click handlers) need `contextSafe`: `const { contextSafe } = useGSAP({ scope }); const onClick = contextSafe(() => gsap.to(...))`.
- Animate refs or scoped selectors, never state-driven values every frame. Do not use React state to drive the animation itself.

## Other useful plugins

- **SplitText**: `SplitText.create(".title", { type: "chars,words,lines", mask: "lines" })`, then animate `.chars`/`.words`/`.lines`. Wait for fonts (`document.fonts.ready`) before splitting.
- **Flip**: `const state = Flip.getState(items); /* change DOM/classes */ Flip.from(state, { duration: 0.6, ease: "power2.inOut" })`. Ideal for reordering cards and layout changes.
- **Draggable**, **Observer**, **MotionPathPlugin**, **MorphSVGPlugin**, **ScrollSmoother** (see Lenis skill for the lighter alternative).

## Common mistakes

1. Forgetting `gsap.registerPlugin(...)`: plugin silently does nothing.
2. Animating the same property with two competing tweens: use `overwrite: "auto"` or kill the older one.
3. Leaving `markers: true` in.
4. Not cleaning up in SPAs (use `useGSAP`, `gsap.context()`, or `matchMedia`).
5. Using `from()` with `scrollTrigger` + `immediateRender` flashes. Set `immediateRender: false` if the element should stay visible until the trigger.
6. Animating layout properties (`width`, `top`) in long scrubbed animations: prefer transforms.

## Using with Lenis

When using Lenis for smooth scroll with ScrollTrigger, wire Lenis into GSAP's ticker. See the `lenis` skill.
