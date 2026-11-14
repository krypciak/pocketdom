/*
 * Pluggable canvas/image backend.
 *
 * Install one of the bundled backends (./native.ts, ./pureimage.ts) with
 * setCanvasBackend(). Without one, a no-op fallback keeps the DOM usable.
 */

export interface DomNativeCanvas {
    width: number
    height: number
    getContext(type: string, attributes?: any): any
    toDataURL(type?: string, quality?: number): string
    toBuffer?(type?: string, quality?: number): any
    encode?(type?: string, quality?: number): any
}

export interface DomNativeImage {
    src: string
    width: number
    height: number
    complete?: boolean
    naturalWidth?: number
    naturalHeight?: number
    onload: any
    onerror: any
    decode?(): Promise<void>
    [key: string]: any
}

export interface DomCanvasBackend {
    createCanvas(width: number, height: number): DomNativeCanvas
    createImage(): DomNativeImage
}

function createNoopContext(): any {
    const noop = () => {}
    return {
        canvas: null,
        globalAlpha: 1,
        globalCompositeOperation: 'source-over',
        fillStyle: '#000',
        strokeStyle: '#000',
        lineWidth: 1,
        font: '10px sans-serif',
        textAlign: 'start',
        textBaseline: 'alphabetic',
        imageSmoothingEnabled: true,
        save: noop,
        restore: noop,
        scale: noop,
        rotate: noop,
        translate: noop,
        transform: noop,
        setTransform: noop,
        resetTransform: noop,
        clearRect: noop,
        fillRect: noop,
        strokeRect: noop,
        beginPath: noop,
        closePath: noop,
        moveTo: noop,
        lineTo: noop,
        bezierCurveTo: noop,
        quadraticCurveTo: noop,
        arc: noop,
        arcTo: noop,
        ellipse: noop,
        rect: noop,
        fill: noop,
        stroke: noop,
        clip: noop,
        isPointInPath: () => false,
        fillText: noop,
        strokeText: noop,
        measureText: (text: string) => ({ width: String(text).length * 6, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 }),
        drawImage: noop,
        createLinearGradient: () => ({ addColorStop: noop }),
        createRadialGradient: () => ({ addColorStop: noop }),
        createPattern: () => null,
        createImageData: (width: number, height: number) => ({ width, height, data: new Uint8ClampedArray(width * height * 4) }),
        getImageData: (x: number, y: number, width: number, height: number) => ({ width, height, data: new Uint8ClampedArray(width * height * 4) }),
        putImageData: noop,
        setLineDash: noop,
        getLineDash: () => [],
    }
}

function createFallbackCanvas(width: number, height: number): DomNativeCanvas {
    const canvas: any = {
        width,
        height,
        getContext() {
            if (!canvas.__context) {
                canvas.__context = createNoopContext()
                canvas.__context.canvas = canvas
            }
            return canvas.__context
        },
        toDataURL() {
            return 'data:image/png;base64,'
        },
        toBuffer() {
            return new Uint8Array(0)
        },
        encode() {
            return new Uint8Array(0)
        },
    }
    return canvas
}

function createFallbackImage(): DomNativeImage {
    const image: any = {
        _src: '',
        width: 0,
        height: 0,
        complete: false,
        naturalWidth: 0,
        naturalHeight: 0,
        onload: null,
        onerror: null,
        get src() {
            return image._src
        },
        set src(value: string) {
            image._src = String(value == null ? '' : value)
            image.complete = true
        },
        decode() {
            return Promise.resolve()
        },
    }
    return image
}

const fallbackBackend: DomCanvasBackend = {
    createCanvas: createFallbackCanvas,
    createImage: createFallbackImage,
}

let currentBackend: DomCanvasBackend = fallbackBackend

export function setCanvasBackend(backend: DomCanvasBackend | null): void {
    currentBackend = backend || fallbackBackend
}

export function getCanvasBackend(): DomCanvasBackend {
    return currentBackend
}

/** Unwraps DomHTMLCanvasElement/DomHTMLImageElement wrappers for native drawImage. */
export function resolveCanvasSource(source: any, depth?: number): any {
    const level = depth || 0
    if (!source || level > 4) return source
    if (source.__nativeCanvas) return source.__nativeCanvas
    if (source.__nativeImage) return resolveCanvasSource(source.__nativeImage, level + 1)
    if (source.__domCanvasSource) return resolveCanvasSource(source.__domCanvasSource, level + 1)
    return source
}
