import type { DomCanvasBackend, DomNativeCanvas, DomNativeImage } from './backend'

/*
 * `@napi-rs/canvas` (Skia) backend.
 *
 * The module is loaded lazily and through a runtime-built specifier so that
 * bundlers (notably Porffor's) do not try to link the native addon when the
 * pure JavaScript backend is selected.
 */

interface NativeCanvasModule {
    createCanvas(width: number, height: number): DomNativeCanvas
    Image: new (...args: any[]) => DomNativeImage
}

let nativeModule: NativeCanvasModule | null = null

export function loadNativeCanvasModule(): NativeCanvasModule {
    if (nativeModule) return nativeModule
    const specifier = ['@napi-rs', 'canvas'].join('/')
    const loaded = require(specifier)
    nativeModule = (loaded?.default ?? loaded) as NativeCanvasModule
    return nativeModule
}

export const nativeCanvasBackend: DomCanvasBackend = {
    createCanvas(width: number, height: number): DomNativeCanvas {
        return loadNativeCanvasModule().createCanvas(width, height)
    },
    createImage(): DomNativeImage {
        const ImageClass = loadNativeCanvasModule().Image
        return new ImageClass()
    },
}
