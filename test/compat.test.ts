import { describe, expect, test, beforeAll } from 'bun:test'
import { createWindow, setCanvasBackend, setXhrBackend } from '../src'
import { createJQuery } from './fixtures/jquery-stub'

class FakeContext {
    canvas: any = null
    drawn: any[] = []
    drawImage(image: any) {
        this.drawn.push(image)
    }
    clearRect() {}
}
class FakeCanvas {
    _width: number
    _height: number
    context = new FakeContext()
    constructor(width: number, height: number) {
        this._width = width
        this._height = height
        this.context.canvas = this
    }
    get width() {
        return this._width
    }
    set width(value: number) {
        this._width = value
    }
    get height() {
        return this._height
    }
    set height(value: number) {
        this._height = value
    }
    getContext() {
        return this.context
    }
    toDataURL() {
        return `data:image/png;base64,${this._width}x${this._height}`
    }
    toBuffer() {
        return Buffer.from(`${this._width}x${this._height}`)
    }
}
class FakeImage {
    _src = ''
    width = 0
    height = 0
    complete = false
    onload: any = null
    onerror: any = null
    get src() {
        return this._src
    }
    set src(value: string) {
        this._src = String(value)
        this.width = 32
        this.height = 16
        this.complete = true
    }
}

beforeAll(() => {
    setCanvasBackend({
        createCanvas: (width, height) => new FakeCanvas(width, height) as any,
        createImage: () => new FakeImage() as any,
    })
    setXhrBackend({
        readFile(path: string) {
            if (path === '/assets/data/global-settings.json') return new TextEncoder().encode('{"ok":true}')
            return null
        },
    })
})

function makeGameWindow() {
    const win: any = createWindow({
        url: 'http://localhost:3000/',
        width: 1136,
        height: 640,
        bodyHTML: `<div id="overlay"></div><h1 id="status" class="title">Initializing CCLoader</h1><div id="ui" class="ui"></div><div id="game"><canvas id="canvas" width="568" height="320"></canvas></div>`,
    })
    ;(win as any).IG_WIDTH = 568
    ;(win as any).IG_HEIGHT = 320
    return win
}

