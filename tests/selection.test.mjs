import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findSourceText, sourceTextWithMap, sourceToPlain, byteColToIndex, indexToByteCol } from '../src/lib/utils/selection.ts';

test('maps plain and Markdown-formatted phrases without changing source', () => {
	for (const source of ['Product meets validation', 'Product **meets** validation']) {
		const hits = findSourceText(source, 'Product meets validation');
		assert.equal(hits.length, 1);
		assert.equal(hits[0].start, 0);
		assert.equal(hits[0].end, source.length);
	}
});

test('maps HTML formatting, quoted attributes, and decoded entities', () => {
	const source = '<td title="Product > fake">Product&nbsp;<strong>meets</strong> validation &amp; safety &#8805; 5</td>';
	const [hit] = findSourceText(source, 'Product meets validation & safety ≥ 5');
	assert.equal(hit.start, source.indexOf('Product&nbsp;'));
	assert.equal(source.slice(hit.start, hit.end), 'Product&nbsp;<strong>meets</strong> validation &amp; safety &#8805; 5');
	assert.equal(findSourceText(source, 'fake').length, 0);
});

test('retains distinct offsets for repeated phrases in separate table cells', () => {
	const source = '<table><tr><td>Pass</td><td>Pass</td></tr></table>';
	const hits = findSourceText(source, 'Pass');
	assert.equal(hits.length, 2);
	assert.ok(hits[1].start > hits[0].end);
	assert.deepEqual(hits.map(h => source.slice(h.start, h.end)), ['Pass', 'Pass']);
});

test('handles multiline text, CRLF, Unicode and complete entity boundaries', () => {
	const source = '<td>α 🧪\r\n<strong>result</strong> &#x1F600;</td>';
	const [hit] = findSourceText(source, 'α 🧪 result 😀');
	assert.equal(source.slice(hit.start, hit.end), 'α 🧪\r\n<strong>result</strong> &#x1F600;');
	assert.equal(byteColToIndex('α 🧪 result', indexToByteCol('α 🧪 result', 5)), 5);
});

test('ignores comments and link destinations, keeps comparison operators', () => {
	assert.equal(findSourceText('<!-- hidden --> [Visible](https://hidden)', 'hidden').length, 0);
	assert.equal(sourceTextWithMap('x < 5 and y > 2').text, 'x < 5 and y > 2');
	assert.equal(findSourceText('[Product](notes.md) meets validation', 'Product meets validation').length, 1);
});

test('search supports case options, empty query and a large HTML table', () => {
	const source = '<table>' + Array.from({ length: 2000 }, (_, i) => `<tr><td>Requirement ${i}</td></tr>`).join('\n') + '</table>';
	assert.equal(findSourceText(source, 'requirement 1999', false).length, 1);
	assert.equal(findSourceText(source, 'requirement 1999', true).length, 0);
	assert.deepEqual(findSourceText(source, ''), []);
});

test('case folding that expands Unicode characters does not shift source offsets', () => {
	const source = '<td>İABC &amp; 🧪</td>';
	const [hit] = findSourceText(source, 'abc & 🧪', false);
	assert.equal(source.slice(hit.start, hit.end), 'ABC &amp; 🧪');
});

test('HTML line breaks and mathematical entities remain searchable', () => {
	const source = '<td>Value<br>must be &ge; 5 &plusmn; 1 and &lt; 10</td>';
	assert.equal(findSourceText(source, 'Value must be ≥ 5 ± 1 and < 10').length, 1);
});

test('reverse mapping preserves mathematical comparisons and quoted HTML attributes', () => {
	assert.equal(sourceToPlain('x < 5 and y > 2'), 'x < 5 and y > 2');
	assert.equal(sourceToPlain('<td title="x > 5">Value &ge; 5</td>'), 'Value ≥ 5');
});

test('wikilink aliases retain visible label offsets and exclude the target', () => {
	const source = '[[Hidden target|Visible label]]';
	assert.equal(findSourceText(source, 'Hidden target').length, 0);
	const [hit] = findSourceText(source, 'Visible label');
	assert.equal(source.slice(hit.start, hit.end), 'Visible label');
});
