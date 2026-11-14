> [!CAUTION]
>
> # 🚨 EXTREMELY VIBECODED 🚨
>
> **This is not a general purpose DOM. Do not drop it into your project and expect it to work.**
>
> `pocketdom` was extracted from [crossnode](https://github.com/krypciak/crossnode) and exists
> for exactly **one** consumer: running CrossCode headless. Every API in here was added because
> CrossCode, CCLoader2/Simplify or some CrossCode mod happened to touch it — nothing was added
> because the spec says so.
>
> That means:
>
> - **The feature set is aggressively, deliberately limited.** If CrossCode does not call it,
>   it is missing, stubbed out, or quietly wrong. `innerHTML` round trips, attribute
>   reflection, CSS cascade, layout, form semantics, tables and ranges are all best-effort at
>   best.
> - **There is no layout engine and no real CSS.** `offsetWidth`, `getBoundingClientRect()`,
>   `getComputedStyle()` and friends return plausible looking lies.
> - **It was written by an AI, and reviewed by nobody.** Most of it is not spec compliant;
>   where behaviour conflicts with convenience, convenience won. The tests only prove that
>   CrossCode boots on two canvas backends.
> - **There is no support, no semver and no backwards compatibility.** Anything can change or
>   be deleted the moment crossnode stops needing it. There is no npm release and there are no
>   plans for one.
> - **Not a browser.** Also not happy-dom, not jsdom, and not `min-document`. If you want a
>   real DOM in Node, use one of those instead.
>
> Treat the "features" below as "things that happened to be necessary", not as an API contract.

# pocketdom

A small browser environment for JavaScript runtimes that do not have one. It exists to run
CrossCode headless through [crossnode](https://github.com/krypciak/crossnode) — read the warning
above before reaching for it anywhere else.

`pocketdom` provides the slice of the browser that CrossCode happens to need, so it can run
headless in Node, Bun or a [Porffor](https://github.com/CanadaHonk/porffor) compiled binary:

- **DOM**: `window`, `document`, elements, attributes, `classList`/`style`, a simple HTML
  parser, `querySelector`/`matches`, bubbling/capturing events, `DOMParser`.
- **canvas**: `<canvas>`/`<img>` elements backed by a pluggable 2D canvas implementation.
- **XMLHttpRequest**: synchronous `file://` reads from disk, `data:` URLs, `fetch` for http(s).
- **FileReader**, `Image`, `DOMParser` and the usual event classes.

Everything is plain TypeScript with no dependencies in the core, and it deliberately avoids
patterns that the Porffor compiler cannot handle (no `Map`/`Set`/`WeakMap`, no private class
fields, no decorators).

## Usage

```ts
import fs from 'fs'
import { createWindow, installWindowGlobals, nativeCanvasBackend, setCanvasBackend, setXhrBackend } from 'pocketdom'

setCanvasBackend(nativeCanvasBackend)
setXhrBackend({
    readFile(path) {
        try {
            return fs.readFileSync(path)
        } catch {
            return null
        }
    },
})

const window = createWindow({
    width: 1136,
    height: 640,
    bodyHTML: '<div id="game"><canvas id="canvas" width="568" height="320"></canvas></div>',
})

// Mirrors window/document/location and every constructor listed in DOM_GLOBALS
// onto globalThis, so bare `document`, `HTMLElement`, `Image`, ... work.
installWindowGlobals(window)
```

`createWindow()` returns a `DomWindow`. `installWindowGlobals(win, target?)` copies it onto
`globalThis` (or any other object); the list of copied constructors is exported as
`DOM_GLOBALS` if you need to filter or extend it.

## Canvas backends

| Backend                  | Module                                                             | Notes                                                       |
| ------------------------ | ------------------------------------------------------------------ | ----------------------------------------------------------- |
| `nativeCanvasBackend`    | [`@napi-rs/canvas`](https://github.com/Brooooooklyn/canvas) (Skia) | pixel accurate, native addon, not usable in Porffor         |
| `pureimageCanvasBackend` | [`pureimage`](https://github.com/joshmarinacci/node-pureimage)     | pure JavaScript, works in Porffor, slower and less accurate |

Both are plain objects with two hooks:

```ts
interface DomCanvasBackend {
    createCanvas(width: number, height: number): DomNativeCanvas
    createImage(): DomNativeImage
}
```

Install only the backend you need: `@napi-rs/canvas`, or `pureimage` + `pngjs` + `jpeg-js`.
Without a backend the DOM still works, canvases just do nothing.

Known `pureimage` limitations: `globalCompositeOperation` is ignored, `createPattern()` is not
implemented, WebP is unsupported, and text metrics differ from Skia.

## XHR backend

```ts
interface DomXhrBackend {
    readFile(path: string): Uint8Array | null
    resolvePath?(url: string): string
}
```

`file://` URLs are resolved as follows: `/abs` stays absolute, `file://localhost/...` loses the
host, anything else is treated as relative to the process working directory (so
`file://data/x.json` reads `data/x.json`). `file://` requests complete synchronously.

## Tests

```bash
bun test
bunx tsc --noEmit
```

`test/backends.test.ts` exercises both real canvas backends, the rest uses fake backends and
covers the DOM, events, selectors, the parser, XHR and a CCLoader2/Simplify/jQuery style flow.