describe('CCLoader2 / Simplify compatibility', () => {
    test('loader flow: DOMParser doc, base, overlay, status, ui', () => {
        const win = makeGameWindow()
        const document = win.document

        const entry = `<html>
            <head><title>CrossCode</title></head>
            <body>
                <div id="game"><canvas id="canvas" width="568" height="320"></canvas></div>
            </body>
        </html>`
        const doc = new win.DOMParser().parseFromString(entry, 'text/html')
        expect(doc.documentElement.localName).toBe('html')
        expect(doc.head).toBeTruthy()
        expect(doc.body).toBeTruthy()

        const base = doc.createElement('base')
        base.href = '/assets/'
        doc.head.insertBefore(base, doc.head.firstChild)
        expect(doc.head.firstElementChild.tagName).toBe('BASE')

        const link = doc.createElement('link')
        link.rel = 'stylesheet'
        link.href = '../ccloader/index.css'
        doc.head.appendChild(link)

        const overlay = doc.createElement('div')
        overlay.id = 'overlay'
        doc.body.appendChild(overlay)

        const status = doc.createElement('h1')
        status.id = 'status'
        status.className = 'title'
        status.innerText = 'Initializing CCLoader'
        doc.body.appendChild(status)

        const ui = doc.createElement('div')
        ui.id = 'ui'
        ui.className = 'ui'
        doc.body.appendChild(ui)

        expect(doc.getElementById('overlay')).toBeTruthy()
        expect(doc.getElementById('status').textContent).toBe('Initializing CCLoader')
        expect(doc.getElementById('ui')).toBeTruthy()
        expect(doc.getElementById('game').localName).toBe('div')

        // loader.continue(): document.lastChild.lastChild must be the real body.
        expect(document.lastChild.lastChild).toBe(document.body)
        expect(document.head.insertBefore).toBeTruthy()

        // _copyUI
        document.getElementById('ui').innerHTML = '<span>ui content</span>'
        doc.getElementById('ui').innerHTML = document.getElementById('ui').innerHTML
        expect(doc.getElementById('ui').innerHTML).toBe('<span>ui content</span>')

        // removeOverlay
        document.getElementById('status').style.visibility = 'hidden'
        document.getElementById('overlay').style.visibility = 'hidden'
        expect(document.getElementById('overlay').style.visibility).toBe('hidden')

        // document.write(document.documentElement.outerHTML)
        const serialized = doc.documentElement.outerHTML
        expect(serialized).toContain('<html>')
        expect(serialized).toContain('id="overlay"')
        expect(serialized).toContain('</html>')
    })

    test('global Event and modsLoaded event', () => {
        const win = makeGameWindow()
        let fired = 0
        win.document.body.addEventListener('modsLoaded', () => fired++)
        const event = win.document.createEvent('Event')
        event.initEvent('modsLoaded', true, true)
        win.document.body.dispatchEvent(event)

        const direct = new win.Event('simplifyInitialized', { bubbles: true })
        win.document.body.dispatchEvent(direct)
        expect(fired).toBe(1)
    })

    test('UI._prepareImage resizes a fresh canvas and exports data URLs', () => {
        const win = makeGameWindow()
        const document = win.document
        const img = document.createElement('img')
        img.src = 'buttons.png'
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        canvas.width = 9
        canvas.height = 24
        ctx.clearRect(0, 0, 9, 24)
        ctx.drawImage(img, 0, 65, 9, 24, 0, 0, 9, 24)
        expect(canvas.toDataURL()).toBe('data:image/png;base64,9x24')
        expect(ctx.drawn[0]).toBe(img.__nativeImage)
    })

    test('UI message divs use inline styles and removal', () => {
        const win = makeGameWindow()
        const document = win.document
        const container = document.createElement('div')
        container.id = 'ui'
        document.body.appendChild(container)

        const entry = document.createElement('div')
        entry.id = 'uimsg_1'
        entry.style.display = 'flex'
        entry.style.height = 48
        entry.style.marginTop = '5px'
        const left = document.createElement('div')
        left.style.backgroundImage = 'url("a.png")'
        left.style.width = 18
        container.appendChild(entry)
        entry.appendChild(left)

        expect(container.children.length).toBe(1)
        expect(entry.style.height).toBe('48')
        expect(entry.style.marginTop).toBe('5px')
        expect(left.style.width).toBe('18')
        container.removeChild(document.getElementById('uimsg_1'))
        expect(container.children.length).toBe(0)
    })
})

