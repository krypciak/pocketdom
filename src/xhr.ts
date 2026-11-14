import { DomEvent, DomEventTarget, DomProgressEvent } from './dom/event'

/*
 * A small XMLHttpRequest implementation.
 *
 * File reads go through a pluggable backend (CrossNode wires up `fs`), while
 * http(s) requests fall back to the platform `fetch`. Calls complete
 * synchronously for files, which matches CrossCode's expectations and keeps the
 * bundled jQuery shim simple.
 */

export interface DomXhrBackend {
    /** Read a file. Returns null (or throws) when the file does not exist. */
    readFile(path: string): Uint8Array | null
    /** Optional: map a raw request URL onto a filesystem path. */
    resolvePath?(url: string): string
}

let currentBackend: DomXhrBackend | null = null

export function setXhrBackend(backend: DomXhrBackend | null): void {
    currentBackend = backend
}

export function getXhrBackend(): DomXhrBackend | null {
    return currentBackend
}

const MIME_BY_EXTENSION: Record<string, string> = {
    json: 'application/json',
    js: 'text/javascript',
    mjs: 'text/javascript',
    html: 'text/html',
    htm: 'text/html',
    css: 'text/css',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    ogg: 'audio/ogg',
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    txt: 'text/plain',
    xml: 'text/xml',
    svg: 'image/svg+xml',
}

function guessMime(path: string): string {
    const clean = path.split('?')[0].split('#')[0]
    const dot = clean.lastIndexOf('.')
    if (dot < 0) return 'text/plain'
    const ext = clean.slice(dot + 1).toLowerCase()
    return MIME_BY_EXTENSION[ext] || 'application/octet-stream'
}

function stripQuery(path: string): string {
    return path.split('#')[0].split('?')[0]
}

function decodePath(path: string): string {
    try {
        return decodeURIComponent(path)
    } catch {
        return path
    }
}

function toText(data: Uint8Array): string {
    if (typeof TextDecoder === 'function') {
        try {
            return new TextDecoder('utf-8').decode(data)
        } catch {
            // fall through
        }
    }
    let out = ''
    for (let i = 0; i < data.length; i++) out += String.fromCharCode(data[i])
    return out
}

function toArrayBuffer(data: Uint8Array): ArrayBuffer {
    const copy = new Uint8Array(data.length)
    copy.set(data)
    return copy.buffer as ArrayBuffer
}

export function looksAbsolute(path: string): boolean {
    if (!path) return false
    if (path.charAt(0) === '/') return true
    return /^[a-zA-Z]:[\\/]/.test(path)
}

export class DomXMLHttpRequest extends DomEventTarget {
    static readonly UNSENT: number = 0
    static readonly OPENED: number = 1
    static readonly HEADERS_RECEIVED: number = 2
    static readonly LOADING: number = 3
    static readonly DONE: number = 4

    readyState: number = 0
    status: number = 0
    statusText: string = ''
    responseType: string = ''
    responseURL: string = ''
    withCredentials: boolean = false
    timeout: number = 0
    upload: DomEventTarget = new DomEventTarget()

    onreadystatechange: any = null
    onloadstart: any = null
    onprogress: any = null
    onload: any = null
    onerror: any = null
    onabort: any = null
    ontimeout: any = null
    onloadend: any = null

    _method: string = 'GET'
    _url: string = ''
    _async: boolean = true
    _requestHeaders: Record<string, string> = {}
    _responseHeaders: Record<string, string> = {}
    _responseText: string = ''
    _response: any = null
    _mimeOverride: string | null = null
    _aborted: boolean = false
    _sent: boolean = false
    _timer: any = null

    get responseText(): string {
        return this._responseText
    }

    get response(): any {
        return this._response
    }

    get responseXML(): any {
        return null
    }

