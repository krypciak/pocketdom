import { DomEvent, DomFocusEvent, DomInputEvent, DomKeyboardEvent, DomMouseEvent } from './event'
import { DomNode, DomText, NODE_TYPE, appendNodes, nodesFromArgument, isDomNode } from './nodes'
import { DomClassList, DomCSSStyleDeclaration } from './style'
import { parseFragment, serializeChildren, serializeElement } from './parser'
import { matchesSelector, querySelectorAll } from './selectors'
import { getCanvasBackend, resolveCanvasSource } from '../canvas/backend'

function numberFromAttribute(value: string | null, fallback: number): number {
    if (value == null) return fallback
    const parsed = parseInt(value, 10)
    return isNaN(parsed) ? fallback : parsed
}

function toInt(value: any, fallback: number): number {
    const parsed = typeof value === 'number' ? value : parseInt(String(value), 10)
    if (isNaN(parsed)) return fallback
    return Math.max(0, Math.floor(parsed))
}

function patchContext(context: any): any {
    if (!context || context.__domContextPatched) return context
    context.__domContextPatched = true

    if (typeof context.drawImage === 'function') {
        const originalDrawImage = context.drawImage
        context.drawImage = function (image: any, ...args: any[]) {
            return originalDrawImage.call(this, resolveCanvasSource(image), ...args)
        }
    }
    if (typeof context.createPattern === 'function') {
        const originalCreatePattern = context.createPattern
        context.createPattern = function (image: any, repetition: any) {
            try {
                return originalCreatePattern.call(this, resolveCanvasSource(image), repetition)
            } catch {
                return null
            }
        }
    }
    return context
}

export class DomElement extends DomNode {
    _tagName: string = ''
    _attributes: Record<string, string> = {}
    _attributeNames: string[] = []
    _style: DomCSSStyleDeclaration | null = null
    _classList: DomClassList | null = null
    namespaceURI: string = 'http://www.w3.org/1999/xhtml'
    prefix: string | null = null

    constructor(tagName: string) {
        super()
        this._tagName = String(tagName == null ? '' : tagName).toLowerCase()
        this.nodeType = NODE_TYPE.ELEMENT_NODE
        this.nodeName = this._tagName.toUpperCase()
    }

    get localName(): string {
        return this._tagName
    }

    get tagName(): string {
        return this._tagName.toUpperCase()
    }

    get nodeValue(): string | null {
        return null
    }

    set nodeValue(_value: string | null) {
        // Elements have no node value.
    }

    get attributes(): any {
        const self = this
        const list: any[] = []
        for (let i = 0; i < this._attributeNames.length; i++) {
            const name = this._attributeNames[i]
            list.push({ name, nodeName: name, localName: name, value: this._attributes[name], nodeValue: this._attributes[name] })
        }
        ;(list as any).item = (index: number) => list[index] || null
        ;(list as any).getNamedItem = (name: string) => {
            for (let i = 0; i < list.length; i++) if (list[i].name === name) return list[i]
            return null
        }
        ;(list as any).__self = self
        return list
    }

    get id(): string {
        return this._attributes['id'] || ''
    }

    set id(value: string) {
        this.setAttribute('id', value)
    }

    get className(): string {
        return this._attributes['class'] || ''
    }

    set className(value: string) {
        this.setAttribute('class', value == null ? '' : String(value))
    }

    get classList(): DomClassList {
        if (!this._classList) {
            const self = this
            this._classList = new DomClassList(this.className, (value: string) => {
                self._setAttributeDirect('class', value)
            })
        } else {
            this._classList._raw = this.className
        }
        return this._classList
    }

    set classList(value: any) {
        this.className = value == null ? '' : String(value)
    }

    get style(): DomCSSStyleDeclaration {
        if (!this._style) {
            const self = this
            this._style = new DomCSSStyleDeclaration(() => {
                self._attributes['style'] = self._style ? self._style.cssText : ''
                if (self._attributeNames.indexOf('style') < 0) self._attributeNames.push('style')
            })
            const inline = this._attributes['style']
            if (inline) this._style.cssText = inline
        }
        return this._style
    }

    set style(value: any) {
        this.setAttribute('style', value == null ? '' : String(value))
    }

    get dataset(): Record<string, string> {
        const out: Record<string, string> = {}
        for (let i = 0; i < this._attributeNames.length; i++) {
            const name = this._attributeNames[i]
            if (name.indexOf('data-') !== 0) continue
            const key = name.slice(5).replace(/-([a-z])/g, (_m, letter: string) => letter.toUpperCase())
            out[key] = this._attributes[name]
        }
        return out
    }

    get title(): string {
        return this._attributes['title'] || ''
    }

    set title(value: string) {
        this.setAttribute('title', value)
    }

    get hidden(): boolean {
        return this._attributes['hidden'] != null
    }

    set hidden(value: boolean) {
        if (value) this.setAttribute('hidden', '')
        else this.removeAttribute('hidden')
    }

    get tabIndex(): number {
        const value = this._attributes['tabindex']
        if (value == null) return -1
        return numberFromAttribute(value, -1)
    }

    set tabIndex(value: number) {
        this.setAttribute('tabindex', String(value))
    }

    get dir(): string {
        return this._attributes['dir'] || ''
    }

    set dir(value: string) {
        this.setAttribute('dir', value)
    }

    get lang(): string {
        return this._attributes['lang'] || ''
    }

    set lang(value: string) {
        this.setAttribute('lang', value)
    }

