// Helpers for carrying a text selection between the Monaco editor (markdown source)
// and the rendered preview (comrak HTML with data-sourcepos attributes).

export type SourceSelection = {
	text: string;
	startLine: number;
	endLine: number;
	/** 1-based UTF-8 byte column, same convention as comrak's sourcepos */
	startColumn: number;
	/** Source text of startLine (editor → preview only) */
	lineText?: string;
	/** Index of the selected text among its matches inside the source block (preview → editor only) */
	occurrence: number;
};

export type Sourcepos = { startLine: number; startCol: number; endLine: number; endCol: number };

// Characters that are markdown syntax in the source but usually vanish in the rendered text
const IGNORED = /[*_~`\\|=]/;
export const IGNORED_CLASS = '[*_~`\\\\|=]*';

export function parseSourcepos(el: Element): Sourcepos | null {
	const sourcepos = (el as HTMLElement).dataset?.sourcepos;
	if (!sourcepos) return null;
	const [start, end = start] = sourcepos.split('-');
	const [startLine, startCol = 1] = start.split(':').map(Number);
	const [endLine, endCol = Infinity] = end.split(':').map(Number);
	if (isNaN(startLine) || isNaN(endLine)) return null;
	return { startLine, startCol: startCol || 1, endLine, endCol: endCol || Infinity };
}

export function sourceposContains(pos: Sourcepos, line: number, col?: number): boolean {
	if (line < pos.startLine || line > pos.endLine) return false;
	if (col === undefined) return true;
	if (line === pos.startLine && col < pos.startCol) return false;
	if (line === pos.endLine && col > pos.endCol) return false;
	return true;
}

/** Convert a 1-based UTF-8 byte column to a 0-based string index */
export function byteColToIndex(line: string, byteCol: number): number {
	const encoder = new TextEncoder();
	let bytes = 0;
	let index = 0;
	for (const ch of line) {
		if (bytes >= byteCol - 1) break;
		bytes += encoder.encode(ch).length;
		index += ch.length;
	}
	return index;
}

/** Convert a 0-based string index to a 1-based UTF-8 byte column */
export function indexToByteCol(line: string, index: number): number {
	return new TextEncoder().encode(line.slice(0, index)).length + 1;
}

/** Roughly turn markdown source into the text it renders to */
export function sourceToPlain(source: string): string {
	return source
		.replace(/!?\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1')
		.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
		.replace(/<[^>]+>/g, '')
		.replace(/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/gm, '')
		.replace(/^\s*(#{1,6}\s+|>\s*|[-*+]\s+(\[[ xX]\]\s+)?|\d+[.)]\s+)/gm, '');
}

/** Strip syntax characters and collapse whitespace; map[i] is the original index of text[i] */
export function normalizeWithMap(s: string): { text: string; map: number[] } {
	let text = '';
	const map: number[] = [];
	let pendingSpace = false;
	for (let i = 0; i < s.length; i++) {
		const ch = s[i];
		if (IGNORED.test(ch)) continue;
		if (/\s/.test(ch)) {
			pendingSpace = text.length > 0;
			continue;
		}
		if (pendingSpace) {
			text += ' ';
			map.push(i);
			pendingSpace = false;
		}
		text += ch;
		map.push(i);
	}
	return { text, map };
}

export function normalize(s: string): string {
	return normalizeWithMap(s).text;
}

export function findAll(haystack: string, needle: string): number[] {
	const result: number[] = [];
	if (!needle) return result;
	let idx = haystack.indexOf(needle);
	while (idx !== -1) {
		result.push(idx);
		idx = haystack.indexOf(needle, idx + 1);
	}
	return result;
}
