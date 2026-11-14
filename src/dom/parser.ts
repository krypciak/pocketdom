import { NODE_TYPE } from './nodes'

/*
 * A pragmatic HTML parser + serializer.
 *
 * It handles the markup that CrossCode, CCLoader, Simplify and DOM-using mods
 * actually generate: nested elements, attributes, comments, doctypes, raw text
 * elements, entities and the common implicit-close rules.
 */

const VOID_ELEMENTS: Record<string, boolean> = {
    area: true,
    base: true,
    br: true,
    col: true,
    embed: true,
    hr: true,
    img: true,
    input: true,
    link: true,
    meta: true,
    param: true,
    source: true,
    track: true,
    wbr: true,
}

const RAW_TEXT_ELEMENTS: Record<string, boolean> = {
    script: true,
    style: true,
    textarea: true,
    title: true,
    xmp: true,
    plaintext: true,
}

const BLOCK_ELEMENTS: Record<string, boolean> = {
    address: true,
    article: true,
    aside: true,
    blockquote: true,
    details: true,
    div: true,
    dl: true,
    fieldset: true,
    figcaption: true,
    figure: true,
    footer: true,
    form: true,
    h1: true,
    h2: true,
    h3: true,
    h4: true,
    h5: true,
    h6: true,
    header: true,
    hgroup: true,
    hr: true,
    main: true,
    nav: true,
    ol: true,
    p: true,
    pre: true,
    section: true,
    table: true,
    ul: true,
}

/** Tag names that implicitly close the currently open tag. */
const CLOSE_BEFORE: Record<string, string[]> = {
    li: ['li'],
    p: ['p'],
    td: ['td', 'th'],
    th: ['td', 'th'],
    tr: ['tr', 'td', 'th'],
    tbody: ['tbody', 'thead', 'tfoot', 'tr', 'td', 'th'],
    thead: ['tbody', 'thead', 'tfoot', 'tr', 'td', 'th'],
    tfoot: ['tbody', 'thead', 'tfoot', 'tr', 'td', 'th'],
    option: ['option'],
    optgroup: ['option', 'optgroup'],
    body: ['head'],
    head: ['body'],
    colgroup: ['colgroup'],
}

