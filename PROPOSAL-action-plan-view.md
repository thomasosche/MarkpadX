# Proposal — Action Plan view mode with a dynamic filter and sort bar

- **Status:** proposal (not decided) · see `IDEAS.md` I-09
- **Date:** 2026-10-18
- **Branch:** `claude/action-plan-view-d163a815`
- **Decided 2026-10-18 (owner):** no priority sort; the view focuses on status, because the BME Action Plan Skill defines status vocabularies but no priority field (§3, §5.4)
- **Decided 2026-10-18 (owner):** the bar selection is remembered per tab while the tab is open; every file open starts as the plain rendered Markdown with the view off (§4.1)
- **Decided 2026-10-18 (owner):** count badges on every chip and dropdown (§4.2); shortcut Ctrl+Shift+A (§4.1); a filtered table always shows how many rows are hidden, with a per-table `show all` (§4.2)
- **Rejected 2026-10-18 (owner):** a "dim" state for done rows — rows are either shown or hidden, nothing in between
- **Owner decision needed:** the remaining open questions in §9 and the suggestions in §4.3

---

## 1. What

A per-tab **Action Plan view** for the preview. When switched on, a slim **filter and sort bar** appears above the rendered document (the slot the Ctrl+F search bar already uses). The bar works on the plan's tables — Decision Log, Open Issues, Document Status, Consistency Checklist — and lets you:

- **hide done or closed rows** (🟢 / ⚪, optionally 🟩 "implemented in draft") with one click,
- **filter** by status, severity, owner, table and free text (ID or substring),
- **sort** by status (open first), owner or ID, and go back to document order,
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

**The skill defines status, not priority.** It has no priority field; its only triage column is the optional `Sev` (MAJOR / MINOR / DOC), and it explicitly allows project leaders a *sorted view* of the same rows "by person and/or by week" as long as the table itself is never reordered. **Decision (owner, 2026-10-18): the view focuses on status.** There is no priority sort; `Sev` is offered as a filter only, and plan-specific extras such as SP3's `Legacy priority / phase` column are ignored by the sort and reachable through the text filter.

The skill's status vocabulary, which the view treats as authoritative:

| Table | Values |
|---|---|
| Open Issues | 🔴 `Open` · 🔴 `CONFIRMED OPEN` · 🟡 `PARTIALLY CLOSED` · 🟩 `IMPLEMENTED IN DRAFT` · 🟢 `DONE` / `CLOSED` · ⚪ `NOT NEEDED` / `Tracked via CR DOC <n>` |
| Decision Log | 🔴 `DECISION NEEDED — <owner>` · 🟢 `DECIDED` · ⚪ `SUPERSEDED by DEC-nn` |
| Document Status | icon + free text (`🟡 Draft`, `🟢 Released`, `🔴 Planned`) |
| Consistency Checklist | 🔴 `Open` · 🟢 `PASS` |
| Coverage Checklist | 🟢 `PASS` · 🟡 `PARTIAL` · 🔴 `FAIL` · 🔴 `NOT-FOUND` · 🔴 `NOT-EVIDENCED` |

## 4. User interface

### 4.1 Entering the view

- **Toolbar button** in the title bar next to the edit toggle (list-with-filter icon), **Ctrl+Shift+A** (free; checked against `Shortcuts.svelte`), and an entry in the kebab menu. Toggles per tab, like edit mode.
- **Default on file open is the plain Markdown rendering** (owner decision, 2026-10-18). Every file open starts with the view off and the bar at its defaults: a newly opened file, a reopened tab (Ctrl+Shift+T), a tab restored at app start, and a file dropped onto the window. There is no auto-enter and no setting that changes this.
- **Auto-offer only:** when the opened file is detected as an action plan (§5.1), the toolbar button shows a subtle ready dot so the view is one click away. Nothing else changes.
- **Remembered per tab while the tab is open:** view on/off, Hide done, the status / Sev / Owner / Table chips, the text filter, and the sort with its direction. Switching tabs and coming back, switching to edit or split view and back, F5 and live reload all keep the selection. Closing the tab forgets it. The selection is never written to the file and never shared between tabs, even for the same file in two tabs.

### 4.2 The bar

One row, wraps on narrow windows, same visual language as the preview search bar:

