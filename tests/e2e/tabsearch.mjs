// End-to-end test: every tab keeps its own preview search (query, current match, highlight) and
// reading position across tab switches. Debug build, isolated WebView2 profile, own fixture files.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { launch, prepareSuite, sleep, createReport } from './lib.mjs';

const suite = prepareSuite('tabsearch');
const PORT = 9338;
const NL = '\r\n';

// Long documents with sections; the keyword of each file sits deep inside a section, three times
function doc(name, keyword, at, links = '') {
	const blocks = [`# Document ${name}`];
	if (links) blocks.push(links);
	for (let i = 1; i <= 140; i++) {
		if (i % 10 === 1) blocks.push(`## Section ${name}${Math.ceil(i / 10)}`);
		const hit = at.includes(i) ? ` The ${keyword} is mentioned here.` : '';
		blocks.push(`Paragraph ${i} of ${name} with enough extra words to make the line a realistic length.${hit}`);
	}
	return blocks.join(NL + NL) + NL;
}
const FILES = [
	{ file: 'alpha.md', keyword: 'kiwiword', at: [23, 57, 98], step: 1 }, // 2nd match
	{ file: 'beta.md', keyword: 'mangoword', at: [44, 81, 120], step: 2 }, // 3rd match
	{ file: 'gamma.md', keyword: 'plumword', at: [12, 66, 133], step: 0 }, // 1st match, then scrolled by hand
	{ file: 'delta.md', keyword: '', at: [], step: 0 }, // no search: bar must stay closed here
];
// the app opens only the first command-line file; the others are opened through links in alpha.md
const LINKS = FILES.slice(1).map((f) => `[${f.file}](${f.file})`).join(' ');
for (const [i, f] of FILES.entries()) fs.writeFileSync(path.join(suite.fixture, f.file), doc(f.file[0].toUpperCase(), f.keyword || 'none', f.at, i === 0 ? LINKS : ''));

const report = createReport();
const ok = (name) => report.ok(name);
const s = await launch({ suite, port: PORT, args: [path.join(suite.fixture, FILES[0].file)] });
const { evaluate, send, key, wheel } = s;
const waitFor = (expr, what, ms = 15000) => s.waitFor(expr, what, ms);

const article = `document.querySelector('article.markdown-body')`;
const activeLabel = () => evaluate(`document.querySelector('.tab.active .tab-label')?.innerText.trim() || ''`);
async function activate(file) {
	const done = await evaluate(`(() => { const t = Array.from(document.querySelectorAll('.tab')).find(t => t.querySelector('.tab-label')?.innerText.trim() === ${JSON.stringify(file)}); if (!t) return false; (t.querySelector('.tab-content-btn') || t).click(); return true; })()`);
	if (!done) throw new Error('tab not found: ' + file);
	await waitFor(`document.querySelector('.tab.active .tab-label')?.innerText.trim() === ${JSON.stringify(file)}`, 'tab ' + file);
	await sleep(900); // restore + rich render + pin
}
// What the reader sees: search bar, query, counter, the active mark and where it is on screen
const snapshot = () => evaluate(`(() => {
	const a = ${article};
	const bar = document.querySelector('.preview-search-bar');
	const mark = a.querySelector('mark.preview-search-active');
	const v = a.getBoundingClientRect();
	const r = mark ? mark.getBoundingClientRect() : null;
	return {
		open: !!bar,
		query: bar ? document.querySelector('.preview-search-input').value : null,
		count: bar ? document.querySelector('.preview-search-count').innerText.trim() : null,
		marks: a.querySelectorAll('mark.preview-search-highlight').length,
		activeText: mark ? mark.closest('p')?.textContent.match(/Paragraph (\\d+)/)?.[1] : null,
		activeY: r ? Math.round(r.top - v.top) : null,
		scrollTop: Math.round(a.scrollTop),
	};
})()`);