const ENTITIES: Record<string, string> = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: '\u00a0',
    copy: '\u00a9',
    reg: '\u00ae',
    trade: '\u2122',
    deg: '\u00b0',
    plusmn: '\u00b1',
    times: '\u00d7',
    divide: '\u00f7',
    frac12: '\u00bd',
    frac14: '\u00bc',
    frac34: '\u00be',
    sup2: '\u00b2',
    sup3: '\u00b3',
    micro: '\u00b5',
    para: '\u00b6',
    sect: '\u00a7',
    middot: '\u00b7',
    bullet: '\u2022',
    hellip: '\u2026',
    mdash: '\u2014',
    ndash: '\u2013',
    lsquo: '\u2018',
    rsquo: '\u2019',
    ldquo: '\u201c',
    rdquo: '\u201d',
    sbquo: '\u201a',
    bdquo: '\u201e',
    laquo: '\u00ab',
    raquo: '\u00bb',
    lsaquo: '\u2039',
    rsaquo: '\u203a',
    larr: '\u2190',
    uarr: '\u2191',
    rarr: '\u2192',
    darr: '\u2193',
    harr: '\u2194',
    lArr: '\u21d0',
    rArr: '\u21d2',
    hArr: '\u21d4',
    le: '\u2264',
    ge: '\u2265',
    ne: '\u2260',
    equiv: '\u2261',
    asymp: '\u2248',
    infin: '\u221e',
    sum: '\u2211',
    prod: '\u220f',
    radic: '\u221a',
    int: '\u222b',
    part: '\u2202',
    nabla: '\u2207',
    isin: '\u2208',
    notin: '\u2209',
    cap: '\u2229',
    cup: '\u222a',
    and: '\u2227',
    or: '\u2228',
    there4: '\u2234',
    sim: '\u223c',
    cong: '\u2245',
    alpha: '\u03b1',
    beta: '\u03b2',
    gamma: '\u03b3',
    delta: '\u03b4',
    epsilon: '\u03b5',
    zeta: '\u03b6',
    eta: '\u03b7',
    theta: '\u03b8',
    iota: '\u03b9',
    kappa: '\u03ba',
    lambda: '\u03bb',
    mu: '\u03bc',
    nu: '\u03bd',
    xi: '\u03be',
    omicron: '\u03bf',
    pi: '\u03c0',
    rho: '\u03c1',
    sigma: '\u03c3',
    tau: '\u03c4',
    upsilon: '\u03c5',
    phi: '\u03c6',
    chi: '\u03c7',
    psi: '\u03c8',
    omega: '\u03c9',
    Alpha: '\u0391',
    Beta: '\u0392',
    Gamma: '\u0393',
    Delta: '\u0394',
    Omega: '\u03a9',
    ensp: '\u2002',
    emsp: '\u2003',
    thinsp: '\u2009',
    zwnj: '\u200c',
    zwj: '\u200d',
    lrm: '\u200e',
    rlm: '\u200f',
    shy: '\u00ad',
    euro: '\u20ac',
    pound: '\u00a3',
    yen: '\u00a5',
    cent: '\u00a2',
    curren: '\u00a4',
    iexcl: '\u00a1',
    iquest: '\u00bf',
    brvbar: '\u00a6',
    uml: '\u00a8',
    ordf: '\u00aa',
    ordm: '\u00ba',
    not: '\u00ac',
    macr: '\u00af',
    acute: '\u00b4',
    cedil: '\u00b8',
    sup1: '\u00b9',
    frac13: '\u2153',
    frac23: '\u2154',
    frac15: '\u2155',
    frac25: '\u2156',
    star: '\u2606',
    starf: '\u2605',
    check: '\u2713',
    cross: '\u2717',
}

export function decodeEntities(text: string): string {
    if (text.indexOf('&') < 0) return text
    let out = ''
    let i = 0
    while (i < text.length) {
        const ch = text.charAt(i)
        if (ch !== '&') {
            out += ch
            i++
            continue
        }
        const semicolon = text.indexOf(';', i + 1)
        if (semicolon < 0 || semicolon - i > 40) {
            out += ch
            i++
            continue
        }
        const body = text.slice(i + 1, semicolon)
        if (!body) {
            out += ch
            i++
            continue
        }
        let decoded: string | null = null
        if (body.charAt(0) === '#') {
            const isHex = body.charAt(1) === 'x' || body.charAt(1) === 'X'
            const code = parseInt(isHex ? body.slice(2) : body.slice(1), isHex ? 16 : 10)
            if (!isNaN(code) && code > 0 && code < 0x110000) decoded = String.fromCodePoint(code)
        } else if (Object.prototype.hasOwnProperty.call(ENTITIES, body)) {
            decoded = ENTITIES[body]
        } else if (body.charAt(body.length - 1) === '=') {
            decoded = '&' + body
        }
        if (decoded == null) {
            out += ch
            i++
            continue
        }
        out += decoded
        i = semicolon + 1
    }
    return out
}

