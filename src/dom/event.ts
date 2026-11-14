/*
 * A small DOM event implementation.
 *
 * It intentionally avoids Proxy, Map, Set and static class fields so that the
 * code stays friendly to Porffor (the AOT JavaScript compiler used for the
 * CrossNode native build).
 */

export type DomEventListener = (event: any) => void

interface ListenerEntry {
    listener: any
    capture: boolean
    once: boolean
}

function normalizeOptions(options: any): { capture: boolean; once: boolean } {
    if (options == null) return { capture: false, once: false }
    if (typeof options === 'boolean') return { capture: options, once: false }
    return { capture: !!options.capture, once: !!options.once }
}

function invokeListener(entry: ListenerEntry, target: any, event: any): void {
    const listener = entry.listener
    if (!listener) return
    if (typeof listener === 'function') {
        listener.call(target, event)
    } else if (typeof listener.handleEvent === 'function') {
        listener.handleEvent(event)
    }
}

/**
 * Assign a field on an event object.
 *
 * Our own events use plain properties, but code sometimes dispatches events
 * created by the host runtime (e.g. Node's global `Event`), where `target` and
 * `currentTarget` are readonly accessors. Defining the property directly works
 * for both shapes.
 */
function setEventField(event: any, name: string, value: any): void {
    try {
        Object.defineProperty(event, name, {
            value,
            configurable: true,
            writable: true,
            enumerable: name.charAt(0) !== '_',
        })
    } catch {
        try {
            event[name] = value
        } catch {
            // Give up; the event is not writable.
        }
    }
}

function invokeListeners(target: any, event: any, phase: number, capture: boolean): void {
    setEventField(event, 'currentTarget', target)
    setEventField(event, 'eventPhase', phase)

    const store: Record<string, ListenerEntry[]> | null = target._listeners
    const entries = store ? store[event.type] : null
    if (entries && entries.length > 0) {
        // Copy so listeners that add/remove listeners don't break iteration.
        const snapshot = entries.slice()
        for (let i = 0; i < snapshot.length; i++) {
            const entry = snapshot[i]
            if (entry.capture !== capture) continue
            if (entry.once) {
                for (let j = entries.length - 1; j >= 0; j--) {
                    if (entries[j] === entry) entries.splice(j, 1)
                }
            }
            invokeListener(entry, target, event)
            if (event.__immediateStopped) return
        }
    }

    // onfoo = fn property handlers run during the bubble/target phase.
    if (!capture) {
        const handler = target['on' + event.type]
        if (typeof handler === 'function') handler.call(target, event)
    }
}

function eventPath(target: any): any[] {
    const path: any[] = [target]
    let node: any = target
    let guard = 0
    while (node && guard++ < 10000) {
        const parent = node.parentNode
        if (parent) {
            path.push(parent)
            node = parent
            continue
        }
        if (node.defaultView && path.indexOf(node.defaultView) < 0) path.push(node.defaultView)
        break
    }
    return path
}

export class DomEventTarget {
    _listeners: Record<string, ListenerEntry[]> | null = null

    addEventListener(type: string, listener: any, options?: any): void {
        if (type == null || listener == null) return
        type = String(type)
        const normalized = normalizeOptions(options)
        if (!this._listeners) this._listeners = {}
        let entries = this._listeners[type]
        if (!entries) {
            entries = []
            this._listeners[type] = entries
        }
        for (let i = 0; i < entries.length; i++) {
            if (entries[i].listener === listener && entries[i].capture === normalized.capture) return
        }
        entries.push({ listener, capture: normalized.capture, once: normalized.once })
    }

    removeEventListener(type: string, listener: any, options?: any): void {
        if (type == null || listener == null || !this._listeners) return
        type = String(type)
        const normalized = normalizeOptions(options)
        const entries = this._listeners[type]
        if (!entries) return
        for (let i = entries.length - 1; i >= 0; i--) {
            if (entries[i].listener === listener && entries[i].capture === normalized.capture) entries.splice(i, 1)
        }
    }

    hasEventListener(type: string): boolean {
        if (!this._listeners) return false
        const entries = this._listeners[String(type)]
        return !!entries && entries.length > 0
    }

