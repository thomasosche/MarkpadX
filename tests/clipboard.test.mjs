import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pasteIntoTextField } from '../src/lib/utils/clipboard.ts';

const field = () => ({
	value: 'old query', selectionStart: 0, selectionEnd: 3, isConnected: true, events: [],
	setRangeText(text, start, end) { this.value = this.value.slice(0, start) + text + this.value.slice(end); },
	dispatchEvent(event) { this.events.push(event); }
});
test('paste replaces only the selected search text and emits an input event', async () => {
	const input = field();
	await pasteIntoTextField(input, async () => 'new');
	assert.equal(input.value, 'new query');
	assert.equal(input.events[0].type, 'input');
	assert.equal(input.events[0].bubbles, true);
});
test('a delayed clipboard read never overwrites newer input or a disposed field', async () => {
	for (const detached of [false, true]) {
		const input = field();
		await pasteIntoTextField(input, async () => {
			if (detached) input.isConnected = false;
			else input.value = 'newer query';
			return 'clipboard';
		});
		assert.equal(input.events.length, 0);
		assert.equal(input.value, detached ? 'old query' : 'newer query');
	}
});