const recorded = {};
try {
	await waitFor(`${article}?.innerText.includes('Paragraph 140')`, 'alpha.md rendered');
	for (const f of FILES.slice(1)) {
		await activate(FILES[0].file);
		await evaluate(`${article}.scrollTop = 0`);
		await sleep(200);
		const at = await evaluate(`(() => { const l = Array.from(${article}.querySelectorAll('a')).find(a => a.textContent.trim() === ${JSON.stringify(f.file)}); const r = l.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
		await s.mouse(at.x, at.y);
		await waitFor(`document.querySelector('.tab.active .tab-label')?.innerText.trim() === ${JSON.stringify(f.file)}`, 'opened ' + f.file);
	}
	await waitFor(`document.querySelectorAll('.tab').length === ${FILES.length}`, 'all tabs open');
	await s.assertOnlyFixtureTabs();

	// 1. search in each document and go to a different match in each
	for (const f of FILES) {
		await activate(f.file);
		if (f.keyword) {
			await key('f', 'KeyF', 70);
			await waitFor(`!!document.querySelector('.preview-search-input')`, 'search bar');
			await sleep(200);
			await send('Input.insertText', { text: f.keyword });
			await waitFor(`${article}.querySelectorAll('mark.preview-search-highlight').length === 3`, 'three matches in ' + f.file);
			// right after a search the first match is still scrolling into view; let it settle so
			// Enter is not raced by the reload/pin that follows the opening of the bar
			await sleep(400);
			for (let i = 0; i < f.step; i++) { await key('Enter', 'Enter', 13, 0); await sleep(150); }
			await sleep(900); // smooth scroll
			if (f.file === 'gamma.md') {
				// read on a bit below the match: the hand-scrolled position is what must come back
				const v = await evaluate(`(() => { const r = ${article}.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
				await wheel(v.x, v.y, 240);
				await sleep(600);
			}
		}
		recorded[f.file] = await snapshot();
		console.log('  info', f.file, JSON.stringify(recorded[f.file]));
	}
	assert.equal(recorded['alpha.md'].activeText, '57', 'alpha on its 2nd match');
	assert.equal(recorded['beta.md'].activeText, '120', 'beta on its 3rd match');
	assert.equal(recorded['gamma.md'].activeText, '12', 'gamma on its 1st match');
	assert.equal(recorded['delta.md'].open, false, 'delta has no search');
	ok('a different search and match set up in three tabs');

	// 2. switch around several times; each tab comes back exactly as it was left
	const order = ['alpha.md', 'gamma.md', 'beta.md', 'delta.md', 'alpha.md', 'beta.md', 'gamma.md', 'alpha.md', 'delta.md', 'gamma.md', 'beta.md'];
	for (const file of order) {
		await activate(file);
		const now = await snapshot();
		const was = recorded[file];
		assert.equal(now.open, was.open, `${file}: search bar open state`);
		assert.equal(now.query, was.query, `${file}: query kept`);
		assert.equal(now.count, was.count, `${file}: counter kept (${now.count} vs ${was.count})`);
		assert.equal(now.activeText, was.activeText, `${file}: same active match`);
		if (was.open) assert.equal(now.marks, 3, `${file}: all matches highlighted again`);
		assert.ok(Math.abs(now.scrollTop - was.scrollTop) <= 3, `${file}: reading position kept (scrollTop ${now.scrollTop} vs ${was.scrollTop})`);
		if (was.activeY !== null) assert.ok(Math.abs(now.activeY - was.activeY) <= 3, `${file}: match at the same place on screen (${now.activeY} vs ${was.activeY})`);
	}
	ok(`${order.length} tab switches: each tab keeps its query, current match, highlights and scroll position`);

	// 3. navigation (F3; the preview has the focus after a switch) continues from the kept match
	// and does not touch the other tabs
	await activate('alpha.md');
	await key('F3', 'F3', 114, 0);
	await waitFor(`document.querySelector('.preview-search-count')?.innerText.trim() === '3 / 3'`, 'alpha next match');
	await sleep(900);
	recorded['alpha.md'] = await snapshot();
	assert.equal(recorded['alpha.md'].activeText, '98');
	await activate('beta.md');
	assert.equal((await snapshot()).activeText, '120', 'beta untouched by alpha navigation');
	await activate('alpha.md');
	assert.equal((await snapshot()).activeText, '98', 'alpha keeps its new match');
	ok('F3 continues from the kept match; other tabs are unaffected');

	// 4. Esc closes the search only in that tab
	await key('Escape', 'Escape', 27, 0);
	await sleep(300);
	assert.equal((await snapshot()).open, false);
	await activate('beta.md');
	assert.equal((await snapshot()).open, true, 'beta search still open');
	await activate('alpha.md');
	assert.equal((await snapshot()).open, false, 'alpha search stays closed');
	ok('closing the search in one tab leaves the others open');

	assert.equal(s.exited, false);
	assert.deepEqual(s.allErrors(), []);
	ok('app still running, no console errors');
} catch (e) {
	console.log('  FAIL', e.message);
	process.exitCode = 1;
} finally {
	await report.finish(s);
}
