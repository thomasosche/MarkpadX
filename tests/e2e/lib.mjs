// Shared harness for the MarkpadX end-to-end suites.
// Drives the debug build (src-tauri/target/debug/Markpad.exe) over WebView2's DevTools protocol:
//   WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=<port>
//   WEBVIEW2_USER_DATA_FOLDER=<throw-away profile>   (never touches the user's real Markpad session)
// Needs Node 24 (global WebSocket / fetch). Real CDP mouse and key events, no app-internal hooks.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const EXE = path.join(REPO, 'src-tauri', 'target', 'debug', 'Markpad.exe');
export const E2E_TMP = path.join(os.tmpdir(), 'markpadx-e2e');

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Thrown when a test touches something outside the suite's fixture folder. Aborts the whole suite. */
export class SafetyStop extends Error {
	constructor(msg) { super('SAFETY STOP: ' + msg); this.fatal = true; }
}

// ---------------------------------------------------------------- suite folders

/**
 * Fresh working folders for a suite under os.tmpdir()/markpadx-e2e/<name>/:
 * fixture/ (the only place the app may touch), profile/ (WebView2 user data), logs/.
 * Everything from a previous run is deleted.
 */
export function prepareSuite(name) {
	const root = path.join(E2E_TMP, name);
	fs.rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
	const suite = { name, root, fixture: path.join(root, 'fixture'), profile: path.join(root, 'profile'), logs: path.join(root, 'logs') };
	for (const d of [suite.fixture, suite.logs]) fs.mkdirSync(d, { recursive: true });
	return suite;
}

// ---------------------------------------------------------------- single-instance guard

export function markpadRunning() {
	const r = spawnSync('tasklist', ['/FI', 'IMAGENAME eq Markpad.exe', '/NH'], { encoding: 'utf8' });
	return /Markpad\.exe/i.test(r.stdout || '');
}

/** The app allows one instance only: a running Markpad would swallow our launch arguments. */
export async function waitNoApp(ms = 8000) {
	for (let t = 0; t < ms; t += 500) {
		if (!markpadRunning()) return;
		await sleep(500);
	}
	throw new Error('Markpad.exe is already running (single-instance app): close it first');
}

// ---------------------------------------------------------------- fixture path safety

const norm = (p) => path.resolve(p).toLowerCase();
export const isInside = (dir, p) => {
	const d = norm(dir), x = norm(p);
	return x === d || x.startsWith(d + path.sep);
};
/** Lower-cased base names of all files below dir (links are not followed). */
function fixtureNames(dir) {
	const names = new Set();
	const walk = (d) => {
		let entries = [];
		try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
		for (const e of entries) {
			if (e.isDirectory()) walk(path.join(d, e.name));
			else names.add(e.name.toLowerCase());
		}
	};
	walk(dir);
	return names;
}

// ---------------------------------------------------------------- injectable page helpers

/**
 * Snippet for Runtime.evaluate: defines window.__t (wordRect, view, edView, ratio, markerAt, toc,
 * caretLine). Inject after the preview has rendered: the page can reload once at start-up.
 */
export const TEST_HELPERS = `window.__t = {
	wordRect(root, word) {
		if (!root) return null;
		const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
		let n;
		while ((n = walker.nextNode())) {
			const i = n.data.indexOf(word);
			if (i >= 0) { const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + word.length); const b = r.getBoundingClientRect(); if (b.height > 0) return { x: b.x, y: b.y, w: b.width, h: b.height }; }
		}
		return null;
	},
	view() { const r = document.querySelector('article.markdown-body').getBoundingClientRect(); return { top: r.top, h: r.height, bottom: r.bottom, left: r.left, w: r.width }; },
	edView() { const e = document.querySelector('.monaco-editor .overflow-guard') || document.querySelector('.monaco-editor'); const r = e.getBoundingClientRect(); return { top: r.top, h: r.height, bottom: r.bottom, left: r.left, w: r.width }; },
	ratio(y, v) { return Math.round(((y - v.top) / v.h) * 100) / 100; },
	// first marker word (rNNN / pNN) whose text sits at or below the given screen y in the preview
	markerAt(y) {
		const a = document.querySelector('article.markdown-body');
		let best = null;
		for (const el of a.querySelectorAll('p, h1, h2, h3')) {
			const m = el.textContent.match(/\\b([rp]\\d{2,3})\\b/);
			if (!m) continue;
			const b = el.getBoundingClientRect();
			if (b.height === 0) continue;
			if (b.bottom > y) { best = { marker: m[1], ratio: this.ratio(b.top, this.view()) }; break; }
		}
		return best;
	},
	toc() { return Array.from(document.querySelectorAll('.toc-list .toc-link')).map(e => e.textContent.trim()).filter(Boolean); },
	caretLine() {
		// the cursor element, or Monaco's current-line highlight (also drawn when the cursor blinks off)
		const curEl = document.querySelector('.monaco-editor .cursor');
		const cur = curEl && curEl.getBoundingClientRect().height > 0 ? curEl.getBoundingClientRect() : null;
		const curLine = document.querySelector('.monaco-editor .current-line');
		const ref = cur || (curLine && curLine.getBoundingClientRect().height > 0 ? curLine.getBoundingClientRect() : null);
		const focused = !!document.activeElement?.closest('.monaco-editor');
		if (!ref) return { text: null, ratio: null, focused, cursorEl: !!curEl, currentLineEl: !!curLine };
		const mid = ref.top + ref.height / 2;
		const line = Array.from(document.querySelectorAll('.monaco-editor .view-line')).find(l => { const b = l.getBoundingClientRect(); return b.top <= mid && b.bottom >= mid; });
		return { text: line ? line.textContent.replace(/\\u00a0/g, ' ') : null, ratio: this.ratio(ref.top, this.edView()), focused, via: cur ? 'cursor' : 'current-line' };
	},
}; true`;

