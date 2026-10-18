# Proposal — Action Plan view mode with a dynamic filter and sort bar

- **Status:** proposal (not decided) · see `IDEAS.md` I-09
- **Date:** 2026-10-18
- **Branch:** `claude/action-plan-view-d163a815`
- **Owner decision needed:** the open questions in §9

---

## 1. What

A per-tab **Action Plan view** for the preview. When switched on, a slim **filter and sort bar** appears above the rendered document (the slot the Ctrl+F search bar already uses). The bar works on the plan's tables — Decision Log, Open Issues, Document Status, Consistency Checklist — and lets you:

- **hide done or closed rows** (🟢 / ⚪, optionally 🟩 "implemented in draft") with one click,
- **filter** by status, severity, owner, table and free text (ID or substring),
- **sort** by priority, status, owner or ID, and go back to document order,
- see **live counts** (`shown 23 / 88`, and `done / open` on each `###` track heading).

The view never touches the file: filtering and sorting are DOM-only, the Markdown source stays exactly as written (rows never move, per the BME Action Plan Skill §2 rule "row position is fixed"). Phase 2 adds a safe in-place status edit per row, reusing the task-checkbox mechanism.

## 2. Why

The repository has six active plans (SP2, SN2, SN2 CPA, SN2 EMC, SP3 RDI, Complaints) with 20–100+ rows each. The SP3 plan alone has 71 done rows next to 45 open ones in the same tables, and the EMC plan is at rev 69. Finding "what is open for owner X, worst first" means scrolling and reading icons. The plans deliberately keep closed rows in place as the audit trail, so the *file* cannot be tidied — the *viewer* has to do it.

## 3. What an action plan looks like (the input contract)

Everything the view needs is already in the plans, defined by the BME Action Plan Skill (`claude.local/ProjectFolder/BME_Action_Plan_Skill.md`):

| Element | Form in the file | Used for |
|---|---|---|
| Status line | `**Status:** 🔴/🟡/🟢 …` directly under the H1 | plan detection, header badge |
| Legend | `**Legend:** 🔴 open · 🟡 in progress · 🟩 implemented in draft · 🟢 done · ⚪ no active action` | status vocabulary (only place icons are defined) |
| Decision Log | `ID \| Decision \| Status \| Date / by \| Basis` | table kind `decisions` |
| Open Issues | `ID \| Sev \| Ref (§/WI) \| Issue \| Action \| Owner \| Status` (+ optional `Legacy priority / phase`) | table kind `issues` — the main target |
| Document status | `Document \| Rev \| File \| Status \| Next steps` | table kind `documents` |
| Consistency checklist | `Check \| How to verify \| Status` | table kind `checks` |
| Track headings | `### Track C — … (33 done / 19 open)` | grouping, count badges |

Older plans deviate and must still work: SN2 and SP2 use plain `Open` / `DONE` / `CLOSED` without icons; the CPA plan uses `Resp.` instead of `Owner` and `Gap` instead of `Issue`; SP3 carries IDs as `[[wiki links]]` and bold `**P8**`. Hence the column aliases and keyword fallback in §5.

**Priority is not a column.** No plan has a `Prio` column; priority is implied by `Sev` (MAJOR / MINOR / DOC), the status icon and the header's "top blocker". The sort therefore uses a *computed* priority key (§5.3) and takes an explicit `Prio` / `Priority` / `Legacy priority` column into account where one exists.

## 4. User interface

### 4.1 Entering the view

- **Toolbar button** in the title bar next to the edit toggle (list-with-filter icon), **Ctrl+Shift+A** (free; checked against `Shortcuts.svelte`), and an entry in the kebab menu. Toggles per tab, like edit mode.
- **Auto-offer:** when a tab opens a file whose name starts with `_Action_Plan` or contains `action plan`, or whose first lines carry a `**Status:**` and a `**Legend:**` line, the toolbar button is shown active-ready (subtle dot). The view is **not** switched on automatically — a setting `Open action plans in Action Plan view` (default off) can make it so.
- The toggle is remembered per tab for the session (in the tab store), not in the file and not globally.

### 4.2 The bar

One row, wraps on narrow windows, same visual language as the preview search bar:

