// End-to-end test: view-mode task checkbox toggle + save in the real MarkpadX debug build via WebView2 CDP.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { launch, prepareSuite, sleep, createReport } from './lib.mjs';

const suite = prepareSuite('main');
const FILE = path.join(suite.fixture, 'tasks-e2e.md');
const PORT = 9333;
const ORIGINAL = [
	'# Task test', '', '- [ ] one', '- [x] two', '  - [ ] nested', '', '1. [ ] ordered', '',
	'> - [ ] quoted', '', '```md', '- [ ] fake in code', '```', '', '- [ ] after code', '- [ ]tight is not a task', '', 'Para.', '', '    - [ ] indented code is not a task', '', '[other](other.md)', '',
].join('\r\n');
fs.writeFileSync(FILE, ORIGINAL);
const OTHER = path.join(suite.fixture, 'other.md');
fs.writeFileSync(OTHER, '- [ ] other task\r\n');

const disk = () => fs.readFileSync(FILE, 'utf8');
const lineOf = (txt, needle) => txt.split('\r\n').find((l) => l.includes(needle));
const report = createReport();
const ok = (name) => report.ok(name);

const s = await launch({ suite, port: PORT, args: [FILE] });
const { evaluate, send, key } = s;
const waitFor = (expr, what, ms = 15000) => s.waitFor(expr, what, ms);
const clickDialog = s.clickDialog;
const assertOnlyTestTabs = s.assertOnlyFixtureTabs;
const dialogsChecked = () => s.dialogsChecked;
const boxes = `Array.from(document.querySelectorAll('article.markdown-body [data-task-checkbox]'))`;
const states = () => evaluate(`${boxes}.map(b => b.checked)`);
const click = async (i) => {
	const rect = await evaluate(`(() => { const b = ${boxes}[${i}]; b.scrollIntoView({block:'center'}); const r = b.getBoundingClientRect(); return {x: r.x + r.width/2, y: r.y + r.height/2}; })()`);
	for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: rect.x, y: rect.y, button: 'left', clickCount: 1 });
	await sleep(150);
};
const save = async () => { await key('s', 'KeyS', 83); await sleep(600); };

