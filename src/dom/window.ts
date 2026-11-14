import {
    DomCustomEvent,
    DomErrorEvent,
    DomEvent,
    DomEventTarget,
    DomFocusEvent,
    DomInputEvent,
    DomKeyboardEvent,
    DomMessageEvent,
    DomMouseEvent,
    DomProgressEvent,
    DomTouchEvent,
    DomUIEvent,
    DomWheelEvent,
} from './event'
import { DomDocument } from './document'
import { DomDocumentFragment, DomNode, DomText, DomComment } from './nodes'
import {
    DomElement,
    DomHTMLElement,
    DomHTMLAnchorElement,
    DomHTMLButtonElement,
    DomHTMLCanvasElement,
    DomHTMLFormElement,
    DomHTMLImageElement,
    DomHTMLInputElement,
    DomHTMLLinkElement,
    DomHTMLMediaElement,
    DomHTMLOptionElement,
    DomHTMLScriptElement,
    DomHTMLSelectElement,
    DomHTMLStyleElement,
    DomHTMLTableElement,
    DomHTMLTableCellElement,
    DomHTMLTableRowElement,
    DomHTMLTableSectionElement,
    DomHTMLTemplateElement,
    DomHTMLTextAreaElement,
} from './elements'
import { DomXMLHttpRequest } from '../xhr'
import { DomCSSStyleDeclaration } from './style'
import { parseDocumentInto } from './parser'

export interface DomWindowOptions {
    url?: string
    width?: number
    height?: number
    screenWidth?: number
    screenHeight?: number
    bodyHTML?: string
    userAgent?: string
    platform?: string
    console?: any
}

class DomLocation {
    _href: string = 'http://localhost/'

    constructor(href: string) {
        this._href = href
    }

    get href(): string {
        return this._href
    }

    set href(value: string) {
        this._href = String(value)
    }

    get origin(): string {
        const match = /^([a-z][a-z0-9+.-]*:\/\/[^/]+)/i.exec(this._href)
        return match ? match[1] : ''
    }

    get protocol(): string {
        const colon = this._href.indexOf(':')
        return colon < 0 ? '' : this._href.slice(0, colon + 1)
    }

