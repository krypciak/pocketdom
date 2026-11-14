import { describe, expect, test } from 'bun:test'
import { createWindow, DOM_GLOBALS, installWindowGlobals, DomEvent, DomCSSStyleDeclaration, DomClassList } from '../src'

function makeWindow(bodyHTML?: string) {
    return createWindow({ bodyHTML, width: 1136, height: 640 }) as any
}

describe('document structure', () => {
    test('creates html/head/body and exposes body via lastChild.lastChild', () => {
        const win = makeWindow()
        const doc = win.document
        expect(doc.documentElement.localName).toBe('html')
        expect(doc.head).toBeTruthy()
        expect(doc.body).toBeTruthy()
        expect(doc.head.parentNode).toBe(doc.documentElement)
        expect(doc.lastChild).toBe(doc.documentElement)
        expect(doc.lastChild.lastChild).toBe(doc.body)
    })

    test('parses body HTML and finds elements', () => {
        const win = makeWindow('<div id="game"><canvas id="canvas" width="568" height="320"></canvas></div>')
        const doc = win.document
        expect(doc.getElementById('game')).toBeTruthy()
        expect(doc.getElementById('canvas').tagName).toBe('CANVAS')
        expect(doc.getElementsByTagName('canvas').length).toBe(1)
        expect(doc.querySelector('#game > canvas').id).toBe('canvas')
        expect(doc.querySelectorAll('div canvas').length).toBe(1)
    })

    test('title accessor', () => {
        const win = makeWindow()
        expect(win.document.title).toBe('')
        win.document.title = 'CrossCode'
        expect(win.document.title).toBe('CrossCode')
        expect(win.document.head.textContent).toBe('CrossCode')
    })
})

