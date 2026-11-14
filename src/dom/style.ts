/*
 * A lightweight CSSStyleDeclaration + DOMTokenList implementation.
 */

function toCamel(name: string): string {
    if (name.indexOf('-') < 0 || name.indexOf('--') === 0) return name
    let out = ''
    let upper = false
    for (let i = 0; i < name.length; i++) {
        const ch = name.charAt(i)
        if (ch === '-') {
            upper = true
            continue
        }
        out += upper ? ch.toUpperCase() : ch
        upper = false
    }
    return out
}

function toKebab(name: string): string {
    if (name.indexOf('-') >= 0) return name
    let out = ''
    for (let i = 0; i < name.length; i++) {
        const ch = name.charAt(i)
        const code = ch.charCodeAt(0)
        if (code >= 65 && code <= 90) out += '-' + ch.toLowerCase()
        else out += ch
    }
    return out
}

/** CSS properties that get direct camelCase accessors (style.fontSize, ...). */
const STYLE_PROPERTIES = [
    'alignContent',
    'alignItems',
    'alignSelf',
    'animation',
    'animationDelay',
    'animationDirection',
    'animationDuration',
    'animationFillMode',
    'animationIterationCount',
    'animationName',
    'animationPlayState',
    'animationTimingFunction',
    'background',
    'backgroundAttachment',
    'backgroundBlendMode',
    'backgroundColor',
    'backgroundImage',
    'backgroundPosition',
    'backgroundPositionX',
    'backgroundPositionY',
    'backgroundRepeat',
    'backgroundSize',
    'backgroundClip',
    'backgroundOrigin',
    'border',
    'borderBottom',
    'borderBottomColor',
    'borderBottomLeftRadius',
    'borderBottomRightRadius',
    'borderBottomStyle',
    'borderBottomWidth',
    'borderCollapse',
    'borderColor',
    'borderImage',
    'borderLeft',
    'borderLeftColor',
    'borderLeftStyle',
    'borderLeftWidth',
    'borderRadius',
    'borderRight',
    'borderRightColor',
    'borderRightStyle',
    'borderRightWidth',
    'borderSpacing',
    'borderStyle',
    'borderTop',
    'borderTopColor',
    'borderTopLeftRadius',
    'borderTopRightRadius',
    'borderTopStyle',
    'borderTopWidth',
    'borderWidth',
    'bottom',
    'boxShadow',
    'boxSizing',
    'captionSide',
    'clear',
    'clip',
    'clipPath',
    'color',
    'columnCount',
    'columnGap',
    'columnRule',
    'columnWidth',
    'columns',
    'content',
    'cursor',
    'direction',
    'display',
    'emptyCells',
    'filter',
    'flex',
    'flexBasis',
    'flexDirection',
    'flexFlow',
    'flexGrow',
    'flexShrink',
    'flexWrap',
    'float',
    'font',
    'fontFamily',
    'fontFeatureSettings',
    'fontSize',
    'fontSizeAdjust',
    'fontStretch',
    'fontStyle',
    'fontVariant',
    'fontWeight',
    'gap',
    'grid',
    'gridArea',
    'gridAutoColumns',
    'gridAutoFlow',
    'gridAutoRows',
    'gridColumn',
    'gridColumnEnd',
    'gridColumnGap',
    'gridColumnStart',
    'gridGap',
    'gridRow',
    'gridRowEnd',
    'gridRowGap',
    'gridRowStart',
    'gridTemplate',
    'gridTemplateAreas',
    'gridTemplateColumns',
    'gridTemplateRows',
    'height',
    'imageRendering',
    'justifyContent',
    'justifyItems',
    'justifySelf',
    'left',
    'letterSpacing',
    'lineHeight',
    'listStyle',
    'listStyleImage',
    'listStylePosition',
    'listStyleType',
    'margin',
    'marginBottom',
    'marginLeft',
    'marginRight',
    'marginTop',
    'maxHeight',
    'maxWidth',
    'minHeight',
    'minWidth',
    'objectFit',
    'objectPosition',
    'opacity',
    'order',
    'outline',
    'outlineColor',
    'outlineOffset',
    'outlineStyle',
    'outlineWidth',
    'overflow',
    'overflowX',
    'overflowY',
    'padding',
    'paddingBottom',
    'paddingLeft',
    'paddingRight',
    'paddingTop',
    'pageBreakAfter',
    'pageBreakBefore',
    'perspective',
    'pointerEvents',
    'position',
    'resize',
    'right',
    'rowGap',
    'scrollBehavior',
    'tableLayout',
    'textAlign',
    'textDecoration',
    'textDecorationColor',
    'textDecorationLine',
    'textDecorationStyle',
    'textIndent',
    'textOverflow',
    'textShadow',
    'textTransform',
    'top',
    'transform',
    'transformOrigin',
    'transition',
    'transitionDelay',
    'transitionDuration',
    'transitionProperty',
    'transitionTimingFunction',
    'userSelect',
    'verticalAlign',
    'visibility',
    'whiteSpace',
    'width',
    'wordBreak',
    'wordSpacing',
    'wordWrap',
    'zIndex',
    'zoom',
]

export class DomCSSStyleDeclaration {
    _values: Record<string, string> = {}
    _priorities: Record<string, string> = {}
    _onChange: (() => void) | null = null

    constructor(onChange?: () => void) {
        if (onChange) this._onChange = onChange
    }

    get length(): number {
        return Object.keys(this._values).length
    }