    dispatchEvent(event: any): boolean {
        if (!event || typeof event.type !== 'string') return true
        if (event.__dispatching) return true

        const target = this
        setEventField(event, '__dispatching', true)
        setEventField(event, 'target', target)
        setEventField(event, 'currentTarget', target)
        setEventField(event, 'eventPhase', 0)
        setEventField(event, '__immediateStopped', false)
        setEventField(event, '__stopped', false)

        const path = eventPath(target)

        // Capture phase: window/document -> parent -> target's parent.
        for (let i = path.length - 1; i >= 1; i--) {
            invokeListeners(path[i], event, 1, true)
            if (event.__stopped || event.__immediateStopped) break
        }

        // Target phase.
        if (!event.__stopped) {
            invokeListeners(target, event, 2, false)
            if (!event.__immediateStopped) invokeListeners(target, event, 2, true)
        }

        // Bubble phase.
        if (event.bubbles && !event.__stopped && !event.__immediateStopped) {
            for (let i = 1; i < path.length; i++) {
                invokeListeners(path[i], event, 3, false)
                if (event.__stopped || event.__immediateStopped) break
            }
        }

        setEventField(event, '__dispatching', false)
        setEventField(event, 'currentTarget', null)
        setEventField(event, 'eventPhase', 0)
        return !event.defaultPrevented
    }
}

export class DomEvent {
    type: string = ''
    bubbles: boolean = false
    cancelable: boolean = false
    composed: boolean = false
    target: any = null
    currentTarget: any = null
    eventPhase: number = 0
    defaultPrevented: boolean = false
    isTrusted: boolean = false
    timeStamp: number = Date.now()
    srcElement: any = null
    returnValue: boolean = true
    cancelBubble: boolean = false

    __stopped: boolean = false
    __immediateStopped: boolean = false
    __dispatching: boolean = false
    __path: any[] = []

    constructor(type: string, init?: any) {
        this.type = String(type == null ? '' : type)
        if (init) {
            if (init.bubbles != null) this.bubbles = !!init.bubbles
            if (init.cancelable != null) this.cancelable = !!init.cancelable
            if (init.composed != null) this.composed = !!init.composed
        }
    }

    preventDefault(): void {
        if (this.cancelable) {
            this.defaultPrevented = true
            this.returnValue = false
        }
    }

    stopPropagation(): void {
        this.__stopped = true
        this.cancelBubble = true
    }

    stopImmediatePropagation(): void {
        this.__stopped = true
        this.__immediateStopped = true
        this.cancelBubble = true
    }

    composedPath(): any[] {
        return this.__path ? this.__path.slice() : []
    }

    initEvent(type: string, bubbles?: boolean, cancelable?: boolean): void {
        this.type = String(type)
        this.bubbles = !!bubbles
        this.cancelable = !!cancelable
        this.defaultPrevented = false
        this.__stopped = false
        this.__immediateStopped = false
        this.cancelBubble = false
        this.returnValue = true
    }

    get NONE(): number {
        return 0
    }
    get CAPTURING_PHASE(): number {
        return 1
    }
    get AT_TARGET(): number {
        return 2
    }
    get BUBBLING_PHASE(): number {
        return 3
    }
}

export class DomUIEvent extends DomEvent {
    detail: number = 0
    view: any = null
    which: number = 0

    constructor(type: string, init?: any) {
        super(type, init)
        if (init) {
            if (init.detail != null) this.detail = init.detail
            if (init.view != null) this.view = init.view
        }
    }
}

export class DomKeyboardEvent extends DomEvent {
    key: string = ''
    code: string = ''
    keyCode: number = 0
    charCode: number = 0
    which: number = 0
    altKey: boolean = false
    ctrlKey: boolean = false
    shiftKey: boolean = false
    metaKey: boolean = false
    repeat: boolean = false
    location: number = 0
    isComposing: boolean = false
    detail: number = 0

    constructor(type: string, init?: any) {
        super(type, init)
        if (init) {
            if (init.key != null) this.key = String(init.key)
            if (init.code != null) this.code = String(init.code)
            if (init.keyCode != null) this.keyCode = init.keyCode
            if (init.charCode != null) this.charCode = init.charCode
            if (init.which != null) this.which = init.which
            if (init.altKey != null) this.altKey = !!init.altKey
            if (init.ctrlKey != null) this.ctrlKey = !!init.ctrlKey
            if (init.shiftKey != null) this.shiftKey = !!init.shiftKey
            if (init.metaKey != null) this.metaKey = !!init.metaKey
            if (init.repeat != null) this.repeat = !!init.repeat
            if (init.location != null) this.location = init.location
            if (init.isComposing != null) this.isComposing = !!init.isComposing
            if (init.detail != null) this.detail = init.detail
        }
        if (!this.which) this.which = this.keyCode
    }