```
[≡ Action plan]  Hide done ☑   Status: 🔴 🟡 🟩 🟢 ⚪   Sev: MAJOR MINOR DOC   Owner: [any ▾]   Table: [all ▾]
                 Find: [ G2 / DEC- / text ]   Sort: [Priority ▾] ↓   shown 23 / 88   [Reset]  [×]
```

| Control | Behaviour |
|---|---|
| **Hide done** | One checkbox: hides 🟢 and ⚪ rows. A small caret opens "also hide 🟩 implemented in draft". Default on when the view is entered (setting). |
| **Status chips** | Multi-select, shown with the plan's own icons. Clicking a chip toggles it; Hide done is just a preset that unselects 🟢 ⚪. Rows whose status cannot be classified are **never hidden** (shown with a grey "?" chip so the gap is visible). |
| **Sev chips** | Values found in the document (`MAJOR`, `MINOR`, `DOC`, `Critical`, `—`). Hidden when no table has a Sev column. |
| **Owner** | Dropdown of distinct owner values from the document (`Owner` / `Resp.` / `Responsible`). Multi-select. |
| **Table** | `all` · `Open Issues` · `Decision Log` · `Document status` · `Checklist` · plus one entry per table that could not be classified (named by the heading above it). |
| **Find** | Substring match over ID + text cells, case-insensitive. `G2` matches the ID `G2` exactly first; `DEC-` matches all decisions. Rows that do not match are hidden, not dimmed. |
| **Sort** | `Document order` (default) · `Priority` · `Status` · `Owner` · `ID` (natural: G2 < G10). Second click flips direction. Sorting is **within each table**; tables never merge. |
| **Counts** | `shown n / total`. Each `###` heading that owns a table gets a live badge `(d done / o open · s shown)` computed from the rows, next to the hand-written count — mismatch is visible at a glance. |
| **Reset** | Document order, all statuses, no text, Hide done per setting. |
| **×** | Leaves the view; the document renders as before. |

**Row rendering.** Hidden rows get `hidden` (not removed), sorted rows are re-appended inside their `tbody` in the new order; the original index is kept on each row so document order is restorable without a re-render. A table with no visible rows collapses to its header row plus one muted line `no rows match`. Headings, prose, Gantt annex and everything outside tables are untouched.

**Tables-only mode** (optional second toggle in the bar): hides paragraphs, lists and blockquotes between the first `##` section and the Annexes heading, keeping headings and tables — a pure worklist. Off by default; phase 1 if cheap, otherwise phase 2.

### 4.3 What does not change

- Edit mode and split view: the bar lives in the preview pane only; in split view it filters the preview, the editor is unaffected.
- Outline (TOC) reads headings from the DOM; headings stay, so the outline is unchanged.
- Ctrl+F preview search: matches inside hidden rows are skipped (`Range`s in hidden elements are excluded when collecting matches).
- Live reload / F5: the view state is reapplied after every re-render (same hook that re-attaches the task-checkbox listeners), so a filter survives an external file change.
- Export (PDF/HTML): exports the full document by default; a checkbox in the export dialog `Export filtered view` is phase 2.
- Zoom: DOM-only, works at every zoom level.

## 5. Model and rules

### 5.1 Detection (file level)

`isActionPlan(raw, path)` is true when any of:

1. the file name starts with `_Action_Plan` or matches `/action[ _-]?plan/i`;
2. the first 40 lines contain a `**Status:**` line *and* a `**Legend:**` line;
3. at least one table header row has a `Status` column and an `ID`-like first column (`ID`, `#`, `Document`, `Check`, `Deliverable`).

Detection only drives the auto-offer; the user can switch the view on for any document, and the bar then simply reports `0 tables recognised` if nothing parses.

### 5.2 Table classification and column aliases

For every `<table>` in `.markdown-body`: read the `<th>` texts, normalise (lower-case, strip punctuation), and map:

| Role | Accepted header texts |
|---|---|
| `id` | `id`, `#`, `no`, `document`, `deliverable`, `check`, `milestone` (first column fallback) |
| `status` | `status`, `state` |
| `sev` | `sev`, `severity`, `class` |
| `owner` | `owner`, `resp`, `resp.`, `responsible`, `who`, `date / by` (decisions: decider only) |
| `prio` | `prio`, `priority`, `legacy priority / phase`, `phase` |
| `text` | `issue`, `gap`, `decision`, `action`, `action / recommendation`, `remediation`, `next steps`, `how to verify`, `basis`, `ref`, `ref (§/wi)` — all concatenated for Find |

