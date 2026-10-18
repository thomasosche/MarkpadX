// Basic unit tests for the Action Plan view logic (pure, DOM-free). Run with `npm test`.
// Deliberately not exhaustive: the owner runs the first manual tests on the built app.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	activeFilterCount,
	blockerIds,
	classifyStatus,
	classifyTable,
	cleanId,
	defaultViewState,
	isActionPlanDoc,
	mapColumns,
	naturalIdCompare,
	ownerFromCell,
	parseLegend,
	rowMatches,
	sortRows,
	splitOwners,
	toggleChip,
} from '../src/lib/utils/actionPlan.ts';

const row = (index, over = {}) => ({
	index, id: `G${index}`, cls: 'open', flag: null, legacy: false, sev: '', owner: '', owners: [], text: '', blocker: false, ...over,
});

test('classifyStatus: skill vocabulary, icon first', () => {
	assert.equal(classifyStatus('🔴 Open').cls, 'open');
	assert.equal(classifyStatus('🔴 CONFIRMED OPEN — still Rev 4').cls, 'open');
	assert.equal(classifyStatus('🔴 DECISION NEEDED — PM/TO').cls, 'open');
	assert.equal(classifyStatus('🟡 PARTIALLY CLOSED — 6 ratings to re-map').cls, 'progress');
	assert.equal(classifyStatus('🟩 IMPLEMENTED IN DRAFT — in 02_Draft_TF/DIS §4.3').cls, 'draft');
	assert.equal(classifyStatus('🟢 DONE — removed in RA Rev 3').cls, 'done');
	assert.equal(classifyStatus('🟢 DECIDED').cls, 'done');
	assert.equal(classifyStatus('🟢 PASS').cls, 'done');
	assert.equal(classifyStatus('⚪ NOT NEEDED — handled by the label CRQ').cls, 'none');
	assert.equal(classifyStatus('⚪ Tracked via CR DOC 3 (deferred)').cls, 'none');
	assert.equal(classifyStatus('⚪ SUPERSEDED by DEC-05').cls, 'none');
});

test('classifyStatus: legacy keywords without icon, disagreement flag, unclassifiable is none', () => {
	const legacy = classifyStatus('Open');
	assert.equal(legacy.cls, 'open');
	assert.equal(legacy.legacy, true);
	assert.equal(classifyStatus('DONE').cls, 'done');
	assert.equal(classifyStatus('In progress').cls, 'progress');
	const disagree = classifyStatus('🟢 Open');
	assert.equal(disagree.cls, 'done'); // the icon is the definition
	assert.match(disagree.flag, /icon 🟢/);
	const none = classifyStatus('tbd');
	assert.equal(none.cls, 'none');
	assert.match(none.flag, /not classifiable/);
	assert.equal(classifyStatus('🟩 IMPLEMENTED IN DRAFT — closes on release').flag, null);
});

test('mapColumns: the four skill table shapes and the CPA/legacy aliases', () => {
	const issues = mapColumns(['ID', 'Sev', 'Ref (§/WI)', 'Issue', 'Action', 'Owner', 'Status']);
	assert.deepEqual([issues.id, issues.sev, issues.owner, issues.status], [0, 1, 5, 6]);
	const decisions = mapColumns(['ID', 'Decision', 'Status', 'Date / by', 'Basis']);
	assert.deepEqual([decisions.id, decisions.status, decisions.owner, decisions.ownerIsDateBy], [0, 2, 3, true]);
	const docs = mapColumns(['Document', 'Rev', 'File', 'Status', 'Next steps']);
	assert.deepEqual([docs.id, docs.status, docs.sev, docs.owner], [0, 3, -1, -1]);
	const checks = mapColumns(['Check', 'How to verify', 'Status']);
	assert.deepEqual([checks.id, checks.status], [0, 2]);
	const cpa = mapColumns(['ID', 'CPA Row', 'AP₁/AP₂', 'Type', 'Gap', 'Action / Recommendation', 'Resp.', 'Status']);
	assert.deepEqual([cpa.id, cpa.owner, cpa.status], [0, 6, 7]);
	assert.equal(mapColumns(['Milestone', 'Estimated', 'Actual', 'Source']).status, -1); // Timeline is not a worklist
});

