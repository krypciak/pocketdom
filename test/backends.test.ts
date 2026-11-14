import { describe, expect, test, beforeAll, afterAll } from 'bun:test'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { createWindow, nativeCanvasBackend, pureimageCanvasBackend, setCanvasBackend, setXhrBackend, type DomCanvasBackend } from '../src'

/*
 * These tests exercise the real canvas backends (not the no-op fallback), so
 * they need @napi-rs/canvas and pureimage installed.
 */

const backends: [string, DomCanvasBackend][] = [
    ['native', nativeCanvasBackend],
    ['pureimage', pureimageCanvasBackend],
]

let dir = ''

beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pocketdom-'))
    setXhrBackend({
        readFile(file: string) {
            try {
                return fs.readFileSync(file)
            } catch {
                return null
            }
        },
    })
})

afterAll(() => {
    setXhrBackend(null)
    setCanvasBackend(null)
    fs.rmSync(dir, { recursive: true, force: true })
})

for (const [name, backend] of backends) {
    describe(`${name} backend`, () => {
        test('canvas draws and reads pixels', () => {
            setCanvasBackend(backend)
            const win: any = createWindow({ width: 100, height: 60 })
            const canvas: any = win.document.createElement('canvas')
            canvas.width = 40
            canvas.height = 30
            expect(canvas.width).toBe(40)
            expect(canvas.height).toBe(30)

            const ctx = canvas.getContext('2d')
            ctx.fillStyle = '#ff0000'
            ctx.fillRect(0, 0, 10, 10)

            const pixel = ctx.getImageData(5, 5, 1, 1).data
            expect(pixel[0]).toBeGreaterThan(200)
            expect(pixel[1]).toBeLessThan(60)
            expect(pixel[3]).toBe(255)

            const empty = ctx.getImageData(30, 20, 1, 1).data
            expect(empty[3]).toBe(0)
        })

        test('canvas encodes to png', async () => {
            setCanvasBackend(backend)
            const win: any = createWindow()
            const canvas: any = win.document.createElement('canvas')
            canvas.width = 16
            canvas.height = 16
            canvas.getContext('2d').fillRect(0, 0, 16, 16)

            const native = canvas.__nativeCanvas
            const buffer = typeof native.encode === 'function' ? await native.encode('png') : native.toBuffer('png')
            expect(buffer.length).toBeGreaterThan(50)
            // PNG magic number
            expect(Array.from(buffer.slice(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47])
        })

        test('image elements load a png from disk', async () => {
            setCanvasBackend(backend)
            const win: any = createWindow()

            // Write a png with the backend under test.
            const source: any = win.document.createElement('canvas')
            source.width = 8
            source.height = 4
            source.getContext('2d').fillRect(0, 0, 8, 4)
            const nativeSource = source.__nativeCanvas
            const data = typeof nativeSource.encode === 'function' ? await nativeSource.encode('png') : nativeSource.toBuffer('png')
            const file = path.join(dir, `${name}.png`)
            fs.writeFileSync(file, data)

            const img: any = win.document.createElement('img')
            const loaded = new Promise<any>(resolve => {
                img.addEventListener('load', () => resolve('load'))
                img.addEventListener('error', () => resolve('error'))
            })
            img.src = file
            expect(await loaded).toBe('load')
            expect(img.naturalWidth).toBe(8)
            expect(img.naturalHeight).toBe(4)
        })

        test('drawImage accepts another canvas element', () => {
            setCanvasBackend(backend)
            const win: any = createWindow()

            const source: any = win.document.createElement('canvas')
            source.width = 4
            source.height = 4
            const sourceCtx = source.getContext('2d')
            sourceCtx.fillStyle = '#00ff00'
            sourceCtx.fillRect(0, 0, 4, 4)

            const target: any = win.document.createElement('canvas')
            target.width = 8
            target.height = 8
            const ctx = target.getContext('2d')
            ctx.drawImage(source, 0, 0)

            const pixel = ctx.getImageData(1, 1, 1, 1).data
            expect(pixel[1]).toBeGreaterThan(200)
            expect(pixel[3]).toBe(255)
        })
    })
}
