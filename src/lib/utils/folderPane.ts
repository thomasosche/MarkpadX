const isSep = (c: string) => c === '\\' || c === '/';

function lastSep(path: string): number {
	for (let i = path.length - 1; i >= 0; i--) if (isSep(path[i])) return i;
	return -1;
}

/** Parent folder of a file path, keeping the original separator style; null for a bare name. */
export function dirname(path: string): string | null {
	if (!path) return null;
	const idx = lastSep(path);
	if (idx < 0) return null;
	// UNC: `\\server\share` is the root; a separator before the share is not a folder boundary
	if (path.length > 2 && isSep(path[0]) && isSep(path[1])) {
		let serverEnd = 2;
		while (serverEnd < path.length && !isSep(path[serverEnd])) serverEnd++;
		if (idx <= serverEnd) return null;
		return path.slice(0, idx);
	}
	if (idx === 0) return path.slice(0, 1);
	if (idx === 2 && path[1] === ':') return path.slice(0, 3);
	return path.slice(0, idx);
}

function normalize(p: string): string {
	let s = p.replace(/\//g, '\\').toLowerCase();
	if (s.length > 1 && s.endsWith('\\')) s = s.slice(0, -1);
	return s;
}

/** Windows path equality: case-insensitive, `\` = `/`, one trailing separator ignored. */
export function samePath(a: string, b: string): boolean {
	return normalize(a) === normalize(b);
}

/** Folder shown in the pane: the pinned folder, else the active file's folder. */
export function paneFolder(pinned: string | null, activePath: string | null | undefined): string | null {
	if (pinned) return pinned;
	if (!activePath) return null;
	return dirname(activePath);
}

/** Last path segment (file or folder name) for display. */
export function baseName(path: string): string {
	const isDriveRoot = /^[A-Za-z]:[\\/]$/.test(path);
	const trimmed = path.length > 1 && isSep(path[path.length - 1]) && !isDriveRoot ? path.slice(0, -1) : path;
	return trimmed.slice(lastSep(trimmed) + 1) || trimmed;
}
