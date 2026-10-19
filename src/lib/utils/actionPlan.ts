// Action Plan view: pure, DOM-free logic (see PROPOSAL-action-plan-view.md).
// Status classes follow the BME Action Plan Skill legend: one class per icon. Anything that
// cannot be classified is ⚪ `none` (owner decision 2026-10-18); there is no priority.

export type StatusClass = 'open' | 'progress' | 'draft' | 'done' | 'none';
export type TableKind = 'issues' | 'decisions' | 'documents' | 'checks' | 'other';
export type SortKey = 'doc' | 'status' | 'owner' | 'id';

export const STATUS_ORDER: StatusClass[] = ['open', 'progress', 'draft', 'done', 'none'];
export const STATUS_ICON: Record<StatusClass, string> = { open: '🔴', progress: '🟡', draft: '🟩', done: '🟢', none: '⚪' };
export const STATUS_LABEL: Record<StatusClass, string> = {
	open: 'open', progress: 'in progress', draft: 'implemented in draft', done: 'done', none: 'no active action',
};
export const STATUS_RANK: Record<StatusClass, number> = { open: 0, progress: 1, draft: 2, done: 3, none: 4 };
// Chips selected when the view is entered: open work only.
export const DEFAULT_STATUSES: StatusClass[] = ['open', 'progress', 'draft'];

const ICON_CLASS: Record<string, StatusClass> = { '🔴': 'open', '🟡': 'progress', '🟩': 'draft', '🟢': 'done', '⚪': 'none' };

// Skill vocabulary first, legacy keywords (icon-less older plans) second. Word-bounded, case-insensitive.
const KEYWORDS: [StatusClass, RegExp][] = [
	['draft', /\bimplemented in draft\b/i],
	['open', /\b(confirmed open|open|decision needed|fail|not-found|not-evidenced|planned|blocked|review needed)\b/i],
	['progress', /\b(partially closed|partial|in progress|draft)\b/i],
	['done', /\b(done|closed|decided|pass|released|complete|completed|resolved)\b/i],
	['none', /\b(not needed|tracked via|superseded|deferred|moot|n\/a)\b/i],
];

export interface StatusInfo {
	cls: StatusClass;
	// Why the cell is suspicious (icon/keyword disagreement, nothing classifiable), else null.
	flag: string | null;
	// True when only a legacy keyword (no icon) classified the cell.
	legacy: boolean;
}

function keywordClass(text: string): StatusClass | null {
	for (const [cls, re] of KEYWORDS) if (re.test(text)) return cls;
	return null;
}

export function classifyStatus(text: string): StatusInfo {
	const t = text.trim();
	const icon = Array.from(t).find((ch) => ICON_CLASS[ch]);
	const kw = keywordClass(t);
	if (icon) {
		const cls = ICON_CLASS[icon];
		return { cls, flag: kw && kw !== cls ? `icon ${icon} but the text says "${kw}"` : null, legacy: false };
	}
	if (kw) return { cls: kw, flag: null, legacy: true };
	return { cls: 'none', flag: 'not classifiable (no legend icon, no known keyword) — counted as ⚪ no action', legacy: false };
}

export interface ColumnMap {
	id: number; // never -1: first column is the fallback
	status: number; // -1 when the table has no status column (then it is not a worklist)
	sev: number;
	owner: number;
	// True when the owner column is the Decision Log's "Date / by" (decider only, blank until decided)
	ownerIsDateBy: boolean;
}

function norm(h: string): string {
	return h.toLowerCase().replace(/[^\w§/ .-]/g, '').replace(/\s+/g, ' ').trim();
}

const ID_HEADERS = ['id', '#', 'no', 'no.', 'document', 'deliverable', 'check', 'milestone', 'area'];
const STATUS_HEADERS = ['status', 'state', 'result'];
const SEV_HEADERS = ['sev', 'sev.', 'severity', 'class'];
const OWNER_HEADERS = ['owner', 'resp', 'resp.', 'responsible', 'who', 'date / by'];