    open(method: string, url: string | URL, async?: boolean, _user?: string | null, _password?: string | null): void {
        this._method = String(method == null ? 'GET' : method).toUpperCase()
        this._url = String(url == null ? '' : url)
        this._async = async === undefined ? true : async !== false
        this._requestHeaders = {}
        this._responseHeaders = {}
        this._responseText = ''
        this._response = null
        this._aborted = false
        this._sent = false
        this.readyState = 1
        this.status = 0
        this.statusText = ''
        this.responseURL = this._url
        this._fire('readystatechange')
    }

    setRequestHeader(name: string, value: string): void {
        this._requestHeaders[String(name).toLowerCase()] = String(value)
    }

    overrideMimeType(mime: string): void {
        this._mimeOverride = String(mime)
    }

    getResponseHeader(name: string): string | null {
        const value = this._responseHeaders[String(name).toLowerCase()]
        return value == null ? null : value
    }

    getAllResponseHeaders(): string {
        let out = ''
        const keys = Object.keys(this._responseHeaders)
        for (let i = 0; i < keys.length; i++) out += keys[i] + ': ' + this._responseHeaders[keys[i]] + '\r\n'
        return out
    }

    abort(): void {
        this._aborted = true
        if (this._timer) {
            clearTimeout(this._timer)
            this._timer = null
        }
        if (this.readyState === 4) return
        this.readyState = 4
        this.status = 0
        this.statusText = ''
        this._fire('readystatechange')
        this._fire('abort')
        this._fire('loadend')
    }

    send(body?: any): void {
        if (this.readyState !== 1) throw new Error('InvalidStateError: XMLHttpRequest is not open')
        this._sent = true
        this._fire('loadstart')

        const url = this._url
        if (/^https?:\/\//i.test(url)) {
            this._sendHttp(url, body)
            return
        }
        if (/^data:/i.test(url)) {
            this._sendDataUrl(url)
            return
        }
        this._sendFile(url)
    }

    _filePath(): string {
        const url = this._url
        let path = url
        if (/^file:\/\//i.test(url)) {
            let withoutScheme = url.slice('file://'.length)
            // file:///abs/path -> /abs/path
            if (withoutScheme.charAt(0) === '/') path = withoutScheme
            // file://localhost/abs -> /abs
            else if (withoutScheme.slice(0, 'localhost'.length + 1).toLowerCase() === 'localhost/') path = withoutScheme.slice('localhost'.length)
            // file://data/x.json -> data/x.json (relative to the CWD)
            else path = withoutScheme
        } else if (/^\/\//.test(path)) {
            // Protocol relative URLs are treated as plain paths.
            path = path.slice(2)
        }
        path = decodePath(stripQuery(path))
        if (currentBackend && typeof currentBackend.resolvePath === 'function') return currentBackend.resolvePath(path)
        return path
    }

    _sendFile(_url: string): void {
        const path = this._filePath()
        let data: Uint8Array | null = null
        let failed: any = null
        if (!currentBackend) {
            failed = new Error('No XMLHttpRequest file backend configured for ' + path)
        } else {
            try {
                data = currentBackend.readFile(path)
            } catch (error) {
                failed = error
            }
        }

        if (data == null) {
            this.status = 0
            this.statusText = ''
            this._finish('error', failed || new Error('File not found: ' + path))
            return
        }

        this.status = 200
        this.statusText = 'OK'
        this._responseHeaders['content-type'] = this._mimeOverride || guessMime(path)
        this._responseHeaders['content-length'] = String(data.length)
        this._setBody(data)
        this._finish('load', null)
    }

