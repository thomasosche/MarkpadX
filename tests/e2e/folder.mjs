// E2E for the folder pane (IDEAS.md I-05): lists the Markdown files of the active file's folder,
// opposite the outline. Debug build, isolated WebView2 profile, own fixture folder, SAFETY STOP for
// any tab / dialog / listed path outside the fixture folder.
//
// Fixture (os.tmpdir()/markpadx-e2e/folder/fixture):
//   A/        a.md  B.md  2.md  10.md  notes.txt  .hidden.md  sub/c.md  link/ (junction -> other/)
//   other/    x.md
// Only the documented DOM contract is used (see tests/e2e/README.md).
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { launch, prepareSuite, sleep, createReport, isInside, SafetyStop } from './lib.mjs';

const PORT = 9337;
const suite = prepareSuite('folder');
const F = suite.fixture;
const A = path.join(F, 'A');
const A_MOVED = path.join(F, 'A_moved');
const OTHER = path.join(F, 'other');
const A_MD = path.join(A, 'a.md');
const X_MD = path.join(OTHER, 'x.md');
const BASE = ['2.md', '10.md', 'a.md', 'B.md']; // expected order: natural, case-insensitive

fs.mkdirSync(path.join(A, 'sub'), { recursive: true });
fs.mkdirSync(OTHER, { recursive: true });
fs.writeFileSync(A_MD, '# A\r\n\r\nFile a.md with a link to [x](../other/x.md) in the other folder.\r\n');
for (const n of ['B', '2', '10']) fs.writeFileSync(path.join(A, n + '.md'), `# ${n}\r\n\r\nFile ${n}.md.\r\n`);
fs.writeFileSync(path.join(A, 'notes.txt'), 'not markdown\r\n');
fs.writeFileSync(path.join(A, '.hidden.md'), '# hidden\r\n');
fs.writeFileSync(path.join(A, 'sub', 'c.md'), '# c\r\n');
fs.writeFileSync(X_MD, '# x\r\n\r\nFile x.md in the other folder with some text to measure.\r\n');
const mk = spawnSync('cmd', ['/C', 'mklink', '/J', path.join(A, 'link'), OTHER], { encoding: 'utf8' });
if (mk.status !== 0) { console.log('cannot create the junction fixture (mklink /J):', mk.stdout, mk.stderr); process.exit(1); }

const report = createReport();
let s;
try { s = await launch({ suite, port: PORT, args: [A_MD] }); } catch (e) { console.log(e.message); process.exit(1); }
const ev = (e) => s.evaluate(e);

// ---------------------------------------------------------------- helpers
const BASENAME = `split(/[\\\\/]/).pop()`;
const LIST = `Array.from(document.querySelectorAll('ul.folder-pane-list > li.folder-pane-item'))`;
const names = () => ev(`${LIST}.map(li => li.dataset.path.${BASENAME})`);
const bn = (p) => p.split(/[\\/]/).pop();
const trimDir = (p) => path.normalize(p).replace(/[\\/]+$/, '').toLowerCase();
const showing = (got, want) => JSON.stringify(got) === JSON.stringify(want);
async function waitNames(expected, what, ms = 8000) {
	let got;
	for (let t = 0; t < ms; t += 150) {
		got = await names();
		if (showing(got, expected)) return got;
		await sleep(150);
	}
	throw new Error(`${what}: expected [${expected}] got [${got}]`);
}
const title = () => ev(`document.querySelector('.folder-pane-title')?.getAttribute('title') ?? null`);
async function waitTitle(dir, what, ms = 8000) {
	let got;
	for (let t = 0; t < ms; t += 150) {
		got = await title();
		if (got && trimDir(got) === trimDir(dir)) return got;
		await sleep(150);
	}
	throw new Error(`${what}: pane title is "${got}", expected ${dir}`);
}
const ls = (key) => ev(`localStorage.getItem(${JSON.stringify(key)})`);
const paneOpen = () => ev(`!!document.querySelector('.folder-pane')`);
const labels = () => ev(`Array.from(document.querySelectorAll('.tab .tab-label')).map(l => l.innerText.trim())`);
const activeLabel = () => ev(`document.querySelector('.tab.active .tab-label')?.innerText.trim() ?? null`);
const waitActive = (name) => s.waitFor(`(document.querySelector('.tab.active .tab-label')?.innerText || '').trim() === ${JSON.stringify(name)}`, `active tab ${name}`, 8000);
const waitViewRendered = () => s.waitFor(`!!document.querySelector('article.markdown-body p, article.markdown-body h1')`, 'preview rendered', 20000);
const item = (name) => `Array.from(document.querySelectorAll('li.folder-pane-item')).find(li => li.dataset.path.${BASENAME} === ${JSON.stringify(name)})`;
const itemClasses = (name) => ev(`(() => { const li = ${item(name)}; return li ? Array.from(li.classList) : null; })()`);