describe('elements', () => {
    test('attributes, classList and style', () => {
        const win = makeWindow()
        const doc = win.document
        const div = doc.createElement('div')
        div.setAttribute('data-foo', 'bar')
        expect(div.getAttribute('data-foo')).toBe('bar')
        expect(div.hasAttribute('data-foo')).toBe(true)
        div.removeAttribute('data-foo')
        expect(div.hasAttribute('data-foo')).toBe(false)

        div.className = 'one two'
        expect(div.classList.contains('two')).toBe(true)
        div.classList.add('three')
        div.classList.remove('one')
        div.classList.toggle('two')
        expect(div.className).toBe('three')

        div.style.backgroundColor = 'red'
        div.style.setProperty('font-size', '12px')
        expect(div.style.getPropertyValue('background-color')).toBe('red')
        expect(div.style.fontSize).toBe('12px')
        expect(div.getAttribute('style')).toContain('background-color: red')
        expect(div.style.cssText).toContain('font-size: 12px')

        div.setAttribute('style', 'display: none; width: 10px')
        expect(div.style.display).toBe('none')
        expect(div.style.width).toBe('10px')
    })

    test('innerHTML / outerHTML roundtrip', () => {
        const win = makeWindow()
        const doc = win.document
        const div = doc.createElement('div')
        div.innerHTML = '<p class="a">hello <b>world</b></p><!-- comment -->'
        expect(div.childNodes.length).toBe(2)
        expect(div.querySelector('p.a').textContent).toBe('hello world')
        expect(div.innerHTML).toBe('<p class="a">hello <b>world</b></p><!-- comment -->')
        div.querySelector('b').outerHTML = '<i>there</i>'
        expect(div.innerHTML).toBe('<p class="a">hello <i>there</i></p><!-- comment -->')
    })

    test('entities, raw text and void elements', () => {
        const win = makeWindow()
        const doc = win.document
        const div = doc.createElement('div')
        div.innerHTML = '<span>&amp; &lt; &#65; &nbsp;</span><br><script>if (a < b) {}</script>'
        expect(div.querySelector('span').textContent).toBe('& < A \u00a0')
        expect(div.querySelectorAll('br').length).toBe(1)
        expect(div.querySelector('script').textContent).toBe('if (a < b) {}')
    })

    test('insertAdjacentHTML positions', () => {
        const win = makeWindow('<div id="root"><span id="mid">m</span></div>')
        const doc = win.document
        const root = doc.getElementById('root')
        const mid = doc.getElementById('mid')
        root.insertAdjacentHTML('afterbegin', '<i id="first">f</i>')
        root.insertAdjacentHTML('beforeend', '<i id="last">l</i>')
        mid.insertAdjacentHTML('beforebegin', '<i id="before">b</i>')
        mid.insertAdjacentHTML('afterend', '<i id="after">a</i>')
        expect(root.querySelector('#first').nextElementSibling.id).toBe('before')
        expect(root.lastElementChild.id).toBe('last')
    })

    test('insertRow/insertCell/deleteRow', () => {
        const win = makeWindow()
        const doc = win.document
        const table = doc.createElement('table')
        const row = table.insertRow()
        row.insertCell().textContent = 'a'
        row.insertCell().textContent = 'b'
        expect(table.rows.length).toBe(1)
        expect(row.cells.length).toBe(2)
        expect(row.cells[1].textContent).toBe('b')
        expect(row.rowIndex).toBe(0)
        expect(row.cells[0].cellIndex).toBe(0)
        table.deleteRow(0)
        expect(table.rows.length).toBe(0)

        const tbody = table.createTBody()
        const row2 = tbody.insertRow()
        expect(tbody.rows.length).toBe(1)
        expect(table.rows.length).toBe(1)
        expect(row2.rowIndex).toBe(0)
    })

    test('table parsing creates tbody for bare rows', () => {
        const win = makeWindow()
        const doc = win.document
        const table = doc.createElement('table')
        table.innerHTML = '<tr><td>one</td></tr>'
        expect(table.tBodies.length).toBe(1)
        expect(table.rows.length).toBe(1)
        expect(table.rows[0].cells[0].textContent).toBe('one')
    })

    test('template content is live', () => {
        const win = makeWindow()
        const doc = win.document
        const template = doc.createElement('template')
        template.innerHTML = '<span>a</span><span>b</span>'
        expect(template.content.childNodes.length).toBe(2)
        expect(template.content.childNodes[0].textContent).toBe('a')
    })

    test('input and textarea basic API', () => {
        const win = makeWindow()
        const doc = win.document
        const input = doc.createElement('input')
        input.value = 'hello'
        expect(input.value).toBe('hello')
        input.setSelectionRange(1, 3)
        expect(input.selectionStart).toBe(1)
        expect(input.selectionEnd).toBe(3)
        input.select()
        expect(input.selectionStart).toBe(0)
        expect(input.selectionEnd).toBe(5)

        const textarea = doc.createElement('textarea')
        textarea.value = 'abc'
        expect(textarea.textContent).toBe('abc')
        expect(textarea.value).toBe('abc')
    })
})