test('classifyTable', () => {
	assert.equal(classifyTable('ID', ['G1', 'W2', 'H4'], true), 'issues');
	assert.equal(classifyTable('ID', ['DEC-01', 'DEC-02'], false), 'decisions');
	assert.equal(classifyTable('Document', ['Risk analysis'], false), 'documents');
	assert.equal(classifyTable('Check', ['IFU matches labelling'], false), 'checks');
	assert.equal(classifyTable('ID', ['TOOL-01', 'B-01', 'E-23'], false), 'issues');
});

test('cleanId, splitOwners, ownerFromCell', () => {
	assert.equal(cleanId('**P8**'), 'P8');
	assert.equal(cleanId('[[_PCA-25-001_1_Project Change|PCA-25-001]]'), 'PCA-25-001');
	assert.deepEqual(splitOwners('TO / QM'), ['TO', 'QM']);
	assert.deepEqual(splitOwners('PM/TO'), ['PM', 'TO']);
	assert.equal(ownerFromCell('2026-09-04, T. Osche', true), 'T. Osche');
	assert.equal(ownerFromCell('after quote comparison', true), ''); // not decided yet: no decider
	assert.equal(ownerFromCell('SW Lead', false), 'SW Lead');
});

test('naturalIdCompare and sortRows keep document order as the tie-break', () => {
	assert.ok(naturalIdCompare('G2', 'G10') < 0);
	assert.ok(naturalIdCompare('DEC-9', 'DEC-10') < 0);
	assert.ok(naturalIdCompare('G3', 'W1') < 0);
	const rows = [row(0, { cls: 'done' }), row(1, { cls: 'open' }), row(2, { cls: 'none' }), row(3, { cls: 'open' }), row(4, { cls: 'draft' })];
	assert.deepEqual(sortRows(rows, 'status', 'asc').map((r) => r.index), [1, 3, 4, 0, 2]);
	assert.deepEqual(sortRows(rows, 'status', 'desc').map((r) => r.index), [2, 0, 4, 3, 1]);
	assert.deepEqual(sortRows(rows, 'doc', 'desc').map((r) => r.index), [0, 1, 2, 3, 4]); // document order ignores direction
});

test('toggleChip: click toggles, Shift+click = only this, Shift+click again = all back', () => {
	const all = ['open', 'progress', 'draft', 'done', 'none'];
	assert.deepEqual(toggleChip(['open', 'progress'], 'done', all, false), ['open', 'progress', 'done']);
	assert.deepEqual(toggleChip(['open', 'progress'], 'open', all, false), ['progress']);
	assert.deepEqual(toggleChip(['open', 'progress'], 'done', all, true), ['done']);
	assert.deepEqual(toggleChip(['done'], 'done', all, true), all);
});

test('rowMatches: entry defaults hide done/none, owner and find filters, per-table override', () => {
	const st = defaultViewState();
	assert.equal(rowMatches(row(0, { cls: 'open' }), st, 0), true);
	assert.equal(rowMatches(row(1, { cls: 'done' }), st, 0), false);
	assert.equal(rowMatches(row(2, { cls: 'none' }), st, 0), false);
	assert.equal(rowMatches(row(1, { cls: 'done' }), { ...st, overrides: [0] }, 0), true);
	const r = row(3, { owners: ['TO', 'QM'], owner: 'TO / QM', text: 'g3 risk analysis variant rows' });
	assert.equal(rowMatches(r, { ...st, owners: ['QM'] }, 0), true);
	assert.equal(rowMatches(r, { ...st, owners: ['RA'] }, 0), false);
	assert.equal(rowMatches(r, { ...st, ownerQuery: 'to' }, 0), true);
	assert.equal(rowMatches(r, { ...st, find: 'variant' }, 0), true);
	assert.equal(rowMatches(r, { ...st, find: 'G3' }, 0), true);
	assert.equal(rowMatches(r, { ...st, find: 'emc' }, 0), false);
	assert.equal(rowMatches(row(4, { sev: 'MINOR' }), { ...st, sevs: ['MAJOR'] }, 0), false);
	assert.equal(activeFilterCount(st), 0);
	assert.equal(activeFilterCount({ ...st, owners: ['QM'], sort: 'status' }), 2);
});