export function mapColumns(headers: string[]): ColumnMap {
	const hs = headers.map(norm);
	const find = (names: string[]) => hs.findIndex((h) => names.includes(h));
	const id = find(ID_HEADERS);
	const owner = find(OWNER_HEADERS);
	return {
		id: id < 0 ? 0 : id,
		status: find(STATUS_HEADERS),
		sev: find(SEV_HEADERS),
		owner,
		ownerIsDateBy: owner >= 0 && hs[owner] === 'date / by',
	};
}

export function classifyTable(idHeader: string, ids: string[], hasSev: boolean): TableKind {
	const h = norm(idHeader);
	if (h === 'document') return 'documents';
	if (h === 'check') return 'checks';
	if (ids.length && ids.every((id) => /^DEC-\d+/i.test(id))) return 'decisions';
	if (hasSev || (ids.length && ids.every((id) => /^[A-Z]{1,5}-?\d+[a-z]?$/.test(id)))) return 'issues';
	return 'other';
}

// Strip Markdown remnants that survive in an ID cell: **bold**, [[wiki|alias]] → alias.
export function cleanId(text: string): string {
	let s = text.trim().replace(/\*\*/g, '');
	s = s.replace(/\[\[[^\]|]*\|([^\]]*)\]\]/g, '$1').replace(/\[\[([^\]]*)\]\]/g, '$1');
	return s.replace(/\s+/g, ' ').trim();
}

export function splitOwners(text: string): string[] {
	return text.split(/\s*(?:\/|,|&|\band\b|;)\s*/).map((s) => s.trim()).filter(Boolean);
}

// Owner text of a cell. For "Date / by" only the decider, and only once a date is present.
export function ownerFromCell(text: string, isDateBy: boolean): string {
	const t = text.trim();
	if (!isDateBy) return t;
	const m = t.match(/^\d{4}-\d{2}-\d{2}\s*[,/]\s*(.+)$/);
	return m ? m[1].trim() : '';
}

export function naturalIdCompare(a: string, b: string): number {
	const pa = a.match(/^([A-Za-z-]*)(\d*)/) || ['', '', ''];
	const pb = b.match(/^([A-Za-z-]*)(\d*)/) || ['', '', ''];
	if (pa[1] !== pb[1]) return pa[1].localeCompare(pb[1]);
	const na = Number(pa[2]) || 0, nb = Number(pb[2]) || 0;
	return na - nb || a.localeCompare(b);
}

// IDs named in the header "Status:" line are the plan's top blockers.
export function blockerIds(statusLine: string): Set<string> {
	const set = new Set<string>();
	for (const m of statusLine.matchAll(/\b([A-Z]{1,5}-?\d+(?:-\d+)*[a-z]?)\b/g)) set.add(m[1]);
	return set;
}

// Icon → legend text from the plan's own "Legend:" line (tooltips use the plan's wording).
export function parseLegend(line: string): Partial<Record<StatusClass, string>> {
	const out: Partial<Record<StatusClass, string>> = {};
	const body = line.replace(/^.*?Legend:\s*/s, '');
	for (const part of body.split('·')) {
		const p = part.trim().replace(/^\*+\s*/, ''); // tolerate raw **Legend:** markup
		const icon = Array.from(p)[0];
		const cls = icon ? ICON_CLASS[icon] : undefined;
		if (cls) out[cls] = p;
	}
	return out;
}

export function isActionPlanDoc(raw: string, path: string): boolean {
	const name = path.split(/[\\/]/).pop() || '';
	if (/^_Action_Plan/i.test(name) || /action[ _-]?plan/i.test(name)) return true;
	const head = raw.split('\n', 40).join('\n');
	return /\*\*Status:\*\*/.test(head) && /\*\*Legend:\*\*/.test(head);
}

