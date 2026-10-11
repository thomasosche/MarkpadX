// Unit tests for the old -> new line mapping used to keep caret / selection / viewed lines on reload.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapLines } from '../src/lib/utils/linemap.ts';

const doc = (n, prefix = 'line') => Array.from({ length: n }, (_, i) => `${prefix} ${i + 1}`);
const join = (lines, nl = '\n') => lines.join(nl);

test('unchanged text maps every line to itself', () => {
	const a = join(doc(50));
	const m = mapLines(a, a);
	for (let i = 1; i <= 50; i++) {
		assert.equal(m.line(i), i);
		assert.equal(m.kept(i), true);
	}
});

test('lines inserted above shift the mapping down', () => {
	const a = doc(50);
	const b = [...a.slice(0, 5), 'new A', 'new B', 'new C', ...a.slice(5)];
	const m = mapLines(join(a), join(b));
	assert.equal(m.line(3), 3);
	assert.equal(m.line(6), 9);
	assert.equal(m.line(50), 53);
});

test('lines deleted above shift the mapping up', () => {
	const a = doc(50);
	const b = [...a.slice(0, 10), ...a.slice(20)];
	const m = mapLines(join(a), join(b));
	assert.equal(m.line(5), 5);
	assert.equal(m.line(25), 15);
});

test('a deleted line maps to the nearest kept line above it', () => {
	const a = doc(50);
	const b = [...a.slice(0, 29), ...a.slice(33)]; // delete lines 30..33
	const m = mapLines(join(a), join(b));
	assert.equal(m.kept(31), false);
	assert.equal(m.line(31), 29); // line 29 is the nearest line above that survived
	assert.equal(m.line(34), 30);
});

test('deleting from the very top maps to line 1', () => {
	const a = doc(10);
	const m = mapLines(join(a), join(a.slice(3)));
	assert.equal(m.line(2), 1);
	assert.equal(m.kept(2), false);
	assert.equal(m.line(4), 1);
});

test('a line changed in place keeps its position (status modified)', () => {
	const a = doc(20);
	const b = a.map((l, i) => (i === 9 ? 'line 10 CHANGED' : l));
	const m = mapLines(join(a), join(b));
	assert.equal(m.kept(10), false);
	assert.equal(m.status(10), 'modified');
	assert.equal(m.line(10), 10);
	assert.equal(m.status(11), 'kept');
	assert.equal(m.line(11), 11);
});

test('a block replaced by a different number of lines counts as deleted', () => {
	const a = doc(20);
	const b = [...a.slice(0, 9), 'new x', 'new y', 'new z', ...a.slice(11)]; // lines 10-11 -> 3 new lines
	const m = mapLines(join(a), join(b));
	assert.equal(m.status(10), 'deleted');
	assert.equal(m.line(10), 9);
	assert.equal(m.line(12), 13);
});

test('several separate changes are all mapped (not just one block)', () => {
	const a = doc(100);
	const b = [...a.slice(0, 10), 'ins 1', ...a.slice(10, 40), ...a.slice(45, 80), 'ins 2', 'ins 3', ...a.slice(80)];
	const m = mapLines(join(a), join(b));
	assert.equal(m.line(20), 21); // after one insert
	assert.equal(m.line(50), 46); // after +1 and -5
	assert.equal(m.line(43), 41); // deleted (41..45) -> old line 40 survived above; it moved to 41
	assert.equal(m.line(90), 88); // +1 -5 +2
});

test('CRLF and LF texts compare by content', () => {
	const a = doc(10);
	const m = mapLines(join(a, '\r\n'), join(['x', ...a], '\n'));
	assert.equal(m.line(1), 2);
	assert.equal(m.kept(10), true);
});

test('empty texts and out-of-range lines are safe', () => {
	assert.equal(mapLines('', '').line(1), 1);
	assert.equal(mapLines('a\nb', '').line(2), 1);
	assert.equal(mapLines('a\nb', 'a\nb').line(99), 2);
	assert.equal(mapLines('a\nb', 'a\nb').line(0), 1);
});

test('very large rewrites fall back to "changed middle" without hanging', () => {
	const a = doc(6000, 'old');
	const b = doc(6000, 'new');
	const t0 = Date.now();
	const m = mapLines(join(['head', ...a, 'tail']), join(['head', ...b, 'tail']));
	assert.ok(Date.now() - t0 < 2000, 'fast');
	assert.equal(m.line(1), 1);
	assert.equal(m.status(3000), 'modified'); // same number of lines replaced: mapped in place
	assert.equal(m.line(3000), 3000);
	assert.equal(m.line(6002), 6002); // "tail"
});
