# MarkpadX — Idea List

Ideas that are not scheduled yet. Each entry: what it should do, why, notes on how it could be built, and open questions to settle before implementing.

**Status values:** `idea` (not decided) · `planned` (agreed, not started) · `in progress` · `done` · `rejected`

---

## I-01 · Linked caret row and word highlight in split view

- **Status:** idea
- **Added:** 2026-10-11

**What**
- In split view, the preview marks the row that holds the editor's caret, and follows the caret as it moves.
- When a word or text is highlighted (selected) in one pane, the same text is highlighted in the other pane: editor → preview and preview → editor.

**Why**
In split view the two panes are not visibly connected. You have to search the preview for the line you are editing, and the other way round.

**Notes (how it could be built)**
- **Reuse:** the edit ↔ view carry-over already maps both directions:
  - **Editor → preview:** source line plus text, via `applyViewSelection` and `data-sourcepos`.
  - **Preview → editor:** source block plus occurrence, via `captureVisibleSelection` and `selectSourceText`.

  Both are tested at every zoom level, including table cells and headings.
- **Mark, don't move:**
  - **Preview:** the CSS Custom Highlight API (`CSS.highlights`), as used for the former caret-row marker.
  - **Editor:** a Monaco decoration.

  Neither should change the other pane's real selection or caret, so typing and copying are not disturbed.
- **Triggers:** Monaco `onDidChangeCursorSelection`, and `selectionchange` on the preview. Debounce both (e.g. 100 ms) so typing stays fast.
- **Scrolling:** only highlight by default. Scroll the other pane only when split-view scroll sync is on, and only if the target is outside the view.
- **Colour:** the same amber as the editor's caret-line frame and the edit → view glow.

**Open questions**
- Should the preview row marker show permanently in split view, or only while the editor has focus?
- Should the word highlight be a selection only, or also the word under the caret? The latter is similar to Monaco's own occurrence highlighting.
- If the same text occurs several times in one block, mark only the matching occurrence, or all of them?
- Should anything happen outside split view (e.g. on the edit ↔ view switch the selection is already carried over)?

---

## I-02 · Tab list in the right sidebar instead of the title-bar strip

- **Status:** idea
- **Added:** 2026-10-11 (moved from `REVIEW-2026-10-11.md` F1; requested by the owner)
- **Precondition:** build on the upstream-rebased code base (see `REVIEW-2026-10-11.md` section S / P5), not on the current one.

**What**
- An opt-in setting shows the open tabs as a vertical list in the sidebar (full title, folder hint, unsaved dot, close button) instead of the horizontal strip in the title bar. Default stays `top`.
- When both the tab list and the outline (TOC) are shown, they share the sidebar: tabs on top, outline fills the remaining height.

**Why**
With many open files the strip truncates titles and needs scroll arrows; a vertical list shows every open document at a glance and gives the unsaved dot room to be seen.

