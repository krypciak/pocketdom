import { describe, expect, test, beforeAll } from 'bun:test'
import { createWindow, getXhrBackend, setCanvasBackend, setXhrBackend } from '../src'

class FakeContext {
    canvas: any = null
    drawn: any[] = []
    patterns: any[] = []
    drawImage(image: any) {
        this.drawn.push(image)
    }
    createPattern(image: any) {
        this.patterns.push(image)
        return { image }
    }
    clearRect() {}
}

class FakeNativeCanvas {
    _width: number
    _height: number
    context = new FakeContext()
    getContextCalls = 0
    toDataURLCalls = 0

    constructor(width: number, height: number) {
        this._width = width
        this._height = height
        this.context.canvas = this
    }

    get width() {
        return this._width
    }
    set width(value: number) {
        this._width = value
    }
    get height() {
        return this._height
    }
    set height(value: number) {
        this._height = value
    }

    getContext() {
        this.getContextCalls++
        return this.context
    }

    toDataURL() {
        this.toDataURLCalls++
        return `data:image/png;base64,${this._width}x${this._height}`
    }

    toBuffer() {
        return Buffer.from(`${this._width}x${this._height}`)
    }

    encode() {
        return this.toBuffer()
    }
}

class FakeImage {
    _src = ''
    width = 0
    height = 0
    complete = false
    naturalWidth = 0
    naturalHeight = 0
    onload: any = null
    onerror: any = null

    get src() {
        return this._src
    }

    set src(value: string) {
        this._src = String(value)
        this.width = 16
        this.height = 8
        this.naturalWidth = 16
        this.naturalHeight = 8
        this.complete = true
        Promise.resolve().then(() => {
            if (this.onload) this.onload({ type: 'load' })
        })
    }
}

const fileSystem: Record<string, string> = {
    '/data/a.txt': 'hello world',
    'data/a.txt': 'hello world (relative)',
    '/data/a.json': '{"ok":true}',
    '/abs/assets/data/x.json': '{"x":1}',
}

beforeAll(() => {
    setCanvasBackend({
        createCanvas: (width, height) => new FakeNativeCanvas(width, height) as any,
        createImage: () => new FakeImage() as any,
    })
    setXhrBackend({
        resolvePath(path: string) {
            if (path.startsWith('/assets/')) return '/abs' + path
            return path
        },
        readFile(path: string) {
            const value = fileSystem[path]
            if (value == null) return null
            return new TextEncoder().encode(value)
        },
    })
})

describe('canvas element', () => {
    test('wraps a native canvas and resizes in place', () => {
        const win: any = createWindow({ bodyHTML: '<canvas id="c" width="568" height="320"></canvas>' })
        const canvas = win.document.getElementById('c')
        expect(canvas.width).toBe(568)
        expect(canvas.height).toBe(320)

        const context = canvas.getContext('2d')
        expect(context).toBeTruthy()
        const native = canvas.__nativeCanvas
        expect(native.width).toBe(568)

        canvas.width = 100
        canvas.height = 50
        expect(native.width).toBe(100)
        expect(native.height).toBe(50)
        expect(canvas.getContext('2d')).toBe(context)

        expect(canvas.toDataURL()).toBe('data:image/png;base64,100x50')
        expect(canvas.toBuffer().toString()).toBe('100x50')
    })

    test('unwraps DOM canvases/images for drawImage', async () => {
        const win: any = createWindow({ bodyHTML: '<canvas id="a"></canvas>' })
        const doc = win.document
        const a = doc.getElementById('a')
        const b = doc.createElement('canvas')
        const context = a.getContext('2d')
        const nativeB = b.__nativeCanvas
        context.drawImage(b, 0, 0)
        expect(context.drawn[0]).toBe(nativeB)

        const img = doc.createElement('img')
        img.src = 'picture.png'
        await Promise.resolve()
        context.drawImage(img, 0, 0)
        expect(context.drawn[1]).toBe(img.__nativeImage)
    })

    test('toBlob passes a Blob to the callback', () => {
        const win: any = createWindow()
        const canvas = win.document.createElement('canvas')
        let blob: any = null
        ;(canvas as any).toBlob((value: any) => (blob = value), 'image/png')
        expect(blob).toBeTruthy()
        expect(blob.type).toBe('image/png')
    })
})

describe('image element', () => {
    test('forwards load events and size', async () => {
        const win: any = createWindow()
        const img = win.document.createElement('img')
        let loaded = 0
        img.addEventListener('load', () => loaded++)
        img.src = 'some.png'
        await Promise.resolve()
        await Promise.resolve()
        expect(loaded).toBe(1)
        expect(img.src).toBe('some.png')
        expect(img.width).toBe(16)
        expect(img.height).toBe(8)
        expect(img.naturalWidth).toBe(16)
        expect(img.complete).toBe(true)
    })
})

