// Map line numbers of an old text to a new text (e.g. after an external change on disk), so a
// reload can keep the caret, the selection and the viewed lines on the same content.

export type LineStatus = 'kept' | 'modified' | 'deleted';

export interface LineMapping {
	// 1-based new line for a 1-based old line. Kept and modified lines map to their new position;
	// a deleted line maps to the nearest surviving line above it (1 when nothing above survived).
	line(oldLine: number): number;
	// 'kept': unchanged; 'modified': changed in place (a run of changed lines replaced by the same
	// number of lines); 'deleted': removed
	status(oldLine: number): LineStatus;
	// true when the old line still exists unchanged
	kept(oldLine: number): boolean;
}

const splitLines = (text: string) => text.replace(/\r\n/g, '\n').split('\n');

// Above this many differing lines the diff is skipped: the changed middle is treated as replaced
const MAX_EDIT_DISTANCE = 2000;

export function mapLines(oldText: string, newText: string): LineMapping {
	const a = splitLines(oldText);
	const b = splitLines(newText);

	// common prefix / suffix: cheap, and the usual case for small edits
	let start = 0;
	while (start < a.length && start < b.length && a[start] === b[start]) start++;
	let endA = a.length;
	let endB = b.length;
	while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
		endA--;
		endB--;
	}

	// map[i] = new index (0-based) for old index i, or -1 when deleted; modified[i] marks in-place changes
	const map = new Int32Array(a.length).fill(-1);
	const modified = new Uint8Array(a.length);
	for (let i = 0; i < start; i++) map[i] = i;
	for (let i = endA; i < a.length; i++) map[i] = i - endA + endB;
	const pairs = myersMatches(a, start, endA, b, start, endB) ?? [];
	pairs.sort((p, q) => p[0] - q[0]);
	for (const [i, j] of pairs) map[i] = j;

	// unmatched runs between matches: same length on both sides -> lines changed in place
	let prevA = start - 1;
	let prevB = start - 1;
	for (const [i, j] of [...pairs, [endA, endB] as [number, number]]) {
		const runA = i - prevA - 1;
		const runB = j - prevB - 1;
		if (runA > 0 && runA === runB) {
			for (let k = 1; k <= runA; k++) {
				map[prevA + k] = prevB + k;
				modified[prevA + k] = 1;
			}
		}
		prevA = i;
		prevB = j;
	}

	const clamp = (oldLine: number) => Math.max(0, Math.min(a.length - 1, oldLine - 1));
	return {
		line(oldLine: number): number {
			let i = clamp(oldLine);
			while (i >= 0 && map[i] < 0) i--;
			return i < 0 ? 1 : map[i] + 1;
		},
		status(oldLine: number): LineStatus {
			const i = oldLine - 1;
			if (i < 0 || i >= a.length || map[i] < 0) return 'deleted';
			return modified[i] ? 'modified' : 'kept';
		},
		kept(oldLine: number): boolean {
			const i = oldLine - 1;
			return i >= 0 && i < a.length && map[i] >= 0 && !modified[i];
		},
	};
}

// Matching line pairs (old index, new index) of a shortest edit script between a[aLo..aHi) and
// b[bLo..bHi), Myers' O(ND) algorithm. Returns null when the edit distance exceeds the limit.
function myersMatches(a: string[], aLo: number, aHi: number, b: string[], bLo: number, bHi: number): [number, number][] | null {
	const n = aHi - aLo;
	const m = bHi - bLo;
	if (n === 0 || m === 0) return [];
	const max = Math.min(n + m, MAX_EDIT_DISTANCE);
	const offset = max;
	const v = new Int32Array(2 * max + 2);
	const trace: Int32Array[] = [];

	for (let d = 0; d <= max; d++) {
		trace.push(v.slice());
		for (let k = -d; k <= d; k += 2) {
			let x = k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1]) ? v[offset + k + 1] : v[offset + k - 1] + 1;
			let y = x - k;
			while (x < n && y < m && a[aLo + x] === b[bLo + y]) {
				x++;
				y++;
			}
			v[offset + k] = x;
			if (x >= n && y >= m) return backtrack(trace, d, n, m, offset, aLo, bLo);
		}
	}
	return null;
}

function backtrack(trace: Int32Array[], dEnd: number, n: number, m: number, offset: number, aLo: number, bLo: number): [number, number][] {
	const pairs: [number, number][] = [];
	let x = n;
	let y = m;
	for (let d = dEnd; d > 0; d--) {
		const v = trace[d];
		const k = x - y;
		const prevK = k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1]) ? k + 1 : k - 1;
		const prevX = v[offset + prevK];
		const prevY = prevX - prevK;
		while (x > prevX && y > prevY) {
			x--;
			y--;
			pairs.push([aLo + x, bLo + y]);
		}
		x = prevX;
		y = prevY;
	}
	while (x > 0 && y > 0) {
		x--;
		y--;
		pairs.push([aLo + x, bLo + y]);
	}
	return pairs;
}
