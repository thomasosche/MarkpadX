/** Paste into a focused search field, never the editor model. Preserve newer user input. */
export async function pasteIntoTextField(
	field: HTMLInputElement | HTMLTextAreaElement,
	readText: () => Promise<string>
): Promise<void> {
	const value = field.value;
	const start = field.selectionStart ?? value.length;
	const end = field.selectionEnd ?? start;
	const text = await readText();
	if (!field.isConnected || field.value !== value || !text) return;
	field.setRangeText(text, start, end, 'end');
	field.dispatchEvent(new Event('input', { bubbles: true }));
}