    get children(): any[] {
        const out: any[] = []
        for (let i = 0; i < this.childNodes.length; i++) {
            if (this.childNodes[i].nodeType === NODE_TYPE.ELEMENT_NODE) out.push(this.childNodes[i])
        }
        ;(out as any).item = (index: number) => out[index] || null
        return out
    }

    _setAttributeDirect(name: string, value: string): void {
        if (this._attributes[name] === value) return
        this._attributes[name] = value
        if (this._attributeNames.indexOf(name) < 0) this._attributeNames.push(name)
        if (name === 'style' && this._style) {
            this._style.cssText = value
        }
    }

    setAttribute(name: string, value: any): void {
        const key = String(name).toLowerCase()
        const text = value == null ? '' : String(value)
        this._attributes[key] = text
        if (this._attributeNames.indexOf(key) < 0) this._attributeNames.push(key)
        if (key === 'style') {
            if (!this._style) {
                const self = this
                this._style = new DomCSSStyleDeclaration(() => {
                    self._attributes['style'] = self._style ? self._style.cssText : ''
                })
            }
            this._style.cssText = text
        } else if (key === 'class' && this._classList) {
            this._classList._raw = text
        }
    }

    setAttributeNS(_namespace: string | null, name: string, value: any): void {
        this.setAttribute(name, value)
    }

    getAttribute(name: string): string | null {
        const key = String(name).toLowerCase()
        const value = this._attributes[key]
        return value == null ? null : value
    }

    getAttributeNS(_namespace: string | null, name: string): string | null {
        return this.getAttribute(name)
    }

    hasAttribute(name: string): boolean {
        return this._attributes[String(name).toLowerCase()] != null
    }

    hasAttributes(): boolean {
        return this._attributeNames.length > 0
    }

    removeAttribute(name: string): void {
        const key = String(name).toLowerCase()
        delete this._attributes[key]
        for (let i = this._attributeNames.length - 1; i >= 0; i--) {
            if (this._attributeNames[i] === key) this._attributeNames.splice(i, 1)
        }
        if (key === 'style' && this._style) {
            this._style._values = {}
            this._style._priorities = {}
        }
    }

    removeAttributeNS(_namespace: string | null, name: string): void {
        this.removeAttribute(name)
    }

    toggleAttribute(name: string, force?: boolean): boolean {
        const has = this.hasAttribute(name)
        if (force === true || (!has && force === undefined)) {
            this.setAttribute(name, '')
            return true
        }
        this.removeAttribute(name)
        return false
    }

    getAttributeNames(): string[] {
        return this._attributeNames.slice()
    }

    getAttributeNode(name: string): any {
        const value = this.getAttribute(name)
        return value == null ? null : { name, value, nodeName: name }
    }

    setAttributeNode(attribute: any): any {
        if (attribute && attribute.name != null) this.setAttribute(attribute.name, attribute.value)
        return attribute
    }

    get innerHTML(): string {
        return serializeChildren(this)
    }

    set innerHTML(html: string) {
        this._clearChildren()
        const nodes = parseFragment(html, this.ownerDocument || this, this.localName)
        for (let i = 0; i < nodes.length; i++) this.appendChild(nodes[i])
    }

    get outerHTML(): string {
        return serializeElement(this)
    }

    set outerHTML(html: string) {
        const parent = this.parentNode
        if (!parent) return
        const nodes = parseFragment(html, this.ownerDocument || this, this.parentElement ? this.parentElement.localName : undefined)
        for (let i = 0; i < nodes.length; i++) parent.insertBefore(nodes[i], this)
        parent.removeChild(this)
    }

    get innerText(): string {
        return this.textContent || ''
    }

    set innerText(value: string) {
        this.textContent = value
    }

    insertAdjacentHTML(position: string, html: string): void {
        const where = String(position).toLowerCase()
        const doc = this.ownerDocument || this
        const nodes = parseFragment(html, doc, this.localName)
        if (where === 'beforebegin') {
            const parent = this.parentNode
            if (!parent) return
            for (let i = 0; i < nodes.length; i++) parent.insertBefore(nodes[i], this)
        } else if (where === 'afterbegin') {
            const reference = this.firstChild
            for (let i = 0; i < nodes.length; i++) this.insertBefore(nodes[i], reference)
        } else if (where === 'beforeend') {
            for (let i = 0; i < nodes.length; i++) this.appendChild(nodes[i])
        } else if (where === 'afterend') {
            const parent = this.parentNode
            if (!parent) return
            const reference = this.nextSibling
            for (let i = 0; i < nodes.length; i++) parent.insertBefore(nodes[i], reference)
        }
    }

    insertAdjacentElement(position: string, element: any): any {
        const where = String(position).toLowerCase()
        if (!element) return null
        if (where === 'beforebegin') {
            if (!this.parentNode) return null
            this.parentNode.insertBefore(element, this)
        } else if (where === 'afterbegin') {
            this.insertBefore(element, this.firstChild)
        } else if (where === 'beforeend') {
            this.appendChild(element)
        } else if (where === 'afterend') {
            if (!this.parentNode) return null
            this.parentNode.insertBefore(element, this.nextSibling)
        } else {
            return null
        }
        return element
    }

    insertAdjacentText(position: string, text: string): void {
        const node = this.ownerDocument ? this.ownerDocument.createTextNode(text) : new DomText(text)
        this.insertAdjacentElement(position, node)
    }

    append(...nodes: any[]): void {
        appendNodes(this, nodes)
    }

