// E2E: selection / caret carry-over between view and edit mode, at several zoom levels, for
// paragraphs, table cells and headings; plus the short glow on the carried row in both directions.
// Runs the debug build with an isolated WebView2 profile (never the user's session).
import fs from 'node:fs';
import path from 'node:path';
import { launch, prepareSuite, sleep } from './lib.mjs';

const suite = prepareSuite('carry');
const FILE = path.join(suite.fixture, 'carry-e2e.md');
const PORT = 9335;
const TOLERANCE = 0.04; // allowed drift of the on-screen position, as a fraction of the view height

// Long document with unique marker words: wNNN in paragraphs, hNN in headings, tNNa/tNNb in tables
const lines = ['# Carry-over test', ''];
for (let i = 1; i <= 160; i++) {
	if (i % 10 === 0) {
		const k = String(i / 10).padStart(2, '0');
		lines.push(`## Section h${k} heading`, '');
		lines.push('| Key | Value |', '| --- | --- |', `| t${k}a cell | t${k}b cell |`, `| t${k}c cell | t${k}d cell |`, '');
	}
	lines.push(`Paragraph ${i} with the marker word w${String(i).padStart(3, '0')} in the middle of some longer text so lines wrap at high zoom levels.`, '');
}
fs.writeFileSync(FILE, lines.join('\r\n'));

let s;
try { s = await launch({ suite, port: PORT, args: [FILE] }); } catch (e) { console.log(e.message); process.exit(1); }
const { evaluate, send, key, mouse, wheel, waitFor } = s;
const inject = () => s.inject();

const article = `document.querySelector('article.markdown-body')`;
const viewLines = `document.querySelector('.monaco-editor .view-lines')`;

async function placeInPreview(word, ratio) {
	for (let i = 0; i < 14; i++) {
		const st = await evaluate(`(() => { const v = __t.view(); const w = __t.wordRect(${article}, ${JSON.stringify(word)}); if (!w) { ${article}.scrollTop += 400; return null; } return { v, w }; })()`);
		if (!st) continue;
		const want = st.v.top + ratio * st.v.h;
		const d = st.w.y - want;
		if (Math.abs(d) < 4) return;
		const step = Math.round(d / 2);
		await evaluate(`${article}.scrollTop += ${step}`);
		await sleep(60);
		const after = (await evaluate(`__t.wordRect(${article}, ${JSON.stringify(word)})`))?.y ?? st.w.y;
		const scale = Math.abs(st.w.y - after) > 0.5 ? (st.w.y - after) / step : 1;
		await evaluate(`${article}.scrollTop += ${Math.round((after - want) / (scale || 1))}`);
		await sleep(60);
	}
}

async function placeInEditor(word, ratio) {
	const ed = await evaluate(`__t.edView()`);
	for (let i = 0; i < 80; i++) {
		const w = await evaluate(`__t.wordRect(${viewLines}, ${JSON.stringify(word)})`);
		const want = ed.top + ratio * ed.h;
		if (!w) { await wheel(300, ed.top + ed.h / 2, 300); await sleep(80); continue; }
		const d = w.y - want;
		if (Math.abs(d) < 6) return;
		await wheel(300, ed.top + ed.h / 2, Math.max(-600, Math.min(600, d)));
		await sleep(80);
	}
}

// glow sampled right after the switch: does an overlay / line decoration cover the word's row?
const glowTrace = [];
const glowLifetimes = [];
async function sampleGlow(where, word) {
	const trace = [];
	const t0 = Date.now();
	while (Date.now() - t0 < 1000) {
		const g = await evaluate(where === 'view'
			? `(() => { const g = document.querySelector('.mode-switch-glow'); const w = __t.wordRect(${article}, ${JSON.stringify(word)}); if (!g) return { glow: false }; const r = g.getBoundingClientRect(); return { glow: true, gTop: Math.round(r.top), gBottom: Math.round(r.bottom), wMid: w ? Math.round(w.y + w.h / 2) : null, covers: !!w && r.top <= w.y + w.h / 2 && r.bottom >= w.y + w.h / 2 }; })()`
			: `(() => { const w = __t.wordRect(${viewLines}, ${JSON.stringify(word)}); const gs = Array.from(document.querySelectorAll('.monaco-editor .mode-switch-glow-line')).map(e => e.getBoundingClientRect()); if (!gs.length) return { glow: false }; return { glow: true, covers: !!w && gs.some(r => r.top <= w.y + w.h / 2 && r.bottom >= w.y + w.h / 2) }; })()`);
		trace.push({ t: Date.now() - t0, ...g });
		if (g.covers) return true;
		await sleep(40);
	}
	glowTrace.push({ where, word, trace });
	return false;
}

