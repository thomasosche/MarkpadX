// Frontend regression test with real Edge/Monaco and isolated mock Tauri I/O.
// Start Vite on 127.0.0.1:4175 first. No native app/session or real documents are used.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const browser = process.env.MARKPAD_TEST_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'markpad-navigation-'));
const port = 9340;
const child = spawn(browser, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
	`--user-data-dir=${profile}`, `--remote-debugging-port=${port}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws;
try {
	let target;
	for (let i = 0; i < 60 && !target; i++) {
		await sleep(200);
		try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(t => t.type === 'page'); } catch {}
	}
	assert.ok(target, 'isolated Edge debugger');
	ws = new WebSocket(target.webSocketDebuggerUrl);
	await new Promise(r => ws.addEventListener('open', r));
	let next = 0;
	const pending = new Map();
	ws.addEventListener('message', e => {
		const response = JSON.parse(e.data);
		if (response.method === 'Runtime.exceptionThrown') console.error(response.params.exceptionDetails.exception?.description);
		if (response.method === 'Runtime.consoleAPICalled' && response.params.type === 'error') console.error(response.params.args.map(a => a.value ?? a.description).join(' '));
		if (response.id) { pending.get(response.id)?.(response); pending.delete(response.id); }
	});
	const send = (method, params = {}) => new Promise(resolve => {
		const id = ++next; pending.set(id, resolve); ws.send(JSON.stringify({ id, method, params }));
	});
	const evaluate = async expression => {
		const response = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
		if (response.result?.exceptionDetails) throw Error(response.result.exceptionDetails.exception?.description || 'browser evaluation failed');
		return response.result?.result?.value;
	};
	const wait = async expression => {
		for (let i = 0; i < 150; i++) { if (await evaluate(expression)) return; await sleep(200); }
		console.error(await evaluate('({body:document.body.innerText.slice(0,2000), commands:window.fixture?.commands})'));
		throw Error('Timed out: ' + expression);
	};
	const key = async (key, code, windowsVirtualKeyCode, modifiers = 2) => {
		await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key, code, windowsVirtualKeyCode, modifiers });
		await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode, modifiers });
	};
	const source = '<h1>Navigation fixture</h1>\n<table>\n' + Array.from({ length: 180 }, (_, i) =>
		`<tr><td data-row="${i}">${i === 10 || i === 140 ? 'Product&nbsp;<strong>meets</strong> validation' : `Requirement ${i}`}</td><td>Evidence ${i}</td></tr>`).join('\n') + '\n</table>\n\n`<td>example &amp;</td>`\n\n```html\n<td>fenced &amp;</td>\n```\n';
	const bootstrap = `
		window.fixture = { source: ${JSON.stringify(source)}, saves: 0, clipboardReads: 0, commands: [] };
		// Fixed renderer fixtures model comrak's escaped code output; native rendering stays outside this browser test.
		fixture.render = text => text.replace(${JSON.stringify('`<td>example &amp;</td>`')}, '<p><code>&lt;td&gt;example &amp;amp;&lt;/td&gt;</code></p>')
			.replace(${JSON.stringify('```html\n<td>fenced &amp;</td>\n```')}, '<pre><code>&lt;td&gt;fenced &amp;amp;&lt;/td&gt;</code></pre>');
		const callbacks = new Map(); let id = 0;
		window.__TAURI_INTERNALS__ = {
			metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main' } },
			transformCallback(fn) { callbacks.set(++id, fn); return id; },
			unregisterCallback(id) { callbacks.delete(id); },
			convertFileSrc(path) { return path; },
			async invoke(cmd, args = {}) {
				fixture.commands.push(cmd);
				if (cmd === 'get_app_mode') return 'app';
				if (cmd === 'get_os_type') return 'windows';
				if (cmd === 'send_markdown_path') return ['C:/fixture/navigation.md'];
				if (cmd === 'read_file_content') return fixture.source;
				if (cmd === 'open_markdown_preview') return [fixture.source, fixture.render(fixture.source), true];
				if (cmd === 'open_markdown') return fixture.source;
				if (cmd === 'render_markdown') return fixture.render(args.content);
				if (cmd === 'save_file_content') { fixture.source = args.content; fixture.saves++; return; }
				if (cmd === 'clipboard_read_text') { fixture.clipboardReads++; return 'Product meets validation'; }
				if (cmd === 'clipboard_read_image') return null;
				if (cmd === 'plugin:event|listen') return ++id;
				if (/is_maximized|is_fullscreen|is_win11/.test(cmd)) return false;
				if (/themes|fonts|list_|get_recent/.test(cmd)) return [];
				return null;
			}
		};
		window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} };
	`;
	await send('Page.enable');
	const injected = await send('Page.addScriptToEvaluateOnNewDocument', { source: bootstrap });
	assert.ok(injected.result?.identifier, JSON.stringify(injected));
	await send('Runtime.enable');
	await send('Page.navigate', { url: 'http://127.0.0.1:4175/' });
	await wait("!!document.querySelector('article.markdown-body td[data-row=\"140\"]')");
	const zoom = Number(process.env.MARKPAD_TEST_ZOOM || 100);
	const position = Number(process.env.MARKPAD_TEST_POSITION || 0.5);
	for (let z = 100; z < zoom; z += 10) await key('=', 'Equal', 187);
	await sleep(400);
	await evaluate(`(() => {
		const cell = document.querySelector('article.markdown-body td[data-row="140"]');
		cell.scrollIntoView({ block: 'center' });
		const range = document.createRange(); range.selectNodeContents(cell);
		getSelection().removeAllRanges(); getSelection().addRange(range);
	})()`);
	await sleep(250);
	await evaluate(`(() => {
		const body = document.querySelector('article.markdown-body');
		const range = getSelection().getRangeAt(0);
		const view = body.getBoundingClientRect();
		const scale = view.height / body.offsetHeight;
		body.scrollTop += (range.getBoundingClientRect().top - view.top - ${position} * view.height) / scale;
	})()`);
	await sleep(150);
	const beforePosition = await evaluate(`(() => { const view = document.querySelector('article.markdown-body').getBoundingClientRect(); return (getSelection().getRangeAt(0).getBoundingClientRect().top - view.top) / view.height; })()`);
	// Use the actual context menu, including its focus transfer.
	const point = await evaluate(`(() => { const r = document.querySelector('td[data-row="140"]').getBoundingClientRect(); return { x: r.x + 5, y: r.y + 5 }; })()`);
	await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'right', clickCount: 1 });
	await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'right', clickCount: 1 });
	await wait("!!document.querySelector('.context-menu .menu-item')");
	await evaluate(`Array.from(document.querySelectorAll('.context-menu .menu-item')).find(b => b.textContent.trim() === 'Edit').click()`);
	await wait("!!document.querySelector('.monaco-editor')");
	await evaluate(`(async () => { window.monacoTest = await import('/node_modules/.vite/deps/monaco-editor.js'); window.ed = monacoTest.editor.getEditors()[0]; })()`);
	await sleep(300);
	const selected = await evaluate(`({ text: ed.getModel().getValueInRange(ed.getSelection()), line: ed.getSelection().startLineNumber })`);
	assert.equal(selected.text, 'Product&nbsp;<strong>meets</strong> validation');
	assert.equal(selected.line, 143, 'select second occurrence, not first or heading');
	const editorPosition = await evaluate(`ed.getScrolledVisiblePosition(ed.getSelection().getStartPosition()).top / ed.getLayoutInfo().height`);
	assert.ok(Math.abs(editorPosition - beforePosition) < 0.05, `viewport at zoom ${zoom}: ${beforePosition} -> ${editorPosition}`);
	console.log(`PASS viewport retention at ${zoom}% zoom, target ${position}`);
	console.log('PASS context-menu exact selection across HTML/entity, repeated phrase');
	await key('f', 'KeyF', 70);
	await wait("!!document.querySelector('.find-widget.visible')");
	await key('v', 'KeyV', 86);
	await wait("!!document.querySelector('.rendered-find-results')");
	assert.match(await evaluate("document.querySelector('.rendered-find-results').textContent"), /1 of 2/);
	assert.equal(await evaluate('fixture.source'), source);
	assert.equal(await evaluate('fixture.clipboardReads'), 1);
	console.log('PASS Ctrl+V into Find, formatted text search without source mutation');
	await evaluate(`(() => { const field = document.activeElement; field.select(); const r = field.getBoundingClientRect(); field.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.x + 5, clientY: r.y + 5 })); })()`);
	await wait("!!document.querySelector('.context-menu .menu-item')");
	await evaluate(`Array.from(document.querySelectorAll('.context-menu .menu-item')).find(b => b.textContent.trim() === 'Paste').click()`);
	await sleep(250);
	assert.equal(await evaluate('fixture.clipboardReads'), 2);
	assert.equal(await evaluate('ed.getValue()'), source);
	console.log('PASS context-menu Paste only changes Find input');
	await key('Enter', 'Enter', 13, 0);
	assert.equal(await evaluate('ed.getSelection().startLineNumber'), 143);
	console.log('PASS next formatted-text search match');
	await evaluate(`(() => { const field = document.activeElement; field.select(); })()`);
	await send('Input.insertText', { text: 'Requirement 100' });
	await wait("!document.querySelector('.rendered-find-results')");
	assert.equal(await evaluate("ed.getModel().getValueInRange(ed.getSelection())"), 'Requirement 100');
	console.log('PASS native literal Find stays unchanged');
	await evaluate(`(() => { const field = document.activeElement; field.select(); })()`);
	await key('v', 'KeyV', 86);
	await wait("!!document.querySelector('.rendered-find-results')");
	await key('Enter', 'Enter', 13, 0);
	await key('Escape', 'Escape', 27, 0);
	await key('e', 'KeyE', 69);
	await wait("!document.querySelector('.monaco-editor') && !!document.querySelector('article.markdown-body')");
	await sleep(700);
	assert.equal(await evaluate('getSelection().toString()'), 'Product\u00a0meets validation');
	const visible = await evaluate(`(() => { const r = getSelection().getRangeAt(0).getBoundingClientRect(); const v = document.querySelector('article.markdown-body').getBoundingClientRect(); return r.top >= v.top && r.bottom <= v.bottom; })()`);
	assert.ok(visible, 'return to preview keeps selected text visible');
	console.log('PASS editor-to-preview return position');
	for (let i = 0; i < 3; i++) {
		await key('e', 'KeyE', 69);
		await wait("!!document.querySelector('.monaco-editor')");
		await sleep(150);
		assert.equal(await evaluate('ed = monacoTest.editor.getEditors()[0]; ed.getSelection().startLineNumber'), 143);
		await key('e', 'KeyE', 69);
		await wait("!document.querySelector('.monaco-editor')");
		await sleep(400);
	}
	console.log('PASS three repeated mode-switch cycles');
	assert.equal(await evaluate('fixture.saves'), 0);
	console.log('PASS navigation/search performs no save');
	await key('e', 'KeyE', 69);
	await wait("!!document.querySelector('.monaco-editor')");
	await evaluate(`ed = monacoTest.editor.getEditors()[0]; ed.executeEdits('test-edit', [{ range: ed.getSelection(), text: 'Product&nbsp;<strong>meets</strong> updated validation' }])`);
	await key('s', 'KeyS', 83);
	await wait('fixture.saves === 1');
	await key('e', 'KeyE', 69);
	await wait("!document.querySelector('.monaco-editor')");
	await wait("document.querySelector('article.markdown-body td[data-row=\"140\"]')?.textContent.includes('updated validation')");
	await sleep(600);
	assert.ok(await evaluate(`(() => { const cell = document.querySelector('td[data-row="140"]'); const r = cell.getBoundingClientRect(); const v = document.querySelector('article.markdown-body').getBoundingClientRect(); return cell.textContent.includes('updated validation') && r.top >= v.top && r.bottom <= v.bottom; })()`));
	console.log('PASS edit/save returns to updated table row');
	for (const text of ['<td>example &amp;</td>', '<td>fenced &amp;</td>']) {
		await evaluate(`(() => {
			const el = Array.from(document.querySelectorAll('article.markdown-body code')).find(el => el.textContent === ${JSON.stringify(text)});
			el.scrollIntoView({block:'center'});
			const range = document.createRange(); range.selectNodeContents(el);
			getSelection().removeAllRanges(); getSelection().addRange(range);
		})()`);
		await key('e', 'KeyE', 69);
		await wait("!!document.querySelector('.monaco-editor')");
		await sleep(200);
		assert.equal(await evaluate('ed = monacoTest.editor.getEditors()[0]; ed.getModel().getValueInRange(ed.getSelection())'), text);
		await key('f', 'KeyF', 70);
		await wait("!!document.querySelector('.find-widget.visible')");
		await evaluate("document.activeElement.select()");
		await send('Input.insertText', { text });
		await sleep(250);
		assert.equal(await evaluate('ed.getModel().getValueInRange(ed.getSelection())'), text);
		await key('Escape', 'Escape', 27, 0);
		await key('e', 'KeyE', 69);
		await wait("!document.querySelector('.monaco-editor')");
		await sleep(500);
		assert.equal(await evaluate('getSelection().toString()'), text);
		assert.ok(await evaluate(`(() => { const r = getSelection().getRangeAt(0).getBoundingClientRect(); const v = document.querySelector('article.markdown-body').getBoundingClientRect(); return r.top >= v.top && r.bottom <= v.bottom; })()`));
		console.log('PASS literal code Find and preview/editor round trip:', text);
	}
	await send('Browser.close');
} finally {
	ws?.close();
	child.kill();
	console.log('Isolated test profile:', profile);
}