    get cssText(): string {
        const keys = Object.keys(this._values)
        let out = ''
        for (let i = 0; i < keys.length; i++) {
            const key = keys[i]
            const value = this._values[key]
            if (!value) continue
            out += toKebab(key) + ': ' + value
            if (this._priorities[key] === 'important') out += ' !important'
            out += '; '
        }
        return out.trim()
    }

    set cssText(text: string) {
        this._values = {}
        this._priorities = {}
        const declarations = String(text == null ? '' : text).split(';')
        for (let i = 0; i < declarations.length; i++) {
            const declaration = declarations[i]
            const colon = declaration.indexOf(':')
            if (colon < 0) continue
            const name = declaration.slice(0, colon).trim()
            let value = declaration.slice(colon + 1).trim()
            if (!name) continue
            let priority = ''
            if (/!important$/i.test(value)) {
                value = value.replace(/!important$/i, '').trim()
                priority = 'important'
            }
            if (!value) continue
            const key = toCamel(name)
            this._values[key] = value
            if (priority) this._priorities[key] = priority
        }
        this._changed()
    }

    _changed(): void {
        if (this._onChange) this._onChange()
    }

    getPropertyValue(name: string): string {
        if (name == null) return ''
        const value = this._values[toCamel(String(name))]
        return value == null ? '' : value
    }

    getPropertyPriority(name: string): string {
        if (name == null) return ''
        return this._priorities[toCamel(String(name))] || ''
    }

    setProperty(name: string, value: any, priority?: string): void {
        if (name == null) return
        const key = toCamel(String(name))
        if (value == null || value === '') {
            this.removeProperty(key)
            return
        }
        this._values[key] = String(value)
        if (priority === 'important') this._priorities[key] = 'important'
        else delete this._priorities[key]
        this._changed()
    }

    removeProperty(name: string): string {
        if (name == null) return ''
        const key = toCamel(String(name))
        const old = this._values[key] || ''
        delete this._values[key]
        delete this._priorities[key]
        if (old) this._changed()
        return old
    }

    item(index: number): string {
        return Object.keys(this._values)[index] || ''
    }

    [key: string]: any
}

for (let i = 0; i < STYLE_PROPERTIES.length; i++) {
    const prop = STYLE_PROPERTIES[i]
    if (prop === 'length' || prop === 'cssText') continue
    Object.defineProperty(DomCSSStyleDeclaration.prototype, prop, {
        configurable: true,
        get(this: DomCSSStyleDeclaration): string {
            const value = this._values[prop]
            return value == null ? '' : value
        },
        set(this: DomCSSStyleDeclaration, value: any): void {
            if (value == null || value === '') this.removeProperty(prop)
            else {
                this._values[prop] = String(value)
                delete this._priorities[prop]
                this._changed()
            }
        },
    })
}

export class DomClassList {
    _onChange: (value: string) => void
    _raw: string

    constructor(initial: string, onChange: (value: string) => void) {
        this._raw = initial || ''
        this._onChange = onChange
    }

    _tokens(): string[] {
        if (!this._raw) return []
        const parts = this._raw.split(/\s+/)
        const out: string[] = []
        for (let i = 0; i < parts.length; i++) {
            if (parts[i]) out.push(parts[i])
        }
        return out
    }

    _commit(tokens: string[]): void {
        this._raw = tokens.join(' ')
        this._onChange(this._raw)
    }

    get length(): number {
        return this._tokens().length
    }

    get value(): string {
        return this._raw
    }

    set value(value: string) {
        this._raw = String(value == null ? '' : value)
        this._onChange(this._raw)
    }

    item(index: number): string | null {
        const tokens = this._tokens()
        return index >= 0 && index < tokens.length ? tokens[index] : null
    }

    contains(name: string): boolean {
        return this._tokens().indexOf(String(name)) >= 0
    }

    add(...names: string[]): void {
        const tokens = this._tokens()
        let changed = false
        for (let i = 0; i < names.length; i++) {
            const name = String(names[i])
            if (!name) continue
            const parts = name.split(/\s+/)
            for (let j = 0; j < parts.length; j++) {
                if (parts[j] && tokens.indexOf(parts[j]) < 0) {
                    tokens.push(parts[j])
                    changed = true
                }
            }
        }
        if (changed) this._commit(tokens)
    }

    remove(...names: string[]): void {
        const tokens = this._tokens()
        let changed = false
        for (let i = 0; i < names.length; i++) {
            const name = String(names[i])
            if (!name) continue
            for (let j = tokens.length - 1; j >= 0; j--) {
                if (tokens[j] === name) {
                    tokens.splice(j, 1)
                    changed = true
                }
            }
        }
        if (changed) this._commit(tokens)
    }

    toggle(name: string, force?: boolean): boolean {
        const has = this.contains(name)
        if (force === true || (!has && force === undefined)) {
            this.add(name)
            return true
        }
        if (force === false || has) {
            this.remove(name)
            return false
        }
        return false
    }

    replace(oldName: string, newName: string): boolean {
        const tokens = this._tokens()
        const index = tokens.indexOf(oldName)
        if (index < 0) return false
        tokens[index] = newName
        this._commit(tokens)
        return true
    }

    forEach(callback: (value: string, index: number) => void, thisArg?: any): void {
        const tokens = this._tokens()
        for (let i = 0; i < tokens.length; i++) callback.call(thisArg, tokens[i], i)
    }

    entries(): any[] {
        return this._tokens()
    }

    toString(): string {
        return this._raw
    }

    toJSON(): string {
        return this._raw
    }

    *[Symbol.iterator](): IterableIterator<string> {
        const tokens = this._tokens()
        for (let i = 0; i < tokens.length; i++) yield tokens[i]
    }
}
