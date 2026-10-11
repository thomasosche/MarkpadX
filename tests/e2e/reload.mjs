// Observation test: live reload after external file changes, in view and edit mode.
// Records what happens to the viewed lines, the caret / selection and the table of contents.
// Asserts nothing about behaviour. Debug build, isolated WebView2 profile, own fixture file.
import fs from 'node:fs';
import path from 'node:path';
import { launch, prepareSuite, sleep } from './lib.mjs';

const suite = prepareSuite('reload');
const FILE = path.join(suite.fixture, 'reload-e2e.md');
const PORT = 9336;
const NL = '\r\n';

// Paragraph i has marker rNNN; heading k has marker pNN
const para = (i) => `Paragraph ${i} with marker r${String(i).padStart(3, '0')} and enough extra words to make the line a realistic length.`;
function baseBlocks() {
	const blocks = ['# Reload test'];
	for (let i = 1; i <= 120; i++) {
		if (i % 15 === 1) blocks.push(`## Part p${String(Math.ceil(i / 15)).padStart(2, '0')}`);
		blocks.push(para(i));
	}
	return blocks;
}
const write = (blocks) => fs.writeFileSync(FILE, blocks.join(NL + NL) + NL);
write(baseBlocks());


let s;
try { s = await launch({ suite, port: PORT, args: [FILE] }); } catch (e) { console.log(e.message); process.exit(1); }
const { evaluate, send, key, mouse, wheel, waitFor } = s;
const inject = () => s.inject();

const article = `document.querySelector('article.markdown-body')`;
const viewLines = `document.querySelector('.monaco-editor .view-lines')`;
const isEditing = () => evaluate(`!!document.querySelector('.monaco-editor .view-lines')`);
const m3 = (i) => `r${String(i).padStart(3, '0')}`;

async function placeInPreview(word, ratio) {
	for (let i = 0; i < 14; i++) {
		const st = await evaluate(`(() => { const v = __t.view(); const w = __t.wordRect(${article}, ${JSON.stringify(word)}); if (!w) { ${article}.scrollTop += 400; return null; } return { v, w }; })()`);
		if (!st) continue;
		const want = st.v.top + ratio * st.v.h;
		const d = st.w.y - want;
		if (Math.abs(d) < 4) return;
		// scrollTop is in the preview's own units: screen distance / zoom factor
		const scale = await evaluate(`(() => { const a = ${article}; return a.getBoundingClientRect().height / a.offsetHeight; })()`);
		await evaluate(`${article}.scrollTop += ${Math.round(d / scale)}`);
		await sleep(80);
	}
}
async function placeInEditor(word, ratio) {
	const ed = await evaluate(`__t.edView()`);
	for (let i = 0; i < 80; i++) {
		const w = await evaluate(`__t.wordRect(${viewLines}, ${JSON.stringify(word)})`);
		const want = ed.top + ratio * ed.h;
		if (!w) { await wheel(ed.left + 300, ed.top + ed.h / 2, 300); await sleep(80); continue; }
		const d = w.y - want;
		if (Math.abs(d) < 6) return;
		await wheel(ed.left + 300, ed.top + ed.h / 2, Math.max(-600, Math.min(600, d)));
		await sleep(80);
	}
}

const results = [];
let failures = 0;
const TOL = 0.04;
function check(row, conds) {
	const failed = Object.entries(conds).filter(([, v]) => !v).map(([k]) => k);
	row.ok = failed.length === 0;
	if (!row.ok) { failures++; row.failed = failed.join(','); }
	results.push(row);
	const { ok, failed: f, ...rest } = row;
	console.log(`${ok ? 'PASS' : 'FAIL'} ${JSON.stringify(rest)}${ok ? '' : '  <- ' + f}`);
}
const near = (a, b, tol = TOL) => typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= tol;

const TARGET = 60; // target paragraph r060, placed at 30 % of the view height
const RATIO = 0.3;
const dropMarkers = (b, markers) => b.filter((x) => !markers.some((m) => x.includes(m + ' ')));
const range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => m3(from + i));