try {
	await waitFor(`${boxes}.length > 0`, 'checkboxes rendered');
	await sleep(500);
	await assertOnlyTestTabs();

	// 0. DOM checkbox count equals the markers the raw-markdown scanner finds (6 real tasks)
	assert.deepEqual(await states(), [false, true, false, false, false, false]);
	ok('6 rendered tasks (fenced + indented code and "[ ]tight" excluded)');

	// 1. check "one": box checked, file NOT auto-saved
	await click(0);
	assert.deepEqual((await states())[0], true);
	assert.equal(disk(), ORIGINAL);
	ok('check in view mode toggles box, file not yet written');

	// 2. Ctrl+S saves in view mode
	await save();
	assert.equal(lineOf(disk(), 'one'), '- [x] one');
	ok('Ctrl+S in view mode saves the check');

	// 3. uncheck + save restores file byte-for-byte
	await click(0);
	assert.equal((await states())[0], false);
	await save();
	assert.equal(disk(), ORIGINAL);
	ok('uncheck + save restores original file exactly (CRLF kept)');

	// 4. uncheck an initially checked one, nested, ordered, quoted, after-code
	for (const i of [1, 2, 3, 4, 5]) await click(i);
	assert.deepEqual(await states(), [false, false, true, true, true, true]);
	await save();
	const d = disk();
	assert.equal(lineOf(d, 'two'), '- [ ] two');
	assert.equal(lineOf(d, 'nested'), '  - [x] nested');
	assert.equal(lineOf(d, 'ordered'), '1. [x] ordered');
	assert.equal(lineOf(d, 'quoted'), '> - [x] quoted');
	assert.equal(lineOf(d, 'after code'), '- [x] after code');
	assert.equal(lineOf(d, 'fake in code'), '- [ ] fake in code');
	assert.equal(lineOf(d, 'tight'), '- [ ]tight is not a task');
	ok('nested / ordered / quoted / after-code toggled correctly, code block untouched');

	// 5. rapid clicks: same box 3x quickly + save -> net toggled once
	const before = (await states())[0];
	const rect = await evaluate(`(() => { const r = ${boxes}[0].getBoundingClientRect(); return {x: r.x + r.width/2, y: r.y + r.height/2}; })()`);
	for (let n = 0; n < 3; n++) for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: rect.x, y: rect.y, button: 'left', clickCount: 1 });
	await sleep(400);
	assert.equal((await states())[0], !before);
	await save();
	assert.equal(lineOf(disk(), 'one'), `- [${!before ? 'x' : ' '}] one`);
	ok('3 rapid clicks -> DOM and file consistent');

	// leave edit mode: the app asks Cancel / Discard / Save when there are unsaved changes
	const leaveEdit = async (button) => {
		await key('e', 'KeyE', 69);
		await waitFor(`!!document.querySelector('.modal-btn')`, 'unsaved-changes dialog', 5000);
		await clickDialog(button);
		await waitFor(`!document.querySelector('.monaco-editor .view-lines')`, 'editor gone');
		await waitFor(`${boxes}.length === 6`, 'view mode again');
		await sleep(800);
	};
	const editorShows = async (re) => {
		await key('e', 'KeyE', 69);
		await waitFor(`!!document.querySelector('.monaco-editor .view-lines')`, 'editor');
		await sleep(800);
		const txt = (await evaluate(`document.querySelector('.monaco-editor .view-lines').innerText`)).replace(/ /g, ' ');
		assert.ok(re.test(txt), 'editor text: ' + txt.slice(0, 120));
	};
	const tabDirty = () => evaluate(`(() => { const d = document.querySelector('.tab.active .dirty-dot'); if (!d) return false; const r = d.getBoundingClientRect(); return r.width > 0 && getComputedStyle(d).visibility !== 'hidden' && getComputedStyle(d).opacity !== '0'; })()`);

	// 5b. unsaved marker in tab follows dirty state
	assert.equal(await tabDirty(), false, 'no marker initially');
	await click(0);
	assert.equal(await tabDirty(), true, 'tab shows visible unsaved marker');
	await click(0);
	assert.equal(await tabDirty(), false, 'toggling back to saved state clears the marker');
	await click(0);
	await save();
	assert.equal(await tabDirty(), false, 'marker cleared after save');
	await click(0);
	await save();
	ok('tab unsaved marker appears on toggle and clears on save / revert');

	// 6. toggle in view, open editor: unsaved change visible; leave with Save -> written to disk
	assert.equal((await states())[0], true);
	await click(0); // uncheck, unsaved
	await editorShows(/\[ \]\s*one/);
	await leaveEdit('Speichern');
	assert.equal(lineOf(disk(), 'one'), '- [ ] one');
	assert.equal((await states())[0], false);
	ok('unsaved view toggle shows in editor and is saved via the Save dialog');

	// 7. toggle in view, open editor, leave with Discard -> disk and view unchanged
	await click(0); // check, unsaved
	await editorShows(/\[x\]\s*one/);
	await leaveEdit('Verwerfen');
	assert.equal(lineOf(disk(), 'one'), '- [ ] one');
	assert.equal((await states())[0], false);
	ok('Discard drops the unsaved toggle, view matches disk');

	// 8. view toggle stays after reopening edit mode only after a real save: toggle + save + check again
	await click(0);
	await save();
	assert.equal(lineOf(disk(), 'one'), '- [x] one');
	await click(0);
	await save();
	assert.equal(lineOf(disk(), 'one'), '- [ ] one');
	ok('check/save/uncheck/save still works after mode switches');

	// 9. tab dot is in front of the name and stays visible while hovering the tab
	await click(0);
	const dot = await evaluate(`(() => { const d = document.querySelector('.tab.active .tab-content-btn .dirty-dot'); if (!d) return null; const label = d.parentElement.querySelector('.tab-label'); return { before: !!(d.compareDocumentPosition(label) & Node.DOCUMENT_POSITION_FOLLOWING), visible: d.getBoundingClientRect().width > 0 }; })()`);
	assert.deepEqual(dot, { before: true, visible: true });
	const tabRect = await evaluate(`(() => { const r = document.querySelector('.tab.active').getBoundingClientRect(); return { x: r.x + 20, y: r.y + r.height / 2 }; })()`);
	await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: tabRect.x, y: tabRect.y });
	await sleep(200);
	assert.equal(await tabDirty(), true, 'dot still visible on hover');
	await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 400 });
	ok('unsaved dot sits in front of the tab name and stays visible on hover');

	// 9b. Ctrl+F with unsaved toggles must not claim the file changed on disk
	const changedToasts = () => evaluate(`Array.from(document.querySelectorAll('.toast-container > *')).filter(t => /changed on disk|extern geändert/i.test(t.innerText)).length`);
	await waitFor(`Array.from(document.querySelectorAll('.toast-container > *')).filter(t => /changed on disk|extern geändert/i.test(t.innerText)).length === 0`, 'old notices gone', 15000);
	await key('f', 'KeyF', 70);
	await sleep(1000);
	assert.equal(await changedToasts(), 0, 'no "changed on disk" notice after Ctrl+F');
	assert.equal((await states())[0], true, 'unsaved toggle kept after Ctrl+F');
	assert.equal(await tabDirty(), true);
	await key('Escape', 'Escape', 27, 0);
	await sleep(300);
	ok('Ctrl+F with unsaved toggle: no false "changed on disk" notice, toggle kept');

	// 10. R1: external change while dirty -> toggle kept, notice shown; Ctrl+S writes our content
	const savedBefore = disk();
	fs.writeFileSync(FILE, savedBefore + 'external line\r\n');
	await sleep(1500);
	assert.equal((await states())[0], true, 'unsaved toggle kept after external change');
	assert.equal(await tabDirty(), true, 'still dirty after external change');
	assert.ok(await evaluate(`(document.querySelector('.toast-container')?.innerText || '').length > 0`), 'notice toast shown');
	await save();
	assert.equal(lineOf(disk(), 'one'), '- [x] one');
	ok('live reload keeps unsaved toggle, shows notice; Ctrl+S saves it');

	// 11. R1: F5 while dirty asks first; Discard reloads from disk
	await click(0); // unchecked, unsaved
	await key('F5', 'F5', 116, 0);
	await waitFor(`!!document.querySelector('.modal-btn')`, 'reload dialog', 5000);
	await clickDialog('Verwerfen');
	await sleep(1200);
	assert.equal((await states())[0], true, 'view shows disk state after discard');
	assert.equal(await tabDirty(), false);
	assert.equal(lineOf(disk(), 'one'), '- [x] one');
	ok('F5 with unsaved toggle asks; Discard reloads disk state');

	// 11b. R5: external change on a clean tab -> view follows the disk (single read + render path)
	assert.equal(await tabDirty(), false);
	fs.writeFileSync(FILE, disk().replace('- [x] one', '- [ ] one'));
	await waitFor(`${boxes}[0] && ${boxes}[0].checked === false`, 'view follows external uncheck', 5000);
	assert.equal(await tabDirty(), false);
	ok('live reload of a clean tab renders the new file content');

	// 11c. R6: save via temp file + rename (as many editors do) -> live reload keeps working afterwards
	const tmp = FILE + '.tmp';
	fs.writeFileSync(tmp, disk().replace('- [ ] one', '- [x] one'));
	fs.renameSync(tmp, FILE);
	await waitFor(`${boxes}[0] && ${boxes}[0].checked === true`, 'view follows rename-save', 5000);
	await sleep(800);
	fs.writeFileSync(FILE, disk().replace('- [x] one', '- [ ] one'));
	await waitFor(`${boxes}[0] && ${boxes}[0].checked === false`, 'view follows the next plain save', 5000);
	fs.writeFileSync(FILE, disk().replace('- [ ] one', '- [x] one'));
	await waitFor(`${boxes}[0] && ${boxes}[0].checked === true`, 'view follows another save', 5000);
	assert.equal(await tabDirty(), false);
	ok('after a rename-save the watcher is re-armed: later saves still reload');

	// 11d. Edit mode: unsaved editor changes survive an external change; clean editor follows the file
	const editorText = () => evaluate(`(document.querySelector('.monaco-editor .view-lines')?.innerText || '').replace(/\\u00a0/g, ' ')`);
	await key('e', 'KeyE', 69);
	await waitFor(`!!document.querySelector('.monaco-editor .view-lines')`, 'editor');
	await sleep(800);
	await send('Input.insertText', { text: 'USERTYPED ' });
	await sleep(400);
	assert.ok((await editorText()).includes('USERTYPED'), 'typed text in editor');
	assert.equal(await tabDirty(), true, 'editor edit marks tab unsaved');
	const onDisk = disk();
	fs.writeFileSync(FILE, onDisk.replace('# Task test', '# Task test EXTERNAL'));
	await sleep(1800);
	assert.ok((await editorText()).includes('USERTYPED'), 'unsaved editor text kept after external change');
	assert.equal(await tabDirty(), true, 'still unsaved after external change');
	assert.ok(await evaluate(`Array.from(document.querySelectorAll('.toast-container > *')).some(t => /changed on disk|extern geändert/i.test(t.innerText))`), 'notice about the external change');
	await save();
	assert.ok(disk().includes('USERTYPED') && !disk().includes('EXTERNAL'), 'Ctrl+S writes the kept editor version');
	assert.equal(await tabDirty(), false);
	ok('edit mode: live reload keeps unsaved editor changes, shows notice; Ctrl+S saves them');

	fs.writeFileSync(FILE, disk().replace('USERTYPED ', ''));
	await waitFor(`!(document.querySelector('.monaco-editor .view-lines')?.innerText || '').includes('USERTYPED')`, 'clean editor follows external change', 5000);
	assert.equal(await tabDirty(), false);
	await key('e', 'KeyE', 69);
	await waitFor(`!document.querySelector('.monaco-editor .view-lines')`, 'back to view');
	await waitFor(`${boxes}.length === 6`, 'view rendered');
	await sleep(600);
	ok('edit mode: a clean editor still follows external changes');

	// 12. R3: indented code block makes scanner and renderer counts differ; sourcepos still maps exactly
	await click(5); // "after code"
	await save();
	assert.equal(lineOf(disk(), 'after code'), '- [ ] after code');
	assert.equal(lineOf(disk(), 'indented code'), '    - [ ] indented code is not a task');
	await click(5);
	await save();
	assert.equal(lineOf(disk(), 'after code'), '- [x] after code');
	ok('toggle maps by source line although an indented code block confuses counting');

	// 13. U5: Enter on a focused checkbox toggles it
	const st = (await states())[0];
	await evaluate(`${boxes}[0].focus()`);
	await key('Enter', 'Enter', 13, 0);
	await sleep(300);
	assert.equal((await states())[0], !st);
	await save();
	assert.equal(lineOf(disk(), 'one'), `- [${!st ? 'x' : ' '}] one`);
	ok('Enter on a focused checkbox toggles it');

	// 14. R2: Ctrl+Shift+W asks for a dirty other tab; Cancel keeps it, Save writes it and closes it
	await evaluate(`document.querySelector('article.markdown-body a[href="other.md"]').scrollIntoView({block:'center'})`);
	const linkRect = await evaluate(`(() => { const r = document.querySelector('article.markdown-body a[href="other.md"]').getBoundingClientRect(); return { x: r.x + 5, y: r.y + r.height / 2 }; })()`);
	for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: linkRect.x, y: linkRect.y, button: 'left', clickCount: 1 });
	await waitFor(`(document.querySelector('.tab.active .tab-label')?.innerText || '').includes('other')`, 'other tab active');
	await waitFor(`${boxes}.length === 1`, 'other tab rendered');
	await sleep(500);
	await click(0); // other tab now dirty
	const labels = () => evaluate(`Array.from(document.querySelectorAll('.tab .tab-label')).map(l => l.innerText.trim())`);
	const mainTab = (await labels()).findIndex((l) => l.includes('tasks-e2e'));
	await evaluate(`document.querySelectorAll('.tab .tab-content-btn')[${mainTab}].click()`);
	await waitFor(`(document.querySelector('.tab.active .tab-label')?.innerText || '').includes('tasks-e2e')`, 'main tab active');
	await sleep(500);
	await assertOnlyTestTabs();
	const closeOthers = () => key('W', 'KeyW', 87, 2 | 8);
	await closeOthers();
	await waitFor(`!!document.querySelector('.modal-btn')`, 'close-others dialog', 5000);
	await clickDialog('Abbrechen');
	await waitFor(`!document.querySelector('.modal-btn')`, 'dialog closed', 5000);
	await sleep(300);
	assert.ok((await labels()).some((l) => l.includes('other')), 'Cancel keeps the dirty tab');
	await evaluate(`window.__kd = 0; window.addEventListener('keydown', (e) => { if (e.key.toLowerCase() === 'w') window.__kd++; }, true)`);
	await closeOthers();
	await waitFor(`!!document.querySelector('.modal-btn')`, 'close-others dialog', 5000);
	console.log('  info: keydowns', await evaluate(`window.__kd`), 'dialog text:', await evaluate(`(document.querySelector('.modal-content')?.innerText || '').replace(/\\s+/g, ' ').slice(0, 200)`));
	await clickDialog('Speichern');
	await sleep(300);
	console.log('  info: after save click, dialog text:', await evaluate(`(document.querySelector('.modal-content')?.innerText || '(none)').replace(/\\s+/g, ' ').slice(0, 200)`));
	await sleep(700);
	console.log('  info: labels', JSON.stringify(await labels()), 'modal buttons', await evaluate(`Array.from(document.querySelectorAll('.modal-btn')).map(b => b.innerText.trim()).join('|')`), 'other.md', JSON.stringify(fs.readFileSync(OTHER, 'utf8')));
	assert.ok(!(await labels()).some((l) => l.includes('other')), 'Save closes the tab');
	assert.equal(fs.readFileSync(OTHER, 'utf8'), '- [x] other task\r\n', 'other.md saved with the toggle');
	assert.ok((await evaluate(`document.querySelector('.tab.active .tab-label').innerText`)).includes('tasks-e2e'), 'main tab active again');
	ok('Ctrl+Shift+W: Cancel keeps a dirty tab, Save writes the right file and closes it');

	assert.ok(dialogsChecked() >= 5, 'dialogs checked: ' + dialogsChecked());
	ok(`${dialogsChecked()} dialogs showed translated text (no raw keys)`);

	assert.equal(s.exited, false);
	ok('app still running');
} catch (e) {
	console.log('  FAIL', e.message);
	process.exitCode = 1;
} finally {
	await report.finish(s);
}