    getModifierState(_key: string): boolean {
        return false
    }
}

export class DomMouseEvent extends DomEvent {
    clientX: number = 0
    clientY: number = 0
    screenX: number = 0
    screenY: number = 0
    pageX: number = 0
    pageY: number = 0
    offsetX: number = 0
    offsetY: number = 0
    movementX: number = 0
    movementY: number = 0
    button: number = 0
    buttons: number = 0
    which: number = 0
    detail: number = 0
    relatedTarget: any = null
    altKey: boolean = false
    ctrlKey: boolean = false
    shiftKey: boolean = false
    metaKey: boolean = false

    constructor(type: string, init?: any) {
        super(type, init)
        if (init) {
            if (init.clientX != null) this.clientX = init.clientX
            if (init.clientY != null) this.clientY = init.clientY
            if (init.screenX != null) this.screenX = init.screenX
            if (init.screenY != null) this.screenY = init.screenY
            if (init.pageX != null) this.pageX = init.pageX
            else this.pageX = this.clientX
            if (init.pageY != null) this.pageY = init.pageY
            else this.pageY = this.clientY
            if (init.offsetX != null) this.offsetX = init.offsetX
            if (init.offsetY != null) this.offsetY = init.offsetY
            if (init.movementX != null) this.movementX = init.movementX
            if (init.movementY != null) this.movementY = init.movementY
            if (init.button != null) this.button = init.button
            if (init.buttons != null) this.buttons = init.buttons
            if (init.which != null) this.which = init.which
            if (init.detail != null) this.detail = init.detail
            if (init.relatedTarget != null) this.relatedTarget = init.relatedTarget
            if (init.altKey != null) this.altKey = !!init.altKey
            if (init.ctrlKey != null) this.ctrlKey = !!init.ctrlKey
            if (init.shiftKey != null) this.shiftKey = !!init.shiftKey
            if (init.metaKey != null) this.metaKey = !!init.metaKey
        }
        if (!this.which) this.which = this.button + 1
    }

    getModifierState(_key: string): boolean {
        return false
    }
}

export class DomWheelEvent extends DomMouseEvent {
    deltaX: number = 0
    deltaY: number = 0
    deltaZ: number = 0
    deltaMode: number = 0
    wheelDelta: number = 0

    constructor(type: string, init?: any) {
        super(type, init)
        if (init) {
            if (init.deltaX != null) this.deltaX = init.deltaX
            if (init.deltaY != null) this.deltaY = init.deltaY
            if (init.deltaZ != null) this.deltaZ = init.deltaZ
            if (init.deltaMode != null) this.deltaMode = init.deltaMode
            if (init.wheelDelta != null) this.wheelDelta = init.wheelDelta
            else this.wheelDelta = -this.deltaY * 3
        }
    }
}

export class DomProgressEvent extends DomEvent {
    lengthComputable: boolean = false
    loaded: number = 0
    total: number = 0

    constructor(type: string, init?: any) {
        super(type, init)
        if (init) {
            if (init.lengthComputable != null) this.lengthComputable = !!init.lengthComputable
            if (init.loaded != null) this.loaded = init.loaded
            if (init.total != null) this.total = init.total
        }
    }
}

export class DomCustomEvent extends DomEvent {
    detail: any = null

    constructor(type: string, init?: any) {
        super(type, init)
        if (init && init.detail !== undefined) this.detail = init.detail
    }

    initCustomEvent(type: string, bubbles?: boolean, cancelable?: boolean, detail?: any): void {
        this.initEvent(type, bubbles, cancelable)
        this.detail = detail
    }
}

export class DomFocusEvent extends DomUIEvent {
    relatedTarget: any = null

    constructor(type: string, init?: any) {
        super(type, init)
        if (init && init.relatedTarget != null) this.relatedTarget = init.relatedTarget
    }
}

export class DomInputEvent extends DomUIEvent {
    data: string | null = null
    inputType: string = ''
    isComposing: boolean = false

    constructor(type: string, init?: any) {
        super(type, init)
        if (init) {
            if (init.data !== undefined) this.data = init.data
            if (init.inputType != null) this.inputType = String(init.inputType)
            if (init.isComposing != null) this.isComposing = !!init.isComposing
        }
    }
}

