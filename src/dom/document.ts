import { createEvent, DomEvent } from './event'
import { DomComment, DomDocumentFragment, DomNode, DomText, NODE_TYPE } from './nodes'
import { createElementFor } from './elements'
import { parseDocumentInto } from './parser'
import { querySelectorAll } from './selectors'

function escapeId(id: string): string {
    return '#' + String(id).replace(/([^\w-])/g, '\\$1')
}

export class DomDocument extends DomNode {
    defaultView: any = null
    readyState: string = 'loading'
    activeElement: any = null
    _url: string = 'http://localhost/'
    _titleElement: any = null
    _bodyOverride: any = undefined

    constructor() {
        super()
        this.nodeType = NODE_TYPE.DOCUMENT_NODE
        this.nodeName = '#document'
    }

    get documentElement(): any {
        for (let i = 0; i < this.childNodes.length; i++) {
            const child = this.childNodes[i]
            if (child.nodeType === NODE_TYPE.ELEMENT_NODE && child.localName === 'html') return child
        }
        return null
    }

    get doctype(): any {
        for (let i = 0; i < this.childNodes.length; i++) {
            const child = this.childNodes[i]
            if (child.nodeType === NODE_TYPE.DOCUMENT_TYPE_NODE) return child
        }
        return null
    }

    get head(): any {
        const root = this.documentElement
        if (!root) return null
        for (let i = 0; i < root.childNodes.length; i++) {
            const child = root.childNodes[i]
            if (child.nodeType === NODE_TYPE.ELEMENT_NODE && child.localName === 'head') return child
        }
        return null
    }

    get body(): any {
        if (this._bodyOverride !== undefined) return this._bodyOverride
        const root = this.documentElement
        if (!root) return null
        for (let i = 0; i < root.childNodes.length; i++) {
            const child = root.childNodes[i]
            if (child.nodeType === NODE_TYPE.ELEMENT_NODE && child.localName === 'body') return child
        }
        return null
    }

    set body(value: any) {
        this._bodyOverride = value
    }

    get title(): string {
        if (this._titleElement) return this._titleElement.textContent || ''
        const head = this.head
        if (!head) return ''
        for (let i = 0; i < head.childNodes.length; i++) {
            const child = head.childNodes[i]
            if (child.nodeType === NODE_TYPE.ELEMENT_NODE && child.localName === 'title') {
                this._titleElement = child
                return child.textContent || ''
            }
        }
        return ''
    }

    set title(value: string) {
        let title = this._titleElement
        if (!title) {
            const head = this.head
            if (!head) return
            title = this.createElement('title')
            head.appendChild(title)
            this._titleElement = title
        }
        title.textContent = value == null ? '' : String(value)
    }

    get location(): any {
        return this.defaultView ? this.defaultView.location : null
    }

    get URL(): string {
        return this._url
    }

    get documentURI(): string {
        return this._url
    }

    get baseURI(): string {
        return this._url
    }

    get referrer(): string {
        return ''
    }

    get cookie(): string {
        return ''
    }

    set cookie(_value: string) {}

    get compatMode(): string {
        return 'CSS1Compat'
    }

    get characterSet(): string {
        return 'UTF-8'
    }

    get charset(): string {
        return 'UTF-8'
    }

    get inputEncoding(): string {
        return 'UTF-8'
    }

    get contentType(): string {
        return 'text/html'
    }

    get hidden(): boolean {
        return false
    }

    get visibilityState(): string {
        return 'visible'
    }

    get scrollingElement(): any {
        return this.documentElement
    }

    get styleSheets(): any[] {
        return []
    }

    get adoptedStyleSheets(): any[] {
        return []
    }

    get fullscreenElement(): any {
        return null
    }

    get pointerLockElement(): any {
        return null
    }

    get fonts(): any {
        return {
            ready: Promise.resolve(),
            status: 'loaded',
            check: () => true,
            load: () => Promise.resolve([]),
            add: () => {},
            addEventListener: () => {},
            removeEventListener: () => {},
            forEach: () => {},
        }
    }

    get implementation(): any {
        const self = this
        return {
            hasFeature: () => true,
            createHTMLDocument(title?: string) {
                const doc = new DomDocument()
                doc.defaultView = self.defaultView
                doc._url = self._url
                doc._createSkeleton()
                if (title != null) doc.title = title
                return doc
            },
            createDocument(_namespace: string | null, _qualifiedName: string | null, doctype?: any) {
                const doc = new DomDocument()
                doc.defaultView = self.defaultView
                if (doctype) doc.appendChild(doctype)
                return doc
            },
            createDocumentType(name: string) {
                const node = new DomNode()
                node.nodeType = NODE_TYPE.DOCUMENT_TYPE_NODE
                node.nodeName = String(name || 'html')
                ;(node as any).name = String(name || 'html')
                return node
            },
        }
    }

    _createSkeleton(): void {
        this._clearChildren()
        const html = this.createElement('html')
        const head = this.createElement('head')
        const body = this.createElement('body')
        html.appendChild(head)
        html.appendChild(body)
        this.appendChild(html)
    }

    _refreshReferences(): void {
        // References are computed lazily.
    }

    _querySelectorAll(root: any, selector: string): any[] {
        return querySelectorAll(root, selector)
    }

    createElement(tagName: string): any {
        const element = createElementFor(tagName)
        element.ownerDocument = this
        if (element.localName === 'html') {
            // keep nodeName consistent
        }
        return element
    }

    createElementNS(_namespace: string | null, tagName: string): any {
        return this.createElement(tagName)
    }

    createTextNode(text: string): any {
        const node = new DomText(text)
        node.ownerDocument = this
        return node
    }