Table kind: `issues` if it has `sev` or its `id` values look like `[A-Z]{1,4}-?\d+`; `decisions` if ids start with `DEC-`; `documents` if the id header is `document`; `checks` if `check`; else `other`. The nearest preceding heading (`h2`/`h3`) names the table in the Table dropdown and carries the count badge.

### 5.3 Status normalisation

Order of evidence inside the status cell: **icon first, then keyword, else unknown**.

| Class | Icons | Keywords (case-insensitive, word-bounded) |
|---|---|---|
| `open` | 🔴 | `open`, `confirmed open`, `blocked`, `fail`, `not-found`, `not-evidenced`, `decision needed`, `planned`, `review needed` |
| `progress` | 🟡 | `in progress`, `partially closed`, `partial`, `draft` (document tables only) |
| `draft` | 🟩 | `implemented in draft` |
| `done` | 🟢 ✅ | `done`, `closed`, `complete`, `completed`, `released`, `pass`, `decided`, `resolved` |
| `none` | ⚪ | `not needed`, `tracked via`, `deferred`, `superseded`, `moot`, `n/a`, `reference-only` |
| `unknown` | — | anything else; never hidden by Hide done |

The keyword fallback is what makes the icon-less SP2 / SN2 / CPA plans work. "Hide done" hides `done` and `none`; the caret option adds `draft`.

### 5.4 Priority key (for `Sort: Priority`)

Lexicographic tuple, lower sorts first:

1. **Explicit priority** when a `prio` column exists: `P1` < `P2` < … ; `Critical` < `High` < `Medium` < `Low`; empty last.
2. **Severity:** `Critical` < `MAJOR` < `MINOR` < `DOC` < empty.
3. **Status:** `open` < `progress` < `draft` < `unknown` < `done` < `none`.
4. **Blocker mention:** rows whose ID appears in the header `**Status:**` line (the "top blocker") sort first inside their severity class.
5. **Document order** (stable tie-break; also what `Document order` uses alone).

`Sort: Status` uses (3, 5); `Sort: Owner` uses (owner, 5); `Sort: ID` splits the id into prefix + number and compares naturally.

### 5.5 Invariants

- The source is never modified by filtering or sorting. Only phase 2 status edits write to the in-memory tab content, and only on an explicit click.
- A row whose status cannot be classified is always shown.
- Document order is always restorable without re-rendering.
- Reapplying the same view state to a fresh render yields the same result (pure function of raw content + view state).

## 6. Implementation

Follows the existing patterns (`tasks.ts` + `tests/tasks.test.mjs`, preview search bar in `MarkdownViewer.svelte`, settings in `settings.svelte.ts`, strings in `i18n.ts`). Rendering stays in Rust/comrak — comrak 0.18 already emits `data-sourcepos` on `<tr>` (`html.rs` TableRow branch), which gives every rendered row its source line for free.