**Notes (how it could be built)**
- **Reuse:** the sidebar slot is the navigation pane — `Toc` inside `toc-overlay-wrapper` with `settings.tocSide` (left/right), `settings.pinnedToc` (pinned vs overlay), Zen-mode hiding and the fly transition. All tab state and shortcuts live in `tabManager` / `MarkdownViewer`, not in the strip. On the upstream base: `tocOverlay.ts`, the resizable TOC (#190) and the three-button mode control (#838).
- **Steps:**
  1. `settings.svelte.ts`: `tabsPosition: 'top' | 'sidebar'`, persisted like `tocSide`; toggle in the Settings Appearance section.
  2. `TabList.svelte`: `orientation="vertical"` prop. Native vertical scrolling instead of the scroll arrows; drag-reorder switched from `currentX` to `currentY` (both already tracked in `dragState`). **Phase 1 ships without drag reorder.**
  3. `Tab.svelte`: wide layout — one row with title, unsaved dot and close button, optional second line with the folder; no truncation to strip width.
  4. Sidebar composition: stack tabs above the outline inside the existing wrapper so pinned/overlay, side and Zen mode apply to both. Keep `Toc` untouched.
  5. `TitleBar.svelte`: with `tabsPosition === 'sidebar'`, render a slim drag region with window controls, kebab menu and the "+" new-tab button only.
  6. Verify detach-to-window, the tab context menu (close others / close to right), Ctrl+Tab cycling and `recentlyClosed` from the vertical list — event-driven, should need no change.
- **Estimate:** ~1 day; main effort in the vertical `TabList` and the sidebar stacking. Low risk, the strip stays the default.

**Open questions**
- Sidebar side: follow `tocSide`, or an own setting?
- With the outline hidden, should the tab list take the full sidebar height, or keep a fixed block?
- Should the vertical list group tabs by folder when several files share a name (upstream #728 shows the folder as a suffix)?
- Drag reorder in phase 2: also allow dragging a tab out into a new window from the vertical list?

---

## I-03 · Re-base MarkpadX on upstream Markpad 2.8.4

- **Status:** idea
- **Added:** 2026-10-11 (from the code review of the same day; upstream checked at `sftwrdotdev/Markpad` master, v2.8.4)

**What**
- Start a new branch from `upstream/master` and re-apply only what is unique to MarkpadX on top of it, instead of merging upstream into the fork.
- Afterwards MarkpadX tracks upstream releases again with small, regular merges.

**Why**
- The fork base is upstream v2.6.5 (2026-05-01). Upstream is **611 commits ahead** (283 fixes, 63 features, 38 refactors, 11 perf). A trial `git merge upstream/master` produces **14 conflicted files**, including every file the fork changed (`MarkdownViewer.svelte`, `Editor.svelte`, `Toc.svelte`, `Tab.svelte`, `TitleBar.svelte`, `Settings.svelte`, `HomePage.svelte`, `i18n.ts`, `lib.rs`). Cherry-picking single fixes conflicts for the same reason.
- Upstream now has, independently: task checkboxes in view mode via `li[data-sourcepos]` (#345, #352, #534, #805), never reload over unsaved edits (#412), save-conflict detection (#698, #875), dirty-tab confirmation before batch close (#243), reading position kept on reload / cold start / tab switch (#420, #740, #839), Ctrl+E on the same line both ways at any zoom (#802, #889), directory-based watcher (#697), one render per open and one reload per save (#947), F5 reload, Back/Forward history, anchor and local-file links, Ctrl+F find bar (#144, #560, #586), shortcuts reference (#488), one tab per path (#413), encoding detection (#544), session-restore recovery, and security fixes (#869 reveal instead of run, UNC refused; #876/#877 no other host's share; #415; #265; dependency audits #306, #953, #960 plus CI audit).
- Upstream is modular (Rust in 10 modules, 80 util modules, 126 vitest files, comrak 0.54, notify 8, Tauri 2.12); the fork's single 3,900-line viewer cannot absorb that by merging.

**Notes (how it could be built)**
- Branch `rebase/upstream-2.8.4` from `upstream/master`; keep `master` as is until the branch reaches feature parity on the list below.
- Port in the order P1 → P5. For every item: first verify what upstream already does in the running app, then port the fork behaviour **only where it differs**.
- Estimate 2–3 days. Main risk is UI drift: upstream replaced the mode toggle with a three-button Preview / Split / Edit control (#838), regrouped settings (#920), added tabs across windows (#214, #279) and window tags (#280, #852).
- Versions: upstream 2.8.4; MarkpadX `package.json` 2.6.5, `Cargo.toml` 2.3.1 — align both to upstream's number plus a fork suffix.

**Work list after the rebase**

*P1 · Build, deploy and supply chain (fork-only, no upstream equivalent)*
- [ ] `build.ps1` (debug, kills running Markpad instances first), `release.ps1`, exe-only release flow (`npm run build` + `npx tauri build --no-bundle`); deploy by replacing the locally installed exe (keep a `.bak` of the previous one).
- [ ] `sbom-upload.ps1` (DependencyTrack) — re-point at upstream's lockfile layout; keep upstream's CI `npm audit` (#308, #314) as well.
- [ ] `install-local.bat`, `.gitignore` entries, `opener:allow-open-path` capability scope — check whether upstream's `localFileLinks.ts` + #869 make the custom scope unnecessary.

*P2 · Owner decisions that differ from upstream defaults (upstream will not have them)*
- [ ] Task toggles stay in memory until Ctrl+S, **no auto-save**. Upstream follows the auto-save setting (#805); map the requirement onto `documentSession.toggleTaskCheckbox`.
- [ ] Unsaved dot in front of the tab name, always visible. Upstream's `Tab.svelte` differs (hover marquee #223, folder suffix #728).
- [ ] Ctrl+F while the bar is open **clears** the query. Upstream re-focuses and keeps it (#560).
- [ ] F5 on a dirty view-mode tab asks Save / Discard / Cancel; live reload keeps unsaved toggles and shows a toast. Compare with upstream #412/#875; keep the toast and the F5 dialog if upstream only silently skips.
- [ ] Bulk close (Ctrl+Shift+W, close others, close to the right): **single three-button dialog** — *Keep unsaved open* (default, Enter/Escape; closes only clean tabs, focuses the first dirty one), *Save all and close* (an untitled tab opens Save As; a cancelled Save As keeps that tab open and continues), *Discard all and close*. Build on upstream #243; the dialog helper needs custom button labels. Still open from the review: the fork today prompts per tab.
- [ ] Ctrl+Shift+W = close all other tabs; ←/→ in preview = previous/next tab; `?` opens the shortcuts dialog. Register in upstream's shortcut registry (`shortcuts.ts`, #488) and check for chord collisions.
- [ ] Enter toggles a focused task checkbox (upstream reacts to the change event, Space only).

*P3 · Fork-unique behaviour to port (upstream has no equivalent)*
- [ ] Selection-text carry-over edit ↔ view (`selection.ts`, `captureViewSelection`, `applyViewSelectionSettled`, `Editor.getSelectionInfo` / `selectSourceText`). Upstream carries the *line* only (`editorPosition.ts`, `previewAnchor.ts`); layer the text selection on top of upstream's line mechanism.
- [ ] External-change line map (`linemap.ts`): old→new line diff keeps viewed lines, preview selection and editor caret/selection across a live reload; deleted lines fall back to the nearest line above; works at every zoom. Port with `tests/linemap.test.mjs`; check interplay with upstream's `previewAnchor.ts`.
- [ ] Editor keeps unsaved edits on external change: notice instead of replacement, Ctrl+S saves the kept version. Overlaps #412/#875 — keep notice wording and line-map repositioning on top of upstream's guard.
- [ ] Edit→view glow on the carried row (`mode-switch-glow`, about 1 s fade) and the caret-line frame in the built-in editor themes (`styles.css`).
- [ ] Task-toggle safety net: sourcepos state check + count-agreement fallback with refusal toast, stale-render check, failure toasts (`resolveTaskLine` in `tasks.ts`). Upstream maps by sourcepos but has no state check.
- [ ] Watcher re-arm guard and 3× retry (`armWatcher`). Upstream watches the directory (#697); port only the retry if upstream still arms once.
- [ ] Tests `tests/tasks.test.mjs`, `tests/linemap.test.mjs` → upstream's vitest; E2E harness with throw-away `WEBVIEW2_USER_DATA_FOLDER` (check `scripts/*.test.ts` for an existing harness first).
- [ ] i18n flat keys `modal.unsavedChangesViewMode`, `modal.unsavedChangesSplitView`, `modal.exitDiscardsUnsaved`, `toast.*` in en + de. Upstream ships English only and fetches other languages on first use (#945).

*P4 · Fork features to compare — keep upstream's if equal or better*
- [ ] Reading position on reload / mode switch (`capturePreviewAnchor`, `pinPreviewPositionSettled`) vs upstream #420, #740, #839. Test: F5 on a long doc with mermaid/KaTeX; edit→view at 150 % zoom.
- [ ] TOC navigation (first-click jump, re-pin on reflow, auto-refresh) vs upstream #901, #891, #694, #965, `tocFollow.ts`.
- [ ] Preview search Ctrl+F / F3, 3-char threshold, case toggle vs upstream FindBar (#144, #586, #377). Keep clear-on-Ctrl+F (P2).
- [ ] Preview link navigation: anchors, relative links, open with default app, Back/Forward history vs upstream `nav-back`/`nav-forward`, `localFileLinks.ts`, #869/#876. Verify `test-links.md` / `test-linked.md` samples.
- [ ] F5 / Ctrl+R reload, Live Mode persisted, debounced reload vs upstream `file-reload` chord, #947, #296.
- [ ] Open-with / single-instance focus vs upstream #193, #866.
- [ ] Link tooltip hidden on click vs upstream #665.

*P5 · New work and polish, only after the rebase*
- [ ] I-02 · Tab list in the right sidebar — build on upstream's `tocOverlay.ts`, resizable TOC (#190) and the three-button mode control (#838).
- [ ] I-01 · Linked caret row and word highlight in split view — depends on the P3 selection carry-over port.
- [ ] Reload-pin release should also react to window-level keys (PageDown etc. with focus outside the preview); today only `wheel` / `mousedown` / `keydown` on the preview body release the pin. Re-check against upstream's `previewAnchor.ts`; drop if not applicable.
- [ ] One cancel handle for both settle loops (selection re-apply after edit→view, reload pin), so a live reload inside the 5 s window does not fight the selection re-apply. Same re-check.
- [ ] Toast on a failed reload (save and toggle failures already have toasts).
- [ ] README: rewrite "New in MarkpadX (vs. upstream)" to list only P1–P3; everything upstream covers moves out.

**Open questions**
- Rebase now, or wait for the next upstream release and rebase onto that tag?
- Keep the fork's German translations for the new keys, or rely on upstream's on-demand language files (#945)?
- Should the exe-only release flow become a GitHub Action in the fork, mirroring upstream's CI, or stay a local script?

---

## I-04 · Edit → view → edit lands on the same row

- **Status:** idea
- **Added:** 2026-10-11 (requested by the owner)

**What**
- After switching from edit to view and back, the caret is on the same row (and column) it had before the first switch, and the editor shows that row at the same height.
- The same holds for the opposite round trip (view → edit → view): the preview is back on the rows it showed before.

**Why**
- Today each direction is mapped independently. Edit → view carries the caret row (it glows), but without a text selection the preview has nothing selected. View → edit then falls back to `captureTopRow`, the row at the **top** of the preview, so the caret lands wherever the top of the view was, not on the row that was carried over. A quick "look at the rendering and come back" moves the caret, and the next key press edits the wrong line.
- A round trip without any interaction in between should be a no-op for the caret; that is what users expect from a toggle.

**Notes (how it could be built)**
- **Remember the carried position per tab.** When edit → view runs, keep the `SourceSelection` from `editorPane.getSelectionInfo()` (line, column, selection range, `viewportOffset`) on the tab, e.g. `tab.carriedFromEditor`. When view → edit runs and the preview has **no visible selection**, use that stored position instead of `captureTopRow`, as long as it is still valid (see below). A selection the user made in the preview still wins, as today.
- **Validity:** the stored position is used only if the file did not change in between (compare `rawContent` / `originalContent`, or map it through `linemap.ts` after an external reload) and the user did not navigate away in the preview. "Navigated away" = the carried row is no longer inside the viewport (a scroll past it); a mere click or a short scroll that keeps the row visible should not drop it. Clear the stored position on tab switch, close and reload-with-discard.
- **Column:** keep the editor column from the stored selection; the preview cannot supply it. The current `captureTopRow` returns column 1.
- **Scroll height:** keep the stored `viewportOffset` so the row is at the same height as before, which the carry-over already supports.
- **Reverse trip (view → edit → view):** symmetric: store the preview anchor (`capturePreviewAnchor`) on view → edit; on edit → view with no editor selection change since the switch, restore that anchor instead of positioning by the caret row. Use `pinPreviewPositionSettled` for the restore.
- **Reuse:** `selection.ts` types, `getSelectionInfo` / `selectSourceText` in `Editor.svelte`, `captureViewSelection` / `applyViewSelectionSettled` and `capturePreviewAnchor` / `pinPreviewPositionSettled` in `MarkdownViewer.svelte`, `mapLines` in `linemap.ts` for the changed-on-disk case.
- **Tests:** unit test for the decision function (stored position vs. top row vs. preview selection) with the cases: no interaction, scrolled but row still visible, scrolled past, file changed, preview selection made. E2E: Ctrl+E twice at line 50 column 12 keeps 50:12 and the same scroll offset, at 100 % and 200 % zoom.
- After the upstream rebase (I-03): upstream carries the line both ways (#802, #889) and may already keep the caret on a round trip; check before porting.

**Open questions**
- Should a scroll in the preview that keeps the carried row visible still count as "same place", or should any scroll switch back to the top-row rule?
- When the user clicks in the preview without selecting text (caret only), should that click define the return row, or keep the stored editor caret?
- Keep the stored position across a live reload when the row survived the line map, or always fall back to the top row after an external change?