describe('events', () => {
    test('bubbles, capture and stopPropagation', () => {
        const win = makeWindow('<div id="outer"><div id="inner"></div></div>')
        const doc = win.document
        const outer = doc.getElementById('outer')
        const inner = doc.getElementById('inner')
        const order: string[] = []
        outer.addEventListener('click', () => order.push('outer-bubble'))
        outer.addEventListener('click', () => order.push('outer-capture'), true)
        inner.addEventListener('click', () => order.push('inner'))
        doc.addEventListener('click', () => order.push('document-bubble'))
        doc.addEventListener('click', () => order.push('document-capture'), true)
        win.addEventListener('click', () => order.push('window-bubble'))
        inner.dispatchEvent(new win.Event('click', { bubbles: true }))
        expect(order).toEqual(['document-capture', 'outer-capture', 'inner', 'outer-bubble', 'document-bubble', 'window-bubble'])
    })

    test('onfoo handlers and once', () => {
        const win = makeWindow('<div id="a"></div>')
        const doc = win.document
        const el = doc.getElementById('a')
        let property = 0
        let once = 0
        el.onclick = () => property++
        el.addEventListener('click', () => once++, { once: true })
        el.dispatchEvent(new win.Event('click', { bubbles: true }))
        el.dispatchEvent(new win.Event('click', { bubbles: true }))
        expect(property).toBe(2)
        expect(once).toBe(1)
    })

    test('preventDefault and cancelable', () => {
        const win = makeWindow('<div id="a"></div>')
        const el = win.document.getElementById('a')
        el.addEventListener('click', (event: any) => event.preventDefault())
        const event = new win.Event('click', { bubbles: true, cancelable: true })
        expect(el.dispatchEvent(event)).toBe(false)
        expect(event.defaultPrevented).toBe(true)
    })

    test('keyboard event keeps keyCode and target', () => {
        const win = makeWindow()
        let received: any = null
        win.addEventListener('keydown', (event: any) => (received = event))
        const event = new win.KeyboardEvent('keydown', { keyCode: 40, key: 'ArrowDown', bubbles: true, cancelable: true })
        win.dispatchEvent(event)
        expect(received.keyCode).toBe(40)
        expect(received.key).toBe('ArrowDown')
        expect(received.target).toBe(win)
    })

    test('createEvent().initEvent()', () => {
        const win = makeWindow()
        const doc = win.document
        const event = doc.createEvent('Event')
        event.initEvent('modsLoaded', true, true)
        expect(event.type).toBe('modsLoaded')
        expect(event.bubbles).toBe(true)
        expect(event.cancelable).toBe(true)

        let fired = 0
        doc.body.addEventListener('modsLoaded', () => fired++)
        doc.body.dispatchEvent(event)
        expect(fired).toBe(1)
    })

    test('focus updates activeElement', () => {
        const win = makeWindow('<input id="i">')
        const doc = win.document
        const input = doc.getElementById('i')
        let focused = 0
        input.addEventListener('focus', () => focused++)
        input.focus()
        expect(doc.activeElement).toBe(input)
        expect(focused).toBe(1)
        input.blur()
        expect(doc.activeElement).not.toBe(input)
    })
})

describe('style and class helpers', () => {
    test('classList token operations', () => {
        let value = 'a b'
        const list = new DomClassList(value, next => (value = next))
        list.add('c')
        expect(value).toBe('a b c')
        list.remove('b')
        expect(value).toBe('a c')
        expect(list.toggle('a')).toBe(false)
        expect(value).toBe('c')
        expect(list.replace('c', 'd')).toBe(true)
        expect(value).toBe('d')
        expect([...list]).toEqual(['d'])
    })

    test('cssText formatting', () => {
        const style = new DomCSSStyleDeclaration()
        style.cssText = 'display:block; color: red !important'
        expect(style.display).toBe('block')
        expect(style.getPropertyPriority('color')).toBe('important')
        expect(style.cssText).toContain('display: block')
        style.removeProperty('display')
        expect(style.display).toBe('')
    })
})

describe('selectors', () => {
    test('common selector forms', () => {
        const win = makeWindow(`
            <ul id="list">
                <li class="item first">a</li>
                <li class="item">b</li>
                <li class="item last"><span data-x="1">c</span></li>
            </ul>
        `)
        const doc = win.document
        expect(doc.querySelectorAll('li').length).toBe(3)
        expect(doc.querySelectorAll('li.item.first').length).toBe(1)
        expect(doc.querySelectorAll('li:first-child').length).toBe(1)
        expect(doc.querySelectorAll('li:last-child').length).toBe(1)
        expect(doc.querySelectorAll('li:nth-child(2)').length).toBe(1)
        expect(doc.querySelectorAll('li:not(.first)').length).toBe(2)
        expect(doc.querySelectorAll('[data-x]').length).toBe(1)
        expect(doc.querySelectorAll('[data-x="1"]').length).toBe(1)
        expect(doc.querySelectorAll('#list > li').length).toBe(3)
        expect(doc.querySelectorAll('li + li').length).toBe(2)
        expect(doc.querySelectorAll('li ~ li').length).toBe(2)
        expect(doc.querySelectorAll('ul li span').length).toBe(1)
        expect(doc.querySelector('li:has(span)').className).toContain('last')
        expect(doc.querySelectorAll('li, span').length).toBe(4)
        expect(doc.querySelector('#list').matches('ul#list')).toBe(true)
        expect(doc.querySelector('span').closest('li').className).toContain('last')
    })
})