async function previewState(word) {
	return evaluate(`(() => {
		const v = __t.view(); const sel = getSelection(); const text = sel.toString().trim();
		let y = null;
		if (sel.rangeCount && text) { const r = sel.getRangeAt(0).getClientRects()[0]; if (r) y = r.y; }
		let hy = null;
		const hl = CSS.highlights && CSS.highlights.get('mode-switch-row');
		if (hl) for (const r of hl) { hy = r.getBoundingClientRect().y; break; }
		const w = __t.wordRect(${article}, ${JSON.stringify(word)});
		const hlOnWord = hl && w ? Array.from(hl).some(r => { const b = r.getBoundingClientRect(); return b.top <= w.y + w.h / 2 && b.bottom >= w.y + w.h / 2; }) : false;
		return { text, selRatio: y === null ? null : __t.ratio(y, v), rowRatio: hy === null ? null : __t.ratio(hy, v), wordRatio: w ? __t.ratio(w.y, v) : null, wordVisible: !!w && w.y >= v.top && w.y + w.h <= v.bottom, hlOnWord };
	})()`);
}

async function editorState(word) {
	return evaluate(`(() => {
		const v = __t.edView();
		const w = __t.wordRect(${viewLines}, ${JSON.stringify(word)});
		const sels = Array.from(document.querySelectorAll('.monaco-editor .selected-text')).map(e => e.getBoundingClientRect()).filter(r => r.width > 0);
		const cur = Array.from(document.querySelectorAll('.monaco-editor .cursor')).map(e => e.getBoundingClientRect()).find(r => r.height > 0);
		const selOnWord = !!w && sels.some(s => s.top <= w.y + w.h / 2 && s.bottom >= w.y + w.h / 2 && s.left <= w.x + 2 && s.right >= w.x + w.w - 2);
		const caretOnRow = !!w && !!cur && Math.abs((cur.top + cur.height / 2) - (w.y + w.h / 2)) < w.h;
		return { wordRatio: w ? __t.ratio(w.y, v) : null, wordVisible: !!w && w.y >= v.top && w.y + w.h <= v.bottom, selOnWord, caretOnRow };
	})()`);
}

const results = [];
let failures = 0;
function check(row, conds) {
	const failed = Object.entries(conds).filter(([, v]) => !v).map(([k]) => k);
	row.ok = failed.length === 0;
	if (!row.ok) { failures++; row.failed = failed.join(','); }
	results.push(row);
	console.log(`${row.ok ? 'PASS' : 'FAIL'} z${row.zoom} ${row.block.padEnd(9)} ${row.dir} ${row.kind.padEnd(9)} ${row.word.padEnd(5)} before ${String(row.before).padEnd(5)} after ${String(row.after).padEnd(5)} glow ${row.glow}${row.ok ? '' : '  <- ' + row.failed}`);
}
const near = (a, b) => a !== null && b !== null && Math.abs(a - b) <= TOLERANCE;

async function viewToEdit(zoom, block, kind, word, ratio) {
	await placeInPreview(word, ratio);
	const w = await evaluate(`__t.wordRect(${article}, ${JSON.stringify(word)})`);
	await mouse(w.x + w.w / 2, w.y + w.h / 2, kind === 'selection' ? 2 : 1);
	const before = await evaluate(`__t.ratio(${w.y}, __t.view())`);
	const selected = kind === 'selection' ? await evaluate(`getSelection().toString().trim()`) : '';
	await key('e', 'KeyE', 69);
	await waitFor(`!!document.querySelector('.monaco-editor .view-lines')`, 'editor');
	await sleep(1000);
	const ed = await editorState(word);
	// no glow in the editor; instead the caret line's frame must sit on the row and be clearly visible
	const frame = await evaluate(`(() => {
		const w = __t.wordRect(${viewLines}, ${JSON.stringify(word)});
		const el = document.querySelector('.monaco-editor .view-overlays .current-line');
		if (!w || !el) return { onRow: false, alpha: 0 };
		const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
		const m = cs.borderTopColor.match(/rgba?\\(([^)]+)\\)/); const parts = m ? m[1].split(',').map(Number) : [];
		return { onRow: r.top <= w.y + w.h / 2 && r.bottom >= w.y + w.h / 2, alpha: parts.length === 4 ? parts[3] : (parts.length === 3 ? 1 : 0), width: parseFloat(cs.borderTopWidth), color: cs.borderTopColor };
	})()`);
	const noEditorGlow = await evaluate(`!document.querySelector('.monaco-editor .mode-switch-glow-line') && !document.querySelector('.mode-switch-glow')`);
	const glow = `frame ${frame.color}`;
	check({ zoom, block, dir: 'view→edit', kind, word, before, after: ed.wordRatio, glow }, kind === 'selection'
		// with a selection Monaco draws no caret-line frame (the selection itself marks the spot)
		? { preselected: selected === word, onWord: ed.selOnWord, visible: ed.wordVisible, position: near(before, ed.wordRatio), noEditorGlow }
		: { caretOnRow: ed.caretOnRow, visible: ed.wordVisible, position: near(before, ed.wordRatio), frameOnRow: frame.onRow, frameVisible: frame.alpha >= 0.4 && frame.width >= 1, noEditorGlow });
}