// External changes; ref = marker that must stay at the same height, caret = marker expected on the caret line
const changes = [
	{ name: 'edit far below', ref: m3(60), caret: m3(60), change: (b) => b.map((x) => (x.includes(m3(110) + ' ') ? x.replace('enough extra words', 'CHANGED words') : x)) },
	{ name: 'insert 10 paragraphs at top', ref: m3(60), caret: m3(60), change: (b) => [b[0], ...Array.from({ length: 10 }, (_, i) => `Inserted paragraph x${String(i + 1).padStart(2, '0')} at the top.`), ...b.slice(1)] },
	{ name: 'delete 10 paragraphs above', ref: m3(60), caret: m3(60), change: (b) => dropMarkers(b, range(40, 49)) },
	{ name: 'modify target paragraph', ref: m3(60), caret: m3(60), change: (b) => b.map((x) => (x.includes(m3(TARGET) + ' ') ? x + ' Appended sentence one. Appended sentence two that wraps the paragraph onto more lines in most window sizes.' : x)) },
	{ name: 'delete target + 2 below', ref: m3(59), caret: m3(59), change: (b) => dropMarkers(b, range(60, 62)) },
	{ name: 'delete target + 5 above', ref: m3(54), caret: m3(54), change: (b) => dropMarkers(b, range(55, 60)) },
	{ name: 'add heading above target', ref: m3(57), caret: m3(60), change: (b) => b.flatMap((x) => (x.includes(m3(TARGET - 3) + ' ') ? [x, '## New heading pNEW'] : [x])), toc: { added: ['New heading pNEW'] } },
	{ name: 'rename heading p04', ref: m3(60), caret: m3(60), change: (b) => b.map((x) => (x === '## Part p04' ? '## Part p04 renamed' : x)), toc: { added: ['Part p04 renamed'], removed: ['Part p04'] } },
	{ name: 'delete heading p04', ref: m3(60), caret: m3(60), change: (b) => b.filter((x) => x !== '## Part p04'), toc: { removed: ['Part p04'] } },
];
const tocOk = (spec, before, after) => {
	const added = after.filter((x) => !before.includes(x));
	const removed = before.filter((x) => !after.includes(x));
	return JSON.stringify(added) === JSON.stringify(spec?.added ?? []) && JSON.stringify(removed) === JSON.stringify(spec?.removed ?? []);
};
const ratioIn = async (root, word, viewFn) => {
	const w = await evaluate(`__t.wordRect(${root}, ${JSON.stringify(word)})`);
	return w ? evaluate(`__t.ratio(${w.y}, ${viewFn})`) : null;
};

const setZoom = (zoom) => s.setZoom(zoom, 700);