| # | File | Change |
|---|---|---|
| 1 | `src/lib/utils/actionPlan.ts` (new) | Pure, DOM-free logic: `isActionPlan`, `classifyStatus`, `mapColumns`, `classifyTable`, `priorityKey`, `compareRows`, `applyFilter`, `naturalIdCompare`. Input is a plain `PlanRow { id, status, sev, owner, prio, text, tableIndex, index, sourceLine }`. |
| 2 | `src/lib/utils/actionPlanDom.ts` (new) | Thin DOM adapter: `collectPlanTables(markdownBody)` → `PlanTable[]` (rows + `tr` refs + heading), `applyView(tables, state)` (hide / reorder / badges / restore). |
| 3 | `src/lib/components/ActionPlanBar.svelte` (new) | The bar. Props: `tables`, `state` (`$bindable`), `onchange`, `onclose`. Owner/Sev/Table options derived from `tables`. |
| 4 | `src/lib/MarkdownViewer.svelte` | Per-tab `actionPlanView` state (in `tabs.svelte.ts` next to `isEditing`); mount the bar in the preview-search slot; call `applyView` after every render (where task listeners are attached); Ctrl+Shift+A; exclude hidden rows from preview search. |
| 5 | `src/lib/components/TitleBar.svelte` | Toggle button beside the edit toggle, ready-dot when `isActionPlan` is true; kebab entry. |
| 6 | `src/lib/stores/settings.svelte.ts`, `Settings.svelte` | `actionPlan: { hideDoneDefault: true, hideDraftDefault: false, autoEnter: false, defaultSort: 'document' }`, persisted like the other settings. |
| 7 | `src/lib/utils/i18n.ts` | English keys under `actionPlan.*`; other languages fall back to English until translated. |
| 8 | `src/styles.css` | Bar styling (reuse `.preview-search-bar` tokens), `tr.ap-hidden`, heading badge, muted `no rows match` row. |
| 9 | `tests/actionPlan.test.mjs` (new) | Status classification across all five vocabularies, column aliasing for the four table shapes above, priority ordering, natural ID sort, Hide-done presets, unknown-status never hidden. Fixtures: trimmed header + table excerpts from the SP3, EMC, SN2, CPA and SP2 plans (no content beyond what the test needs). |
| 10 | `tests/e2e/actionplan.mjs` (phase 1 end) | Open a fixture plan, toggle view, hide done, check row counts and badge text, sort by priority, reload, assert state survives. |

**Rebase note (I-03).** Everything new is additive (three new files + small hooks), so it ports onto the upstream 2.8.4 base unchanged; upstream also renders with comrak and sourcepos. Do not couple the bar to the current single-file viewer beyond the two hook points (mount + post-render apply).

## 7. Phases and estimate

| Phase | Content | Estimate |
|---|---|---|
| **1 — View** | Detection, bar, Hide done, status/sev/owner/table/text filters, all sorts, counts and badges, per-tab state, reapply on reload, unit tests | ~1.5 days |
| **2 — Edit** | Click a status cell → popover with the five icons; writes `🔴 Open` → `🟢 DONE` on that row's source line via `data-sourcepos` with the same safety net as task toggles (line must still contain the status the cell showed, else refuse with a toast); in memory until Ctrl+S, no auto-save. Also: `Export filtered view`, Tables-only mode if not in phase 1 | ~1 day |
| **3 — Across plans** | Folder-pane filter `action plans only`; a generated overview tab listing every `_Action_Plan*.md` in the folder with its `Status:` line and open counts (read-only) | idea, size later |

## 8. Risks and mitigations

- **Column drift between plans.** Mitigated by aliases plus the `other` table kind; an unrecognised table is still listed and filterable by text, never silently dropped.
- **Multi-line cells (`<br>`), bold and wiki links in cells.** The adapter reads `textContent`, so markup is irrelevant; the ID cell is trimmed of `**`, `[[…|` and `]]` before matching.
- **Rows the renderer splits oddly** (unbalanced pipes). Those rows show as `unknown` and remain visible — the view degrades to "nothing hidden", never to "wrong row hidden".
- **Preview search interplay.** Hidden rows must be excluded from matches or the current-match counter jumps to invisible text; covered by the e2e test.
- **Performance.** The largest plan has about 400 rows; hide/reorder in one `requestAnimationFrame` batch is well below one frame. No virtualisation needed.

## 9. Open questions (owner decision)

1. **Default sort on entering the view:** document order (safe, matches the file) or priority (what you usually want)? Proposal: document order, with the last used sort remembered per session.
2. **Hide done default:** on when entering the view? Proposal: on, hide 🟩 draft off.
3. **Decision Log under Hide done:** hide 🟢 DECIDED rows too, or keep decisions always visible? Proposal: hide; the Table filter can show them.
4. **Count badges:** view-only, or also a `Write counts to headings` action that rewrites `(d done / o open)` in the source (phase 2, same safety net)? Proposal: view-only in phase 1.
5. **Tables-only mode:** phase 1 or 2?
6. **Shortcut:** Ctrl+Shift+A acceptable, or prefer a plain `A` like the `?` shortcut dialog?

## 10. Not in scope

- No new Markdown syntax or front-matter; plans stay plain GFM tables.
- No editing of IDs, owners or text from the view (edit mode does that).
- No cross-file aggregation in phases 1–2.
- No change to the Rust renderer.