async function editToView(zoom, block, kind, word, ratio) {
	await placeInEditor(word, ratio);
	const w = await evaluate(`__t.wordRect(${viewLines}, ${JSON.stringify(word)})`);
	const before = await evaluate(`__t.ratio(${w.y}, __t.edView())`);
	await mouse(w.x + w.w / 2, w.y + w.h / 2, kind === 'selection' ? 2 : 1);
	await key('e', 'KeyE', 69);
	await waitFor(`!document.querySelector('.monaco-editor .view-lines')`, 'view');
	const switchedAt = Date.now();
	const glow = await sampleGlow('view', word);
	let glowGone = true;
	try { await waitFor(`!document.querySelector('.mode-switch-glow')`, 'glow gone', Math.max(0, 2000 - (Date.now() - switchedAt))); } catch { glowGone = false; }
	glowLifetimes.push(Date.now() - switchedAt);
	await sleep(300);
	const pv = await previewState(word);
	check({ zoom, block, dir: 'edit→view', kind, word, before, after: kind === 'selection' ? pv.selRatio : pv.wordRatio, glow }, kind === 'selection'
		? { selected: pv.text === word, visible: pv.wordVisible, position: near(before, pv.wordRatio), glow, glowGone }
		: { noLastingMarker: !pv.hlOnWord && pv.rowRatio === null, visible: pv.wordVisible, position: near(before, pv.wordRatio), glow, glowGone });
}

try {
	await waitFor(`!!document.querySelector('article.markdown-body p')`, 'preview rendered');
	await sleep(800);
	await inject();
	console.log('window', JSON.stringify(await evaluate(`({ w: innerWidth, h: innerHeight, dpr: devicePixelRatio })`)));

	const plan = [];
	let p = 10, h = 1, t = 1;
	const cells = ['a', 'b', 'c', 'd'];
	for (const zoom of [100, 150, 200]) {
		for (const ratio of [0.15, 0.5, 0.85]) plan.push({ zoom, block: 'paragraph', ratio, words: () => `w${String(p++).padStart(3, '0')}` });
	}
	for (const zoom of [100, 200]) {
		for (const ratio of [0.3, 0.8]) {
			plan.push({ zoom, block: 'table', ratio, words: () => { const k = Math.floor((t - 1) / 4) + 1; const c = cells[(t++ - 1) % 4]; return `t${String(k).padStart(2, '0')}${c}`; } });
			plan.push({ zoom, block: 'heading', ratio, words: () => `h${String(h++).padStart(2, '0')}` });
		}
	}

	let currentZoom = null;
	for (const step of plan) {
		if (step.zoom !== currentZoom) {
			await key('0', 'Digit0', 48);
			for (let z = 100; z < step.zoom; z += 10) await key('=', 'Equal', 187);
			await sleep(600);
			currentZoom = step.zoom;
		}
		// each case takes a fresh marker word, so no case can hit a previous selection
		for (const [dir, kind] of [['v', 'selection'], ['e', 'selection'], ['v', 'caret'], ['e', 'caret']]) {
			const word = step.words();
			if (dir === 'v') await viewToEdit(step.zoom, step.block, kind, word, step.ratio);
			else await editToView(step.zoom, step.block, kind, word, step.ratio);
		}
		// make sure every block starts in view mode
		if (await evaluate(`!!document.querySelector('.monaco-editor .view-lines')`)) {
			await key('e', 'KeyE', 69);
			await waitFor(`!document.querySelector('.monaco-editor .view-lines')`, 'view');
			await sleep(600);
		}
	}
} catch (e) {
	console.log('ERROR', e.message);
	failures++;
} finally {
	fs.writeFileSync(path.join(suite.logs, 'carry-results.json'), JSON.stringify(results, null, 1));
	fs.writeFileSync(path.join(suite.logs, 'carry-glow-trace.json'), JSON.stringify(glowTrace, null, 1));
	console.log(s.errors.length ? 'page errors:\n  ' + s.errors.join('\n  ') : 'no page errors');
	if (glowLifetimes.length) console.log(`preview glow visible until ${Math.min(...glowLifetimes)}–${Math.max(...glowLifetimes)} ms after the switch`);
	console.log(`${results.filter((r) => r.ok).length}/${results.length} cases passed`);
	if (failures || s.errors.length) process.exitCode = 1;
	await s.close();
}