describe('XMLHttpRequest', () => {
    test('reads files synchronously and fires load', () => {
        const win: any = createWindow()
        const xhr = new win.XMLHttpRequest()
        const states: number[] = []
        let loaded = 0
        xhr.onreadystatechange = () => states.push(xhr.readyState)
        xhr.onload = () => loaded++
        xhr.open('GET', 'file:///data/a.txt')
        expect(xhr.readyState).toBe(1)
        xhr.send()
        expect(loaded).toBe(1)
        expect(xhr.readyState).toBe(4)
        expect(xhr.status).toBe(200)
        expect(xhr.statusText).toBe('OK')
        expect(xhr.responseText).toBe('hello world')
        expect(states).toEqual([1, 2, 3, 4])
        expect(xhr.getResponseHeader('content-type')).toBe('text/plain')
    })

    test('json and arraybuffer response types', () => {
        const win: any = createWindow()
        const json = new win.XMLHttpRequest()
        json.responseType = 'json'
        let data: any = null
        json.onload = () => (data = json.response)
        json.open('GET', 'file:///data/a.json')
        json.send()
        expect(data).toEqual({ ok: true })

        const binary = new win.XMLHttpRequest()
        binary.responseType = 'arraybuffer'
        let buffer: any = null
        binary.onload = () => (buffer = binary.response)
        binary.open('GET', 'file:///data/a.txt')
        binary.send()
        expect(buffer instanceof ArrayBuffer).toBe(true)
        expect(new TextDecoder().decode(buffer)).toBe('hello world')
    })

    test('missing files fire error', () => {
        const win: any = createWindow()
        const xhr = new win.XMLHttpRequest()
        let error = 0
        let load = 0
        xhr.onerror = () => error++
        xhr.onload = () => load++
        xhr.open('GET', 'file:///data/missing.txt')
        xhr.send()
        expect(error).toBe(1)
        expect(load).toBe(0)
        expect(xhr.readyState).toBe(4)
        expect(xhr.status).toBe(0)
    })

    test('Simplify-style prototype.open override works', () => {
        const win: any = createWindow()
        const XHR = win.XMLHttpRequest
        const original = XHR.prototype.open
        XHR.prototype.open = function (method: string, url: string) {
            const args = Array.prototype.slice.call(arguments)
            args[1] = 'file:///abs/assets/' + url
            return original.apply(this, args)
        }
        try {
            const xhr = new XHR()
            let text = ''
            xhr.onload = () => (text = xhr.responseText)
            xhr.open('GET', 'data/x.json')
            xhr.send()
            expect(text).toBe('{"x":1}')
        } finally {
            XHR.prototype.open = original
        }
    })

    test('data URLs are decoded', () => {
        const win: any = createWindow()
        const xhr = new win.XMLHttpRequest()
        let text = ''
        xhr.onload = () => (text = xhr.responseText)
        xhr.open('GET', 'data:text/plain,hello%20there')
        xhr.send()
        expect(text).toBe('hello there')
    })

    test('addEventListener load fires', () => {
        const win: any = createWindow()
        const xhr = new win.XMLHttpRequest()
        let fired = 0
        xhr.addEventListener('load', () => fired++)
        xhr.open('GET', 'file:///data/a.txt')
        xhr.send()
        expect(fired).toBe(1)
    })

    test('abort fires abort/loadend', () => {
        const win: any = createWindow()
        const xhr = new win.XMLHttpRequest()
        let aborted = 0
        let ended = 0
        xhr.addEventListener('abort', () => aborted++)
        xhr.addEventListener('loadend', () => ended++)
        xhr.open('GET', 'file:///data/a.txt')
        xhr.abort()
        expect(aborted).toBe(1)
        expect(ended).toBe(1)
        expect(xhr.readyState).toBe(4)
    })
})

describe('XMLHttpRequest path handling', () => {
    test('file://<relative> keeps the relative path', () => {
        const win: any = createWindow()
        const xhr = new win.XMLHttpRequest()
        let error = 0
        let text = ''
        xhr.onerror = () => error++
        xhr.onload = () => (text = xhr.responseText)
        // /data/a.txt exists in the fake backend, file://data/a.txt would be
        // resolved relative to the CWD, so it must not become "/a.txt".
        xhr.open('GET', 'file://data/a.txt')
        xhr.send()
        expect(error).toBe(0)
        expect(text).toBe('hello world (relative)')
    })

    test('file://localhost/abs is stripped', () => {
        const win: any = createWindow()
        const xhr = new win.XMLHttpRequest()
        let text = ''
        xhr.onload = () => (text = xhr.responseText)
        xhr.open('GET', 'file://localhost/data/a.txt')
        xhr.send()
        expect(text).toBe('hello world')
    })
})

