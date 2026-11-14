import { DomEventTarget } from './event'
import { matchesSelector, querySelectorAll as selectAll } from './selectors'

/*
 * Core DOM node classes: Node, CharacterData, Text, Comment,
 * DocumentFragment. Element/Document live in their own files.
 */

export const NODE_TYPE = {
    ELEMENT_NODE: 1,
    ATTRIBUTE_NODE: 2,
    TEXT_NODE: 3,
    CDATA_SECTION_NODE: 4,
    ENTITY_REFERENCE_NODE: 5,
    ENTITY_NODE: 6,
    PROCESSING_INSTRUCTION_NODE: 7,
    COMMENT_NODE: 8,
    DOCUMENT_NODE: 9,
    DOCUMENT_TYPE_NODE: 10,
    DOCUMENT_FRAGMENT_NODE: 11,
    NOTATION_NODE: 12,
} as const

export const DOCUMENT_POSITION_DISCONNECTED = 1
export const DOCUMENT_POSITION_PRECEDING = 2
export const DOCUMENT_POSITION_FOLLOWING = 4
export const DOCUMENT_POSITION_CONTAINS = 8
export const DOCUMENT_POSITION_CONTAINED_BY = 16

function detach(node: DomNode): void {
    const parent = node.parentNode
    if (!parent) return
    const siblings = parent.childNodes
    for (let i = siblings.length - 1; i >= 0; i--) {
        if (siblings[i] === node) siblings.splice(i, 1)
    }
    node.parentNode = null
}

function insertNode(parent: DomNode, node: DomNode, reference: DomNode | null): DomNode {
    if (node === parent) throw new Error('HierarchyRequestError: cannot insert a node into itself')
    // Ancestor check
    let ancestor: DomNode | null = parent
    while (ancestor) {
        if (ancestor === node) throw new Error('HierarchyRequestError: cannot insert an ancestor')
        ancestor = ancestor.parentNode
    }

    if (node.nodeType === NODE_TYPE.DOCUMENT_FRAGMENT_NODE) {
        const children = node.childNodes.slice()
        for (let i = 0; i < children.length; i++) insertNode(parent, children[i], reference)
        return node
    }

    detach(node)

    const siblings = parent.childNodes
    if (reference == null) {
        siblings.push(node)
    } else {
        let index = -1
        for (let i = 0; i < siblings.length; i++) {
            if (siblings[i] === reference) {
                index = i
                break
            }
        }
        if (index < 0) siblings.push(node)
        else siblings.splice(index, 0, node)
    }
    node.parentNode = parent
    if (!node.ownerDocument) node.ownerDocument = parent.ownerDocument
    return node
}

function collectText(node: DomNode, out: string[]): void {
    const children = node.childNodes
    for (let i = 0; i < children.length; i++) {
        const child = children[i]
        if (child.nodeType === NODE_TYPE.TEXT_NODE || child.nodeType === NODE_TYPE.CDATA_SECTION_NODE) {
            out.push((child as DomCharacterData).data)
        } else if (child.nodeType === NODE_TYPE.ELEMENT_NODE || child.nodeType === NODE_TYPE.DOCUMENT_FRAGMENT_NODE) {
            collectText(child, out)
        }
        // Comments are intentionally skipped.
    }
}

export class DomNode extends DomEventTarget {
    static readonly ELEMENT_NODE: number = 1
    static readonly ATTRIBUTE_NODE: number = 2
    static readonly TEXT_NODE: number = 3
    static readonly CDATA_SECTION_NODE: number = 4
    static readonly ENTITY_REFERENCE_NODE: number = 5
    static readonly ENTITY_NODE: number = 6
    static readonly PROCESSING_INSTRUCTION_NODE: number = 7
    static readonly COMMENT_NODE: number = 8
    static readonly DOCUMENT_NODE: number = 9
    static readonly DOCUMENT_TYPE_NODE: number = 10
    static readonly DOCUMENT_FRAGMENT_NODE: number = 11
    static readonly NOTATION_NODE: number = 12

    static readonly DOCUMENT_POSITION_DISCONNECTED: number = 1
    static readonly DOCUMENT_POSITION_PRECEDING: number = 2
    static readonly DOCUMENT_POSITION_FOLLOWING: number = 4
    static readonly DOCUMENT_POSITION_CONTAINS: number = 8
    static readonly DOCUMENT_POSITION_CONTAINED_BY: number = 16

    nodeType: number = 0
    nodeName: string = ''
    _nodeValue: string | null = null
    parentNode: DomNode | null = null
    childNodes: DomNode[] = []
    ownerDocument: any = null
    __domNode = true

    get nodeValue(): string | null {
        return this._nodeValue
    }

    set nodeValue(value: string | null) {
        this._nodeValue = value
    }

    get localName(): string {
        return this.nodeName ? this.nodeName.toLowerCase() : ''
    }