test('isActionPlanDoc, blockerIds, parseLegend', () => {
	assert.equal(isActionPlanDoc('# x', 'C:\\plans\\_Action_Plan_SN2_EMC.md'), true);
	assert.equal(isActionPlanDoc('# Plan\n\n**Status:** 🔴 Active\n\n**Legend:** 🔴 open · 🟢 done', 'notes.md'), true);
	assert.equal(isActionPlanDoc('# README\n\nplain', 'README.md'), false);
	assert.deepEqual([...blockerIds('🔴 Active — blocked on G1 and DEC-04; W3 also open')], ['G1', 'DEC-04', 'W3']);
	const legend = parseLegend('Legend: 🔴 open · 🟡 in progress · 🟩 implemented in draft (→ 🟢 on release) · 🟢 done · ⚪ no active action');
	assert.equal(legend.open, '🔴 open');
	assert.match(legend.none, /no active action/);
});

// ---- second batch (2026-10-18): edge cases around vocabulary, filters and sorting ----

test('classifyStatus: coverage-checklist and document-status wording, keyword precedence', () => {
	assert.equal(classifyStatus('🔴 FAIL').cls, 'open');
	assert.equal(classifyStatus('🔴 NOT-EVIDENCED').cls, 'open');
	assert.equal(classifyStatus('🟡 PARTIAL').cls, 'progress');
	assert.equal(classifyStatus('🟡 Draft').cls, 'progress');
	assert.equal(classifyStatus('🟢 Released').cls, 'done');
	assert.equal(classifyStatus('🔴 Planned').cls, 'open');
	// legacy, no icon: the draft phrase wins over the bare "draft" keyword, "closed" is not "partially closed"
	assert.equal(classifyStatus('IMPLEMENTED IN DRAFT — DSR-12-001 §8.1').cls, 'draft');
	assert.equal(classifyStatus('PARTIALLY CLOSED — 2 of 5 points').cls, 'progress');
	assert.equal(classifyStatus('CLOSED — Rev 3').cls, 'done');
	// a word inside another word does not count
	assert.equal(classifyStatus('reopened').cls, 'none');
	assert.equal(classifyStatus('').cls, 'none');
	assert.match(classifyStatus('').flag, /not classifiable/);
});

test('classifyStatus: a legacy keyword never overrides an icon, icons anywhere after text still count', () => {
	assert.equal(classifyStatus('DONE 🔴').cls, 'open'); // icon wins even when not first
	assert.equal(classifyStatus('🟡 DONE — waiting for release').cls, 'progress');
	assert.match(classifyStatus('🟡 DONE — waiting for release').flag, /says "done"/);
});

test('mapColumns: coverage checklist (Result), "#" id column, state alias, unknown headers fall back to column 0', () => {
	const cov = mapColumns(['Area (§ ref)', 'Result', 'Notes']);
	assert.deepEqual([cov.id, cov.status], [0, 1]);
	const hash = mapColumns(['#', 'Action', 'Status']);
	assert.deepEqual([hash.id, hash.status], [0, 2]);
	const state = mapColumns(['Item', 'Who', 'State']);
	assert.deepEqual([state.id, state.owner, state.status], [0, 1, 2]);
	assert.equal(mapColumns(['Gap', 'Remediation', 'Owner', 'Status']).id, 0);
});

test('classifyTable: mixed ids without Sev are "other", CPL/IPL style ids are issues', () => {
	assert.equal(classifyTable('ID', ['G1', 'Appendix A'], false), 'other');
	assert.equal(classifyTable('ID', ['CPL-3', 'IPL-12', 'CY2'], false), 'issues');
	assert.equal(classifyTable('ID', [], false), 'other');
	assert.equal(classifyTable('ID', ['DEC-01', 'G1'], false), 'issues'); // one non-DEC id: not a decision log
});

test('cleanId and splitOwners: wiki link without alias, bold inside link, separators', () => {
	assert.equal(cleanId('[[G7]]'), 'G7');
	assert.equal(cleanId('**[[_PCA-25-001|PCA-25-001]]**'), 'PCA-25-001');
	assert.equal(cleanId('  B-01\n'), 'B-01');
	assert.deepEqual(splitOwners('TO, QM and RA'), ['TO', 'QM', 'RA']);
	assert.deepEqual(splitOwners('SW Lead; RA'), ['SW Lead', 'RA']);
	assert.deepEqual(splitOwners(''), []);
});