    prepend(...nodes: any[]): void {
        const reference = this.firstChild
        for (let i = nodes.length - 1; i >= 0; i--) {
            const resolved = nodesFromArgument(this.ownerDocument, nodes[i])
            for (let j = resolved.length - 1; j >= 0; j--) this.insertBefore(resolved[j], reference)
        }
    }

    before(...nodes: any[]): void {
        const parent = this.parentNode
        if (!parent) return
        const resolved: any[] = []
        for (let i = 0; i < nodes.length; i++) resolved.push(...nodesFromArgument(this.ownerDocument, nodes[i]))
        for (let i = 0; i < resolved.length; i++) parent.insertBefore(resolved[i], this)
    }

    after(...nodes: any[]): void {
        const parent = this.parentNode
        if (!parent) return
        const reference = this.nextSibling
        const resolved: any[] = []
        for (let i = 0; i < nodes.length; i++) resolved.push(...nodesFromArgument(this.ownerDocument, nodes[i]))
        for (let i = 0; i < resolved.length; i++) parent.insertBefore(resolved[i], reference)
    }

    replaceWith(...nodes: any[]): void {
        const parent = this.parentNode
        if (!parent) return
        const reference = this.nextSibling
        const resolved: any[] = []
        for (let i = 0; i < nodes.length; i++) resolved.push(...nodesFromArgument(this.ownerDocument, nodes[i]))
        for (let i = 0; i < resolved.length; i++) parent.insertBefore(resolved[i], reference)
        parent.removeChild(this)
    }

    replaceChildren(...nodes: any[]): void {
        this._clearChildren()
        appendNodes(this, nodes)
    }

    querySelector(selector: string): any {
        const all = querySelectorAll(this, selector)
        return all.length > 0 ? all[0] : null
    }

    querySelectorAll(selector: string): any[] {
        return querySelectorAll(this, selector)
    }

    getElementsByTagName(name: string): any[] {
        const tag = String(name).toLowerCase()
        const result: any[] = []
        collectByTag(this, tag, result)
        ;(result as any).item = (index: number) => result[index] || null
        ;(result as any).namedItem = () => null
        return result
    }