    _sendDataUrl(url: string): void {
        const comma = url.indexOf(',')
        if (comma < 0) {
            this.status = 0
            this._finish('error', new Error('Invalid data URL'))
            return
        }
        const meta = url.slice('data:'.length, comma)
        const payload = url.slice(comma + 1)
        let data: Uint8Array
        try {
            if (meta.indexOf('base64') >= 0 && typeof Buffer !== 'undefined') {
                const buffer = Buffer.from(decodeURIComponent(payload), 'base64')
                data = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
            } else {
                const text = decodeURIComponent(payload)
                data = new Uint8Array(text.length)
                for (let i = 0; i < text.length; i++) data[i] = text.charCodeAt(i) & 0xff
            }
        } catch (error) {
            this.status = 0
            this._finish('error', error)
            return
        }
        this.status = 200
        this.statusText = 'OK'
        const mime = meta.split(';')[0]
        this._responseHeaders['content-type'] = this._mimeOverride || mime || 'text/plain'
        this._setBody(data)
        this._finish('load', null)
    }

    _sendHttp(url: string, body: any): void {
        const fetchImpl = typeof fetch === 'function' ? fetch : null
        if (!fetchImpl) {
            this.status = 0
            this._finish('error', new Error('fetch is not available'))
            return
        }

        const options: any = { method: this._method, headers: this._requestHeaders }
        if (this._method !== 'GET' && this._method !== 'HEAD' && body != null) options.body = body

        let done = false
        if (this.timeout && this.timeout > 0) {
            this._timer = setTimeout(() => {
                if (done) return
                done = true
                this.readyState = 4
                this.status = 0
                this._fire('readystatechange')
                this._fire('timeout')
                this._fire('loadend')
            }, this.timeout)
        }

        fetchImpl(url, options)
            .then(async (response: any) => {
                if (done) return
                this.status = response.status
                this.statusText = response.statusText || ''
                this.responseURL = response.url || url
                if (response.headers && typeof response.headers.forEach === 'function') {
                    response.headers.forEach((value: string, key: string) => {
                        this._responseHeaders[String(key).toLowerCase()] = value
                    })
                }
                const buffer = await response.arrayBuffer()
                if (done) return
                done = true
                if (this._timer) {
                    clearTimeout(this._timer)
                    this._timer = null
                }
                this._setBody(new Uint8Array(buffer))
                this._finish(this.status >= 200 && this.status < 400 ? 'load' : 'error', null)
            })
            .catch((error: any) => {
                if (done) return
                done = true
                if (this._timer) {
                    clearTimeout(this._timer)
                    this._timer = null
                }
                this.status = 0
                this._finish('error', error)
            })
    }

    _setBody(data: Uint8Array): void {
        const text = toText(data)
        this._responseText = text
        const type = String(this.responseType || '')
        if (type === 'arraybuffer') {
            this._response = toArrayBuffer(data)
        } else if (type === 'blob') {
            const BlobConstructor = typeof Blob !== 'undefined' ? Blob : null
            this._response = BlobConstructor
                ? new BlobConstructor([data as any], { type: this._responseHeaders['content-type'] || 'application/octet-stream' })
                : { size: data.length, type: this._responseHeaders['content-type'] || 'application/octet-stream' }
        } else if (type === 'json') {
            try {
                this._response = text ? JSON.parse(text) : null
            } catch {
                this._response = null
            }
        } else {
            this._response = text
        }
    }

    _finish(kind: 'load' | 'error', error: any): void {
        if (this._aborted) return
        this.readyState = 2
        this._fire('readystatechange')
        this.readyState = 3
        this._fire('readystatechange')
        this.readyState = 4
        this._fire('readystatechange')

        if (kind === 'error') {
            const event: any = new DomProgressEvent('error')
            event.error = error
            this._fireEvent(event)
        } else {
            const event = new DomProgressEvent('load', { loaded: this._responseText.length, total: this._responseText.length, lengthComputable: true })
            this._fireEvent(event)
        }
        this._fire('loadend')
    }

    _fire(type: string): void {
        this._fireEvent(new DomEvent(type))
    }

    _fireEvent(event: DomEvent): void {
        try {
            this.dispatchEvent(event)
        } catch (error) {
            console.error('crossnode: error in XMLHttpRequest listener', error)
        }
    }
}

export function isFileUrl(url: string): boolean {
    return /^file:\/\//i.test(url)
}
