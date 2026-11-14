/*
 * A compact CSS selector engine.
 *
 * Supported: tag, *, #id, .class, [attr], [attr=value], [attr~=v], [attr^=v],
 * [attr$=v], [attr*=v], [attr|=v], descendant/child/adjacent/general-sibling
 * combinators, comma groups and the commonly used structural/state pseudo
 * classes. Pseudo-elements never match.
 */

interface AttributeSelector {
    name: string
    operator: string | null
    value: string | null
}

interface PseudoSelector {
    name: string
    argument: string | null
    nested: SelectorGroup[] | null
}

interface CompoundSelector {
    tag: string | null
    id: string | null
    classes: string[]
    attributes: AttributeSelector[]
    pseudos: PseudoSelector[]
}

export interface SelectorGroup {
    compounds: CompoundSelector[]
    combinators: string[]
}

const cache: Record<string, SelectorGroup[] | null> = {}
const CACHE_LIMIT = 500

function isWhitespace(ch: string): boolean {
    return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === '\f'
}

function readBalanced(text: string, start: number, open: string, close: string): { value: string; end: number } {
    let depth = 1
    let i = start
    let value = ''
    while (i < text.length) {
        const ch = text.charAt(i)
        if (ch === '\\') {
            value += ch
            i++
            if (i < text.length) value += text.charAt(i)
            i++
            continue
        }
        if (ch === open) depth++
        else if (ch === close) {
            depth--
            if (depth === 0) return { value, end: i + 1 }
        }
        value += ch
        i++
    }
    return { value, end: i }
}

function splitTopLevel(text: string, separator: string): string[] {
    const parts: string[] = []
    let current = ''
    let bracket = 0
    let paren = 0
    let quote = ''
    for (let i = 0; i < text.length; i++) {
        const ch = text.charAt(i)
        if (quote) {
            current += ch
            if (ch === quote && text.charAt(i - 1) !== '\\') quote = ''
            continue
        }
        if (ch === '"' || ch === "'") {
            quote = ch
            current += ch
            continue
        }
        if (ch === '[') bracket++
        else if (ch === ']') bracket--
        else if (ch === '(') paren++
        else if (ch === ')') paren--
        if (ch === separator && bracket === 0 && paren === 0) {
            parts.push(current)
            current = ''
            continue
        }
        current += ch
    }
    parts.push(current)
    return parts
}

function parseAttribute(content: string): AttributeSelector | null {
    const text = content.trim()
    if (!text) return null
    let i = 0
    while (i < text.length) {
        const ch = text.charAt(i)
        if (ch === '=' || ch === '~' || ch === '^' || ch === '$' || ch === '*' || ch === '|') break
        i++
    }
    const name = text.slice(0, i).trim().toLowerCase()
    if (!name) return null
    if (i >= text.length) return { name, operator: null, value: null }

    if (text.charAt(i) === '=') {
        const value = stripValueQuotes(text.slice(i + 1).trim())
        return { name, operator: null, value: value === '' ? null : decodeSelectorValue(value) }
    }

    let operator = text.charAt(i)
    i++
    if (text.charAt(i) !== '=') return { name, operator: null, value: null }
    operator += '='
    i++
    const value = stripValueQuotes(text.slice(i).trim())
    return { name, operator, value: decodeSelectorValue(value) }
}

function stripValueQuotes(value: string): string {
    if (value.length >= 2) {
        const first = value.charAt(0)
        if ((first === '"' || first === "'") && value.charAt(value.length - 1) === first) return value.slice(1, -1)
    }
    return value
}

function decodeSelectorValue(value: string): string {
    return value.replace(/\\(.)/g, '$1')
}

