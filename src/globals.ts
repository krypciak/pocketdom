import type { DomWindow } from './dom/window'

/*
 * Making a DomWindow the process wide browser environment.
 *
 * Headless code (games, jQuery era libraries) usually reaches for bare globals
 * like `document`, `HTMLElement` or `XMLHttpRequest` instead of `window.*`, so
 * the constructors have to be mirrored onto the host's global object.
 */

/** Constructors and objects that are normally available as bare globals. */
export const DOM_GLOBALS = [
    // Events
    'Event',
    'UIEvent',
    'KeyboardEvent',
    'MouseEvent',
    'PointerEvent',
    'WheelEvent',
    'ProgressEvent',
    'CustomEvent',
    'FocusEvent',
    'InputEvent',
    'ErrorEvent',
    'MessageEvent',
    'TouchEvent',
    // Nodes
    'Node',
    'Element',
    'HTMLElement',
    'HTMLCanvasElement',
    'HTMLImageElement',
    'HTMLInputElement',
    'HTMLTextAreaElement',
    'HTMLSelectElement',
    'HTMLOptionElement',
    'HTMLTableElement',
    'HTMLTableRowElement',
    'HTMLTableCellElement',
    'HTMLTableSectionElement',
    'HTMLMediaElement',
    'HTMLVideoElement',
    'HTMLAudioElement',
    'HTMLScriptElement',
    'HTMLTemplateElement',
    'HTMLAnchorElement',
    'HTMLStyleElement',
    'HTMLLinkElement',
    'HTMLFormElement',
    'HTMLButtonElement',
    'Document',
    'DocumentFragment',
    'Text',
    'Comment',
    // Misc
    'DOMParser',
    'XMLHttpRequest',
    'FileReader',
    'Image',
] as const

/**
 * Exposes `win` as the global browser environment: assigns `window`, `document`
 * and `location`, then every DOM constructor listed in {@link DOM_GLOBALS}.
 */
export function installWindowGlobals(win: DomWindow, target: any = globalThis): void {
    target.window = win
    target.document = win.document
    target.location = win.location

    for (let i = 0; i < DOM_GLOBALS.length; i++) {
        const name = DOM_GLOBALS[i]
        target[name] = (win as any)[name]
    }
}