test('sortRows: owner and id sorts, descending flips, empty owners sort first ascending', () => {
	const rows = [
		row(0, { id: 'G10', owner: 'QM' }), row(1, { id: 'G2', owner: '' }), row(2, { id: 'G1', owner: 'RA' }), row(3, { id: 'DEC-3', owner: 'QM' }),
	];
	assert.deepEqual(sortRows(rows, 'id', 'asc').map((r) => r.id), ['DEC-3', 'G1', 'G2', 'G10']);
	assert.deepEqual(sortRows(rows, 'id', 'desc').map((r) => r.id), ['G10', 'G2', 'G1', 'DEC-3']);
	assert.deepEqual(sortRows(rows, 'owner', 'asc').map((r) => r.index), [1, 0, 3, 2]); // empty < QM (doc order inside QM) < RA
	assert.deepEqual(rows.map((r) => r.index), [0, 1, 2, 3]); // input untouched
});

test('toggleChip: deselecting the last selected chip is allowed, Shift+click on another chip narrows to it', () => {
	const all = ['MAJOR', 'MINOR', 'DOC'];
	assert.deepEqual(toggleChip(['MAJOR'], 'MAJOR', all, false), []);
	assert.deepEqual(toggleChip(['MAJOR'], 'DOC', all, true), ['DOC']);
	assert.deepEqual(toggleChip([], 'DOC', all, false), ['DOC']);
});

test('rowMatches: filters combine with AND, owner chips with OR, override is per table index', () => {
	const st = { ...defaultViewState(), owners: ['TO', 'QM'], find: 'ifu' };
	const r = row(0, { owners: ['QM'], text: 'h2 ifu lacks mr statement' });
	assert.equal(rowMatches(r, st, 0), true);
	assert.equal(rowMatches(row(1, { owners: ['RA'], text: 'ifu' }), st, 0), false); // owner fails
	assert.equal(rowMatches(row(2, { owners: ['TO'], text: 'label' }), st, 0), false); // find fails
	const done = row(3, { cls: 'done' });
	assert.equal(rowMatches(done, { ...defaultViewState(), overrides: [2] }, 1), false);
	assert.equal(rowMatches(done, { ...defaultViewState(), overrides: [2] }, 2), true);
	// an empty Sev filter means no Sev filter; a row without Sev passes any Sev filter
	assert.equal(rowMatches(row(4, { sev: '' }), { ...defaultViewState(), sevs: ['MAJOR'] }, 0), true);
	// live owner query is a substring match, case-insensitive
	assert.equal(rowMatches(row(5, { owners: ['PM/TO'] }), { ...defaultViewState(), ownerQuery: 'pm' }, 0), true);
	assert.equal(rowMatches(row(6, { owners: ['QM'] }), { ...defaultViewState(), ownerQuery: 'pm' }, 0), false);
});

test('activeFilterCount counts every departure from the entry defaults', () => {
	const st = defaultViewState();
	assert.equal(activeFilterCount({ ...st, statuses: ['open'] }), 1);
	assert.equal(activeFilterCount({ ...st, statuses: ['draft', 'progress', 'open'] }), 0); // same set, other order
	assert.equal(activeFilterCount({ ...st, compact: true, overrides: [0, 3], ownerQuery: 'to', find: ' ' }), 4);
	assert.equal(activeFilterCount({ ...st, sevs: ['MAJOR'], owners: ['TO', 'QM'], sort: 'id', dir: 'desc' }), 4);
});

test('isActionPlanDoc: name match is case-insensitive, header check only looks at the first 40 lines', () => {
	assert.equal(isActionPlanDoc('', 'C:\\x\\action-plan-2026.md'), true);
	assert.equal(isActionPlanDoc('', 'ActionPlan_CPA-23-001-Rev2_DEKRA-2026.md'), true);
	const late = Array(45).fill('text').join('\n') + '\n**Status:** 🔴\n**Legend:** 🔴 open';
	assert.equal(isActionPlanDoc(late, 'notes.md'), false);
	assert.equal(isActionPlanDoc('# T\n**Status:** 🟢 COMPLETE\n\nno legend here', 'notes.md'), false);
});

test('blockerIds and parseLegend: no false ids from dates or document numbers, legend without an icon part', () => {
	const ids = blockerIds('🔴 Active — closing NC TDR02/R6-01 (2026-10-15), see RAN-23-001 Rev 2 and P8, P9');
	assert.ok(ids.has('P8') && ids.has('P9') && ids.has('RAN-23-001'));
	assert.ok(!ids.has('2026') && !ids.has('15'));
	assert.deepEqual(parseLegend('Legend: open · done'), {});
	assert.equal(parseLegend('**Legend:** 🟩 implemented in draft (→ 🟢 on release) · ⚪ no active action').draft, '🟩 implemented in draft (→ 🟢 on release)');
});