function parseCompound(text: string): CompoundSelector {
    const compound: CompoundSelector = { tag: null, id: null, classes: [], attributes: [], pseudos: [] }
    let i = 0
    while (i < text.length) {
        const ch = text.charAt(i)
        if (ch === '*') {
            compound.tag = '*'
            i++
            continue
        }
        if (ch === '#') {
            i++
            let name = ''
            while (i < text.length) {
                const c = text.charAt(i)
                if (c === '.' || c === '#' || c === '[' || c === ':' || isWhitespace(c)) break
                if (c === '\\') {
                    i++
                    if (i < text.length) name += text.charAt(i)
                    i++
                    continue
                }
                name += c
                i++
            }
            compound.id = name
            continue
        }
        if (ch === '.') {
            i++
            let name = ''
            while (i < text.length) {
                const c = text.charAt(i)
                if (c === '.' || c === '#' || c === '[' || c === ':' || isWhitespace(c)) break
                if (c === '\\') {
                    i++
                    if (i < text.length) name += text.charAt(i)
                    i++
                    continue
                }
                name += c
                i++
            }
            if (name) compound.classes.push(name)
            continue
        }
        if (ch === '[') {
            const read = readBalanced(text, i + 1, '[', ']')
            const attribute = parseAttribute(read.value)
            if (attribute) compound.attributes.push(attribute)
            i = read.end
            continue
        }
        if (ch === ':') {
            i++
            if (text.charAt(i) === ':') {
                // Pseudo-element: consume name (and possible arguments) and ignore.
                i++
                while (i < text.length) {
                    const c = text.charAt(i)
                    if (c === '(') {
                        const read = readBalanced(text, i + 1, '(', ')')
                        i = read.end
                        break
                    }
                    if (isWhitespace(c) || c === '.' || c === '#' || c === '[' || c === ':') break
                    i++
                }
                continue
            }
            let name = ''
            while (i < text.length) {
                const c = text.charAt(i)
                if (c === '(' || isWhitespace(c) || c === '.' || c === '#' || c === '[' || c === ':') break
                name += c
                i++
            }
            let argument: string | null = null
            let nested: SelectorGroup[] | null = null
            if (text.charAt(i) === '(') {
                const read = readBalanced(text, i + 1, '(', ')')
                argument = read.value
                i = read.end
            }
            const lower = name.toLowerCase()
            if ((lower === 'not' || lower === 'is' || lower === 'where' || lower === 'matches' || lower === 'has') && argument != null) {
                nested = parseSelector(argument)
            }
            compound.pseudos.push({ name: lower, argument, nested })
            continue
        }
        // Tag name
        let name = ''
        while (i < text.length) {
            const c = text.charAt(i)
            if (c === '.' || c === '#' || c === '[' || c === ':' || isWhitespace(c) || c === '>' || c === '+' || c === '~') break
            name += c
            i++
        }
        if (name) compound.tag = name.toLowerCase()
    }
    return compound
}

export function parseSelector(selector: string): SelectorGroup[] | null {
    if (selector == null) return null
    const text = String(selector).trim()
    if (!text) return null
    if (Object.prototype.hasOwnProperty.call(cache, text)) return cache[text]

    const groups: SelectorGroup[] = []
    const groupTexts = splitTopLevel(text, ',')

    for (let g = 0; g < groupTexts.length; g++) {
        const groupText = groupTexts[g].trim()
        if (!groupText) continue

        const compounds: CompoundSelector[] = []
        const combinators: string[] = []
        let i = 0
        let pending: string | null = null
        const length = groupText.length

        while (i < length) {
            while (i < length && isWhitespace(groupText.charAt(i))) i++
            if (i >= length) break

            const ch = groupText.charAt(i)
            if (ch === '>' || ch === '+' || ch === '~') {
                pending = ch
                i++
                continue
            }

            const start = i
            let bracket = 0
            let paren = 0
            let quote = ''
            while (i < length) {
                const c = groupText.charAt(i)
                if (quote) {
                    if (c === quote && groupText.charAt(i - 1) !== '\\') quote = ''
                    i++
                    continue
                }
                if (c === '"' || c === "'") {
                    quote = c
                    i++
                    continue
                }
                if (c === '[') bracket++
                else if (c === ']') bracket--
                else if (c === '(') paren++
                else if (c === ')') paren--
                if (bracket === 0 && paren === 0 && (isWhitespace(c) || c === '>' || c === '+' || c === '~')) break
                i++
            }

            const compoundText = groupText.slice(start, i)
            if (!compoundText) {
                i++
                continue
            }
            if (compounds.length > 0) combinators.push(pending || ' ')
            compounds.push(parseCompound(compoundText))
            pending = null
        }

        if (compounds.length > 0) groups.push({ compounds, combinators })
    }

    const result = groups.length > 0 ? groups : null
    if (Object.keys(cache).length < CACHE_LIMIT) cache[text] = result
    return result
}

function elementChildren(element: any): any[] {
    const out: any[] = []
    if (!element || !element.childNodes) return out
    for (let i = 0; i < element.childNodes.length; i++) {
        const child = element.childNodes[i]
        if (child && child.nodeType === 1) out.push(child)
    }
    return out
}

function getAttributeValue(element: any, name: string): string | null {
    if (!element.getAttribute) return null
    const value = element.getAttribute(name)
    return value == null ? null : String(value)
}