// real mouse click at the centre of the element the expression returns; refuses to click a covered or hidden element
async function clickEl(expr) {
	const r = await ev(`(() => { const el = ${expr}; if (!el) return null; el.scrollIntoView({ block: 'nearest' }); const b = el.getBoundingClientRect(); const x = b.x + b.width / 2, y = b.y + b.height / 2; const hit = document.elementFromPoint(x, y); return { x, y, w: b.width, h: b.height, hit: !!hit && (el === hit || el.contains(hit)) }; })()`);
	if (!r) throw new Error('element not found: ' + expr.slice(0, 90));
	if (!r.w || !r.h) throw new Error('element not visible: ' + expr.slice(0, 90));
	if (!r.hit) throw new Error('element is covered at its centre: ' + expr.slice(0, 90));
	await s.mouse(r.x, r.y);
}
const sel = (c) => `document.querySelector(${JSON.stringify(c)})`;
async function switchTab(name) {
	const idx = (await labels()).findIndex((l) => l === name);
	if (idx < 0) throw new Error('no tab ' + name);
	await ev(`document.querySelectorAll('.tab .tab-content-btn')[${idx}].click()`);
	await waitActive(name);
	await s.assertOnlyFixtureTabs();
	await sleep(300);
}
async function openPane() {
	if (await paneOpen()) return;
	await clickEl(sel('.folder-toggle-floating'));
	await s.waitFor(`!!document.querySelector('.folder-pane')`, 'pane visible', 5000);
	await sleep(500); // fly transition
}
const pinState = () => ev(`document.querySelector('.folder-pane-pin')?.getAttribute('aria-pressed') ?? null`);
// horizontal centre of an element as 'left' / 'right' half of the window
const sideOf = (expr) => ev(`(() => { const el = ${expr}; if (!el) return null; const b = el.getBoundingClientRect(); if (!b.width) return null; return (b.x + b.width / 2) < innerWidth / 2 ? 'left' : 'right'; })()`);
const other = (side) => (side === 'left' ? 'right' : 'left');
async function outlineSide() {
	return (await sideOf(sel('.toc-toggle-floating'))) ?? (((await ls('editor.tocSide')) ?? 'left') === 'right' ? 'right' : 'left');
}
const wrapperSide = () => ev(`(() => { const w = document.querySelector('.folder-pane-wrapper'); if (!w) return null; return w.classList.contains('on-left') ? 'left' : w.classList.contains('on-right') ? 'right' : '?'; })()`);
async function renameDir(from, to) {
	let last;
	for (let i = 0; i < 12; i++) {
		try { fs.renameSync(from, to); return; } catch (e) { last = e; await sleep(300); }
	}
	throw new Error(`cannot rename ${path.basename(from)} -> ${path.basename(to)}: ${last.message}`);
}
const fmt = (r) => `[${Math.round(r.l)}..${Math.round(r.r)}]`;
// rectangle overlap of the pane with editor and preview text
const overlapProbe = () => ev(`(() => {
	const pane = document.querySelector('.folder-pane');
	if (!pane) return null;
	const p = pane.getBoundingClientRect();
	const inter = (b) => Math.min(b.right, p.right) - Math.max(b.left, p.left) > 1 && Math.min(b.bottom, p.bottom) - Math.max(b.top, p.top) > 1;
	const out = { pane: { l: p.left, r: p.right }, win: innerWidth, editor: null, text: null };
	const ed = document.querySelector('.monaco-editor');
	if (ed) { const b = ed.getBoundingClientRect(); out.editor = { l: b.left, r: b.right, overlap: inter(b) }; }
	const art = document.querySelector('article.markdown-body');
	if (art) {
		let rects = 0, over = 0, minL = 1e9, maxR = -1e9, first = null;
		const w = document.createTreeWalker(art, NodeFilter.SHOW_TEXT);
		let n;
		while ((n = w.nextNode())) {
			if (!n.data.trim()) continue;
			const r = document.createRange(); r.selectNodeContents(n);
			for (const b of r.getClientRects()) {
				if (!b.width || !b.height) continue;
				rects++;
				if (inter(b)) { over++; first ??= { text: n.data.trim().slice(0, 40), l: Math.round(b.left), r: Math.round(b.right), t: Math.round(b.top), parent: n.parentElement?.tagName + '.' + (n.parentElement?.className || '') }; }
				minL = Math.min(minL, b.left); maxR = Math.max(maxR, b.right);
			}
		}
		out.text = { rects, over, l: minL, r: maxR, first, article: (() => { const b = art.getBoundingClientRect(); return { l: Math.round(b.left), r: Math.round(b.right) }; })() };
	}
	return out;
})()`);
// The preview article stays in the DOM in edit mode, so the mode is read from the layout classes
const mode = () => ev(`(() => { const lc = document.querySelector('.layout-container'); return lc?.classList.contains('split') ? 'split' : lc?.classList.contains('editing') ? 'edit' : 'view'; })()`);
async function ensureView() {
	for (let i = 0; i < 3; i++) {
		const m = await mode();
		if (m === 'view') return;
		if (m === 'split') await s.key('h', 'KeyH', 72); else await s.key('e', 'KeyE', 69);
		await sleep(900);
	}
}
const editor = `!!document.querySelector('.monaco-editor .view-lines')`;