describe('CrossCode ig.dom + jQuery', () => {
    test('ig.dom helpers', () => {
        const win = makeGameWindow()
        const document = win.document
        const $: any = createJQuery(win as any)
        ;(win as any).$ = $

        const div = document.createElement('div')
        div.setAttribute('id', 'made')
        div.textContent = 'text'
        const wrapped = $(div)
        expect(wrapped[0]).toBe(div)
        expect(wrapped.text()).toBe('text')

        const parent = document.createElement('div')
        parent.appendChild(div)
        expect(parent.firstChild).toBe(div)

        const parsed = new win.DOMParser().parseFromString('<div id="html-test">x</div>', 'text/html')
        const bodyFirst = parsed.body.firstChild
        expect(bodyFirst.id).toBe('html-test')
        expect($(bodyFirst).length).toBe(1)

        let bound = 0
        div.addEventListener('click', () => bound++)
        div.dispatchEvent(new win.Event('click'))
        expect(bound).toBe(1)
    })

    test('$(window).width()/height() read documentElement client sizes', () => {
        const win = makeGameWindow()
        const $: any = createJQuery(win as any)
        expect($(win).width()).toBe(1136)
        expect($(win).height()).toBe(640)
    })

    test('element instanceof HTMLElement', () => {
        const win = makeGameWindow()
        const document = win.document
        expect(document.createElement('div') instanceof win.HTMLElement).toBe(true)
        expect(document.getElementById('game') instanceof win.HTMLElement).toBe(true)
        expect(document.getElementById('canvas') instanceof win.HTMLCanvasElement).toBe(true)
    })

    test('ig.Input.getMouseCoords math', () => {
        const win = makeGameWindow()
        const document = win.document
        const canvas = document.getElementById('canvas')
        const mouse = { x: 0, y: 0 }
        // ig.Input.getMouseCoords equivalent
        let offsetX = 0
        let offsetY = 0
        for (let node: any = canvas; node != null;) {
            offsetX += node.offsetLeft
            offsetY += node.offsetTop
            node = node.offsetParent
        }
        const event = new win.MouseEvent('mousemove', { pageX: 25, pageY: 40 })
        mouse.x = event.pageX - offsetX
        mouse.y = event.pageY - offsetY
        expect(mouse).toEqual({ x: 25, y: 40 })
    })

    test('readyState can be overridden like setDocumentLoadingState', () => {
        const win = makeGameWindow()
        const document = win.document
        expect(document.readyState).toBe('loading')
        let state = 'loading'
        Object.defineProperty(document, 'readyState', {
            configurable: true,
            get: () => state,
        })
        state = 'complete'
        expect(document.readyState).toBe('complete')
    })

    test('$.ajax reads files through XMLHttpRequest', async () => {
        const win = makeGameWindow()
        const $: any = createJQuery(win as any)
        const result = await new Promise<any>(resolve => {
            $.ajax({
                dataType: 'json',
                url: 'file:///assets/data/global-settings.json',
                success: (data: any) => resolve(data),
                error: (xhr: any) => resolve({ error: true, status: xhr.status }),
            })
        })
        expect(result).toEqual({ ok: true })
    })

    test('global variable assignment works on window (captureWindowVar)', () => {
        const win = makeGameWindow()
        const define = (name: string) => {
            Object.defineProperty(win, name, {
                set(v: any) {
                    delete win[name]
                    Object.defineProperty(win, name, { writable: true, value: v, configurable: true })
                },
                configurable: true,
            })
        }
        define('sc')
        win.sc = { value: 1 }
        expect(win.sc.value).toBe(1)
        expect(Object.getOwnPropertyDescriptor(win, 'sc')!.writable).toBe(true)
    })
})