```
[≡ Action plan]  Hide done ☑   Status: 🔴 🟡 🟩 🟢 ⚪   Sev: MAJOR MINOR DOC   Owner: [any ▾]   Table: [all ▾]
                 Find: [ G2 / DEC- / text ]   Sort: [Status ▾] ↓   shown 23 / 88   [Reset]  [×]
```

| Control | Behaviour |
|---|---|
| **Hide done** | One checkbox: hides 🟢 and ⚪ rows. A small caret opens "also hide 🟩 implemented in draft". Default on when the view is entered (setting). |
| **Status chips** | Multi-select, shown with the plan's own icons. Clicking a chip toggles it; Hide done is just a preset that unselects 🟢 ⚪. Rows whose status cannot be classified are **never hidden** (shown with a grey "?" chip so the gap is visible). |
| **Count badges** (decided 2026-10-18) | Every chip carries its row count: `🔴 45 · 🟡 17 · 🟩 3 · 🟢 71 · ⚪ 6`, likewise on the Sev chips and in the Owner and Table dropdowns. Counts are totals over the whole document, not over the current filter, so they answer "how much is open" before anything is clicked; the `shown n / total` counter shows the filtered result. Recomputed from the row model on every render. |
| **Sev chips** | Filter only, never a sort key. Values found in the document (`MAJOR`, `MINOR`, `DOC`; anything else, e.g. a plan-specific `Critical`, shows as its own chip). Hidden when no table has a Sev column. |
| **Owner** | Dropdown of distinct owner values from the document (`Owner` / `Resp.` / `Responsible`). Multi-select. |
| **Table** | `all` · `Open Issues` · `Decision Log` · `Document status` · `Checklist` · plus one entry per table that could not be classified (named by the heading above it). |
| **Find** | Substring match over ID + text cells, case-insensitive. `G2` matches the ID `G2` exactly first; `DEC-` matches all decisions. Rows that do not match are hidden, not dimmed. |
| **Sort** | `Document order` (default) · `Status` (open first, see §5.4) · `Owner` · `ID` (natural: G2 < G10). Second click flips direction. Sorting is **within each table**; tables never merge. |
| **Counts** | `shown n / total`. Each `###` heading that owns a table gets a live badge `(d done / o open · s shown)` computed from the rows, next to the hand-written count — mismatch is visible at a glance. |
| **Reset** | Document order, all statuses, no text, Hide done per setting. |
| **×** | Leaves the view; the document renders as before. |

**Row rendering.** Hidden rows get `hidden` (not removed), sorted rows are re-appended inside their `tbody` in the new order; the original index is kept on each row so document order is restorable without a re-render. Headings, prose, Gantt annex and everything outside tables are untouched.

**Never let a filtered table look like a short table** (decided 2026-10-18). Whenever at least one row of a table is hidden, the table shows it explicitly, in three places:
- a muted footer line directly under the table, `23 of 88 rows hidden · show all`; clicking `show all` reveals that table's rows for this tab without changing the bar (a per-table override, cleared by Reset);
- the hidden count in the heading badge, `(33 done / 19 open · 19 shown, 33 hidden)`;
- a table with no visible rows keeps its header row and shows the footer line as `all 88 rows hidden · show all` instead of collapsing silently.
The footer line is part of the rendered DOM, so it scrolls with the table and is included in copy/paste and print of the view; it is never written to the file.

**Tables-only mode** (optional second toggle in the bar): hides paragraphs, lists and blockquotes between the first `##` section and the Annexes heading, keeping headings and tables — a pure worklist. Off by default; phase 1 if cheap, otherwise phase 2.

### 4.3 Usability and performance suggestions (proposed 2026-10-18, not yet decided)

Usability:
- **Chip click semantics:** plain click = "only this one", Shift+click = add/remove, so the common case is one click.
- **Keep the reading position** on every filter change: anchor on the first visible row in the viewport and scroll it back after the apply (reuse the reading-position / line-map code).
- **"Mine" quick filter:** a setting with the user's owner tokens (`TO`, `PM/TO`, `Thomas Osche`) becomes one chip.
- **Sticky table header rows** while a long table scrolls; the bar itself is pinned.
- **Visible sort cue:** arrow in the sorted column header and a `sorted by status` tag, so the view order is never mistaken for the file order.
- **Keyboard flow:** Ctrl+Shift+A opens the view and focuses Find; Esc clears Find first, second Esc leaves the view (same as the search bar); chips are toggle buttons with a pressed state.
- **Legend-driven tooltips:** chip tooltips come from the plan's own `Legend:` line.
- **Compact rows option:** single-line cells with ellipsis, expand on click.
- **Row to source:** a hover icon that jumps to the row's source line in split/edit view (sourcepos is already there; Ctrl+E on a focused row does it today).