function matchesAttribute(element: any, selector: AttributeSelector): boolean {
    const actual = getAttributeValue(element, selector.name)
    if (actual == null) return false
    if (selector.operator == null) return true
    const expected = selector.value == null ? '' : selector.value
    switch (selector.operator) {
        case '=':
            return actual === expected
        case '~=':
            return (' ' + actual + ' ').indexOf(' ' + expected + ' ') >= 0
        case '^=':
            return expected !== '' && actual.indexOf(expected) === 0
        case '$=':
            return expected !== '' && actual.length >= expected.length && actual.slice(actual.length - expected.length) === expected
        case '*=':
            return expected !== '' && actual.indexOf(expected) >= 0
        case '|=':
            return actual === expected || actual.indexOf(expected + '-') === 0
        default:
            return false
    }
}

function parseNth(argument: string | null): { a: number; b: number } | null {
    if (argument == null) return null
    const text = argument.trim().toLowerCase()
    if (text === 'odd') return { a: 2, b: 1 }
    if (text === 'even') return { a: 2, b: 0 }
    if (/^[+-]?\d+$/.test(text)) return { a: 0, b: parseInt(text, 10) }
    const match = /^([+-]?\d*)n([+-]\d+)?$/.exec(text)
    if (!match) return null
    const aText = match[1]
    let a = 0
    if (aText === '' || aText === '+') a = 1
    else if (aText === '-') a = -1
    else a = parseInt(aText, 10)
    const b = match[2] ? parseInt(match[2], 10) : 0
    return { a, b }
}

function nthMatches(index: number, nth: { a: number; b: number }): boolean {
    // index is 1-based
    if (nth.a === 0) return index === nth.b
    const n = (index - nth.b) / nth.a
    return n >= 0 && Math.floor(n) === n
}

function previousElementSibling(element: any): any {
    return element ? element.previousElementSibling : null
}

function matchesPseudo(element: any, pseudo: PseudoSelector): boolean {
    const name = pseudo.name
    switch (name) {
        case 'first-child':
            return previousElementSibling(element) == null
        case 'last-child':
            return element.nextElementSibling == null
        case 'only-child':
            return previousElementSibling(element) == null && element.nextElementSibling == null
        case 'first-of-type':
        case 'last-of-type':
        case 'only-of-type': {
            const parent = element.parentNode
            if (!parent) return false
            let count = 0
            let index = -1
            const children = parent.childNodes
            for (let i = 0; i < children.length; i++) {
                const child = children[i]
                if (child.nodeType !== 1 || child.localName !== element.localName) continue
                count++
                if (child === element) index = count
            }
            if (name === 'first-of-type') return index === 1
            if (name === 'last-of-type') return index === count
            return count === 1
        }
        case 'nth-child':
        case 'nth-last-child':
        case 'nth-of-type':
        case 'nth-last-of-type': {
            const parent = element.parentNode
            if (!parent) return false
            const ofType = name.indexOf('of-type') >= 0
            const fromEnd = name.indexOf('last') >= 0
            let count = 0
            let index = -1
            const children = parent.childNodes
            for (let i = 0; i < children.length; i++) {
                const child = children[i]
                if (child.nodeType !== 1) continue
                if (ofType && child.localName !== element.localName) continue
                count++
                if (child === element) index = count
            }
            if (fromEnd) index = count - index + 1
            const nth = parseNth(pseudo.argument)
            if (!nth) return false
            return nthMatches(index, nth)
        }
        case 'empty': {
            const children = element.childNodes
            for (let i = 0; i < children.length; i++) {
                const child = children[i]
                if (child.nodeType === 1) return false
                if ((child.nodeType === 3 || child.nodeType === 4) && child.data) return false
            }
            return true
        }
        case 'root':
            return element.parentNode != null && element.parentNode.nodeType === 9
        case 'scope':
            return false
        case 'checked':
        case 'default':
            return !!element.checked || element.getAttribute('checked') != null || element.getAttribute('selected') != null
        case 'selected':
            return !!element.selected || element.getAttribute('selected') != null
        case 'disabled':
            return element.getAttribute('disabled') != null || element.disabled === true
        case 'enabled':
            return element.getAttribute('disabled') == null && element.disabled !== true
        case 'focus':
        case 'focus-within':
        case 'focus-visible': {
            const doc = element.ownerDocument
            return !!doc && doc.activeElement != null && (doc.activeElement === element || (name !== 'focus' && element.contains && element.contains(doc.activeElement)))
        }
        case 'required':
            return element.getAttribute('required') != null
        case 'optional':
            return element.getAttribute('required') == null
        case 'read-only':
            return element.getAttribute('readonly') != null || element.disabled === true
        case 'read-write':
            return element.getAttribute('readonly') == null && element.disabled !== true
        case 'link':
        case 'any-link':
            return element.localName === 'a' || element.localName === 'area'
        case 'visited':
            return false
        case 'hover':
        case 'active':
        case 'target':
            return false
        case 'not':
            return pseudo.nested != null && !matchesAnyGroup(element, pseudo.nested)
        case 'is':
        case 'where':
        case 'matches':
            return pseudo.nested != null && matchesAnyGroup(element, pseudo.nested)
        case 'has': {
            if (!pseudo.nested) return false
            const descendants = querySelectorAll(element, null, pseudo.nested)
            return descendants.length > 0
        }
        case 'contains':
            return pseudo.argument != null && (element.textContent || '').indexOf(pseudo.argument) >= 0
        case 'visible':
            return true
        case 'hidden':
            return false
        default:
            return false
    }
}