    createComment(text: string): any {
        const node = new DomComment(text)
        node.ownerDocument = this
        return node
    }

    createDocumentFragment(): any {
        const fragment = new DomDocumentFragment()
        fragment.ownerDocument = this
        return fragment
    }

    createAttribute(name: string): any {
        return { name: String(name), value: '', nodeName: String(name), nodeType: NODE_TYPE.ATTRIBUTE_NODE }
    }

    createEvent(type: string): any {
        return createEvent(type)
    }

    createEventNS(_namespace: string | null, type: string): any {
        return createEvent(type)
    }

    getElementById(id: string): any {
        const found = querySelectorAll(this, escapeId(id))
        return found.length > 0 ? found[0] : null
    }

    getElementsByTagName(name: string): any[] {
        const tag = String(name).toLowerCase()
        const result: any[] = []
        collectByTag(this, tag, result)
        ;(result as any).item = (index: number) => result[index] || null
        ;(result as any).namedItem = () => null
        return result
    }

    getElementsByTagNameNS(_namespace: string | null, name: string): any[] {
        return this.getElementsByTagName(name)
    }

    getElementsByClassName(names: string): any[] {
        const wanted = String(names).split(/\s+/)
        const result: any[] = []
        collectByTag(this, '*', result)
        const filtered: any[] = []
        for (let i = 0; i < result.length; i++) {
            const element = result[i]
            let matches = true
            for (let j = 0; j < wanted.length; j++) {
                if (!wanted[j]) continue
                if (!element.classList.contains(wanted[j])) {
                    matches = false
                    break
                }
            }
            if (matches) filtered.push(element)
        }
        ;(filtered as any).item = (index: number) => filtered[index] || null
        return filtered
    }

    querySelector(selector: string): any {
        const all = querySelectorAll(this, selector)
        return all.length > 0 ? all[0] : null
    }

    querySelectorAll(selector: string): any[] {
        return querySelectorAll(this, selector)
    }

    hasFocus(): boolean {
        return true
    }

    open(): void {
        this._clearChildren()
    }

    write(html: string): void {
        if (this.childNodes.length === 0) parseDocumentInto(this, html)
        else {
            const nodes = querySelectorAll(this, 'html')
            if (nodes.length > 0) {
                // Append to body when a document is already open.
                const body = this.body
                if (body && body.insertAdjacentHTML) body.insertAdjacentHTML('beforeend', html)
            }
        }
    }

    writeln(html: string): void {
        this.write(html + '\n')
    }

    close(): void {
        this.readyState = 'complete'
        this.dispatchEvent(new DomEvent('DOMContentLoaded', { bubbles: true }))
        this.dispatchEvent(new DomEvent('readystatechange'))
    }

    execCommand(_command: string, _showUI?: boolean, _value?: string): boolean {
        return false
    }

    queryCommandSupported(_command: string): boolean {
        return false
    }

    getSelection(): any {
        return {
            rangeCount: 0,
            isCollapsed: true,
            type: 'None',
            anchorNode: null,
            focusNode: null,
            addRange() {},
            removeAllRanges() {},
            empty() {},
            collapse() {},
            extend() {},
            selectAllChildren() {},
            getRangeAt() {
                return null
            },
            toString() {
                return ''
            },
        }
    }

    createRange(): any {
        return {
            collapsed: true,
            startContainer: null,
            endContainer: null,
            startOffset: 0,
            endOffset: 0,
            commonAncestorContainer: null,
            setStart() {},
            setEnd() {},
            setStartBefore() {},
            setStartAfter() {},
            setEndBefore() {},
            setEndAfter() {},
            collapse() {},
            selectNode() {},
            selectNodeContents() {},
            insertNode() {},
            surroundContents() {},
            deleteContents() {},
            cloneContents() {
                return null
            },
            extractContents() {
                return null
            },
            createContextualFragment(html: string) {
                return null
            },
            getBoundingClientRect() {
                return { x: 0, y: 0, width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0 }
            },
            getClientRects() {
                return []
            },
            toString() {
                return ''
            },
        }
    }

    elementFromPoint(_x: number, _y: number): any {
        return this.body
    }

    elementsFromPoint(_x: number, _y: number): any[] {
        return this.body ? [this.body] : []
    }

    importNode(node: any, deep?: boolean): any {
        const clone = node.cloneNode(deep)
        clone.ownerDocument = this
        return clone
    }

    adoptNode(node: any): any {
        if (node && node.parentNode) node.parentNode.removeChild(node)
        node.ownerDocument = this
        return node
    }

    exitFullscreen(): Promise<void> {
        return Promise.resolve()
    }

    exitPointerLock(): void {}

    _shallowClone(): DomNode {
        const clone = new DomDocument()
        clone.defaultView = this.defaultView
        clone._url = this._url
        clone.ownerDocument = this.ownerDocument
        return clone
    }
}

export class DomDocumentType extends DomNode {
    name: string = 'html'
    publicId: string = ''
    systemId: string = ''

    constructor(name?: string) {
        super()
        this.nodeType = NODE_TYPE.DOCUMENT_TYPE_NODE
        this.name = name == null ? 'html' : String(name)
        this.nodeName = this.name
    }
}

function collectByTag(root: any, tag: string, out: any[]): void {
    if (!root || !root.childNodes) return
    for (let i = 0; i < root.childNodes.length; i++) {
        const child = root.childNodes[i]
        if (child.nodeType === NODE_TYPE.ELEMENT_NODE) {
            if (tag === '*' || child.localName === tag) out.push(child)
            collectByTag(child, tag, out)
        } else if (child.nodeType === NODE_TYPE.DOCUMENT_FRAGMENT_NODE) {
            collectByTag(child, tag, out)
        }
    }
}
