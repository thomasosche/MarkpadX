// Action Plan view: DOM adapter. Reads the rendered tables into PlanRows, applies a view state
// (hide / reorder / footers / badges) and keeps the reading position. Never touches the source.
import {
	blockerIds, classifyStatus, classifyTable, cleanId, mapColumns, ownerFromCell, parseLegend, rowMatches,
	sortRows, splitOwners, STATUS_ICON, type ActionPlanViewState, type PlanRow, type StatusClass, type TableKind,
} from './actionPlan.js';

export interface DomRow extends PlanRow {
	tr: HTMLTableRowElement;
}

export interface PlanTable {
	index: number;
	el: HTMLTableElement;
	kind: TableKind;
	name: string;
	heading: HTMLElement | null; // nearest h2/h3 above the table
	rows: DomRow[];
	idCol: number;
	statusCol: number;
	ownerCol: number;
}

export interface PlanModel {
	tables: PlanTable[];
	legend: Partial<Record<StatusClass, string>>;
	blockers: Set<string>;
}

const CLEAN_SELECTOR = '.ap-foot, .ap-badge, .ap-sorttag, .ap-blocker, .ap-qmark';

function headingAbove(table: HTMLTableElement): HTMLElement | null {
	let el: Element | null = table;
	while (el && el.parentElement && el.parentElement.tagName !== 'ARTICLE' && !el.parentElement.classList.contains('markdown-body')) el = el.parentElement;
	for (let p = el?.previousElementSibling ?? null; p; p = p.previousElementSibling) {
		if (/^H[1-3]$/.test(p.tagName)) return p as HTMLElement;
	}
	return null;
}

function headingText(h: HTMLElement | null): string {
	if (!h) return '';
	let s = '';
	h.childNodes.forEach((n) => { if (n.nodeType === Node.TEXT_NODE || !(n as HTMLElement).classList?.contains('ap-badge')) s += n.textContent; });
	return s.replace(/\s+/g, ' ').trim();
}

export function collectPlanModel(body: HTMLElement): PlanModel {
	const paragraphs = Array.from(body.querySelectorAll('p'));
	const statusP = paragraphs.find((p) => /^\s*Status:/.test(p.textContent || ''));
	const legendP = paragraphs.find((p) => /^\s*Legend:/.test(p.textContent || ''));
	const blockers = blockerIds(statusP?.textContent || '');
	const legend = legendP ? parseLegend(legendP.textContent || '') : {};
	const tables: PlanTable[] = [];

	body.querySelectorAll('table').forEach((el) => {
		const ths = Array.from(el.querySelectorAll('thead th')).map((th) => th.textContent || '');
		if (!ths.length) return;
		const cols = mapColumns(ths);
		if (cols.status < 0) return;
		const trs = Array.from(el.querySelectorAll('tbody tr'));
		const rows: DomRow[] = trs.map((tr, index) => {
			const tds = Array.from(tr.children) as HTMLElement[];
			const cell = (i: number) => (i >= 0 && tds[i] ? tds[i].textContent || '' : '');
			const id = cleanId(cell(cols.id));
			const st = classifyStatus(cell(cols.status));
			const owner = ownerFromCell(cell(cols.owner), cols.ownerIsDateBy);
			return {
				tr: tr as HTMLTableRowElement, index, id, cls: st.cls, flag: st.flag, legacy: st.legacy,
				sev: cell(cols.sev).trim(), owner, owners: cols.owner >= 0 ? splitOwners(owner) : [],
				text: tds.map((td) => td.textContent || '').join(' ').toLowerCase(), blocker: blockers.has(id),
			};
		});
		const heading = headingAbove(el);
		tables.push({
			index: tables.length, el, kind: classifyTable(ths[cols.id], rows.map((r) => r.id), cols.sev >= 0),
			name: headingText(heading) || `Table ${tables.length + 1}`, heading, rows, idCol: cols.id, statusCol: cols.status, ownerCol: cols.owner,
		});
	});
	return { tables, legend, blockers };
}

export interface ApplyResult {
	shown: number;
	total: number;
}

function clearDecorations(body: HTMLElement) {
	body.querySelectorAll(CLEAN_SELECTOR).forEach((n) => n.remove());
	body.querySelectorAll('th.ap-sorted').forEach((th) => th.classList.remove('ap-sorted', 'ap-desc'));
	body.querySelectorAll('tr[hidden]').forEach((tr) => ((tr as HTMLElement).hidden = false));
	body.querySelectorAll('.ap-id, .ap-status, .ap-expanded').forEach((n) => n.classList.remove('ap-id', 'ap-status', 'ap-expanded'));
	body.classList.remove('ap-view', 'ap-compact');
}

// Picks the first row or heading in the viewport before a change and scrolls it back to the same
// offset afterwards. If the anchor itself got hidden, the nearest visible row/heading above stands in.
export function keepReadingPosition(scroller: HTMLElement, body: HTMLElement, change: () => void) {
	const top = scroller.getBoundingClientRect().top;
	const candidates = Array.from(body.querySelectorAll<HTMLElement>('tbody tr, h1, h2, h3')).filter((el) => !el.hidden);
	let anchor: HTMLElement | null = null;
	let offset = 0;
	for (const el of candidates) {
		const r = el.getBoundingClientRect();
		if (r.bottom > top) { anchor = el; offset = r.top - top; break; }
	}
	change();
	if (!anchor) return;
	let el: HTMLElement | null = anchor;
	if (el.hidden || el.offsetParent === null) {
		const all = Array.from(body.querySelectorAll<HTMLElement>('tbody tr, h1, h2, h3'));
		let i = all.indexOf(anchor) - 1;
		el = null;
		for (; i >= 0; i--) if (!all[i].hidden && all[i].offsetParent !== null) { el = all[i]; break; }
	}
	if (!el) return;
	const r = el.getBoundingClientRect();
	scroller.scrollTop += r.top - top - offset;
}

