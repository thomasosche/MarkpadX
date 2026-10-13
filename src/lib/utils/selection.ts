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
	/** Distance in px from the top of the source pane to the selection, to put it at the same height after the switch */
	viewportOffset?: number;
	/** Relative height survives different pane sizes and zoom levels. */
	viewportRatio?: number;
	/** Exact UTF-16 source offsets, when resolved from rendered text. */
	sourceStart?: number;
	sourceEnd?: number;
	/** Occurrence in the full document, for HTML without sourcepos. */
	globalOccurrence?: number;
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
		.replace(/<\/?[a-zA-Z][\w:-]*(?:\s+(?:[^>"']|"[^"]*"|'[^']*')*)?\s*\/?>/g, '')
		.replace(/&(?:#[0-9]+|#x[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]+);/g, decodeEntity)
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

export type SourceTextMap = { text: string; map: number[]; ends: number[] };

const namedEntities: Record<string, string> = {
	amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0',
	ge: '≥', le: '≤', plusmn: '±', ndash: '–', mdash: '—'
};

function decodeEntity(entity: string): string {
	const name = entity.slice(1, -1);
	if (name.startsWith('#')) {
		const hex = /^#x/i.test(name);
		const code = Number.parseInt(name.slice(hex ? 2 : 1), hex ? 16 : 10);
		return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff)
			? String.fromCodePoint(code) : '\ufffd';
	}
	if (namedEntities[name]) return namedEntities[name];
	if (typeof document !== 'undefined') {
		const textarea = document.createElement('textarea');
		textarea.innerHTML = entity;
		return textarea.value;
	}
	return entity;
}

/** Visible source text with offsets into the unchanged source. Tags/attributes never become matches. */
export function sourceTextWithMap(source: string): SourceTextMap {
	let plain = '';
	const starts: number[] = [];
	const ends: number[] = [];
	const omitted = new Map<number, number>();
	for (const m of source.matchAll(/!?\[\[(?:([^\]|]*)\|)?([^\]]*)\]\]/g)) {
		const labelStart = m.index + m[0].indexOf('[[') + 2 + (m[1] !== undefined ? m[1].length + 1 : 0);
		omitted.set(m.index, labelStart);
		omitted.set(labelStart + m[2].length, m.index + m[0].length);
	}
	for (const m of source.matchAll(/!?\[([^\]]*)\]\([^\n)]*\)/g)) {
		const labelStart = m.index + m[0].indexOf('[') + 1;
		omitted.set(m.index, labelStart);
		omitted.set(labelStart + m[1].length, m.index + m[0].length);
	}
	for (const m of source.matchAll(/^\s*(?:#{1,6}\s+|>\s*|[-*+]\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s+)/gm)) {
		omitted.set(m.index, m.index + m[0].length);
	}
	const tag = /<\/?[a-zA-Z][\w:-]*(?:\s+(?:[^>"']|"[^"]*"|'[^']*')*)?\s*\/?>/y;
	const entity = /&(?:#[0-9]+|#x[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]+);/y;
	const emit = (value: string, start: number, end: number) => {
		plain += value;
		for (let k = 0; k < value.length; k++) { starts.push(start); ends.push(end); }
	};
	for (let i = 0; i < source.length;) {
		const skip = omitted.get(i);
		if (skip !== undefined) { i = skip; continue; }
		if (source.startsWith('<!--', i)) {
			const end = source.indexOf('-->', i + 4);
			i = end < 0 ? source.length : end + 3;
			continue;
		}
		if (source[i] === '<') {
			tag.lastIndex = i;
			const match = tag.exec(source);
			if (match) {
				if (/^<\/?(?:td|th|tr|p|div|br|li)\b/i.test(match[0])) emit(' ', i, tag.lastIndex);
				i = tag.lastIndex;
				continue;
			}
		}
		if (source[i] === '&') {
			entity.lastIndex = i;
			const match = entity.exec(source);
			if (match) { emit(decodeEntity(match[0]), i, entity.lastIndex); i = entity.lastIndex; continue; }
		}
		emit(source[i], i, i + 1);
		i++;
	}
	const normalized = normalizeWithMap(plain);
	return {
		text: normalized.text,
		map: normalized.map.map(i => starts[i]),
		ends: normalized.map.map(i => ends[i])
	};
}

/** Matches visible text while retaining exact source offsets for navigation/search decorations. */
export function findSourceText(source: string, query: string, caseSensitive = true): { start: number; end: number }[] {
	const projected = sourceTextWithMap(source);
	const needle = normalize(query);
	let haystack = projected.text;
	let starts = projected.map;
	let ends = projected.ends;
	if (!caseSensitive) {
		haystack = '';
		starts = [];
		ends = [];
		// Lowercasing can expand a character (e.g. İ). Keep offsets into the original source.
		for (let i = 0; i < projected.text.length;) {
			const ch = String.fromCodePoint(projected.text.codePointAt(i)!);
			const lower = ch.toLowerCase();
			haystack += lower;
			for (let k = 0; k < lower.length; k++) {
				starts.push(projected.map[i + Math.min(k, ch.length - 1)]);
				ends.push(projected.ends[i + Math.min(k, ch.length - 1)]);
			}
			i += ch.length;
		}
	}
	const wanted = caseSensitive ? needle : needle.toLowerCase();
	return findAll(haystack, wanted).map(index => ({
		start: starts[index],
		end: ends[index + wanted.length - 1]
	}));
}