Performance:
- **Parse once per render**, right after the Markdown render where the task-checkbox listeners are attached; filter and sort touch only the model and the DOM, never the Rust renderer.
- **One animation frame per apply:** set `hidden` and re-append sorted rows in a single pass with no layout reads inside the loop.
- **Debounce only the Find box** (~100 ms, like the search bar); chip clicks apply synchronously.
- **Preview search skips hidden rows by DOM test** (`closest('tr[hidden]')`), not by geometry.
- **Badges and counts derive from the same model**, no second DOM query.
- **Per-row data in a `WeakMap`** keyed by the row element, so nothing leaks across re-renders.
- **Reapply, do not rebuild, on live reload.**
- **Budget test:** an e2e check that Hide done plus a status sort on the SP3 plan applies in under one frame.

### 4.4 What does not change

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
| `text` | `issue`, `gap`, `decision`, `action`, `action / recommendation`, `remediation`, `next steps`, `how to verify`, `basis`, `ref`, `ref (§/wi)`, and any extra column (e.g. `legacy priority / phase`) — all concatenated for Find |

Table kind: `issues` if it has `sev` or its `id` values look like `[A-Z]{1,4}-?\d+`; `decisions` if ids start with `DEC-`; `documents` if the id header is `document`; `checks` if `check`; else `other`. The nearest preceding heading (`h2`/`h3`) names the table in the Table dropdown and carries the count badge.

### 5.3 Status normalisation

Five classes, one per legend icon. Order of evidence inside the status cell: **icon first** (the skill makes the icon mandatory and first in the cell), **then skill keyword**, **then legacy keyword**, else `unknown`.

| Class | Icon | Skill keywords (authoritative) | Legacy fallback (icon-less SP2 / SN2 / CPA plans, until migrated) |
|---|---|---|---|
| `open` | 🔴 | `Open`, `CONFIRMED OPEN`, `DECISION NEEDED`, `FAIL`, `NOT-FOUND`, `NOT-EVIDENCED`, `Planned` | `Blocked`, `Review needed` |
| `progress` | 🟡 | `PARTIALLY CLOSED`, `PARTIAL`, `Draft` (document tables) | `In progress` |
| `draft` | 🟩 | `IMPLEMENTED IN DRAFT` | — |
| `done` | 🟢 | `DONE`, `CLOSED`, `DECIDED`, `PASS`, `Released` | ✅, `Complete`, `Resolved` |
| `none` | ⚪ | `NOT NEEDED`, `Tracked via CR DOC`, `SUPERSEDED` | `deferred`, `moot`, `n/a` |
| `unknown` | — | anything else; never hidden by Hide done, shown with a grey "?" chip | |

Keyword matching is case-insensitive and word-bounded. A cell whose icon and keyword disagree (e.g. `🟢 Open`) is classified by the icon and flagged with the "?" chip, since the skill says the icon is the definition. "Hide done" hides `done` and `none`; the caret option adds `draft`.

### 5.4 Sort keys

There is no priority sort (owner decision, §3). `Sort: Status` orders by the status class, most urgent first, with document order as the only tie-break:

1. **Status class:** `open` < `progress` < `draft` < `unknown` < `done` < `none`.
2. **Document order** (stable; also what `Document order` uses alone).

Rows named as the top blocker in the header `**Status:**` line are not moved by the sort; instead they get a small "blocker" badge in the ID cell so they stand out wherever they are. `Sort: Owner` uses (owner, document order); `Sort: ID` splits the id into prefix + number and compares naturally. `Sev` never enters a sort key.

### 5.5 Invariants

