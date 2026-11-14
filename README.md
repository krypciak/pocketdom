# pocketdom

A small browser environment for JavaScript runtimes that do not have one.

`pocketdom` provides just enough of the browser to run browser oriented code (games,
canvas renderers, old jQuery era code) headlessly in Node, Bun or a
[Porffor](https://github.com/CanadaHonk/porffor) compiled binary:

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
import { createWindow, nativeCanvasBackend, setCanvasBackend, setXhrBackend } from 'pocketdom'

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

globalThis.window = window
globalThis.document = window.document
```

`createWindow()` returns a `DomWindow`; assign `window`, `document`, `location` and whichever
DOM constructors your code expects to `globalThis` (see `crossnode`'s `src/dom.ts` for a
complete bootstrap).

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