export interface PlanRow {
	index: number; // document order inside its table
	id: string;
	cls: StatusClass;
	flag: string | null;
	legacy: boolean;
	sev: string;
	owner: string;
	owners: string[];
	text: string; // all cells, lower-cased, for Find
	blocker: boolean;
}

export interface ActionPlanViewState {
	on: boolean;
	statuses: StatusClass[]; // selected chips
	sevs: string[]; // selected Sev chips; empty = no Sev filter
	owners: string[]; // pinned owner chips (OR)
	ownerQuery: string; // live text in the owner box
	find: string;
	sort: SortKey;
	dir: 'asc' | 'desc';
	compact: boolean;
	overrides: number[]; // table indices with "show all"
}

export function defaultViewState(): ActionPlanViewState {
	return { on: false, statuses: [...DEFAULT_STATUSES], sevs: [], owners: [], ownerQuery: '', find: '', sort: 'doc', dir: 'asc', compact: false, overrides: [] };
}

// Chip semantics: click toggles; Shift+click selects only this chip, Shift+click on the sole selected chip brings all back.
export function toggleChip<T>(selected: T[], value: T, all: T[], only: boolean): T[] {
	if (only) {
		if (selected.length === 1 && selected[0] === value) return [...all];
		return [value];
	}
	return selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value];
}

export function rowMatches(row: PlanRow, state: ActionPlanViewState, tableIndex: number): boolean {
	if (state.overrides.includes(tableIndex)) return true;
	if (!state.statuses.includes(row.cls)) return false;
	if (state.sevs.length && row.sev && !state.sevs.includes(row.sev)) return false;
	if (state.owners.length && !row.owners.some((o) => state.owners.includes(o))) return false;
	const q = state.ownerQuery.trim().toLowerCase();
	if (q && !row.owners.some((o) => o.toLowerCase().includes(q))) return false;
	if (state.find) {
		const f = state.find.trim().toLowerCase();
		if (f && !(row.id.toLowerCase() === f || row.text.includes(f))) return false;
	}
	return true;
}

// Sorted copy; document order is always the tie-break, so equal keys keep the file's order.
// Descending flips only the key, never the tie-break.
export function sortRows<T extends PlanRow>(rows: T[], sort: SortKey, dir: 'asc' | 'desc'): T[] {
	const d = dir === 'desc' ? -1 : 1;
	const key: (a: T, b: T) => number =
		sort === 'status' ? (a, b) => STATUS_RANK[a.cls] - STATUS_RANK[b.cls]
		: sort === 'owner' ? (a, b) => a.owner.localeCompare(b.owner)
		: sort === 'id' ? (a, b) => naturalIdCompare(a.id, b.id)
		: () => 0;
	return [...rows].sort((a, b) => d * key(a, b) || a.index - b.index);
}

// Fixed order for the Sev chips, independent of row order: known severities first, the rest A-Z.
const SEV_RANK = ['critical', 'high', 'major', 'medium', 'minor', 'low', 'doc', 'obs', 'observation', 'info'];

export function sevCompare(a: string, b: string): number {
	const ra = SEV_RANK.indexOf(a.toLowerCase());
	const rb = SEV_RANK.indexOf(b.toLowerCase());
	if (ra !== rb) return ra < 0 ? 1 : rb < 0 ? -1 : ra - rb;
	return a.localeCompare(b);
}

// Number of filters that differ from the entry defaults (shown on the Reset button).
export function activeFilterCount(state: ActionPlanViewState): number {
	const def = defaultViewState();
	const sameStatuses = STATUS_ORDER.every((c) => def.statuses.includes(c) === state.statuses.includes(c));
	return (sameStatuses ? 0 : 1) + (state.sevs.length ? 1 : 0) + state.owners.length + (state.find.trim() ? 1 : 0)
		+ (state.ownerQuery.trim() ? 1 : 0) + (state.sort !== 'doc' ? 1 : 0) + (state.compact ? 1 : 0) + state.overrides.length;
}