try {
	await waitViewRendered();
	await sleep(800);
	await s.assertOnlyFixtureTabs();
	report.info('window', JSON.stringify(await ev(`({ w: innerWidth, h: innerHeight, dpr: devicePixelRatio })`)));

	// 1. off by default; toggle opposite the outline; close; menu entry
	let side0;
	await report.step('1 pane off by default; toggle shows it opposite the outline; close works; menu has Open Folder', async () => {
		if (await paneOpen()) throw new Error('pane is open on a fresh profile');
		const stored = await ls('editor.showFolderPane');
		if (stored === 'true') throw new Error('editor.showFolderPane is true on a fresh profile');
		const tog = await sideOf(sel('.folder-toggle-floating'));
		if (!tog) throw new Error('.folder-toggle-floating not visible');
		side0 = await outlineSide();
		if (tog !== other(side0)) throw new Error(`folder toggle on ${tog}, outline on ${side0}`);
		await openPane();
		await s.waitFor(`localStorage.getItem('editor.showFolderPane') === 'true'`, 'editor.showFolderPane persisted', 5000);
		const w = await wrapperSide();
		const geo = await sideOf(sel('.folder-pane'));
		if (w !== other(side0) || geo !== other(side0)) throw new Error(`wrapper ${w}, pane ${geo}, outline ${side0}`);
		// no separate close button: the floating toggle closes the pane
		if (await ev(`!!document.querySelector('.folder-pane-close')`)) throw new Error('header still has a close button');
		await clickEl(sel('.folder-toggle-floating'));
		await s.waitFor(`!document.querySelector('.folder-pane')`, 'pane closed', 5000);
		await s.waitFor(`localStorage.getItem('editor.showFolderPane') === 'false'`, 'close persisted', 5000);
		await openPane();
		// switch-side button in the header swaps folder pane and outline, and back
		await clickEl(sel('.folder-pane-switch-side'));
		await s.waitFor(`localStorage.getItem('editor.tocSide') === ${JSON.stringify(other(side0))}`, 'outline side switched', 5000);
		await sleep(600);
		const swapped = { pane: await wrapperSide(), geo: await sideOf(sel('.folder-pane')), toggle: await sideOf(sel('.folder-toggle-floating')) };
		if (swapped.pane !== side0 || swapped.geo !== side0 || swapped.toggle !== side0) throw new Error(`after switch: ${JSON.stringify(swapped)}, expected all ${side0}`);
		await clickEl(sel('.folder-pane-switch-side'));
		await s.waitFor(`localStorage.getItem('editor.tocSide') === ${JSON.stringify(side0)}`, 'outline side switched back', 5000);
		await sleep(600);
		if ((await wrapperSide()) !== other(side0)) throw new Error('pane did not switch back');
		// menu: Open Folder entry exists (the native picker itself cannot be automated)
		await clickEl(sel('.icon-home-btn'));
		await s.waitFor(`!!document.querySelector('button.home-menu-item[data-action="open-folder"]')`, 'Open Folder menu entry', 4000);
		const vis = await ev(`(() => { const b = document.querySelector('button.home-menu-item[data-action="open-folder"]').getBoundingClientRect(); return b.width > 0 && b.height > 0; })()`);
		await clickEl(sel('.icon-home-btn'));
		await s.waitFor(`!document.querySelector('.home-dropdown-menu')`, 'menu closed', 4000);
		if (!vis) throw new Error('Open Folder entry not visible');
		return `outline ${side0}, pane ${w}, toggle ${tog}`;
	});
	side0 = side0 ?? (await outlineSide());
	await openPane();

	// 2. list content
	await report.step('2 list shows exactly 2.md, 10.md, a.md, B.md', async () => {
		const got = await waitNames(BASE, 'list');
		const links = await ev(`${LIST}.map(li => li.querySelector('button.folder-pane-link')?.textContent.trim())`);
		if (!showing(links, BASE)) throw new Error('link texts: ' + links);
		const paths = await ev(`${LIST}.map(li => li.dataset.path)`);
		for (const p of paths) if (!isInside(F, p)) throw new SafetyStop('pane lists a path outside the fixture folder: ' + p);
		const t = await waitTitle(A, 'title');
		const txt = await ev(`document.querySelector('.folder-pane-title').textContent.trim()`);
		if (txt !== 'A') throw new Error('title text: ' + txt);
		if (await ev(`!!document.querySelector('.folder-pane-empty, .folder-pane-error')`)) throw new Error('empty/error state shown');
		return `${got.join(', ')}; title "${txt}" -> ${t}`;
	});

	// 3. active highlight; click opens; click on an open file switches, tab count unchanged
	await report.step('3 active file highlighted; click opens a tab; click on open file reuses its tab', async () => {
		const c0 = await itemClasses('a.md');
		if (!c0?.includes('active') || !c0.includes('open')) throw new Error('a.md classes: ' + c0);
		if ((await ev(`document.querySelectorAll('li.folder-pane-item.active').length`)) !== 1) throw new Error('not exactly one active item');
		const n0 = (await labels()).length;
		await clickEl(`${item('B.md')}?.querySelector('button.folder-pane-link')`);
		await waitActive('B.md');
		await s.assertOnlyFixtureTabs();
		const n1 = (await labels()).length;
		if (n1 !== n0 + 1) throw new Error(`tabs ${n0} -> ${n1} after opening B.md`);
		await s.waitFor(`${item('B.md')}?.classList.contains('active')`, 'B.md active', 4000);
		const ca = await itemClasses('a.md');
		if (!ca.includes('open') || ca.includes('active')) throw new Error('a.md classes after opening B.md: ' + ca);
		await clickEl(`${item('a.md')}?.querySelector('button.folder-pane-link')`);
		await waitActive('a.md');
		const n2 = (await labels()).length;
		if (n2 !== n1) throw new Error(`tabs ${n1} -> ${n2} after clicking the open a.md`);
		await s.waitFor(`${item('a.md')}?.classList.contains('active')`, 'a.md active again', 4000);
		return `tabs ${n0} -> ${n1} -> ${n2}`;
	});

	// 4. open other/x.md through a link: the list follows to other/
	await report.step('4 opening other/x.md switches the list to other/', async () => {
		await clickEl(`document.querySelector('article.markdown-body a[href="../other/x.md"]')`);
		await waitActive('x.md');
		await s.assertOnlyFixtureTabs();
		const t = await waitTitle(OTHER, 'title after opening x.md');
		await waitNames(['x.md'], 'list in other/');
		await switchTab('a.md');
		await waitNames(BASE, 'list back in A');
		return `title ${t}`;
	});

	// 5. pin keeps the folder; unpin follows again
	await report.step('5 pin keeps the list across tab switches; unpin follows again', async () => {
		await clickEl(sel('.folder-pane-pin'));
		await s.waitFor(`document.querySelector('.folder-pane-pin')?.getAttribute('aria-pressed') === 'true'`, 'pin pressed', 4000);
		await switchTab('x.md');
		await sleep(900);
		await waitNames(BASE, 'pinned list after switching to x.md');
		await waitTitle(A, 'pinned title');
		await clickEl(sel('.folder-pane-pin'));
		await s.waitFor(`document.querySelector('.folder-pane-pin')?.getAttribute('aria-pressed') !== 'true'`, 'pin released', 4000);
		await waitNames(['x.md'], 'list after unpin');
		await switchTab('a.md');
		await waitNames(BASE, 'list back in A');
		return 'pinned A while x.md active; unpinned -> x.md';
	});

	// 6. new file on disk: not shown until a trigger (tab switch, refresh button)
	await report.step('6 new file appears after a tab switch and after the refresh button, not before', async () => {
		fs.writeFileSync(path.join(A, 'new.md'), '# new\r\n');
		await sleep(1500);
		if (!showing(await names(), BASE)) throw new Error('new.md appeared without a trigger');
		await switchTab('x.md');
		await waitNames(['x.md'], 'list in other/');
		await switchTab('a.md');
		await waitNames([...BASE, 'new.md'], 'list after tab switch');
		fs.writeFileSync(path.join(A, 'zz.md'), '# zz\r\n');
		await sleep(1200);
		if ((await names()).includes('zz.md')) throw new Error('zz.md appeared without a trigger');
		await clickEl(sel('.folder-pane-refresh'));
		await waitNames([...BASE, 'new.md', 'zz.md'], 'list after refresh button');
		return 'new.md via tab switch, zz.md via refresh button';
	});

	// 7. Save into the shown folder refreshes the list
	await report.step('7 Save refreshes the list (and the dirty marker follows the tab)', async () => {
		fs.writeFileSync(path.join(A, 'saved.md'), '# saved\r\n');
		await sleep(1000);
		if ((await names()).includes('saved.md')) throw new Error('saved.md appeared without a trigger');
		await s.key('e', 'KeyE', 69);
		await s.waitFor(editor, 'editor', 8000);
		await sleep(800);
		await s.send('Input.insertText', { text: 'EDITED ' });
		await s.waitFor(`document.querySelector('li.folder-pane-item.active')?.classList.contains('dirty')`, 'active item marked dirty', 4000);
		await s.key('s', 'KeyS', 83);
		await waitNames([...BASE, 'new.md', 'saved.md', 'zz.md'], 'list after Save', 8000);
		await s.waitFor(`!document.querySelector('li.folder-pane-item.dirty')`, 'dirty marker cleared', 4000);
		await s.key('e', 'KeyE', 69);
		await s.waitFor(`!(${editor})`, 'back to view', 8000);
		await sleep(500);
		return 'saved.md listed after Ctrl+S';
	});

	// 8. folder renamed while shown (pinned A, other tab active) -> error state, no crash; restore -> list again
	await report.step('8 renamed folder -> error state, no crash; renamed back + refresh -> list', async () => {
		await clickEl(sel('.folder-pane-pin'));
		await s.waitFor(`document.querySelector('.folder-pane-pin')?.getAttribute('aria-pressed') === 'true'`, 'pin pressed', 4000);
		await switchTab('x.md');
		await sleep(600);
		await renameDir(A, A_MOVED);
		try {
			await clickEl(sel('.folder-pane-refresh'));
			await s.waitFor(`(() => { const e = document.querySelector('.folder-pane-error'); if (!e) return false; const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0; })()`, 'error state visible', 6000);
			const n = (await names()).length;
			if (n) throw new Error(n + ' items listed next to the error');
			if (s.exited) throw new Error('app exited');
			if (!(await paneOpen())) throw new Error('pane vanished');
		} finally {
			await renameDir(A_MOVED, A);
		}
		await clickEl(sel('.folder-pane-refresh'));
		await waitNames([...BASE, 'new.md', 'saved.md', 'zz.md'], 'list after restoring the folder');
		if (await ev(`!!document.querySelector('.folder-pane-error')`)) throw new Error('error state still shown');
		return 'error shown while A_moved, list restored';
	});

	// 9. restart with the same profile: pane open again, pin not restored, outline side switch moves the pane
	await report.step('9 restart on the same profile: pane open, pin not restored; other outline side -> pane moves', async () => {
		if ((await pinState()) !== 'true') throw new Error('precondition: folder pinned');
		if ((await ls('editor.showFolderPane')) !== 'true') throw new Error('editor.showFolderPane not persisted');
		const newOutline = other(side0);
		// switch the outline side through the app's own control (outline header "switch side" button):
		// the app writes all settings from memory on every change, so a value set directly in
		// localStorage would be overwritten by the next save
		const tocWasShown = await ev(`!!document.querySelector('.toc-header')`);
		if (!tocWasShown) await clickEl(sel('.toc-toggle-floating'));
		await s.waitFor(`document.querySelectorAll('.toc-header .toc-header-btn').length >= 1`, 'outline header switch-side button', 5000);
		// the outline header's only button since the dock option was removed: switch side
		await ev(`Array.from(document.querySelectorAll('.toc-header .toc-header-btn')).at(-1).click(); true`);
		await s.waitFor(`localStorage.getItem('editor.tocSide') === ${JSON.stringify(newOutline)}`, 'outline side saved', 5000);
		if (!tocWasShown) await clickEl(sel('.toc-toggle-floating'));
		await sleep(500);
		await s.closeGracefully(); // a killed process would lose the side switch it just stored
		s = await launch({ suite, port: PORT, args: [X_MD] });
		await waitViewRendered();
		await sleep(1000);
		await s.assertOnlyFixtureTabs();
		await s.waitFor(`!!document.querySelector('.folder-pane')`, 'pane open after restart (editor.showFolderPane persisted)', 8000);
		await waitActive('x.md');
		const pin = await pinState();
		if (pin === 'true') throw new Error('pinned state was restored');
		await waitNames(['x.md'], 'list follows the current file after restart');
		await waitTitle(OTHER, 'title after restart');
		const w = await wrapperSide();
		const geo = await sideOf(sel('.folder-pane'));
		const out = await outlineSide();
		if (out !== newOutline) throw new Error(`outline on ${out}, expected ${newOutline} (stored editor.tocSide after restart: ${await ls('editor.tocSide')}; layout ${await ev(`document.querySelector('.layout-container')?.className`)})`);
		if (w !== side0 || geo !== side0) throw new Error(`wrapper ${w}, pane ${geo}, expected ${side0}`);
		return `outline ${side0} -> ${out}, pane ${other(side0)} -> ${w}`;
	});

	// 10. pinned pane never overlaps editor / preview text; at zoom 200 the list stays clickable
	await report.step('10 pinned pane: no overlap in view / edit / split mode; clickable at zoom 200', async () => {
		fs.writeFileSync(path.join(OTHER, 'y.md'), '# y\r\n\r\nFile y.md for the zoom click.\r\n');
		await s.send('Page.reload', {}); // not evaluate(): the reply would be lost with the destroyed context
		await sleep(1500);
		await waitViewRendered();
		await s.waitFor(`!!document.querySelector('.folder-pane')`, 'pane after reload', 10000);
		await sleep(1000);
		await s.assertOnlyFixtureTabs();
		if (!(await ev(`!!document.querySelector('.folder-pane-wrapper.is-pinned')`))) throw new Error('wrapper is not docked (.is-pinned)');
		const notes = [];
		const view = await overlapProbe();
		if (!view.text || !view.text.rects) throw new Error('no preview text measured');
		if (view.text.over) throw new Error(`view: ${view.text.over} text rects under the pane`);
		notes.push(`view pane${fmt(view.pane)} text${fmt(view.text)}`);

		await s.key('e', 'KeyE', 69);
		await s.waitFor(editor, 'editor', 8000);
		await sleep(900);
		const ed = await overlapProbe();
		if (!ed.editor) throw new Error('no .monaco-editor in edit mode');
		if (ed.editor.overlap) throw new Error(`edit: editor${fmt(ed.editor)} overlaps pane${fmt(ed.pane)}`);
		notes.push(`edit editor${fmt(ed.editor)}`);
		await ensureView();
		await sleep(600);

		await ensureView();
		await s.key('h', 'KeyH', 72);
		await s.waitFor(`!!document.querySelector('.layout-container.split') && ${editor}`, 'split view', 8000);
		await sleep(900);
		const sp = await overlapProbe();
		if (sp.editor?.overlap) throw new Error(`split: editor${fmt(sp.editor)} overlaps pane${fmt(sp.pane)}`);
		if (!sp.text || !sp.text.rects) throw new Error('split: no preview text measured');
		if (sp.text.over) {
			const lay = await ev(`(() => { const r = (q) => { const el = document.querySelector(q); if (!el) return null; const b = el.getBoundingClientRect(); return Math.round(b.left) + '..' + Math.round(b.right); }; const lc = document.querySelector('.layout-container'); return { classes: lc?.className, padding: lc && getComputedStyle(lc).padding, layout: r('.layout-container'), editorPane: r('.editor-pane'), viewerPane: r('.viewer-pane'), toc: r('.toc-overlay-wrapper'), splitBar: r('.split-bar') }; })()`);
			throw new Error(`split: ${sp.text.over} preview text rects under the pane${fmt(sp.pane)}; article [${sp.text.article.l}..${sp.text.article.r}]; first ${JSON.stringify(sp.text.first)}; layout ${JSON.stringify(lay)}`);
		}
		notes.push(`split editor${fmt(sp.editor)} text${fmt(sp.text)}`);
		await ensureView();
		await sleep(600);

		await s.setZoom(200, 900);
		const z = await overlapProbe();
		if (!z.text?.rects) throw new Error('zoom 200: no preview text measured');
		if (z.text.over) throw new Error(`zoom 200: ${z.text.over} text rects under the pane`);
		if (z.pane.l < -1 || z.pane.r > z.win + 1) throw new Error(`zoom 200: pane${fmt(z.pane)} outside the window (${z.win})`);
		await clickEl(`${item('y.md')}?.querySelector('button.folder-pane-link')`);
		await waitActive('y.md');
		await s.assertOnlyFixtureTabs();
		await s.waitFor(`${item('y.md')}?.classList.contains('active')`, 'y.md active', 4000);
		notes.push('zoom 200: click opened y.md');
		await s.setZoom(100, 600);
		return notes.join('; ');
	});

	// 11. no console errors, app alive
	await report.step('11 app still running', async () => {
		if (s.exited) throw new Error('app exited with code ' + s.exitCode);
		await s.assertOnlyFixtureTabs();
		return 'tabs: ' + (await labels()).join(', ');
	});
} catch (e) {
	console.log('  ABORT', e.message);
	process.exitCode = 1;
} finally {
	await report.finish(s);
}