function matchesCompound(element: any, compound: CompoundSelector): boolean {
    if (!element || element.nodeType !== 1) return false
    if (compound.tag && compound.tag !== '*' && element.localName !== compound.tag) return false
    if (compound.id && getAttributeValue(element, 'id') !== compound.id) return false
    if (compound.classes.length > 0) {
        const className = getAttributeValue(element, 'class') || ''
        const tokens = (' ' + className + ' ').replace(/\s+/g, ' ')
        for (let i = 0; i < compound.classes.length; i++) {
            if (tokens.indexOf(' ' + compound.classes[i] + ' ') < 0) return false
        }
    }
    for (let i = 0; i < compound.attributes.length; i++) {
        if (!matchesAttribute(element, compound.attributes[i])) return false
    }
    for (let i = 0; i < compound.pseudos.length; i++) {
        if (!matchesPseudo(element, compound.pseudos[i])) return false
    }
    return true
}

function matchesGroupAt(element: any, group: SelectorGroup, index: number): boolean {
    if (!matchesCompound(element, group.compounds[index])) return false
    if (index === 0) return true
    const combinator = group.combinators[index - 1] || ' '
    if (combinator === '>') {
        const parent = element.parentElement
        return parent ? matchesGroupAt(parent, group, index - 1) : false
    }
    if (combinator === ' ') {
        let parent = element.parentElement
        let guard = 0
        while (parent && guard++ < 10000) {
            if (matchesGroupAt(parent, group, index - 1)) return true
            parent = parent.parentElement
        }
        return false
    }
    if (combinator === '+') {
        const sibling = previousElementSibling(element)
        return sibling ? matchesGroupAt(sibling, group, index - 1) : false
    }
    if (combinator === '~') {
        let sibling = previousElementSibling(element)
        let guard = 0
        while (sibling && guard++ < 10000) {
            if (matchesGroupAt(sibling, group, index - 1)) return true
            sibling = previousElementSibling(sibling)
        }
        return false
    }
    return false
}

export function matchesAnyGroup(element: any, groups: SelectorGroup[]): boolean {
    for (let i = 0; i < groups.length; i++) {
        const group = groups[i]
        if (matchesGroupAt(element, group, group.compounds.length - 1)) return true
    }
    return false
}

export function matchesSelector(element: any, selector: string | SelectorGroup[]): boolean {
    const groups = typeof selector === 'string' ? parseSelector(selector) : selector
    if (!groups) return false
    return matchesAnyGroup(element, groups)
}

function collectElements(root: any, out: any[]): void {
    if (!root || !root.childNodes) return
    const children = root.childNodes
    for (let i = 0; i < children.length; i++) {
        const child = children[i]
        if (child.nodeType === 1) {
            out.push(child)
            collectElements(child, out)
        } else if (child.nodeType === 11) {
            collectElements(child, out)
        }
    }
}

export function querySelectorAll(root: any, selector: string | null, parsed?: SelectorGroup[] | null): any[] {
    const groups = parsed !== undefined && parsed !== null ? parsed : selector != null ? parseSelector(selector) : null
    if (!groups || groups.length === 0) return []
    const elements: any[] = []
    collectElements(root, elements)
    const result: any[] = []
    for (let i = 0; i < elements.length; i++) {
        if (matchesAnyGroup(elements[i], groups)) result.push(elements[i])
    }
    return result
}