describe('host event interop', () => {
    test('dispatching a native Event object works', () => {
        const win = makeWindow('<div id="a"></div>')
        const el = win.document.getElementById('a')
        let received: any = null
        el.addEventListener('click', (event: any) => (received = event))
        const native = new Event('click', { bubbles: true, cancelable: true })
        expect(() => el.dispatchEvent(native)).not.toThrow()
        expect(received).toBe(native)
        expect(received.target).toBe(el)
        expect(received.currentTarget).toBeNull()
    })

    test('styleSheets exists', () => {
        const win = makeWindow()
        expect(Array.isArray(win.document.styleSheets)).toBe(true)
        expect([...win.document.styleSheets]).toEqual([])
    })
})

describe('class constants', () => {
    test('Node exposes node type constants', () => {
        const win: any = makeWindow()
        expect(win.Node.ELEMENT_NODE).toBe(1)
        expect(win.Node.TEXT_NODE).toBe(3)
        expect(win.Node.COMMENT_NODE).toBe(8)
        expect(win.Node.DOCUMENT_NODE).toBe(9)
        expect(win.Node.DOCUMENT_FRAGMENT_NODE).toBe(11)
        expect(win.Node.DOCUMENT_POSITION_CONTAINED_BY).toBe(16)
        const el = win.document.createElement('div')
        expect(el.nodeType).toBe(win.Node.ELEMENT_NODE)
    })

    test('XMLHttpRequest exposes ready state constants', () => {
        const win: any = makeWindow()
        expect(win.XMLHttpRequest.UNSENT).toBe(0)
        expect(win.XMLHttpRequest.OPENED).toBe(1)
        expect(win.XMLHttpRequest.HEADERS_RECEIVED).toBe(2)
        expect(win.XMLHttpRequest.LOADING).toBe(3)
        expect(win.XMLHttpRequest.DONE).toBe(4)
        expect(new win.XMLHttpRequest().readyState).toBe(win.XMLHttpRequest.UNSENT)
    })
})

describe('CharacterData', () => {
    test('substringData clamps like the spec', () => {
        const win: any = makeWindow()
        const text = win.document.createTextNode('abcdef')
        expect(text.substringData(1, 3)).toBe('bcd')
        expect(text.substringData(4, 100)).toBe('ef')
        expect(text.substringData(2, 0)).toBe('')
    })
})

describe('global installation', () => {
    test('installWindowGlobals mirrors the window onto a target', () => {
        const win = makeWindow()
        const target: any = {}
        installWindowGlobals(win, target)

        expect(target.window).toBe(win)
        expect(target.document).toBe(win.document)
        expect(target.location).toBe(win.location)
        expect(target.HTMLElement).toBe(win.HTMLElement)
        expect(target.HTMLCanvasElement).toBe(win.HTMLCanvasElement)
        expect(target.XMLHttpRequest).toBe(win.XMLHttpRequest)
        expect(target.Image).toBe(win.Image)
    })

    test('every listed global exists on the window', () => {
        const win = makeWindow()
        for (const name of DOM_GLOBALS) expect((win as any)[name]).toBeDefined()
    })

    test('installing twice is harmless', () => {
        const win = makeWindow()
        const target: any = {}
        installWindowGlobals(win, target)
        installWindowGlobals(win, target)
        expect(target.document).toBe(win.document)
    })
})