describe('cc-vim GUI construction', () => {
    test('builds the full UI with insertAdjacentHTML', () => {
        const win = makeGameWindow()
        const document = win.document
        const id = 0

        document.body.insertAdjacentHTML(
            'beforeend',
            `
                <div id="vimContainer${id}">
                    <div id="vimHistory${id}"
                        style="
                            display: none;
                            position: absolute;
                            top: 43%;
                            left: 1%;
                            width: 9%;
                            background: rgba(0, 0, 0, 1);
                            color: white;
                            font-size: 150%;
                            display: block;
                            z-index: 99999;
                        ">
                    <table id="historyTable${id}" style="
                        border-collapse: collapse;
                        z-index: 99999;
                    "></table>
                    </div>
                    <div id="vim${id}"
                        style="
                            display: none;
                            position: absolute;
                            top: 40%;
                            left: 10%;
                            width: 89%;
                            background: rgba(0, 0, 0, 1);
                            color: white;
                            font-size: 150%;
                            display: block;
                            z-index: 99999;
                        ">
                        <input id="viminput${id}" autocomplete="off" style="
                            background: rgba(0, 0, 0, 1);
                            font-size: 150%;
                            width: 100%;
                        ">
                        <table id="suggestionTable${id}" style="
                            border-collapse: collapse;
                        "></table>
                        <table id="suggestionArgType${id}" style="
                            border-collapse: collapse;
                            left: 5%;
                        "></table>
                        <table id="suggestionArgTable${id}" style="
                            border-collapse: collapse
                            left: 5%;
                        "></table>
                    </div>
                </div>
            `
        )

        const container = document.getElementById(`vimContainer${id}`)
        const historyBlock = document.getElementById(`vimHistory${id}`)
        const block = document.getElementById(`vim${id}`)
        const input = document.getElementById(`viminput${id}`)
        const historyTable = document.getElementById(`historyTable${id}`)
        const suggestionTable = document.getElementById(`suggestionTable${id}`)
        const suggestionArgType = document.getElementById(`suggestionArgType${id}`)
        const suggestionArgTable = document.getElementById(`suggestionArgTable${id}`)

        expect(container).toBeTruthy()
        expect(historyBlock).toBeTruthy()
        expect(block).toBeTruthy()
        expect(input.value).toBe('')
        expect(input.getAttribute('autocomplete')).toBe('off')
        expect(historyTable.localName).toBe('table')
        expect(historyTable.style.borderCollapse).toBe('collapse')
        expect(block.style.zIndex).toBe('99999')
        expect(block.style.display).toBe('block')
        expect(container.querySelectorAll('table').length).toBe(4)

        // hide()
        block.style.display = 'none'
        historyBlock.style.display = 'none'
        document.getElementById('game').focus()
        expect(document.activeElement).toBe(document.getElementById('game'))

        // SuggestionTable.autocomplete
        const values = [{ display: ['help', 'Shows help'] }, { display: ['goto', 'Teleports'] }]
        function autocomplete(table: any, selected: number) {
            table.innerHTML = ''
            for (let i = 0; i < values.length; i++) {
                const tr = table.insertRow()
                for (const entry of values[i].display) {
                    const cell = tr.insertCell()
                    cell.style.paddingRight = '20px'
                    cell.style.whiteSpace = 'nowrap'
                    cell.textContent = entry
                }
                if (i === selected) tr.style.backgroundColor = 'blue'
                else tr.style.backgroundColor = ''
            }
        }
        autocomplete(suggestionTable, 0)
        expect(suggestionTable.rows.length).toBe(2)
        expect(suggestionTable.rows[0].cells[0].textContent).toBe('help')
        expect(suggestionTable.rows[0].cells[0].style.paddingRight).toBe('20px')
        expect(suggestionTable.rows[0].cells[1].style.whiteSpace).toBe('nowrap')
        expect(suggestionTable.rows[0].style.backgroundColor).toBe('blue')
        expect(suggestionTable.rows[1].style.backgroundColor).toBe('')

        // argTypeTable.innerHTML = '<br>' followed by insertRow
        suggestionArgType.innerHTML = '<br>'
        const argRow = suggestionArgType.insertRow()
        argRow.insertCell().textContent = 'arg'
        expect(suggestionArgType.rows.length).toBe(1)

        // Input events
        let keyEvents = 0
        let inputEvents = 0
        let lastValue = ''
        input.addEventListener('keydown', (event: any) => {
            keyEvents++
            if (event.key === 'Enter') event.preventDefault()
        })
        input.addEventListener('input', (event: any) => {
            inputEvents++
            lastValue = event.target.value
        })
        input.focus()
        expect(input.nativeSelectionStartForTest).toBeUndefined()
        expect(input.selectionStart).toBe(input.value.length)

        input.value = 'goto'
        input.dispatchEvent(new win.InputEvent('input', { bubbles: true }))
        const key = new win.KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true, cancelable: true })
        input.dispatchEvent(key)
        expect(inputEvents).toBe(1)
        expect(lastValue).toBe('goto')
        expect(keyEvents).toBe(1)
        expect(key.defaultPrevented).toBe(true)

        // show()
        block.style.display = 'block'
        historyBlock.style.display = 'block'
        input.value = ''
        suggestionTable.innerHTML = ''
        input.focus()
        expect(suggestionTable.rows.length).toBe(0)
        expect(document.activeElement).toBe(input)

        // destroy()
        container.remove()
        expect(document.getElementById(`vimContainer${id}`)).toBeNull()
    })

    test('history table insertRow/deleteRow', () => {
        const win = makeGameWindow()
        const document = win.document
        const table = document.createElement('table')
        document.body.appendChild(table)
        table.innerHTML = '<tr><td>old</td></tr>'
        const row = table.insertRow()
        row.insertCell().textContent = 'new'
        expect(table.rows.length).toBe(2)
        table.deleteRow(0)
        expect(table.rows.length).toBe(1)
        expect(table.rows[0].cells[0].textContent).toBe('new')
    })
})