    get parentElement(): any {
        return this.parentNode && this.parentNode.nodeType === NODE_TYPE.ELEMENT_NODE ? this.parentNode : null
    }

    get firstChild(): DomNode | null {
        return this.childNodes.length > 0 ? this.childNodes[0] : null
    }

    get lastChild(): DomNode | null {
        return this.childNodes.length > 0 ? this.childNodes[this.childNodes.length - 1] : null
    }

    get nextSibling(): DomNode | null {
        const parent = this.parentNode
        if (!parent) return null
        const siblings = parent.childNodes
        for (let i = 0; i < siblings.length - 1; i++) {
            if (siblings[i] === this) return siblings[i + 1]
        }
        return null
    }

    get previousSibling(): DomNode | null {
        const parent = this.parentNode
        if (!parent) return null
        const siblings = parent.childNodes
        for (let i = 1; i < siblings.length; i++) {
            if (siblings[i] === this) return siblings[i - 1]
        }
        return null
    }

    get isConnected(): boolean {
        let node: DomNode | null = this
        while (node) {
            if (node.nodeType === NODE_TYPE.DOCUMENT_NODE) return true
            node = node.parentNode
        }
        return false
    }

    get childElementCount(): number {
        let count = 0
        for (let i = 0; i < this.childNodes.length; i++) {
            if (this.childNodes[i].nodeType === NODE_TYPE.ELEMENT_NODE) count++
        }
        return count
    }

    get firstElementChild(): any {
        for (let i = 0; i < this.childNodes.length; i++) {
            if (this.childNodes[i].nodeType === NODE_TYPE.ELEMENT_NODE) return this.childNodes[i]
        }
        return null
    }

    get lastElementChild(): any {
        for (let i = this.childNodes.length - 1; i >= 0; i--) {
            if (this.childNodes[i].nodeType === NODE_TYPE.ELEMENT_NODE) return this.childNodes[i]
        }
        return null
    }

    get previousElementSibling(): any {
        let sibling = this.previousSibling
        while (sibling && sibling.nodeType !== NODE_TYPE.ELEMENT_NODE) sibling = sibling.previousSibling
        return sibling
    }

    get nextElementSibling(): any {
        let sibling = this.nextSibling
        while (sibling && sibling.nodeType !== NODE_TYPE.ELEMENT_NODE) sibling = sibling.nextSibling
        return sibling
    }

    get textContent(): string | null {
        if (this.nodeType === NODE_TYPE.DOCUMENT_NODE) return null
        const out: string[] = []
        collectText(this, out)
        return out.join('')
    }

    set textContent(value: string | null) {
        const text = value == null ? '' : String(value)
        this._clearChildren()
        if (text) this.appendChild(this._createTextNode(text))
    }

    get baseURI(): string {
        return this.ownerDocument ? this.ownerDocument.baseURI : ''
    }

    _createTextNode(text: string): DomNode {
        return this.ownerDocument ? this.ownerDocument.createTextNode(text) : new DomText(text)
    }

    _clearChildren(): void {
        for (let i = this.childNodes.length - 1; i >= 0; i--) {
            const child = this.childNodes[i]
            child.parentNode = null
        }
        this.childNodes.length = 0
    }

    appendChild(node: DomNode): DomNode {
        return insertNode(this, node, null)
    }

    insertBefore(node: DomNode, reference: DomNode | null): DomNode {
        return insertNode(this, node, reference == null ? null : reference)
    }

    removeChild(node: DomNode): DomNode {
        if (node.parentNode !== this) throw new Error('NotFoundError: node is not a child of this node')
        detach(node)
        return node
    }

    replaceChild(newNode: DomNode, oldNode: DomNode): DomNode {
        if (oldNode.parentNode !== this) throw new Error('NotFoundError: node is not a child of this node')
        insertNode(this, newNode, oldNode)
        detach(oldNode)
        return oldNode
    }

    remove(): void {
        if (this.parentNode) this.parentNode.removeChild(this)
    }

    hasChildNodes(): boolean {
        return this.childNodes.length > 0
    }

    contains(node: DomNode | null): boolean {
        if (!node) return false
        let current: DomNode | null = node
        while (current) {
            if (current === this) return true
            current = current.parentNode
        }
        return false
    }

    getRootNode(): DomNode {
        let node: DomNode = this
        while (node.parentNode) node = node.parentNode
        return node
    }

    cloneNode(deep?: boolean): DomNode {
        const clone = this._shallowClone()
        if (deep) {
            for (let i = 0; i < this.childNodes.length; i++) clone.appendChild(this.childNodes[i].cloneNode(true))
        }
        return clone
    }

    _shallowClone(): DomNode {
        const clone = new DomNode()
        clone.nodeType = this.nodeType
        clone.nodeName = this.nodeName
        clone.nodeValue = this.nodeValue
        clone.ownerDocument = this.ownerDocument
        return clone
    }