// ---------------------------------------------------------------- launching the app

const DIALOG_NAMES = { Speichern: ['Speichern', 'Save'], Verwerfen: ['Verwerfen', 'Discard'], Abbrechen: ['Abbrechen', 'Cancel'] };

/**
 * Start the app with an isolated WebView2 profile and connect to it over CDP.
 * @param {object} o
 * @param {{name:string,fixture:string,profile:string,logs:string}} o.suite  from prepareSuite()
 * @param {number} o.port   CDP port, unique per suite
 * @param {string[]} [o.args]  command-line arguments (files to open)
 * The profile is NOT wiped here, so a second launch with the same suite restarts on the same profile.
 */
export async function launch({ suite, port, args = [] }) {
	if (!fs.existsSync(EXE)) throw new Error(`debug build not found: ${EXE}\nBuild it first: npx tauri build --debug --no-bundle`);
	await waitNoApp();
	const out = fs.openSync(path.join(suite.logs, 'app-stdout.log'), 'a');
	const err = fs.openSync(path.join(suite.logs, 'app-stderr.log'), 'a');
	const app = spawn(EXE, args, {
		env: { ...process.env, RUST_BACKTRACE: '1', WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}`, WEBVIEW2_USER_DATA_FOLDER: suite.profile },
		stdio: ['ignore', out, err],
	});
	const s = { app, suite, port, errors: [], consoleErrors: [], exited: false, dialogsChecked: 0 };
	app.on('exit', (c) => { s.exited = true; s.exitCode = c; });

	const killTree = () => { try { spawnSync('taskkill', ['/PID', String(app.pid), '/T', '/F'], { stdio: 'ignore' }); } catch {} };
	s.close = async () => {
		try { s.ws?.close(); } catch {}
		if (!s.exited) killTree();
		for (let t = 0; t < 10000 && !s.exited; t += 100) await sleep(100);
		try { fs.closeSync(out); fs.closeSync(err); } catch {}
	};
	// Close the window the normal way, so WebView2 writes localStorage to disk (a killed process
	// loses the changes of its last seconds). Falls back to killing the process tree.
	s.closeGracefully = async (ms = 10000) => {
		try {
			// no await: the reply is lost when the page goes away
			void s.send('Runtime.evaluate', { expression: `window.__TAURI_INTERNALS__?.invoke('plugin:window|close', { label: 'main' })` });
		} catch {}
		for (let t = 0; t < ms && !s.exited; t += 100) await sleep(100);
		await s.close();
	};

	let target;
	for (let i = 0; i < 60 && !target; i++) {
		await sleep(500);
		if (s.exited) break;
		try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page'); } catch {}
	}
	if (!target) { await s.close(); throw new Error('CDP target not found'); }

	const ws = new WebSocket(target.webSocketDebuggerUrl);
	s.ws = ws;
	await new Promise((r) => ws.addEventListener('open', r));
	let id = 0;
	const pending = new Map();
	ws.addEventListener('message', (ev) => {
		const m = JSON.parse(ev.data);
		if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
		if (m.method === 'Runtime.exceptionThrown') s.errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
		if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') s.consoleErrors.push(m.params.args.map((a) => a.value ?? a.description).join(' '));
	});
	s.send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
	s.evaluate = async (expr) => {
		const r = await s.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
		if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text);
		return r.result.result.value;
	};
	await s.send('Runtime.enable');

	s.waitFor = async (expr, what, ms = 10000) => {
		for (let t = 0; t < ms; t += 100) { if (await s.evaluate(expr)) return; await sleep(100); }
		throw new Error('timeout waiting for ' + what);
	};
	// modifiers: 2 = Ctrl, 8 = Shift (Ctrl+Shift = 10), 0 = none
	s.key = async (k, code, vk, modifiers = 2) => {
		const text = k.length === 1 && !modifiers ? k : k === 'Enter' ? '\r' : undefined;
		await s.send('Input.dispatchKeyEvent', { type: text ? 'keyDown' : 'rawKeyDown', key: k, code, windowsVirtualKeyCode: vk, modifiers, text });
		await s.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk, modifiers });
	};
	s.mouse = async (x, y, clickCount = 1) => {
		for (let c = 1; c <= clickCount; c++) for (const type of ['mousePressed', 'mouseReleased']) await s.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: c });
		await sleep(120);
	};
	s.move = (x, y) => s.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
	s.wheel = (x, y, deltaY) => s.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: 0, deltaY });
	/** Reset zoom (Ctrl+0), then Ctrl+= in 10 % steps up to the wanted zoom (100..). */
	s.setZoom = async (zoom, settle = 700) => {
		await s.key('0', 'Digit0', 48);
		for (let z = 100; z < zoom; z += 10) await s.key('=', 'Equal', 187);
		await sleep(settle);
	};
	s.inject = () => s.evaluate(TEST_HELPERS);

	// SAFETY: every dialog the test answers and every open tab must concern fixture files only
	s.assertOnlyFixtureTabs = async () => {
		const labels = await s.evaluate(`Array.from(document.querySelectorAll('.tab .tab-label')).map(l => l.innerText.trim())`);
		const names = fixtureNames(suite.fixture);
		const foreign = labels.filter((l) => l && !names.has(l.toLowerCase()));
		if (foreign.length) throw new SafetyStop('tab outside the fixture folder: ' + foreign.join(', '));
	};
	s.assertDialogText = (txt) => {
		const names = fixtureNames(suite.fixture);
		for (const tok of txt.match(/(?:[A-Za-z]:)?[^\s"'<>|*?]*\.md\b/gi) || []) {
			const ok = /[\\/]/.test(tok) ? path.isAbsolute(tok) && isInside(suite.fixture, tok) : names.has(tok.toLowerCase());
			if (!ok) throw new SafetyStop('dialog refers to a file outside the fixture folder: ' + txt);
		}
	};
	s.clickDialog = async (name) => {
		const txt = await s.evaluate(`document.querySelector('.modal-content')?.innerText || ''`);
		s.assertDialogText(txt);
		if (/\b(modal|toast)\.[a-z]/i.test(txt)) throw new Error('dialog shows an untranslated key: ' + txt);
		s.dialogsChecked++;
		const clicked = await s.evaluate(`(() => { const b = Array.from(document.querySelectorAll('.modal-btn')).find(b => ${JSON.stringify(DIALOG_NAMES[name])}.includes(b.innerText.trim())); if (!b) return false; b.click(); return true; })()`);
		if (!clicked) throw new Error('dialog button not found: ' + name);
	};
	/** Console errors and uncaught exceptions, minus known noise. */
	s.allErrors = () => [...s.errors, ...s.consoleErrors].filter((e) => !/favicon|DevTools/i.test(e));
	return s;
}

// ---------------------------------------------------------------- result reporting

/** Minimal PASS/FAIL reporter shared by the assertion-style suites. */
export function createReport() {
	const r = {
		pass: 0,
		fail: 0,
		ok(name, detail) { r.pass++; console.log('  PASS', name + (detail ? '  [' + detail + ']' : '')); },
		bad(name, detail) { r.fail++; process.exitCode = 1; console.log('  FAIL', name + (detail ? '  [' + detail + ']' : '')); },
		info(...a) { console.log('  info:', ...a); },
		/** Run one check; a failed assertion is reported and the suite goes on, a SafetyStop aborts it. fn may return a detail string. */
		async step(name, fn) {
			try { r.ok(name, await fn()); } catch (e) { if (e.fatal) throw e; r.bad(name, e.message); }
		},
		/** Final lines: console errors, check count; sets the exit code; closes the app. */
		async finish(s) {
			const errs = s ? s.allErrors() : [];
			console.log(errs.length ? 'console errors:\n  ' + errs.join('\n  ') : 'no console errors');
			if (errs.length) process.exitCode = 1;
			console.log(`${r.pass} checks passed` + (r.fail ? `, ${r.fail} FAILED` : ''));
			if (s) await s.close();
		},
	};
	return r;
}