    getElementsByClassName(names: string): any[] {
        const wanted = String(names).split(/\s+/)
        const result: any[] = []
        collectElements(this, result)
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

    getElementById(id: string): any {
        const found = querySelectorAll(this, '#' + String(id).replace(/[^\w-]/g, '\\$&'))
        return found.length > 0 ? found[0] : null
    }

    matches(selector: string): boolean {
        return matchesSelector(this, selector)
    }

    webkitMatchesSelector(selector: string): boolean {
        return matchesSelector(this, selector)
    }

    closest(selector: string): any {
        let element: any = this
        while (element && element.nodeType === NODE_TYPE.ELEMENT_NODE) {
            if (matchesSelector(element, selector)) return element
            element = element.parentElement
        }
        return null
    }

    focus(): void {
        const doc = this.ownerDocument
        if (doc && doc.activeElement !== this) {
            const previous = doc.activeElement
            doc.activeElement = this
            if (previous && previous !== this) previous.dispatchEvent(new DomFocusEvent('blur', { relatedTarget: this }))
            this.dispatchEvent(new DomFocusEvent('focus', { relatedTarget: previous }))
            const focusin = new DomFocusEvent('focusin', { bubbles: true, relatedTarget: previous })
            this.dispatchEvent(focusin)
        }
    }

    blur(): void {
        const doc = this.ownerDocument
        if (doc && doc.activeElement === this) {
            doc.activeElement = doc.body || null
            this.dispatchEvent(new DomFocusEvent('blur', { relatedTarget: doc.activeElement }))
            this.dispatchEvent(new DomFocusEvent('focusout', { bubbles: true, relatedTarget: doc.activeElement }))
        }
    }

    click(): void {
        this.dispatchEvent(new DomMouseEvent('click', { bubbles: true, cancelable: true, button: 0 }))
    }

    scrollIntoView(): void {}
    scrollTo(): void {}
    scrollBy(): void {}
    scroll(): void {}
    scrollTop: number = 0
    scrollLeft: number = 0

    get scrollWidth(): number {
        return this.clientWidth
    }

    get scrollHeight(): number {
        return this.clientHeight
    }

    get offsetParent(): any {
        return null
    }

    get offsetLeft(): number {
        return 0
    }

    get offsetTop(): number {
        return 0
    }

    get offsetWidth(): number {
        return this._dimension('width')
    }

    get offsetHeight(): number {
        return this._dimension('height')
    }

    get clientWidth(): number {
        return this._dimension('width')
    }

    get clientHeight(): number {
        return this._dimension('height')
    }

    get clientTop(): number {
        return 0
    }

    get clientLeft(): number {
        return 0
    }

    _dimension(axis: 'width' | 'height'): number {
        const override = (this as any)['_client' + (axis === 'width' ? 'Width' : 'Height')]
        if (typeof override === 'number') return override
        const inline = this._style ? this._style.getPropertyValue(axis) : ''
        if (inline && inline.endsWith('px')) {
            const parsed = parseFloat(inline)
            if (!isNaN(parsed)) return parsed
        }
        return 0
    }

    getBoundingClientRect(): any {
        const width = this.offsetWidth
        const height = this.offsetHeight
        return { x: 0, y: 0, left: 0, top: 0, right: width, bottom: height, width, height, toJSON: () => ({}) }
    }

    getClientRects(): any[] {
        return [this.getBoundingClientRect()]
    }

    getElementsByTagNameNS(_namespace: string | null, name: string): any[] {
        return this.getElementsByTagName(name)
    }

    _shallowClone(): DomNode {
        const doc = this.ownerDocument
        const clone: DomElement = doc ? doc.createElement(this.localName) : new DomElement(this.localName)
        for (let i = 0; i < this._attributeNames.length; i++) {
            const name = this._attributeNames[i]
            clone.setAttribute(name, this._attributes[name])
        }
        return clone
    }

    get contentEditable(): string {
        const value = this._attributes['contenteditable']
        return value == null ? 'inherit' : value
    }

    set contentEditable(value: string) {
        this.setAttribute('contenteditable', value)
    }
}

function collectElements(root: any, out: any[]): void {
    if (!root || !root.childNodes) return
    for (let i = 0; i < root.childNodes.length; i++) {
        const child = root.childNodes[i]
        if (child.nodeType === NODE_TYPE.ELEMENT_NODE) {
            out.push(child)
            collectElements(child, out)
        } else if (child.nodeType === NODE_TYPE.DOCUMENT_FRAGMENT_NODE) {
            collectElements(child, out)
        }
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

/** HTMLElement: currently just an alias for DomElement. */
export class DomHTMLElement extends DomElement {}

export class DomHTMLCanvasElement extends DomHTMLElement {
    _width: number = 300
    _height: number = 150
    __nativeCanvasInstance: any = null

    constructor() {
        super('canvas')
        this._width = 300
        this._height = 150
    }

    get width(): number {
        return this._width
    }

    set width(value: number) {
        this._width = toInt(value, 300)
        this._attributes['width'] = String(this._width)
        if (this.__nativeCanvasInstance) this.__nativeCanvasInstance.width = this._width
    }

    get height(): number {
        return this._height
    }

    set height(value: number) {
        this._height = toInt(value, 150)
        this._attributes['height'] = String(this._height)
        if (this.__nativeCanvasInstance) this.__nativeCanvasInstance.height = this._height
    }

    setAttribute(name: string, value: any): void {
        super.setAttribute(name, value)
        const key = String(name).toLowerCase()
        if (key === 'width') this.width = toInt(value, 300)
        else if (key === 'height') this.height = toInt(value, 150)
    }

    get __nativeCanvas(): any {
        if (!this.__nativeCanvasInstance) {
            this.__nativeCanvasInstance = getCanvasBackend().createCanvas(this._width, this._height)
        }
        return this.__nativeCanvasInstance
    }

    getContext(type: string, attributes?: any): any {
        const context = this.__nativeCanvas.getContext(type, attributes)
        return patchContext(context)
    }

    toDataURL(type?: string, quality?: number): string {
        return this.__nativeCanvas.toDataURL(type, quality)
    }

    toBlob(callback: (blob: any) => void, type?: string, quality?: number): void {
        try {
            const native = this.__nativeCanvas
            const buffer = native.toBuffer ? native.toBuffer(type, quality) : native.encode ? native.encode(type, quality) : null
            if (buffer == null) {
                callback(null)
                return
            }
            const BlobConstructor = this.ownerDocument && this.ownerDocument.defaultView ? this.ownerDocument.defaultView.Blob : null
            const blob = BlobConstructor ? new BlobConstructor([buffer], { type: type || 'image/png' }) : { type: type || 'image/png', size: buffer.length }
            callback(blob)
        } catch {
            callback(null)
        }
    }

    toBuffer(type?: string, quality?: number): any {
        const native = this.__nativeCanvas
        if (typeof native.toBuffer === 'function') return native.toBuffer(type, quality)
        if (typeof native.encode === 'function') return native.encode(type, quality)
        return null
    }

    encode(type?: string, quality?: number): any {
        return this.toBuffer(type, quality)
    }
}

export class DomHTMLImageElement extends DomHTMLElement {
    __nativeImageInstance: any = null
    _srcValue: string = ''

    constructor() {
        super('img')
    }

    get __nativeImage(): any {
        if (!this.__nativeImageInstance) {
            const self = this
            const image = getCanvasBackend().createImage()
            image.onload = () => {
                self.dispatchEvent(new DomEvent('load'))
            }
            image.onerror = (event: any) => {
                const error = new DomEvent('error')
                ;(error as any).error = event ? event.error : undefined
                self.dispatchEvent(error)
            }
            this.__nativeImageInstance = image
        }
        return this.__nativeImageInstance
    }

    get src(): string {
        return this._srcValue
    }

    set src(value: string) {
        this._srcValue = value == null ? '' : String(value)
        this._attributes['src'] = this._srcValue
        this.__nativeImage.src = this._srcValue
    }

    get currentSrc(): string {
        return this._srcValue
    }

    get complete(): boolean {
        return !!this.__nativeImage.complete
    }

    get naturalWidth(): number {
        const value = this.__nativeImage.naturalWidth
        return typeof value === 'number' ? value : this.__nativeImage.width || 0
    }

    get naturalHeight(): number {
        const value = this.__nativeImage.naturalHeight
        return typeof value === 'number' ? value : this.__nativeImage.height || 0
    }

    get width(): number {
        const attribute = this._attributes['width']
        if (attribute != null) return numberFromAttribute(attribute, 0)
        return this.__nativeImage.width || 0
    }

    set width(value: number) {
        const next = toInt(value, 0)
        this._attributes['width'] = String(next)
        this.__nativeImage.width = next
    }

    get height(): number {
        const attribute = this._attributes['height']
        if (attribute != null) return numberFromAttribute(attribute, 0)
        return this.__nativeImage.height || 0
    }

    set height(value: number) {
        const next = toInt(value, 0)
        this._attributes['height'] = String(next)
        this.__nativeImage.height = next
    }

    get crossOrigin(): string | null {
        return this.getAttribute('crossorigin')
    }

    set crossOrigin(value: string | null) {
        if (value == null) this.removeAttribute('crossorigin')
        else this.setAttribute('crossorigin', value)
    }

    get decoding(): string {
        return this.getAttribute('decoding') || 'auto'
    }

    set decoding(value: string) {
        this.setAttribute('decoding', value)
    }

    decode(): Promise<void> {
        if (typeof this.__nativeImage.decode === 'function') return this.__nativeImage.decode()
        return Promise.resolve()
    }
}

export class DomHTMLInputElement extends DomHTMLElement {
    _valueOverride: string | null = null
    _checked: boolean | null = null
    selectionStart: number | null = null
    selectionEnd: number | null = null
    selectionDirection: string = 'none'
    _files: any[] = []

    constructor() {
        super('input')
    }

    get type(): string {
        return (this.getAttribute('type') || 'text').toLowerCase()
    }

    set type(value: string) {
        this.setAttribute('type', value)
    }

    get value(): string {
        if (this._valueOverride != null) return this._valueOverride
        const attribute = this.getAttribute('value')
        if (attribute != null) return attribute
        return this.type === 'checkbox' || this.type === 'radio' ? 'on' : ''
    }

    set value(value: any) {
        this._valueOverride = value == null ? '' : String(value)
        this.setAttribute('value', this._valueOverride)
        this.selectionStart = this._valueOverride.length
        this.selectionEnd = this._valueOverride.length
    }

    get defaultValue(): string {
        return this.getAttribute('value') || ''
    }

    set defaultValue(value: string) {
        this.setAttribute('value', value)
    }

    get checked(): boolean {
        if (this._checked != null) return this._checked
        return this.hasAttribute('checked')
    }

    set checked(value: boolean) {
        this._checked = !!value
        if (value) this.setAttribute('checked', '')
        else this.removeAttribute('checked')
    }

    get defaultChecked(): boolean {
        return this.hasAttribute('checked')
    }

    set defaultChecked(value: boolean) {
        if (value) this.setAttribute('checked', '')
        else this.removeAttribute('checked')
    }

    get disabled(): boolean {
        return this.hasAttribute('disabled')
    }

    set disabled(value: boolean) {
        if (value) this.setAttribute('disabled', '')
        else this.removeAttribute('disabled')
    }

    get readOnly(): boolean {
        return this.hasAttribute('readonly')
    }

    set readOnly(value: boolean) {
        if (value) this.setAttribute('readonly', '')
        else this.removeAttribute('readonly')
    }

    get placeholder(): string {
        return this.getAttribute('placeholder') || ''
    }

    set placeholder(value: string) {
        this.setAttribute('placeholder', value)
    }

    get name(): string {
        return this.getAttribute('name') || ''
    }

    set name(value: string) {
        this.setAttribute('name', value)
    }

    get autocomplete(): string {
        return this.getAttribute('autocomplete') || ''
    }

    set autocomplete(value: string) {
        this.setAttribute('autocomplete', value)
    }

    get multiple(): boolean {
        return this.hasAttribute('multiple')
    }

    set multiple(value: boolean) {
        if (value) this.setAttribute('multiple', '')
        else this.removeAttribute('multiple')
    }

    get maxLength(): number {
        return numberFromAttribute(this.getAttribute('maxlength'), -1)
    }

    set maxLength(value: number) {
        this.setAttribute('maxlength', String(value))
    }

    get minLength(): number {
        return numberFromAttribute(this.getAttribute('minlength'), -1)
    }

    set minLength(value: number) {
        this.setAttribute('minlength', String(value))
    }

    get required(): boolean {
        return this.hasAttribute('required')
    }

    set required(value: boolean) {
        if (value) this.setAttribute('required', '')
        else this.removeAttribute('required')
    }

    get files(): any {
        return this._files
    }

    set files(value: any) {
        this._files = value || []
    }

    get valueAsNumber(): number {
        const parsed = parseFloat(this.value)
        return isNaN(parsed) ? NaN : parsed
    }

    set valueAsNumber(value: number) {
        this.value = String(value)
    }

    setSelectionRange(start: number, end?: number, direction?: string): void {
        const length = this.value.length
        let s = Math.max(0, Math.min(length, start | 0))
        let e = end == null ? s : Math.max(0, Math.min(length, end | 0))
        if (e < s) {
            const tmp = s
            s = e
            e = tmp
        }
        this.selectionStart = s
        this.selectionEnd = e
        this.selectionDirection = direction || 'none'
    }

    select(): void {
        this.setSelectionRange(0, this.value.length)
        if (this.ownerDocument) this.ownerDocument.activeElement = this
    }

    focus(): void {
        if (this.selectionStart == null) {
            this.selectionStart = this.value.length
            this.selectionEnd = this.value.length
        }
        super.focus()
    }

    checkValidity(): boolean {
        return true
    }

    reportValidity(): boolean {
        return true
    }

    setCustomValidity(_message: string): void {}
}

export class DomHTMLTextAreaElement extends DomHTMLElement {
    _valueOverride: string | null = null
    selectionStart: number | null = null
    selectionEnd: number | null = null
    selectionDirection: string = 'none'

    constructor() {
        super('textarea')
    }

    get value(): string {
        if (this._valueOverride != null) return this._valueOverride
        return this.textContent || ''
    }

    set value(value: any) {
        this._valueOverride = value == null ? '' : String(value)
        this.textContent = this._valueOverride
        this.selectionStart = this._valueOverride.length
        this.selectionEnd = this._valueOverride.length
    }

    get defaultValue(): string {
        return this.textContent || ''
    }

    set defaultValue(value: string) {
        this.textContent = value
    }

    get rows(): number {
        return numberFromAttribute(this.getAttribute('rows'), 2)
    }

    set rows(value: number) {
        this.setAttribute('rows', String(value))
    }

    get cols(): number {
        return numberFromAttribute(this.getAttribute('cols'), 20)
    }

    set cols(value: number) {
        this.setAttribute('cols', String(value))
    }

    get readOnly(): boolean {
        return this.hasAttribute('readonly')
    }

    set readOnly(value: boolean) {
        if (value) this.setAttribute('readonly', '')
        else this.removeAttribute('readonly')
    }

    setSelectionRange(start: number, end?: number, direction?: string): void {
        this.selectionStart = start
        this.selectionEnd = end == null ? start : end
        this.selectionDirection = direction || 'none'
    }

    select(): void {
        this.setSelectionRange(0, this.value.length)
    }
}

export class DomHTMLOptionElement extends DomHTMLElement {
    constructor() {
        super('option')
    }

    get value(): string {
        const value = this.getAttribute('value')
        return value == null ? this.textContent || '' : value
    }

    set value(value: string) {
        this.setAttribute('value', value)
    }

    get text(): string {
        return this.textContent || ''
    }

    set text(value: string) {
        this.textContent = value
    }

    get selected(): boolean {
        return this.hasAttribute('selected')
    }

    set selected(value: boolean) {
        if (value) this.setAttribute('selected', '')
        else this.removeAttribute('selected')
    }

    get defaultSelected(): boolean {
        return this.hasAttribute('selected')
    }

    set defaultSelected(value: boolean) {
        if (value) this.setAttribute('selected', '')
        else this.removeAttribute('selected')
    }

    get index(): number {
        const parent = this.parentElement
        if (!parent) return 0
        const options = parent.getElementsByTagName('option')
        for (let i = 0; i < options.length; i++) if (options[i] === this) return i
        return 0
    }

    get disabled(): boolean {
        return this.hasAttribute('disabled')
    }

    set disabled(value: boolean) {
        if (value) this.setAttribute('disabled', '')
        else this.removeAttribute('disabled')
    }
}

export class DomHTMLSelectElement extends DomHTMLElement {
    constructor() {
        super('select')
    }

    get options(): any[] {
        return this.getElementsByTagName('option')
    }

    get length(): number {
        return this.options.length
    }

    get selectedIndex(): number {
        const options = this.options
        for (let i = 0; i < options.length; i++) if (options[i].selected) return i
        return options.length > 0 ? 0 : -1
    }

    set selectedIndex(value: number) {
        const options = this.options
        for (let i = 0; i < options.length; i++) options[i].selected = i === value
    }

    get value(): string {
        const index = this.selectedIndex
        const options = this.options
        return index >= 0 && options[index] ? options[index].value : ''
    }

    set value(value: string) {
        const options = this.options
        for (let i = 0; i < options.length; i++) options[i].selected = options[i].value === value
    }

    get multiple(): boolean {
        return this.hasAttribute('multiple')
    }

    set multiple(value: boolean) {
        if (value) this.setAttribute('multiple', '')
        else this.removeAttribute('multiple')
    }

    get disabled(): boolean {
        return this.hasAttribute('disabled')
    }

    set disabled(value: boolean) {
        if (value) this.setAttribute('disabled', '')
        else this.removeAttribute('disabled')
    }

    add(option: any, before?: any): void {
        if (before) this.insertBefore(option, before)
        else this.appendChild(option)
    }

    remove(index?: number): void {
        if (index == null) {
            super.remove()
            return
        }
        const options = this.options
        if (options[index]) options[index].remove()
    }
}

export class DomHTMLTableElement extends DomHTMLElement {
    constructor() {
        super('table')
    }

    get rows(): any[] {
        const out: any[] = []
        for (let i = 0; i < this.childNodes.length; i++) {
            const child = this.childNodes[i]
            if (child.nodeType !== NODE_TYPE.ELEMENT_NODE) continue
            if (child.localName === 'tr') out.push(child)
            else if (child.localName === 'thead' || child.localName === 'tbody' || child.localName === 'tfoot') {
                for (let j = 0; j < child.childNodes.length; j++) {
                    const row = child.childNodes[j]
                    if (row.nodeType === NODE_TYPE.ELEMENT_NODE && row.localName === 'tr') out.push(row)
                }
            }
        }
        ;(out as any).item = (index: number) => out[index] || null
        return out
    }

    get tBodies(): any[] {
        const out: any[] = []
        for (let i = 0; i < this.childNodes.length; i++) {
            const child = this.childNodes[i]
            if (child.nodeType === NODE_TYPE.ELEMENT_NODE && child.localName === 'tbody') out.push(child)
        }
        return out
    }

    get tHead(): any {
        for (let i = 0; i < this.childNodes.length; i++) {
            const child = this.childNodes[i]
            if (child.nodeType === NODE_TYPE.ELEMENT_NODE && child.localName === 'thead') return child
        }
        return null
    }

    get tFoot(): any {
        for (let i = 0; i < this.childNodes.length; i++) {
            const child = this.childNodes[i]
            if (child.nodeType === NODE_TYPE.ELEMENT_NODE && child.localName === 'tfoot') return child
        }
        return null
    }

    get caption(): any {
        for (let i = 0; i < this.childNodes.length; i++) {
            const child = this.childNodes[i]
            if (child.nodeType === NODE_TYPE.ELEMENT_NODE && child.localName === 'caption') return child
        }
        return null
    }

    insertRow(index?: number): any {
        const row = this.ownerDocument.createElement('tr')
        const rows = this.rows
        if (index == null || index < 0 || index >= rows.length) {
            const bodies = this.tBodies
            if (bodies.length > 0) bodies[bodies.length - 1].appendChild(row)
            else this.appendChild(row)
            return row
        }
        const reference = rows[index]
        if (reference.parentNode) reference.parentNode.insertBefore(row, reference)
        else this.appendChild(row)
        return row
    }

    deleteRow(index: number): void {
        const rows = this.rows
        if (index >= 0 && index < rows.length) rows[index].remove()
    }

    createTBody(): any {
        const tbody = this.ownerDocument.createElement('tbody')
        this.appendChild(tbody)
        return tbody
    }
}

export class DomHTMLTableSectionElement extends DomHTMLElement {
    constructor(tag: string) {
        super(tag || 'tbody')
    }

    get rows(): any[] {
        const out: any[] = []
        for (let i = 0; i < this.childNodes.length; i++) {
            const child = this.childNodes[i]
            if (child.nodeType === NODE_TYPE.ELEMENT_NODE && child.localName === 'tr') out.push(child)
        }
        ;(out as any).item = (index: number) => out[index] || null
        return out
    }

    insertRow(index?: number): any {
        const row = this.ownerDocument.createElement('tr')
        const rows = this.rows
        if (index == null || index < 0 || index >= rows.length) this.appendChild(row)
        else this.insertBefore(row, rows[index])
        return row
    }

    deleteRow(index: number): void {
        const rows = this.rows
        if (index >= 0 && index < rows.length) rows[index].remove()
    }
}

export class DomHTMLTableRowElement extends DomHTMLElement {
    constructor() {
        super('tr')
    }

    get cells(): any[] {
        const out: any[] = []
        for (let i = 0; i < this.childNodes.length; i++) {
            const child = this.childNodes[i]
            if (child.nodeType === NODE_TYPE.ELEMENT_NODE && (child.localName === 'td' || child.localName === 'th')) out.push(child)
        }
        ;(out as any).item = (index: number) => out[index] || null
        return out
    }

    get rowIndex(): number {
        let node: any = this.parentNode
        while (node && node.localName !== 'table') node = node.parentNode
        if (!node) return -1
        const rows = node.rows
        for (let i = 0; i < rows.length; i++) if (rows[i] === this) return i
        return -1
    }

    get sectionRowIndex(): number {
        const parent = this.parentNode
        if (!parent) return -1
        let index = 0
        for (let i = 0; i < parent.childNodes.length; i++) {
            const child = parent.childNodes[i]
            if (child.nodeType !== NODE_TYPE.ELEMENT_NODE || child.localName !== 'tr') continue
            if (child === this) return index
            index++
        }
        return -1
    }

    insertCell(index?: number): any {
        const cell = this.ownerDocument.createElement('td')
        const cells = this.cells
        if (index == null || index < 0 || index >= cells.length) this.appendChild(cell)
        else this.insertBefore(cell, cells[index])
        return cell
    }

    deleteCell(index: number): void {
        const cells = this.cells
        if (index >= 0 && index < cells.length) cells[index].remove()
    }
}

export class DomHTMLTableCellElement extends DomHTMLElement {
    constructor(tag: string) {
        super(tag || 'td')
    }

    get cellIndex(): number {
        const parent = this.parentNode
        if (!parent) return -1
        let index = 0
        for (let i = 0; i < parent.childNodes.length; i++) {
            const child = parent.childNodes[i]
            if (child.nodeType !== NODE_TYPE.ELEMENT_NODE) continue
            if (child.localName !== 'td' && child.localName !== 'th') continue
            if (child === this) return index
            index++
        }
        return -1
    }

    get colSpan(): number {
        return numberFromAttribute(this.getAttribute('colspan'), 1)
    }

    set colSpan(value: number) {
        this.setAttribute('colspan', String(value))
    }

    get rowSpan(): number {
        return numberFromAttribute(this.getAttribute('rowspan'), 1)
    }

    set rowSpan(value: number) {
        this.setAttribute('rowspan', String(value))
    }

    get headers(): string {
        return this.getAttribute('headers') || ''
    }

    get abbr(): string {
        return this.getAttribute('abbr') || ''
    }
}

export class DomHTMLMediaElement extends DomHTMLElement {
    currentTime: number = 0
    duration: number = 0
    volume: number = 1
    muted: boolean = false
    paused: boolean = true
    ended: boolean = false
    readyState: number = 0
    loop: boolean = false
    autoplay: boolean = false
    playbackRate: number = 1
    defaultMuted: boolean = false

    play(): Promise<void> {
        this.paused = false
        return Promise.resolve()
    }

    pause(): void {
        this.paused = true
    }

    load(): void {}

    canPlayType(_type: string): string {
        return ''
    }

    get src(): string {
        return this.getAttribute('src') || ''
    }

    set src(value: string) {
        this.setAttribute('src', value)
    }

    get currentSrc(): string {
        return this.src
    }
}

export class DomHTMLScriptElement extends DomHTMLElement {
    constructor() {
        super('script')
    }

    get src(): string {
        return this.getAttribute('src') || ''
    }

    set src(value: string) {
        this.setAttribute('src', value)
    }

    get type(): string {
        return this.getAttribute('type') || ''
    }

    set type(value: string) {
        this.setAttribute('type', value)
    }

    get text(): string {
        return this.textContent || ''
    }

    set text(value: string) {
        this.textContent = value
    }

    get async(): boolean {
        return this.hasAttribute('async')
    }

    set async(value: boolean) {
        if (value) this.setAttribute('async', '')
        else this.removeAttribute('async')
    }

    get defer(): boolean {
        return this.hasAttribute('defer')
    }

    set defer(value: boolean) {
        if (value) this.setAttribute('defer', '')
        else this.removeAttribute('defer')
    }
}

export class DomHTMLTemplateElement extends DomHTMLElement {
    _content: any = null

    constructor() {
        super('template')
    }

    get content(): any {
        if (!this._content) {
            const fragment = this.ownerDocument ? this.ownerDocument.createDocumentFragment() : null
            if (fragment) {
                // Share the child list so reading content reflects innerHTML.
                fragment.childNodes = this.childNodes
                fragment.ownerDocument = this.ownerDocument
            }
            this._content = fragment || { childNodes: this.childNodes, nodeType: NODE_TYPE.DOCUMENT_FRAGMENT_NODE }
        }
        return this._content
    }
}

export class DomHTMLAnchorElement extends DomHTMLElement {
    constructor() {
        super('a')
    }

    get href(): string {
        const href = this.getAttribute('href')
        if (href == null) return ''
        const doc = this.ownerDocument
        const base = doc ? doc.baseURI : ''
        if (!href || /^[a-z][a-z0-9+.-]*:/i.test(href)) return href
        if (!base) return href
        if (href.charAt(0) === '/') return base.replace(/\/[^/]*$/, '') + href
        return base.replace(/\/[^/]*$/, '/') + href
    }

    set href(value: string) {
        this.setAttribute('href', value)
    }

    get target(): string {
        return this.getAttribute('target') || ''
    }

    set target(value: string) {
        this.setAttribute('target', value)
    }

    get rel(): string {
        return this.getAttribute('rel') || ''
    }

    set rel(value: string) {
        this.setAttribute('rel', value)
    }

    get download(): string {
        return this.getAttribute('download') || ''
    }

    set download(value: string) {
        this.setAttribute('download', value)
    }
}

export class DomHTMLStyleElement extends DomHTMLElement {
    constructor() {
        super('style')
    }

    get type(): string {
        return this.getAttribute('type') || 'text/css'
    }

    set type(value: string) {
        this.setAttribute('type', value)
    }

    get media(): string {
        return this.getAttribute('media') || ''
    }

    set media(value: string) {
        this.setAttribute('media', value)
    }

    get sheet(): any {
        return null
    }
}

export class DomHTMLLinkElement extends DomHTMLElement {
    constructor() {
        super('link')
    }

    get rel(): string {
        return this.getAttribute('rel') || ''
    }

    set rel(value: string) {
        this.setAttribute('rel', value)
    }

    get href(): string {
        return this.getAttribute('href') || ''
    }

    set href(value: string) {
        this.setAttribute('href', value)
    }

    get type(): string {
        return this.getAttribute('type') || ''
    }

    set type(value: string) {
        this.setAttribute('type', value)
    }

    get sheet(): any {
        return null
    }
}

export class DomHTMLFormElement extends DomHTMLElement {
    constructor() {
        super('form')
    }

    get elements(): any[] {
        const out: any[] = []
        const controls = ['input', 'select', 'textarea', 'button']
        const all = this.getElementsByTagName('*')
        for (let i = 0; i < all.length; i++) {
            if (controls.indexOf(all[i].localName) >= 0) out.push(all[i])
        }
        ;(out as any).item = (index: number) => out[index] || null
        return out
    }

    submit(): void {}
    reset(): void {}
}

export class DomHTMLButtonElement extends DomHTMLElement {
    constructor() {
        super('button')
    }

    get type(): string {
        return (this.getAttribute('type') || 'submit').toLowerCase()
    }

    set type(value: string) {
        this.setAttribute('type', value)
    }

    get disabled(): boolean {
        return this.hasAttribute('disabled')
    }

    set disabled(value: boolean) {
        if (value) this.setAttribute('disabled', '')
        else this.removeAttribute('disabled')
    }
}

export function createElementFor(tagName: string): DomElement {
    const tag = String(tagName == null ? 'div' : tagName).toLowerCase()
    switch (tag) {
        case 'canvas':
            return new DomHTMLCanvasElement()
        case 'img':
            return new DomHTMLImageElement()
        case 'input':
            return new DomHTMLInputElement()
        case 'textarea':
            return new DomHTMLTextAreaElement()
        case 'option':
            return new DomHTMLOptionElement()
        case 'select':
            return new DomHTMLSelectElement()
        case 'table':
            return new DomHTMLTableElement()
        case 'thead':
        case 'tbody':
        case 'tfoot':
            return new DomHTMLTableSectionElement(tag)
        case 'tr':
            return new DomHTMLTableRowElement()
        case 'td':
        case 'th':
            return new DomHTMLTableCellElement(tag)
        case 'video':
        case 'audio':
            return new DomHTMLMediaElement(tag)
        case 'script':
            return new DomHTMLScriptElement()
        case 'template':
            return new DomHTMLTemplateElement()
        case 'a':
            return new DomHTMLAnchorElement()
        case 'style':
            return new DomHTMLStyleElement()
        case 'link':
            return new DomHTMLLinkElement()
        case 'form':
            return new DomHTMLFormElement()
        case 'button':
            return new DomHTMLButtonElement()
        default:
            return new DomHTMLElement(tag)
    }
}