    normalize(): void {
        const children = this.childNodes
        for (let i = children.length - 1; i >= 0; i--) {
            const child = children[i]
            if (child.nodeType === NODE_TYPE.TEXT_NODE) {
                const previous = child.previousSibling
                if (previous && previous.nodeType === NODE_TYPE.TEXT_NODE) {
                    ;(previous as DomCharacterData).data += (child as DomCharacterData).data
                    child.remove()
                } else if (!(child as DomCharacterData).data) {
                    child.remove()
                }
            } else if (child.nodeType === NODE_TYPE.ELEMENT_NODE) {
                child.normalize()
            }
        }
    }

    compareDocumentPosition(other: DomNode): number {
        if (other === this) return 0
        if (this.contains(other)) return DOCUMENT_POSITION_CONTAINED_BY | DOCUMENT_POSITION_FOLLOWING
        if (other.contains(this)) return DOCUMENT_POSITION_CONTAINS | DOCUMENT_POSITION_PRECEDING
        return DOCUMENT_POSITION_DISCONNECTED
    }

    isSameNode(other: DomNode): boolean {
        return this === other
    }
}

export class DomCharacterData extends DomNode {
    data: string = ''

    get nodeValue(): string | null {
        return this.data
    }

    set nodeValue(value: string | null) {
        this.data = value == null ? '' : String(value)
    }

    get length(): number {
        return this.data.length
    }

    get textContent(): string {
        return this.data
    }

    set textContent(value: string | null) {
        this.data = value == null ? '' : String(value)
    }

    appendData(text: string): void {
        this.data += String(text)
    }

    insertData(offset: number, text: string): void {
        this.data = this.data.slice(0, offset) + String(text) + this.data.slice(offset)
    }

    deleteData(offset: number, count: number): void {
        this.data = this.data.slice(0, offset) + this.data.slice(offset + count)
    }

    replaceData(offset: number, count: number, text: string): void {
        this.data = this.data.slice(0, offset) + String(text) + this.data.slice(offset + count)
    }

    substringData(offset: number, count: number): string {
        return this.data.substring(offset, offset + count)
    }

    _shallowClone(): DomNode {
        const clone = new (this.constructor as any)()
        clone.nodeType = this.nodeType
        clone.nodeName = this.nodeName
        clone.data = this.data
        clone.ownerDocument = this.ownerDocument
        return clone
    }
}

export class DomText extends DomCharacterData {
    constructor(data?: string) {
        super()
        this.nodeType = NODE_TYPE.TEXT_NODE
        this.nodeName = '#text'
        this.data = data == null ? '' : String(data)
    }

    get wholeText(): string {
        return this.data
    }
}

export class DomComment extends DomCharacterData {
    constructor(data?: string) {
        super()
        this.nodeType = NODE_TYPE.COMMENT_NODE
        this.nodeName = '#comment'
        this.data = data == null ? '' : String(data)
    }
}

export class DomDocumentFragment extends DomNode {
    constructor() {
        super()
        this.nodeType = NODE_TYPE.DOCUMENT_FRAGMENT_NODE
        this.nodeName = '#document-fragment'
    }

    get children(): any[] {
        const out: any[] = []
        for (let i = 0; i < this.childNodes.length; i++) {
            if (this.childNodes[i].nodeType === NODE_TYPE.ELEMENT_NODE) out.push(this.childNodes[i])
        }
        return out
    }

    getElementById(id: string): any {
        const found = this.querySelector('#' + String(id))
        return found || null
    }

    querySelector(selector: string): any {
        const all = this.querySelectorAll(selector)
        return all.length > 0 ? all[0] : null
    }

    querySelectorAll(selector: string): any[] {
        return selectAll(this, selector)
    }

    matches(selector: string): boolean {
        return matchesSelector(this, selector)
    }

    _shallowClone(): DomNode {
        const clone = new DomDocumentFragment()
        clone.ownerDocument = this.ownerDocument
        return clone
    }
}

export function isDomNode(value: any): boolean {
    return !!value && typeof value.nodeType === 'number'
}

export function appendNodes(parent: DomNode, nodes: any[]): void {
    const doc = parent.ownerDocument
    for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i]
        if (node == null) continue
        if (isDomNode(node)) parent.appendChild(node)
        else if (doc) parent.appendChild(doc.createTextNode(String(node)))
    }
}

export function nodesFromArgument(doc: any, value: any): any[] {
    if (value == null) return []
    if (isDomNode(value)) return [value]
    if (typeof value === 'string') return [doc ? doc.createTextNode(value) : new DomText(value)]
    if (typeof value.length === 'number') {
        const out: any[] = []
        for (let i = 0; i < value.length; i++) out.push(...nodesFromArgument(doc, value[i]))
        return out
    }
    return [doc ? doc.createTextNode(String(value)) : new DomText(String(value))]
}