    get host(): string {
        const match = /^[a-z][a-z0-9+.-]*:\/\/([^/?#]*)/i.exec(this._href)
        return match ? match[1] : ''
    }

    get hostname(): string {
        const host = this.host
        const colon = host.lastIndexOf(':')
        return colon < 0 ? host : host.slice(0, colon)
    }

    get port(): string {
        const host = this.host
        const colon = host.lastIndexOf(':')
        return colon < 0 ? '' : host.slice(colon + 1)
    }

    get pathname(): string {
        const match = /^[a-z][a-z0-9+.-]*:\/\/[^/?#]*([^?#]*)/i.exec(this._href)
        if (match) return match[1] || '/'
        const hash = this._href.indexOf('#')
        const query = this._href.indexOf('?')
        let end = this._href.length
        if (hash >= 0 && hash < end) end = hash
        if (query >= 0 && query < end) end = query
        return this._href.slice(0, end) || '/'
    }

    get search(): string {
        const query = this._href.indexOf('?')
        if (query < 0) return ''
        const hash = this._href.indexOf('#')
        return hash < 0 ? this._href.slice(query) : this._href.slice(query, hash)
    }

    get hash(): string {
        const hash = this._href.indexOf('#')
        return hash < 0 ? '' : this._href.slice(hash)
    }

    assign(url: string): void {
        this._href = String(url)
    }

    replace(url: string): void {
        this._href = String(url)
    }

    reload(): void {}

    toString(): string {
        return this._href
    }
}

class DomStorage {
    _data: Record<string, string> = {}

    get length(): number {
        return Object.keys(this._data).length
    }

    key(index: number): string | null {
        const keys = Object.keys(this._data)
        return index >= 0 && index < keys.length ? keys[index] : null
    }

    getItem(key: string): string | null {
        const value = this._data[String(key)]
        return value == null ? null : value
    }

    setItem(key: string, value: any): void {
        this._data[String(key)] = String(value)
    }

    removeItem(key: string): void {
        delete this._data[String(key)]
    }

    clear(): void {
        this._data = {}
    }
}

export class DomBlob {
    _parts: any[] = []
    size: number = 0
    type: string = ''

    constructor(parts?: any[], options?: any) {
        this._parts = parts || []
        let size = 0
        for (let i = 0; i < this._parts.length; i++) {
            const part = this._parts[i]
            if (typeof part === 'string') size += part.length
            else if (part && typeof part.byteLength === 'number') size += part.byteLength
            else if (part && typeof part.length === 'number') size += part.length
        }
        this.size = size
        this.type = options && options.type ? String(options.type) : ''
    }

    arrayBuffer(): Promise<ArrayBuffer> {
        return Promise.resolve(this._merge())
    }

    text(): Promise<string> {
        const merged = this._merge()
        let out = ''
        const bytes = new Uint8Array(merged)
        for (let i = 0; i < bytes.length; i++) out += String.fromCharCode(bytes[i])
        return Promise.resolve(out)
    }

    slice(start?: number, end?: number, type?: string): DomBlob {
        const merged = new Uint8Array(this._merge())
        return new DomBlob([merged.slice(start || 0, end == null ? merged.length : end)], { type: type || this.type })
    }

    stream(): any {
        return null
    }

    _merge(): ArrayBuffer {
        const chunks: Uint8Array[] = []
        let total = 0
        for (let i = 0; i < this._parts.length; i++) {
            const part = this._parts[i]
            if (typeof part === 'string') {
                const bytes = new Uint8Array(part.length)
                for (let j = 0; j < part.length; j++) bytes[j] = part.charCodeAt(j) & 0xff
                chunks.push(bytes)
                total += bytes.length
            } else if (part instanceof Uint8Array) {
                chunks.push(part)
                total += part.length
            } else if (part instanceof ArrayBuffer) {
                const bytes = new Uint8Array(part)
                chunks.push(bytes)
                total += bytes.length
            } else if (part && part.buffer) {
                const bytes = new Uint8Array(part.buffer, part.byteOffset || 0, part.byteLength || 0)
                chunks.push(bytes)
                total += bytes.length
            }
        }
        const merged = new Uint8Array(total)
        let offset = 0
        for (let i = 0; i < chunks.length; i++) {
            merged.set(chunks[i], offset)
            offset += chunks[i].length
        }
        return merged.buffer as ArrayBuffer
    }
}

export class DomFile extends DomBlob {
    name: string = ''
    lastModified: number = 0

    constructor(parts?: any[], name?: string, options?: any) {
        super(parts, options)
        this.name = name == null ? '' : String(name)
        this.lastModified = options && options.lastModified ? options.lastModified : Date.now()
    }
}

export class DomFileReader extends DomEventTarget {
    result: any = null
    error: any = null
    readyState: number = 0
    onload: any = null
    onerror: any = null
    onloadend: any = null
    onprogress: any = null

    readAsText(blob: any, _encoding?: string): void {
        this.readyState = 1
        const done = (text: string) => {
            this.result = text
            this.readyState = 2
            this.dispatchEvent(new DomProgressEvent('load'))
            this.dispatchEvent(new DomProgressEvent('loadend'))
        }
        if (blob && typeof blob.text === 'function') blob.text().then(done)
        else done(String(blob == null ? '' : blob))
    }

    readAsArrayBuffer(blob: any): void {
        this.readyState = 1
        const done = (buffer: ArrayBuffer) => {
            this.result = buffer
            this.readyState = 2
            this.dispatchEvent(new DomProgressEvent('load'))
            this.dispatchEvent(new DomProgressEvent('loadend'))
        }
        if (blob && typeof blob.arrayBuffer === 'function') blob.arrayBuffer().then(done)
        else done(new ArrayBuffer(0))
    }

    readAsDataURL(blob: any): void {
        this.readAsArrayBuffer(blob)
    }

    abort(): void {}
}

export class DomFormData {
    _entries: Array<[string, any]> = []

    append(name: string, value: any): void {
        this._entries.push([String(name), value])
    }

    set(name: string, value: any): void {
        this.delete(name)
        this.append(name, value)
    }

    get(name: string): any {
        for (let i = 0; i < this._entries.length; i++) if (this._entries[i][0] === name) return this._entries[i][1]
        return null
    }

    getAll(name: string): any[] {
        const out: any[] = []
        for (let i = 0; i < this._entries.length; i++) if (this._entries[i][0] === name) out.push(this._entries[i][1])
        return out
    }

    has(name: string): boolean {
        return this.get(name) != null
    }

    delete(name: string): void {
        for (let i = this._entries.length - 1; i >= 0; i--) if (this._entries[i][0] === name) this._entries.splice(i, 1)
    }

    forEach(callback: (value: any, key: string) => void): void {
        for (let i = 0; i < this._entries.length; i++) callback(this._entries[i][1], this._entries[i][0])
    }
}

export class DomWindow extends DomEventTarget {
    window: any = null
    self: any = null
    top: any = null
    parent: any = null
    frames: any = null
    document: any = null
    location: any = null
    navigator: any = null
    screen: any = null
    history: any = null
    localStorage: any = null
    sessionStorage: any = null
    name: string = ''
    closed: boolean = false
    opener: any = null
    length: number = 0
    devicePixelRatio: number = 1
    innerWidth: number = 1136
    innerHeight: number = 640
    outerWidth: number = 1136
    outerHeight: number = 640
    scrollX: number = 0
    scrollY: number = 0
    pageXOffset: number = 0
    pageYOffset: number = 0
    isSecureContext: boolean = false
    origin: string = ''

    // DOM constructors
    Event: any = DomEvent
    UIEvent: any = DomUIEvent
    KeyboardEvent: any = DomKeyboardEvent
    MouseEvent: any = DomMouseEvent
    PointerEvent: any = DomMouseEvent
    WheelEvent: any = DomWheelEvent
    ProgressEvent: any = DomProgressEvent
    CustomEvent: any = DomCustomEvent
    FocusEvent: any = DomFocusEvent
    InputEvent: any = DomInputEvent
    ErrorEvent: any = DomErrorEvent
    MessageEvent: any = DomMessageEvent
    TouchEvent: any = DomTouchEvent

    Node: any = DomNode
    NodeList: any = null
    EventTarget: any = DomEventTarget
    Element: any = DomElement
    HTMLElement: any = DomHTMLElement
    HTMLCanvasElement: any = DomHTMLCanvasElement
    HTMLImageElement: any = DomHTMLImageElement
    HTMLInputElement: any = DomHTMLInputElement
    HTMLTextAreaElement: any = DomHTMLTextAreaElement
    HTMLSelectElement: any = DomHTMLSelectElement
    HTMLOptionElement: any = DomHTMLOptionElement
    HTMLTableElement: any = DomHTMLTableElement
    HTMLTableRowElement: any = DomHTMLTableRowElement
    HTMLTableCellElement: any = DomHTMLTableCellElement
    HTMLTableSectionElement: any = DomHTMLTableSectionElement
    HTMLMediaElement: any = DomHTMLMediaElement
    HTMLVideoElement: any = DomHTMLMediaElement
    HTMLAudioElement: any = DomHTMLMediaElement
    HTMLScriptElement: any = DomHTMLScriptElement
    HTMLTemplateElement: any = DomHTMLTemplateElement
    HTMLAnchorElement: any = DomHTMLAnchorElement
    HTMLStyleElement: any = DomHTMLStyleElement
    HTMLLinkElement: any = DomHTMLLinkElement
    HTMLButtonElement: any = DomHTMLButtonElement
    HTMLFormElement: any = DomHTMLFormElement
    Document: any = DomDocument
    DocumentFragment: any = DomDocumentFragment
    Text: any = DomText
    Comment: any = DomComment

    Image: any = DomHTMLImageElement
    Audio: any = DomHTMLMediaElement
    Option: any = DomHTMLOptionElement
    Blob: any = DomBlob
    File: any = DomFile
    FileReader: any = DomFileReader
    FormData: any = DomFormData
    XMLHttpRequest: any = DomXMLHttpRequest
    DOMException: any = null
    DOMParser: any = null
    URL: any = typeof URL !== 'undefined' ? URL : null
    URLSearchParams: any = typeof URLSearchParams !== 'undefined' ? URLSearchParams : null
    TextDecoder: any = typeof TextDecoder !== 'undefined' ? TextDecoder : null
    TextEncoder: any = typeof TextEncoder !== 'undefined' ? TextEncoder : null
    fetch: any = typeof fetch !== 'undefined' ? fetch : null
    WebSocket: any = typeof WebSocket !== 'undefined' ? WebSocket : null
    AbortController: any = typeof AbortController !== 'undefined' ? AbortController : null
    structuredClone: any = typeof structuredClone !== 'undefined' ? structuredClone : null
    console: any = console
    process: any = typeof process !== 'undefined' ? process : null
    performance: any = typeof performance !== 'undefined' ? performance : { now: () => Date.now() }
    crypto: any = typeof crypto !== 'undefined' ? crypto : null

    constructor(options?: DomWindowOptions) {
        super()
        const opts = options || {}
        this.window = this
        this.self = this
        this.top = this
        this.parent = this
        this.frames = this

        this.innerWidth = opts.width || 1136
        this.innerHeight = opts.height || 640
        this.outerWidth = this.innerWidth
        this.outerHeight = this.innerHeight
        this.screen = {
            width: opts.screenWidth || 1920,
            height: opts.screenHeight || 1080,
            availWidth: opts.screenWidth || 1920,
            availHeight: opts.screenHeight || 1080,
            colorDepth: 24,
            pixelDepth: 24,
            orientation: { type: 'landscape-primary', angle: 0, addEventListener: () => {}, removeEventListener: () => {} },
        }

        const href = opts.url || 'http://localhost/'
        this.location = new DomLocation(href)
        this.origin = this.location.origin
        this.history = {
            length: 1,
            state: null,
            scrollRestoration: 'auto',
            pushState() {},
            replaceState() {},
            back() {},
            forward() {},
            go() {},
        }

        const userAgent = opts.userAgent || 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) CrossCode/0.35.5 Safari/537.36'
        this.navigator = {
            userAgent,
            appName: 'Netscape',
            appVersion: '5.0 (X11; Linux x86_64)',
            appCodeName: 'Mozilla',
            platform: opts.platform || 'Linux x86_64',
            language: 'en-US',
            languages: ['en-US', 'en'],
            onLine: true,
            cookieEnabled: true,
            hardwareConcurrency: 8,
            maxTouchPoints: 0,
            vendor: '',
            webdriver: false,
            clipboard: {
                writeText: (_text: string) => Promise.resolve(),
                readText: () => Promise.resolve(''),
            },
            userAgentData: null,
            sendBeacon: () => false,
        }

        this.sessionStorage = new DomStorage()
        this.localStorage = new DomStorage()

        const win = this
        this.document = new DomDocument()
        this.document.defaultView = this
        this.document._url = href
        this.document.ownerDocument = null
        this.document._createSkeleton()

        const documentElement = this.document.documentElement
        documentElement._clientWidth = this.innerWidth
        documentElement._clientHeight = this.innerHeight
        if (this.document.body) {
            this.document.body._clientWidth = this.innerWidth
            this.document.body._clientHeight = this.innerHeight
        }
        this.document.activeElement = this.document.body

        const bodyHTML = opts.bodyHTML
        if (bodyHTML) {
            const body = this.document.body
            if (body) body.innerHTML = bodyHTML
            const newBody = this.document.body
            if (newBody) {
                newBody._clientWidth = this.innerWidth
                newBody._clientHeight = this.innerHeight
            }
            const newRoot = this.document.documentElement
            if (newRoot) {
                newRoot._clientWidth = this.innerWidth
                newRoot._clientHeight = this.innerHeight
            }
        }

        class DomDOMParser {
            parseFromString(html: string, _type?: string): any {
                const doc = new DomDocument()
                doc.defaultView = win
                doc._url = win.location.href
                parseDocumentInto(doc, html)
                return doc
            }
        }

        class DomDOMException extends Error {
            code: number = 0
            constructor(message?: string, name?: string) {
                super(message)
                this.name = name || 'Error'
            }
        }

        this.DOMException = DomDOMException
        this.DOMParser = DomDOMParser
        this.console = opts.console || console
    }

    setTimeout(callback: any, delay?: number, ...args: any[]): any {
        return setTimeout(callback, delay, ...args)
    }

    clearTimeout(id: any): void {
        clearTimeout(id)
    }

    setInterval(callback: any, delay?: number, ...args: any[]): any {
        return setInterval(callback, delay, ...args)
    }

    clearInterval(id: any): void {
        clearInterval(id)
    }

    setImmediate(callback: any, ...args: any[]): any {
        if (typeof setImmediate === 'function') return setImmediate(callback, ...args)
        return setTimeout(callback, 0, ...args)
    }

    clearImmediate(id: any): void {
        if (typeof clearImmediate === 'function') clearImmediate(id)
    }

    requestAnimationFrame(callback: any): any {
        return setTimeout(() => {
            callback(this.performance && this.performance.now ? this.performance.now() : Date.now())
        }, 16)
    }

    cancelAnimationFrame(id: any): void {
        clearTimeout(id)
    }

    requestIdleCallback(callback: any): any {
        return setTimeout(() => callback({ didTimeout: false, timeRemaining: () => 50 }), 1)
    }

    cancelIdleCallback(id: any): void {
        clearTimeout(id)
    }

    queueMicrotask(callback: any): void {
        if (typeof queueMicrotask === 'function') queueMicrotask(callback)
        else Promise.resolve().then(callback)
    }

    getComputedStyle(element: any, _pseudo?: string | null): any {
        if (!element || !element.style) {
            return new DomCSSStyleDeclaration()
        }
        const inline: DomCSSStyleDeclaration = element.style
        const pseudoStyle: any = {
            getPropertyValue(name: string): string {
                const value = inline.getPropertyValue(name)
                if (value) return value
                const key = String(name).toLowerCase()
                if (key === 'display') return element.localName === 'head' ? 'none' : element.localName === 'div' ? 'block' : ''
                if (key === 'visibility') return 'visible'
                if (key === 'position') return 'static'
                return ''
            },
            getPropertyPriority(): string {
                return ''
            },
            item(): string {
                return ''
            },
            length: 0,
            cssText: '',
        }
        return pseudoStyle
    }

    matchMedia(query: string): any {
        return {
            matches: false,
            media: query,
            onchange: null,
            addListener() {},
            removeListener() {},
            addEventListener() {},
            removeEventListener() {},
            dispatchEvent() {
                return true
            },
        }
    }

    getSelection(): any {
        return this.document.getSelection()
    }

    alert(_message?: string): void {}
    confirm(_message?: string): boolean {
        return true
    }
    prompt(_message?: string, defaultValue?: string): string | null {
        return defaultValue == null ? null : defaultValue
    }
    print(): void {}
    focus(): void {}
    blur(): void {}
    scroll(_x?: number, _y?: number): void {}
    scrollTo(_x?: number, _y?: number): void {}
    scrollBy(_x?: number, _y?: number): void {}
    stop(): void {}
    close(): void {
        this.closed = true
    }
    postMessage(data: any, targetOrigin?: string): void {
        const event = new DomMessageEvent('message', { data, origin: targetOrigin || '*' })
        this.dispatchEvent(event)
    }
    open(_url?: string, _target?: string, _features?: string): any {
        return {
            focus() {},
            close() {},
            closed: true,
            location: { href: _url || '' },
        }
    }
    captureEvents(): void {}
    releaseEvents(): void {}
    toString(): string {
        return '[object Window]'
    }
}

export function createWindow(options?: DomWindowOptions): DomWindow {
    return new DomWindow(options)
}