describe('XMLHttpRequest async reads', () => {
    /** Swaps in a backend for the duration of a test, then restores it. */
    function useBackend(backend: any): () => void {
        const previous = getXhrBackend()
        setXhrBackend(backend)
        return () => setXhrBackend(previous)
    }

    test('asynchronous requests use readFileAsync', async () => {
        const calls: string[] = []
        const restore = useBackend({
            readFile(path: string) {
                calls.push('sync:' + path)
                return null
            },
            readFileAsync(path: string) {
                calls.push('async:' + path)
                return Promise.resolve(new TextEncoder().encode('async body'))
            },
        })

        try {
            const win: any = createWindow()
            const xhr = new win.XMLHttpRequest()
            let loads = 0
            const loaded = new Promise<void>(resolve =>
                xhr.addEventListener('load', () => {
                    loads++
                    resolve()
                })
            )

            xhr.open('GET', 'file:///data/a.txt')
            xhr.send()

            // The request is still in flight when send() returns.
            expect(loads).toBe(0)
            expect(xhr.readyState).toBe(1)
            expect(xhr.status).toBe(0)

            await loaded

            expect(loads).toBe(1)
            expect(xhr.readyState).toBe(4)
            expect(xhr.status).toBe(200)
            expect(xhr.responseText).toBe('async body')
            expect(xhr.getResponseHeader('content-type')).toBe('text/plain')
            expect(calls).toEqual(['async:/data/a.txt'])
        } finally {
            restore()
        }
    })

    test('synchronous requests block on readFile', () => {
        const calls: string[] = []
        const restore = useBackend({
            readFile() {
                calls.push('sync')
                return new TextEncoder().encode('sync body')
            },
            readFileAsync() {
                calls.push('async')
                return Promise.resolve(new TextEncoder().encode('async body'))
            },
        })

        try {
            const win: any = createWindow()
            const xhr = new win.XMLHttpRequest()
            let loads = 0
            xhr.onload = () => loads++

            xhr.open('GET', 'file:///data/a.txt', false)
            xhr.send()

            expect(loads).toBe(1)
            expect(xhr.readyState).toBe(4)
            expect(xhr.responseText).toBe('sync body')
            expect(calls).toEqual(['sync'])
        } finally {
            restore()
        }
    })

    test('a backend without readFileAsync stays synchronous', () => {
        const restore = useBackend({
            readFile() {
                return new TextEncoder().encode('legacy body')
            },
        })

        try {
            const win: any = createWindow()
            const xhr = new win.XMLHttpRequest()
            let text = ''
            xhr.onload = () => (text = xhr.responseText)

            xhr.open('GET', 'file:///data/a.txt')
            xhr.send()

            expect(text).toBe('legacy body')
            expect(xhr.readyState).toBe(4)
        } finally {
            restore()
        }
    })

    test('async misses and rejections fire error', async () => {
        const implementations: (() => Promise<Uint8Array | null>)[] = [() => Promise.resolve(null), () => Promise.reject(new Error('boom'))]

        for (const readFileAsync of implementations) {
            const restore = useBackend({ readFile: () => null, readFileAsync })

            try {
                const win: any = createWindow()
                const xhr = new win.XMLHttpRequest()
                const failed = new Promise<number>(resolve => xhr.addEventListener('error', () => resolve(xhr.status)))

                xhr.open('GET', 'file:///data/missing.txt')
                xhr.send()

                expect(await failed).toBe(0)
                expect(xhr.readyState).toBe(4)
                expect(xhr.responseText).toBe('')
            } finally {
                restore()
            }
        }
    })

    test('aborting a pending async read suppresses load', async () => {
        let finishRead: any = null
        const restore = useBackend({
            readFile: () => null,
            readFileAsync: () => new Promise(resolve => (finishRead = resolve)),
        })

        try {
            const win: any = createWindow()
            const xhr = new win.XMLHttpRequest()
            let loads = 0
            let aborts = 0
            xhr.onload = () => loads++
            xhr.onabort = () => aborts++

            xhr.open('GET', 'file:///data/a.txt')
            xhr.send()
            xhr.abort()
            finishRead(new TextEncoder().encode('late body'))
            await Promise.resolve()
            await Promise.resolve()

            expect(aborts).toBe(1)
            expect(loads).toBe(0)
            expect(xhr.responseText).toBe('')
        } finally {
            restore()
        }
    })
})

describe('XMLHttpRequest stale responses', () => {
    test('a reopened request ignores the previous pending read', async () => {
        const resolvers: ((data: Uint8Array | null) => void)[] = []
        const previous = getXhrBackend()
        setXhrBackend({
            readFile: () => null,
            readFileAsync: () => new Promise(resolve => resolvers.push(resolve)),
        })

        try {
            const win: any = createWindow()
            const xhr = new win.XMLHttpRequest()
            const texts: string[] = []
            xhr.addEventListener('load', () => texts.push(xhr.responseText))

            xhr.open('GET', 'file:///data/a.txt')
            xhr.send()
            xhr.open('GET', 'file:///data/a.txt')
            xhr.send()

            resolvers[0](new TextEncoder().encode('stale'))
            await Promise.resolve()
            await Promise.resolve()
            expect(texts).toEqual([])
            expect(xhr.readyState).toBe(1)

            resolvers[1](new TextEncoder().encode('fresh'))
            await Promise.resolve()
            await Promise.resolve()
            expect(texts).toEqual(['fresh'])
            expect(xhr.responseText).toBe('fresh')
        } finally {
            setXhrBackend(previous)
        }
    })
})