// Applies the view state to the rendered tables. state === null restores the plain document.
export function applyPlanView(body: HTMLElement, model: PlanModel, state: ActionPlanViewState | null, onchange?: () => void): ApplyResult {
	clearDecorations(body);
	let total = 0;
	for (const t of model.tables) total += t.rows.length;
	if (!state || !state.on) {
		for (const t of model.tables) restoreOrder(t);
		return { shown: total, total };
	}
	body.classList.add('ap-view');
	body.classList.toggle('ap-compact', state.compact);
	let shown = 0;
	for (const t of model.tables) {
		let visible = 0;
		for (const r of t.rows) {
			const v = rowMatches(r, state, t.index);
			r.tr.hidden = !v;
			if (v) visible++;
			const tds = r.tr.children;
			tds[t.idCol]?.classList.add('ap-id');
			tds[t.statusCol]?.classList.add('ap-status');
			if (r.blocker) {
				const b = document.createElement('span');
				b.className = 'ap-blocker'; b.textContent = 'blocker'; b.title = 'named as top blocker in the Status line';
				tds[t.idCol]?.appendChild(b);
			}
			if (r.flag) {
				const q = document.createElement('span');
				q.className = 'ap-qmark'; q.textContent = '?'; q.title = r.flag;
				tds[t.statusCol]?.appendChild(q);
			}
		}
		shown += visible;
		const tbody = t.el.tBodies[0];
		if (tbody) for (const r of sortRows(t.rows, state.sort, state.dir)) tbody.appendChild(r.tr);
		if (state.sort !== 'doc') {
			const col = state.sort === 'status' ? t.statusCol : state.sort === 'owner' ? t.ownerCol : t.idCol;
			const th = t.el.querySelectorAll('thead th')[col] as HTMLElement | undefined;
			if (th) { th.classList.add('ap-sorted'); if (state.dir === 'desc') th.classList.add('ap-desc'); }
		}
		const hidden = t.rows.length - visible;
		const anchorEl = t.el.parentElement?.classList.contains('table-wrapper') ? t.el.parentElement : t.el;
		if (hidden > 0) {
			const f = document.createElement('div');
			f.className = 'ap-foot';
			f.append(visible === 0 ? `all ${t.rows.length} rows hidden · ` : `${hidden} of ${t.rows.length} rows hidden · `);
			const btn = document.createElement('button');
			btn.type = 'button'; btn.textContent = 'show all';
			btn.onclick = (e) => { e.preventDefault(); state.overrides = [...state.overrides, t.index]; onchange?.(); };
			f.appendChild(btn);
			anchorEl.after(f);
		} else if (state.overrides.includes(t.index)) {
			const f = document.createElement('div');
			f.className = 'ap-foot';
			f.append(`all ${t.rows.length} rows shown for this table · `);
			const btn = document.createElement('button');
			btn.type = 'button'; btn.textContent = 'apply filter again';
			btn.onclick = (e) => { e.preventDefault(); state.overrides = state.overrides.filter((i) => i !== t.index); onchange?.(); };
			f.appendChild(btn);
			anchorEl.after(f);
		}
		if (t.heading && t.heading.tagName === 'H3') {
			const done = t.rows.filter((r) => r.cls === 'done' || r.cls === 'none').length;
			const badge = document.createElement('span');
			badge.className = 'ap-badge';
			badge.textContent = `${done} done / ${t.rows.length - done} open · ${visible} shown${hidden ? `, ${hidden} hidden` : ''}`;
			badge.title = 'computed from the rows; a count written in the heading is the file\'s own';
			t.heading.appendChild(badge);
			if (state.sort !== 'doc') {
				const tag = document.createElement('span');
				tag.className = 'ap-sorttag';
				tag.textContent = `sorted by ${state.sort}${state.dir === 'desc' ? ' ↓' : ''}`;
				t.heading.appendChild(tag);
			}
		}
	}
	return { shown, total };
}

function restoreOrder(t: PlanTable) {
	const tbody = t.el.tBodies[0];
	if (!tbody) return;
	for (const r of [...t.rows].sort((a, b) => a.index - b.index)) tbody.appendChild(r.tr);
}

// Totals per status for the chips, over the whole document.
export function statusCounts(model: PlanModel): Record<StatusClass, number> {
	const c: Record<StatusClass, number> = { open: 0, progress: 0, draft: 0, done: 0, none: 0 };
	for (const t of model.tables) for (const r of t.rows) c[r.cls]++;
	return c;
}

export function unclassifiableCount(model: PlanModel): number {
	let n = 0;
	for (const t of model.tables) for (const r of t.rows) if (r.cls === 'none' && r.flag && /not classifiable/.test(r.flag)) n++;
	return n;
}

export function sevCounts(model: PlanModel): [string, number][] {
	const m = new Map<string, number>();
	for (const t of model.tables) for (const r of t.rows) if (r.sev) m.set(r.sev, (m.get(r.sev) || 0) + 1);
	return Array.from(m);
}

export function ownerCounts(model: PlanModel): [string, number][] {
	const m = new Map<string, number>();
	for (const t of model.tables) for (const r of t.rows) for (const o of r.owners) m.set(o, (m.get(o) || 0) + 1);
	return Array.from(m).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

export const statusIcon = STATUS_ICON;