export class DomErrorEvent extends DomEvent {
    message: string = ''
    filename: string = ''
    lineno: number = 0
    colno: number = 0
    error: any = null

    constructor(type: string, init?: any) {
        super(type, init)
        if (init) {
            if (init.message != null) this.message = String(init.message)
            if (init.filename != null) this.filename = String(init.filename)
            if (init.lineno != null) this.lineno = init.lineno
            if (init.colno != null) this.colno = init.colno
            if (init.error !== undefined) this.error = init.error
        }
    }
}

export class DomMessageEvent extends DomEvent {
    data: any = null
    origin: string = ''
    lastEventId: string = ''
    source: any = null
    ports: any[] = []

    constructor(type: string, init?: any) {
        super(type, init)
        if (init) {
            if (init.data !== undefined) this.data = init.data
            if (init.origin != null) this.origin = String(init.origin)
            if (init.lastEventId != null) this.lastEventId = String(init.lastEventId)
            if (init.source != null) this.source = init.source
        }
    }
}

export class DomTouchEvent extends DomUIEvent {
    touches: any[] = []
    targetTouches: any[] = []
    changedTouches: any[] = []
    altKey: boolean = false
    ctrlKey: boolean = false
    shiftKey: boolean = false
    metaKey: boolean = false

    constructor(type: string, init?: any) {
        super(type, init)
        if (init) {
            if (init.touches) this.touches = init.touches.slice()
            if (init.targetTouches) this.targetTouches = init.targetTouches.slice()
            if (init.changedTouches) this.changedTouches = init.changedTouches.slice()
            if (init.altKey != null) this.altKey = !!init.altKey
            if (init.ctrlKey != null) this.ctrlKey = !!init.ctrlKey
            if (init.shiftKey != null) this.shiftKey = !!init.shiftKey
            if (init.metaKey != null) this.metaKey = !!init.metaKey
        }
    }
}

export interface DomEventConstructors {
    Event: typeof DomEvent
    UIEvent: typeof DomUIEvent
    KeyboardEvent: typeof DomKeyboardEvent
    MouseEvent: typeof DomMouseEvent
    PointerEvent: typeof DomMouseEvent
    WheelEvent: typeof DomWheelEvent
    ProgressEvent: typeof DomProgressEvent
    CustomEvent: typeof DomCustomEvent
    FocusEvent: typeof DomFocusEvent
    InputEvent: typeof DomInputEvent
    ErrorEvent: typeof DomErrorEvent
    MessageEvent: typeof DomMessageEvent
    TouchEvent: typeof DomTouchEvent
}

export const domEventConstructors: DomEventConstructors = {
    Event: DomEvent,
    UIEvent: DomUIEvent,
    KeyboardEvent: DomKeyboardEvent,
    MouseEvent: DomMouseEvent,
    PointerEvent: DomMouseEvent,
    WheelEvent: DomWheelEvent,
    ProgressEvent: DomProgressEvent,
    CustomEvent: DomCustomEvent,
    FocusEvent: DomFocusEvent,
    InputEvent: DomInputEvent,
    ErrorEvent: DomErrorEvent,
    MessageEvent: DomMessageEvent,
    TouchEvent: DomTouchEvent,
}

export function createEvent(name: string, init?: any): DomEvent {
    const lower = String(name).toLowerCase()
    switch (lower) {
        case 'keyboardevent':
        case 'keyboardevents':
            return new DomKeyboardEvent('', init)
        case 'mouseevent':
        case 'mouseevents':
            return new DomMouseEvent('', init)
        case 'wheelevent':
            return new DomWheelEvent('', init)
        case 'uievent':
        case 'uievents':
            return new DomUIEvent('', init)
        case 'customevent':
            return new DomCustomEvent('', init)
        case 'progressevent':
            return new DomProgressEvent('', init)
        case 'focusevent':
            return new DomFocusEvent('', init)
        case 'inputevent':
            return new DomInputEvent('', init)
        case 'errorevent':
        case 'errorevents':
            return new DomErrorEvent('', init)
        case 'messageevent':
            return new DomMessageEvent('', init)
        case 'touchevent':
            return new DomTouchEvent('', init)
        default:
            // "Event", "Events", "HTMLEvents", "SVGEvents", ...
            return new DomEvent('', init)
    }
}

export function isEventTarget(value: any): boolean {
    return !!value && typeof value.addEventListener === 'function' && typeof value.dispatchEvent === 'function'
}