- The source is never modified by filtering or sorting. Only phase 2 status edits write to the in-memory tab content, and only on an explicit click.
- A row whose status cannot be classified is always shown.
- Document order is always restorable without re-rendering.
- Reapplying the same view state to a fresh render yields the same result (pure function of raw content + view state).
- View state lives in the tab, nowhere else: a file open always starts with the view off and defaults; closing the tab discards the state; no global or per-file memory.

## 6. Implementation

Follows the existing patterns (`tasks.ts` + `tests/tasks.test.mjs`, preview search bar in `MarkdownViewer.svelte`, settings in `settings.svelte.ts`, strings in `i18n.ts`). Rendering stays in Rust/comrak — comrak 0.18 already emits `data-sourcepos` on `<tr>` (`html.rs` TableRow branch), which gives every rendered row its source line for free.

| # | File | Change |
|---|---|---|
| 1 | `src/lib/utils/actionPlan.ts` (new) | Pure, DOM-free logic: `isActionPlan`, `classifyStatus`, `mapColumns`, `classifyTable`, `statusRank`, `compareRows`, `applyFilter`, `naturalIdCompare`. Input is a plain `PlanRow { id, status, sev, owner, text, tableIndex, index, sourceLine, isTopBlocker }`. |
| 2 | `src/lib/utils/actionPlanDom.ts` (new) | Thin DOM adapter: `collectPlanTables(markdownBody)` → `PlanTable[]` (rows + `tr` refs + heading), `applyView(tables, state)` (hide / reorder / badges / restore). |
| 3 | `src/lib/components/ActionPlanBar.svelte` (new) | The bar. Props: `tables`, `state` (`$bindable`), `onchange`, `onclose`. Owner/Sev/Table options derived from `tables`. |
| 4 | `src/lib/MarkdownViewer.svelte` | Per-tab `actionPlanView` state (in `tabs.svelte.ts` next to `isEditing`); mount the bar in the preview-search slot; call `applyView` after every render (where task listeners are attached); Ctrl+Shift+A; exclude hidden rows from preview search. |
| 5 | `src/lib/components/TitleBar.svelte` | Toggle button beside the edit toggle, ready-dot when `isActionPlan` is true; kebab entry. |
| 6 | `src/lib/stores/settings.svelte.ts`, `Settings.svelte` | `actionPlan: { hideDoneDefault: true, hideDraftDefault: false, defaultSort: 'document' }` — the bar's defaults when the view is switched on; persisted like the other settings. No auto-enter setting (§4.1). |
| 7 | `src/lib/utils/i18n.ts` | English keys under `actionPlan.*`; other languages fall back to English until translated. |
| 8 | `src/styles.css` | Bar styling (reuse `.preview-search-bar` tokens), `tr.ap-hidden`, heading badge, muted `no rows match` row. |
| 9 | `tests/actionPlan.test.mjs` (new) | Status classification for every skill value and every legacy fallback, icon-over-keyword precedence and the disagreement flag, column aliasing for the four table shapes above, status ordering with stable document-order tie-break, natural ID sort, Hide-done presets, unknown-status never hidden, top-blocker detection from the header line. Fixtures: trimmed header + table excerpts from the SP3, EMC, SN2, CPA and SP2 plans (no content beyond what the test needs). |
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

1. **Default sort on entering the view:** document order (safe, matches the file) or status (open first)? Proposal: document order, with the last used sort remembered per session.
   *Decided 2026-10-18: no priority sort; the view focuses on status (§3, §5.4).*
2. **Hide done default:** on when entering the view? Proposal: on, hide 🟩 draft off.
3. **Decision Log under Hide done:** hide 🟢 DECIDED rows too, or keep decisions always visible? Proposal: hide; the Table filter can show them.
4. **Count badges:** view-only, or also a `Write counts to headings` action that rewrites `(d done / o open)` in the source (phase 2, same safety net)? Proposal: view-only in phase 1.
5. **Tables-only mode:** phase 1 or 2?
6. ~~**Shortcut:** Ctrl+Shift+A acceptable, or prefer a plain `A` like the `?` shortcut dialog?~~ *Decided 2026-10-18: Ctrl+Shift+A.*

## 10. Not in scope

- No new Markdown syntax or front-matter; plans stay plain GFM tables.
- No editing of IDs, owners or text from the view (edit mode does that).
- No cross-file aggregation in phases 1–2.
- No change to the Rust renderer.
