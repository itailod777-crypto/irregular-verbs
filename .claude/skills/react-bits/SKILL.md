---
name: react-bits
description: Add animated, copy-paste React components from React Bits (DavidHDev/react-bits, reactbits.dev) - text animations, animated backgrounds, UI components, and micro-interactions - via the shadcn or jsrepo CLI or by copying source. Use this skill whenever the user mentions React Bits, reactbits, animated React components, fancy text effects (BlurText, SplitText-style reveals), animated or shader backgrounds, or asks for eye-catching animated UI in a React or Next.js project, even if they do not name the library.
---

# React Bits

React Bits is a large MIT + Commons Clause licensed library (200+ components, free for personal and commercial use) of animated React components. It is **not an npm package you import from**. Components are copied into your codebase (shadcn-style), so you own and can edit the source. Docs: https://reactbits.dev, repo: https://github.com/DavidHDev/react-bits.

Categories: **Text Animations**, **Animations**, **Components**, **Micro** (30 micro-interaction components), **Backgrounds**. There is also a paid Pro tier (pro.reactbits.dev) and free web tools (Background Studio, Shape Magic, Texture Lab).

## Pick a variant first

Every component ships in 4 variants. Choose the one that matches the project, otherwise styling will clash:

| Variant | Language | Styling |
| --- | --- | --- |
| `JS-CSS` | JavaScript | plain CSS file |
| `JS-TW` | JavaScript | Tailwind |
| `TS-CSS` | TypeScript | plain CSS file |
| `TS-TW` | TypeScript | Tailwind |

Detect it: `tsconfig.json` present means TS; `tailwind.config.*` or `@import "tailwindcss"` means TW.

## Install a component

shadcn CLI (name pattern: `@react-bits/<ComponentName>-<Variant>`):

```bash
npx shadcn@latest add @react-bits/BlurText-TS-TW
```

jsrepo gives the same source:

```bash
npx jsrepo@latest add https://reactbits.dev/r/SplitText-JS-CSS
```

On pnpm/yarn/bun replace `npx` with `pnpm dlx`, `yarn` or `bun x --bun`. The ending (`JS-CSS`, `TS-TW`, ...) picks the variant. Each component page on reactbits.dev has a Code tab with the exact source and a **Dependencies** section. There is also a "Copy for AI" button on each page and an official MCP server (https://reactbits.dev/get-started/mcp) if the user wants agents to browse components.

The shadcn route needs a `components.json` (run `npx shadcn@latest init` first if the project has none). Manual route: copy the component file (and its `.css` for CSS variants) into e.g. `src/components/`, then install the dependencies the page lists.

## Typical dependencies

Many components are dependency-free (CSS/canvas). Others pull in a library, so check the component page:

- `gsap` (+ `@gsap/react`): many text and scroll effects. See the `gsap` skill.
- `motion` (Framer Motion): spring/gesture components.
- `three`, `@react-three/fiber`, `ogl`: WebGL/shader backgrounds and 3D.
- `lenis`: smooth-scroll based components (see the `lenis` skill).

Install only what the chosen component needs: do not add all of them preemptively.

## Usage pattern

Components are props-driven; tweak props rather than editing source first. Verified example (BlurText depends on `motion`, so also `npm install motion`):

```jsx
import BlurText from "./components/BlurText";

<BlurText
  text="Irregular verbs made easy"
  animateBy="words"        // "words" | "letters"
  direction="top"          // "top" | "bottom"
  delay={150}              // ms between words/letters
  stepDuration={0.35}      // seconds per step
  threshold={0.1}          // IntersectionObserver: animates when scrolled into view
  onAnimationComplete={() => console.log("done")}
/>
```

Prop names differ per component (and not every component accepts `className`), so read the copied source or the component's Props table instead of guessing. Many components animate when they enter the viewport via IntersectionObserver, which is useful to know when they sit below the fold.

## Guidelines when using React Bits in a project

1. **Fit the app, not the other way round.** Animated backgrounds and heavy WebGL components cost GPU and battery. Use one hero effect at most; keep study/quiz screens calm.
2. **Respect `prefers-reduced-motion`.** Many components do not check it. Wrap them or provide a static fallback for reduced-motion users.
3. **Lazy-load heavy components** (`React.lazy` / `next/dynamic` with `ssr: false` for canvas/WebGL ones) so they do not block first paint or break SSR.
4. **Next.js / SSR:** components touching `window`, canvas or WebGL need `"use client"` and often dynamic import with `ssr: false`.
5. **Keep copied code tidy.** After copying, remove unused props/exports and keep the license header intact. The Commons Clause forbids selling the components themselves as a standalone product.
6. **Mobile:** test on a real phone. Pointer-driven effects (cursor trails, tilt) need a touch fallback.
7. If the user only needs a simple effect, a few lines of CSS or GSAP may beat pulling in a component. Prefer the lighter option.

## Workflow to suggest a component

1. Ask (or infer) the goal: text reveal, background, card hover, button micro-interaction.
2. Browse the matching category on reactbits.dev (Index page lets you browse all visually).
3. Pick the variant, run the install command, import it, and wire up props.
4. Verify in the dev server, check reduced motion and mobile, then finish.
