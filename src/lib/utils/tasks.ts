export interface TaskMarker {
	line: number;
	prefix: string;
	length: number;
	checked: boolean;
}

// A task list item: bullet or ordered marker, optionally inside blockquotes. As in GFM, the
// [ ] / [x] must be followed by whitespace or end of line (\r of a CRLF line counts as whitespace).
const TASK_LINE = /^(\s*(?:>\s*)*(?:[-*+]|\d+[.)])\s+)\[( |x|X)\](?=\s|$)/;

function parseTaskLine(text: string, line: number): TaskMarker | null {
	const m = text.match(TASK_LINE);
	return m ? { line, prefix: m[1], length: m[0].length, checked: m[2] !== ' ' } : null;
}

// Locate task markers in raw markdown, in document order, skipping fenced code blocks.
export function findTaskMarkers(raw: string): TaskMarker[] {
	const lines = raw.split('\n');
	const markers: TaskMarker[] = [];
	let fence: string | null = null;
	for (let i = 0; i < lines.length; i++) {
		const fenceMatch = lines[i].match(/^\s*(?:>\s*)*(`{3,}|~{3,})/);
		if (fenceMatch) {
			const marker = fenceMatch[1];
			if (fence === null) fence = marker;
			else if (marker[0] === fence[0] && marker.length >= fence.length) fence = null;
			continue;
		}
		if (fence !== null) continue;
		const marker = parseTaskLine(lines[i], i);
		if (marker) markers.push(marker);
	}
	return markers;
}

// The task marker on a given 0-based line, or null when that line is not a task item.
export function taskMarkerOnLine(raw: string, line: number): TaskMarker | null {
	const text = raw.split('\n')[line];
	return text === undefined ? null : parseTaskLine(text, line);
}

// Start line (0-based) from a comrak data-sourcepos attribute such as "3:1-3:12".
export function sourceposLine(sourcepos: string | null | undefined): number | null {
	const m = sourcepos?.match(/^(\d+):/);
	return m ? Number(m[1]) - 1 : null;
}

export interface RenderedTask {
	index: number; // position among the rendered task checkboxes
	count: number; // number of rendered task checkboxes
	sourceLine: number | null; // 0-based start line of the checkbox's list item, from data-sourcepos
	checked: boolean; // state the checkbox showed before the click
}

// Find the source line of a rendered checkbox. The list item's source position is preferred; the
// n-th marker is only used when the renderer and the scanner agree on the number of tasks. Either
// way the line must hold a marker in the state the checkbox showed, otherwise the DOM and the
// source disagree and null is returned rather than flipping the wrong line.
export function resolveTaskLine(raw: string, task: RenderedTask): number | null {
	if (task.sourceLine !== null) {
		const marker = taskMarkerOnLine(raw, task.sourceLine);
		if (marker && marker.checked === task.checked) return marker.line;
	}
	const markers = findTaskMarkers(raw);
	const marker = markers.length === task.count ? markers[task.index] : undefined;
	if (marker && marker.checked === task.checked) return marker.line;
	return null;
}

// Set the task marker on a given 0-based line. Returns null when the line holds no marker.
export function setTaskMarkerOnLine(raw: string, line: number, checked: boolean): string | null {
	const marker = taskMarkerOnLine(raw, line);
	if (!marker) return null;
	if (marker.checked === checked) return raw;
	const lines = raw.split('\n');
	lines[line] = `${marker.prefix}[${checked ? 'x' : ' '}]` + lines[line].slice(marker.length);
	return lines.join('\n');
}