function escapeText(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function escapeAttribute(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function isSpace(code: number): boolean {
    return code === 32 || code === 9 || code === 10 || code === 13 || code === 12
}

function readTagName(html: string, start: number): { name: string; end: number } {
    let end = start
    while (end < html.length) {
        const code = html.charCodeAt(end)
        if (isSpace(code) || code === 47 /* / */ || code === 62 /* > */) break
        end++
    }
    return { name: html.slice(start, end).toLowerCase(), end }
}

function readAttributes(html: string, start: number): { attributes: Array<[string, string]>; end: number; selfClosing: boolean } {
    const attributes: Array<[string, string]> = []
    let i = start
    let selfClosing = false
    while (i < html.length) {
        while (i < html.length && isSpace(html.charCodeAt(i))) i++
        if (i >= html.length) break
        let code = html.charCodeAt(i)
        if (code === 62 /* > */) {
            i++
            return { attributes, end: i, selfClosing }
        }
        if (code === 47 /* / */) {
            selfClosing = true
            i++
            continue
        }
        // Attribute name
        const nameStart = i
        while (i < html.length) {
            code = html.charCodeAt(i)
            if (isSpace(code) || code === 61 /* = */ || code === 62 || code === 47) break
            i++
        }
        const name = html.slice(nameStart, i).toLowerCase()
        if (!name) {
            i++
            continue
        }
        while (i < html.length && isSpace(html.charCodeAt(i))) i++
        let value = ''
        if (i < html.length && html.charCodeAt(i) === 61) {
            i++
            while (i < html.length && isSpace(html.charCodeAt(i))) i++
            if (i < html.length) {
                const quote = html.charAt(i)
                if (quote === '"' || quote === "'") {
                    i++
                    const valueStart = i
                    while (i < html.length && html.charAt(i) !== quote) i++
                    value = html.slice(valueStart, i)
                    if (i < html.length) i++
                } else {
                    const valueStart = i
                    while (i < html.length) {
                        const c = html.charCodeAt(i)
                        if (isSpace(c) || c === 62) break
                        i++
                    }
                    value = html.slice(valueStart, i)
                }
            }
        }
        attributes.push([name, decodeEntities(value)])
    }
    return { attributes, end: i, selfClosing }
}

export function parseFragment(html: string, doc: any, contextTag?: string): any[] {
    const source = String(html == null ? '' : html)
    const fragment = doc.createDocumentFragment()
    const stack: any[] = [fragment]
    let i = 0
    const length = source.length

    const top = (): any => stack[stack.length - 1]

    const insertElement = (element: any): void => {
        const tag = element.localName
        const closes = CLOSE_BEFORE[tag]
        if (closes) {
            for (;;) {
                const current = top()
                if (current === fragment) break
                if (closes.indexOf(current.localName) < 0) break
                stack.pop()
            }
        } else if (BLOCK_ELEMENTS[tag]) {
            // Block elements close an open <p>.
            const current = top()
            if (current !== fragment && current.localName === 'p') stack.pop()
        }

        // Browsers wrap bare <tr> rows in a <tbody>.
        if (tag === 'tr') {
            const current = top()
            if (current !== fragment && current.localName === 'table') {
                const tbody = doc.createElement('tbody')
                current.appendChild(tbody)
                stack.push(tbody)
            } else if (current === fragment && contextTag === 'table') {
                const tbody = doc.createElement('tbody')
                fragment.appendChild(tbody)
                stack.push(tbody)
            }
        }

        top().appendChild(element)
    }

    while (i < length) {
        const lt = source.indexOf('<', i)
        if (lt < 0) {
            const text = source.slice(i)
            if (text) top().appendChild(doc.createTextNode(decodeEntities(text)))
            break
        }
        if (lt > i) {
            const text = source.slice(i, lt)
            if (text) top().appendChild(doc.createTextNode(decodeEntities(text)))
            i = lt
        }

        // Comment
        if (source.slice(i, i + 4) === '<!--') {
            const end = source.indexOf('-->', i + 4)
            const data = end < 0 ? source.slice(i + 4) : source.slice(i + 4, end)
            top().appendChild(doc.createComment(data))
            i = end < 0 ? length : end + 3
            continue
        }

        // Doctype / processing instruction / bogus comment
        if (source.charAt(i + 1) === '!') {
            const end = source.indexOf('>', i + 2)
            i = end < 0 ? length : end + 1
            continue
        }
        if (source.charAt(i + 1) === '?') {
            const end = source.indexOf('>', i + 2)
            i = end < 0 ? length : end + 1
            continue
        }

        // End tag
        if (source.charAt(i + 1) === '/') {
            const read = readTagName(source, i + 2)
            const name = read.name
            let end = read.end
            while (end < source.length && source.charCodeAt(end) !== 62) end++
            i = end < source.length ? end + 1 : source.length
            if (!name) continue
            // Find the matching open element.
            for (let j = stack.length - 1; j >= 1; j--) {
                if (stack[j].localName === name) {
                    stack.length = j
                    break
                }
            }
            continue
        }

        // Start tag
        const read = readTagName(source, i + 1)
        const name = read.name
        if (!name) {
            // A lone "<" is just text.
            top().appendChild(doc.createTextNode('<'))
            i++
            continue
        }

        const attrRead = readAttributes(source, read.end)
        i = attrRead.end

        const element = doc.createElement(name)
        for (let a = 0; a < attrRead.attributes.length; a++) {
            element.setAttribute(attrRead.attributes[a][0], attrRead.attributes[a][1])
        }

        const isVoid = !!VOID_ELEMENTS[name]
        if (isVoid || attrRead.selfClosing) {
            insertElement(element)
            continue
        }

        if (RAW_TEXT_ELEMENTS[name]) {
            // Raw text: everything up to the matching closing tag.
            const lower = source.toLowerCase()
            const closeTag = '</' + name
            let end = lower.indexOf(closeTag, i)
            if (end < 0) end = length
            const raw = source.slice(i, end)
            insertElement(element)
            if (name === 'textarea' || name === 'title') {
                element.appendChild(doc.createTextNode(decodeEntities(raw)))
            } else {
                element.appendChild(doc.createTextNode(raw))
            }
            if (end < length) {
                const gt = source.indexOf('>', end)
                i = gt < 0 ? length : gt + 1
            } else {
                i = length
            }
            continue
        }

        insertElement(element)
        stack.push(element)
    }

    // Detach parsed nodes from the fragment and return them.
    const result: any[] = []
    const children = fragment.childNodes.slice()
    for (let n = 0; n < children.length; n++) {
        fragment.removeChild(children[n])
        result.push(children[n])
    }
    return result
}

/** Parse a full HTML document into `doc` (a DomDocument). */
export function parseDocumentInto(doc: any, html: string): void {
    const source = String(html == null ? '' : html)
    const fragment = doc.createDocumentFragment()
    const stack: any[] = [fragment]
    // Reuse the fragment parser but keep html/head/body elements in the tree.
    const parsed = parseFragment(source, doc)
    for (let i = 0; i < parsed.length; i++) fragment.appendChild(parsed[i])

    let htmlElement: any = null
    for (let i = 0; i < fragment.childNodes.length; i++) {
        const child = fragment.childNodes[i]
        if (child.nodeType === NODE_TYPE.ELEMENT_NODE && child.localName === 'html') {
            htmlElement = child
            break
        }
    }

    if (!htmlElement) {
        // No <html>: everything belongs to <body>.
        htmlElement = doc.createElement('html')
        const head = doc.createElement('head')
        const body = doc.createElement('body')
        htmlElement.appendChild(head)
        htmlElement.appendChild(body)
        const children = fragment.childNodes.slice()
        for (let i = 0; i < children.length; i++) {
            const child = children[i]
            fragment.removeChild(child)
            if (child.nodeType === NODE_TYPE.ELEMENT_NODE && child.localName === 'head') {
                const headChildren = child.childNodes.slice()
                for (let j = 0; j < headChildren.length; j++) {
                    child.removeChild(headChildren[j])
                    head.appendChild(headChildren[j])
                }
            } else if (child.nodeType === NODE_TYPE.ELEMENT_NODE && child.localName === 'body') {
                const bodyChildren = child.childNodes.slice()
                for (let j = 0; j < bodyChildren.length; j++) {
                    child.removeChild(bodyChildren[j])
                    body.appendChild(bodyChildren[j])
                }
            } else {
                body.appendChild(child)
            }
        }
    } else {
        // Ensure canonical head/body ordering inside <html>.
        let head: any = null
        let body: any = null
        const children = htmlElement.childNodes.slice()
        for (let i = 0; i < children.length; i++) {
            const child = children[i]
            if (child.nodeType !== NODE_TYPE.ELEMENT_NODE) continue
            if (child.localName === 'head') head = child
            else if (child.localName === 'body') body = child
        }
        if (!head) {
            head = doc.createElement('head')
            htmlElement.insertBefore(head, htmlElement.firstChild)
        }
        if (!body) {
            body = doc.createElement('body')
            htmlElement.appendChild(body)
        } else if (htmlElement.lastChild !== body) {
            htmlElement.appendChild(body)
        }
    }

    // Collect doctype nodes (kept outside <html>).
    const doctypes: any[] = []
    for (let i = 0; i < fragment.childNodes.length; i++) {
        const child = fragment.childNodes[i]
        if (child.nodeType === NODE_TYPE.DOCUMENT_TYPE_NODE) doctypes.push(child)
    }

    doc._clearChildren()
    for (let i = 0; i < doctypes.length; i++) doc.appendChild(doctypes[i])
    doc.appendChild(htmlElement)
    doc._refreshReferences()
}

export function serializeNode(node: any): string {
    if (!node) return ''
    switch (node.nodeType) {
        case NODE_TYPE.TEXT_NODE:
            return escapeText(node.data)
        case NODE_TYPE.CDATA_SECTION_NODE:
            return '<![CDATA[' + node.data + ']]>'
        case NODE_TYPE.COMMENT_NODE:
            return '<!--' + node.data + '-->'
        case NODE_TYPE.DOCUMENT_NODE: {
            let out = ''
            for (let i = 0; i < node.childNodes.length; i++) out += serializeNode(node.childNodes[i])
            return out
        }
        case NODE_TYPE.DOCUMENT_TYPE_NODE:
            return '<!DOCTYPE ' + (node.name || 'html') + '>'
        case NODE_TYPE.DOCUMENT_FRAGMENT_NODE: {
            let out = ''
            for (let i = 0; i < node.childNodes.length; i++) out += serializeNode(node.childNodes[i])
            return out
        }
        case NODE_TYPE.ELEMENT_NODE:
            return serializeElement(node)
        default:
            return ''
    }
}

export function serializeElement(element: any): string {
    const tag = element.localName
    let out = '<' + tag
    const names = element.getAttributeNames ? element.getAttributeNames() : []
    for (let i = 0; i < names.length; i++) {
        const name = names[i]
        const value = element.getAttribute(name)
        if (value == null) {
            out += ' ' + name
        } else {
            out += ' ' + name + '="' + escapeAttribute(value) + '"'
        }
    }
    out += '>'
    if (VOID_ELEMENTS[tag]) return out

    if (RAW_TEXT_ELEMENTS[tag]) {
        let text = ''
        for (let i = 0; i < element.childNodes.length; i++) {
            const child = element.childNodes[i]
            if (child.nodeType === NODE_TYPE.TEXT_NODE) text += child.data
            else text += serializeNode(child)
        }
        return out + text + '</' + tag + '>'
    }

    for (let i = 0; i < element.childNodes.length; i++) out += serializeNode(element.childNodes[i])
    return out + '</' + tag + '>'
}

export function serializeChildren(node: any): string {
    let out = ''
    if (!node) return out
    for (let i = 0; i < node.childNodes.length; i++) out += serializeNode(node.childNodes[i])
    return out
}

export function parseAttributesInto(element: any, attributeText: string): void {
    const attributeSource = String(attributeText || '')
    const read = readAttributes(attributeSource, 0)
    for (let i = 0; i < read.attributes.length; i++) element.setAttribute(read.attributes[i][0], read.attributes[i][1])
}

export function isVoidElement(tag: string): boolean {
    return !!VOID_ELEMENTS[String(tag).toLowerCase()]
}
