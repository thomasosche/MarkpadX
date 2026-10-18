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
