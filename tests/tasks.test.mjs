// Unit tests for the task-checkbox source mapping. Run with `npm test` (Node >= 22.18, built-in
// test runner with TypeScript type stripping; no extra dependencies).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	findTaskMarkers,
	resolveTaskLine,
	setTaskMarkerOnLine,
	sourceposLine,
	taskMarkerOnLine,
} from '../src/lib/utils/tasks.ts';

const DOC = [
	'# Title', // 0
	'- [ ] one', // 1
	'* [x] two', // 2
	'  + [X] nested', // 3
	'1. [ ] ordered', // 4
	'2) [ ] ordered paren', // 5
	'> - [ ] quoted', // 6
	'```', // 7
	'- [ ] in backtick code', // 8
	'```', // 9
	'~~~~', // 10
	'- [ ] in tilde code', // 11
	'~~~', // 12  shorter closer: still code
	'- [ ] still code', // 13
	'~~~~', // 14
	'- [ ] after code', // 15
	'- not a task', // 16
	'-[ ] no space', // 17
	'- [ ]tight', // 18  GFM: marker must be followed by whitespace
	'- [ ]', // 19  marker at end of line
].join('\r\n');

test('findTaskMarkers: list kinds, blockquotes, fences, GFM whitespace rule', () => {
	const markers = findTaskMarkers(DOC);
	assert.deepEqual(
		markers.map((m) => m.line),
		[1, 2, 3, 4, 5, 6, 15, 19],
	);
	assert.deepEqual(
		markers.map((m) => m.checked),
		[false, true, true, false, false, false, false, false],
	);
});

test('setTaskMarkerOnLine: check / uncheck round trip keeps CRLF and other lines', () => {
	for (const m of findTaskMarkers(DOC)) {
		const flipped = setTaskMarkerOnLine(DOC, m.line, !m.checked);
		assert.equal(taskMarkerOnLine(flipped, m.line).checked, !m.checked);
		assert.equal(flipped.split('\r\n').length, DOC.split('\r\n').length);
		const back = setTaskMarkerOnLine(flipped, m.line, m.checked);
		if (m.checked) assert.equal(back.split('\r\n')[m.line].replace('[x]', '[X]'), DOC.split('\r\n')[m.line].replace('[x]', '[X]'));
		else assert.equal(back, DOC);
	}
	assert.ok(setTaskMarkerOnLine(DOC, 6, true).includes('> - [x] quoted'));
	assert.ok(setTaskMarkerOnLine(DOC, 19, true).endsWith('- [x]'));
});

test('setTaskMarkerOnLine: no-op when unchanged, null when the line is no task', () => {
	assert.equal(setTaskMarkerOnLine(DOC, 1, false), DOC);
	assert.equal(setTaskMarkerOnLine(DOC, 0, true), null);
	assert.equal(setTaskMarkerOnLine(DOC, 18, true), null);
	assert.equal(setTaskMarkerOnLine(DOC, 999, true), null);
});

test('sourceposLine parses comrak data-sourcepos', () => {
	assert.equal(sourceposLine('3:1-3:12'), 2);
	assert.equal(sourceposLine('12:5-14:1'), 11);
	assert.equal(sourceposLine(null), null);
	assert.equal(sourceposLine('garbage'), null);
});

test('resolveTaskLine: sourcepos wins, even when counting would be wrong', () => {
	// indented code block: the scanner counts it, the renderer does not
	const raw = ['Text', '', '    - [ ] indented code', '', '- [ ] real'].join('\n');
	assert.equal(findTaskMarkers(raw).length, 2);
	assert.equal(resolveTaskLine(raw, { index: 0, count: 1, sourceLine: 4, checked: false }), 4);
});

test('resolveTaskLine: falls back to the n-th marker only when counts agree', () => {
	assert.equal(resolveTaskLine(DOC, { index: 6, count: 8, sourceLine: null, checked: false }), 15);
	assert.equal(resolveTaskLine(DOC, { index: 6, count: 9, sourceLine: null, checked: false }), null);
});

test('resolveTaskLine: refuses when the line state does not match the checkbox', () => {
	// line 2 is checked in the source; a checkbox that showed "unchecked" does not belong to it
	assert.equal(resolveTaskLine(DOC, { index: 1, count: 99, sourceLine: 2, checked: false }), null);
	// shifted sourcepos (points at a non-task line) and no usable count -> refuse
	assert.equal(resolveTaskLine(DOC, { index: 0, count: 99, sourceLine: 0, checked: false }), null);
	// shifted sourcepos but counts agree -> n-th marker is used
	assert.equal(resolveTaskLine(DOC, { index: 0, count: 8, sourceLine: 0, checked: false }), 1);
});