try {
	await waitFor(`!!document.querySelector('article.markdown-body p')`, 'preview rendered');
	await sleep(800);
	await inject();
	if (!(await evaluate(`document.querySelectorAll('.toc-list .toc-link').length > 0`))) {
		await evaluate(`document.querySelector('.toc-toggle-floating')?.click()`);
		await waitFor(`document.querySelectorAll('.toc-list .toc-link').length > 0`, 'toc visible', 5000);
	}

	for (const zoom of [100, 200]) {
		await setZoom(zoom);
		const scale = zoom / 100;

		// ---------------- view mode ----------------
		for (const c of changes) {
			write(baseBlocks());
			await sleep(1500);
			await placeInPreview(m3(TARGET), RATIO);
			await sleep(300);
			let ref = c.ref;
			let refBefore = await ratioIn(article, ref, '__t.view()');
			const isDeletion = c.name.startsWith('delete');
			// an off-screen reference says nothing when nothing in view was deleted: then the paragraph
			// at the reload anchor line (60 preview px below the top, as capturePreviewAnchor uses) is
			// the one that must stay put
			if ((refBefore === null || refBefore < 0) && !isDeletion) {
				const v0 = await evaluate(`__t.view()`);
				const firstVisible = await evaluate(`__t.markerAt(${v0.top + 60 * scale + 1})`);
				if (firstVisible?.marker?.startsWith('r')) {
					ref = firstVisible.marker;
					refBefore = await ratioIn(article, ref, '__t.view()');
				}
			}
			const tocBefore = await evaluate(`__t.toc()`);
			write(c.change(baseBlocks()));
			await sleep(1800);
			const refAfter = await ratioIn(article, ref, '__t.view()');
			// a reference line that was scrolled off above the view moves to the top offset when the
			// lines below it (the anchor) were deleted; a visible one must stay where it was
			const vh = (await evaluate(`__t.view()`)).h;
			const expected = refBefore !== null && refBefore >= 0 ? refBefore : Math.round(((60 * scale) / vh) * 100) / 100;
			check({ zoom, mode: 'view', change: c.name, ref, before: refBefore, expected, after: refAfter }, { position: near(expected, refAfter, refBefore !== null && refBefore >= 0 ? TOL : 0.05), toc: tocOk(c.toc, tocBefore, await evaluate(`__t.toc()`)) });
		}

		// view mode: the paragraphs at the very top of the view are deleted -> the line above lands at the top
		write(baseBlocks());
		await sleep(1500);
		await placeInPreview(m3(TARGET), RATIO);
		await sleep(300);
		const v = await evaluate(`__t.view()`);
		// the paragraph cut by the top edge of the view: deleting it and everything down to the target
		// certainly removes the element the reload anchors on
		const top = await evaluate(`__t.markerAt(${v.top + 1})`);
		const topNo = top && top.marker.startsWith('r') ? Number(top.marker.slice(1)) : null;
		if (topNo) {
			write(dropMarkers(baseBlocks(), range(topNo, TARGET)));
			await sleep(1800);
			const above = m3(topNo - 1);
			const aboveRatio = await ratioIn(article, above, '__t.view()');
			const expected = Math.round(((60 * scale) / v.h) * 100) / 100;
			check({ zoom, mode: 'view', change: `delete top of view (${top.marker}..${m3(TARGET)})`, ref: above, expected, after: aboveRatio }, { lineAboveAtTop: near(aboveRatio, expected, 0.05) });
		} else {
			check({ zoom, mode: 'view', change: 'delete top of view', note: 'no paragraph at the top' }, { setup: false });
		}

		// view mode: a selection survives a reload (also when lines shift above it)
		for (const c of [changes[0], changes[1]]) {
			write(baseBlocks());
			await sleep(1500);
			await placeInPreview(m3(TARGET), RATIO);
			const w = await evaluate(`__t.wordRect(${article}, '${m3(TARGET)}')`);
			await mouse(w.x + w.w / 2, w.y + w.h / 2, 2);
			const selBefore = await evaluate(`getSelection().toString().trim()`);
			const selRatioBefore = await evaluate(`(() => { const s = getSelection(); if (!s.rangeCount || !s.toString().trim()) return null; return __t.ratio(s.getRangeAt(0).getClientRects()[0].y, __t.view()); })()`);
			write(c.change(baseBlocks()));
			await sleep(1800);
			const selAfter = await evaluate(`getSelection().toString().trim()`);
			const selRatio = await evaluate(`(() => { const s = getSelection(); if (!s.rangeCount || !s.toString().trim()) return null; return __t.ratio(s.getRangeAt(0).getClientRects()[0].y, __t.view()); })()`);
			check({ zoom, mode: 'view', change: `${c.name} (with selection)`, selBefore, selAfter, before: selRatioBefore, after: selRatio }, { selectionKept: selBefore === m3(TARGET) && selAfter === m3(TARGET), position: near(selRatio, selRatioBefore) });
		}

		// ---------------- edit mode ----------------
		write(baseBlocks());
		await sleep(1500);
		await key('e', 'KeyE', 69);
		await waitFor(`!!document.querySelector('.monaco-editor .view-lines')`, 'editor');
		await sleep(800);
		for (const c of changes) {
			write(baseBlocks());
			await sleep(1500);
			await placeInEditor(m3(TARGET), RATIO);
			const w = await evaluate(`__t.wordRect(${viewLines}, '${m3(TARGET)}')`);
			if (!w) { check({ zoom, mode: 'edit', change: c.name }, { targetFound: false }); continue; }
			await mouse(w.x + w.w / 2, w.y + w.h / 2, 1);
			const refBefore = await ratioIn(viewLines, c.ref, '__t.edView()');
			const tocBefore = await evaluate(`__t.toc()`);
			write(c.change(baseBlocks()));
			await sleep(1800);
			const caret = await evaluate(`__t.caretLine()`);
			const refAfter = await ratioIn(viewLines, c.ref, '__t.edView()');
			const caretText = caret?.text ?? '';
			// a deleted caret line moves to the nearest line above: the reference line or the blank line after it
			const caretOk = caretText.includes(c.caret) || (c.caret === c.ref && caretText.trim() === '' && near(caret?.ratio, refAfter, 0.08));
			check({ zoom, mode: 'edit', change: c.name, ref: c.ref, before: refBefore, after: refAfter, caretLine: caretText.trim().slice(0, 24) || '(blank)' }, {
				position: near(refBefore, refAfter),
				caret: caretOk,
				toc: tocOk(c.toc, tocBefore, await evaluate(`__t.toc()`)),
			});
		}
		await key('e', 'KeyE', 69);
		await waitFor(`!document.querySelector('.monaco-editor .view-lines')`, 'back to view');
		await sleep(800);
	}
} catch (e) {
	console.log('ERROR', e.message);
	failures++;
} finally {
	fs.writeFileSync(path.join(suite.logs, 'reload-results.json'), JSON.stringify(results, null, 1));
	console.log(s.errors.length ? 'page errors:\n  ' + s.errors.join('\n  ') : 'no page errors');
	console.log(`${results.filter((r) => r.ok).length}/${results.length} cases passed`);
	if (failures || s.errors.length) process.exitCode = 1;
	await s.close();
}
