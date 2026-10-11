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

---

## I-05 · Folder pane: Markdown files of the folder, opposite the outline

- **Status:** done (2026-10-11) — implemented as planned, with these changes from the owner's test: no close (X) button in the pane header (the floating toggle closes it), a switch-side button instead, and the dock/undock option removed for both side panes (always docked). Tests: `tests/folderPane.test.mjs`, Rust unit tests in `src-tauri/src/folder.rs`, E2E `tests/e2e/folder.mjs` (11 checks).
- **Added:** 2026-10-11 (requested by the owner; inspired by upstream PR [sftwrdotdev/Markpad#964](https://github.com/sftwrdotdev/Markpad/pull/964))

**What**
- A second sidebar pane on the opposite side from the outline (TOC). It lists the Markdown files of a folder; clicking one opens it as a tab.
- The outline stays where it is (`tocSide`), and the folder pane takes the other side.

**Why**
Notes and tech-file folders hold many related `.md` files. Today you open them one by one through the file dialog or links; a folder pane shows the neighbours of the current file at a glance.

**Reference: how upstream PR #964 does it** (open, **not merged**; upstream declined a folder tree before, #149)
- **Folder selection:** an **Open Folder** entry in the main (⋮) menu opens the system folder picker (`open({ directory: true, multiple: false })`). No shortcut (`Ctrl+Shift+O` is taken by Monaco). A **Close Folder** button sits in the pane header. One folder per window.
- **Persistence:** the folder path is stored in `localStorage` (`folder.lastRoot`) on open and cleared on close. Only the main window restores it at start-up; a folder that no longer exists is dropped quietly. Expanded subfolders are not remembered. Side, stack order, "Show all files", divider position and column width are settings.
- **Tree:** reads one level per expand and watches only expanded folders, non-recursively, coalesced over 200 ms. By default it lists only the files Markpad opens; "Show all files" lists the rest dimmed and opens them with the system app (launchable files are revealed, never run).
- **Security:** on Windows, symlinks and junctions are not listed, so expanding a folder can never make Windows offer NTLM credentials to a UNC host.
- **Size:** about 1,270 lines over 16 files. It is stacked on PR #963 (tabs in a side column) and uses upstream-only modules (`app.rs`, `window_runtime.rs`, `coalesced`, `openWithSystem`, the shared extension list). **Not portable to the current fork base**; realistic only after the I-03 rebase, and only if upstream merges it.

**Notes: simple version for the current code base** (about half a day, 300–400 lines)
- **Rust:** one command that lists one folder level: Markdown files sorted by name, hidden entries skipped, symlinks/junctions skipped on Windows (same reasoning as #964). Unit test.
- **`FolderFiles.svelte`:** flat list. The active file is highlighted, files open in a tab are marked, a click opens the file like a link does (one tab per path).
- **Placement:** mirror the outline's existing wrapper (overlay/pinned, width, fly transition, Zen mode hides it) on the side opposite `tocSide`. Mostly CSS in `MarkdownViewer.svelte`.
- **Toggle:** a floating button like the outline's, plus a setting (off by default).
- **Refresh:** on file open, tab switch and window focus, plus a refresh button. Optional later: a non-recursive directory watcher.
- **Tests:** E2E with the isolated profile: list shown, click opens, pane is on the other side from the outline, a file added on disk appears after a refresh.

**Spec decisions (owner, 2026-10-11)**
- **Folder:** both. By default the pane shows the folder of the active tab and follows tab switches; a **pin** button keeps the current folder fixed while you open files elsewhere. An Open Folder entry in the ⋮ menu (system folder picker) pins a chosen folder.
- **Structure:** flat list, one folder level, no subfolders.
- **Files:** `.md` only.
- **Remembered for the next session:** only whether the pane is open. A pinned folder is **not** restored; after a restart the pane follows the current file again.
- **Estimate with these decisions:** about 0.75 day (the pin and Open Folder add a few hours to the simple version above).

**Still open**
- **Sorting and extras:** by name only, or also by modification date? Show the date? Filter box?
- **Live update:** refresh on file open / tab switch / window focus plus a refresh button, or also watch the folder for new and deleted files while the pane is open?
- **Go / no-go:** pending the owner's decision.

**Implementation plan (draft 2026-10-11, for the go / no-go decision)**

*Assumptions for the points still open; change them before the go if needed:*
- **A1 · Sorting:** by file name only, case-insensitive with numbers in natural order (`2.md` before `10.md`). No date column, no filter box.
- **A2 · Refresh:** when the folder changes (tab switch, pin/unpin), when the window regains focus, after Save / Save As, and with a refresh button. No directory watcher.
- **A3 · Open Folder:** an entry in the ⋮ menu opens the system folder picker and pins the chosen folder.
- **A4 · Pane behaviour:** overlay vs. pinned follows the outline's existing **Pin** setting, so both panes behave alike. The pane is available in view, edit and split mode; hidden on the Home/Recents page and in Zen mode.

*Steps*
1. **Rust: `src-tauri/src/folder.rs`, command `list_markdown_files(dir)`.**
   - Reads one level with `read_dir` and returns `{ name, path }` for regular files with the extension `.md` (case-insensitive).
   - Skips hidden entries (leading `.`), subfolders and all other file types.
   - Never follows links: the entry type comes from `read_dir`'s own records. On Windows, symlinks and junctions (reparse points) are left out, so a listing can never make Windows offer NTLM credentials to a UNC host (the reason given in upstream #876 / #964).
   - Sorts by name, case-insensitive and natural.
   - Errors for a missing path or a path that is not a folder.
   - Registered in `lib.rs`.
2. **Pure helpers `src/lib/utils/folderPane.ts`:**
   - `dirname(path)` for `\` and `/`, drive roots and UNC paths.
   - `samePath(a, b)`: case-insensitive on Windows, ignores separator style.
   - `paneFolder(pinned, activeTabPath)`: the pinned folder, otherwise the active file's folder; null for untitled tabs and the Home page.
3. **Store `src/lib/stores/folderPane.svelte.ts`:**
   - State: `pinned`, `folder` (derived), `files`, `error`, `loading`.
   - Methods: `refresh()` with a sequence guard (a slower old listing cannot overwrite a newer one), `pin()`, `unpin()`, `openFolder()` (dialog → pin).
   - The pinned folder lives in memory only, so it is not restored after a restart (spec).
4. **Settings (`settings.svelte.ts`):**
   - `showFolderPane`, persisted as `editor.showFolderPane`, default off.
   - Included in the Zen-mode save/restore like `showToc`.
   - Checkbox in Settings → Appearance.
5. **UI `src/lib/components/FolderPane.svelte`:**
   - **Header:** folder name, full path as tooltip, pin/unpin, refresh and close buttons.
   - **Rows:** file name, the active file highlighted, files already open in a tab marked (their unsaved dot shown as in the tab).
   - **Empty and error states:** "No Markdown files", "Folder not available".
   - **Click:** opens the file through `loadMarkdown`, which already switches to an existing tab instead of opening a duplicate.
6. **Placement in `MarkdownViewer.svelte`:**
   - A second wrapper mirroring `toc-overlay-wrapper`, on the opposite side from `settings.tocSide`: same width, fly transition, overlay/pinned styles.
   - A floating toggle button mirroring `toc-toggle-floating`.
   - Layout classes `has-pinned-folder` / `folder-on-left` / `folder-on-right`, so a pinned pane never covers the editor or the preview text.
7. **Menu (`TitleBar.svelte`):** "Open Folder…" in the ⋮ menu (`onopenFolder`), below Open File; also turns the pane on.
8. **Refresh triggers (`MarkdownViewer.svelte`):** effect on `folderPane.folder`; `onFocusChanged` → refresh when focused and the pane is shown; after `saveContent` / `saveContentAs` when the saved file is in the shown folder.
9. **i18n:** new keys in en + de; other languages fall back to English. Covers the title, pin, unpin, Open Folder, refresh, close, empty, not available, and the show/hide tooltips.
10. **Docs:** README section "Folder pane"; I-05 status → done.

*Tests*
- **Rust unit tests (`cargo test`, in `folder.rs`, temp folders with std only):**
  - only `.md` / `.MD` listed; `.markdown`, `.txt`, subfolders and hidden files left out
  - natural, case-insensitive order
  - one level only (a file in a subfolder is not listed)
  - a missing path and a file path return errors
  - Windows: a junction (created with `mklink /J`, no admin rights needed) and, where the runner may create it, a symlink are left out; the symlink test skips itself if it can't be created
- **Node unit tests (`tests/folderPane.test.mjs`, `npm test`):**
  - `dirname` for `C:\a\b.md`, `/a/b.md`, `\\server\share\x.md` and drive roots
  - `samePath` with mixed case and separators
  - `paneFolder`: pinned wins; untitled tab and Home page give null; follows the active path when unpinned
- **E2E (`folder.mjs`, same harness as the other suites: debug build, throw-away WebView2 profile, own fixture folder, safety stop for non-fixture files):**
  - **Fixture folder:** `a.md`, `B.md`, `2.md`, `10.md`, `notes.txt`, `.hidden.md`, `sub/c.md`, a junction `link/` to another fixture folder; a second folder `other/` with `x.md`.
  1. Pane off by default; the toggle shows it on the side opposite the outline; switching the outline side moves the pane to the other side.
  2. The list shows exactly `2.md, 10.md, a.md, B.md`.
  3. The active file is highlighted; clicking `a.md` opens it; clicking an already open file switches to its tab, so the tab count stays the same.
  4. Opening `other/x.md` (tab switch) → the list follows to `other/`.
  5. Pin, switch tabs → the list stays; unpin → it follows again.
  6. A new `new.md` on disk is not shown until a trigger; tab switch and the refresh button show it.
  7. Saving a file into the shown folder (Save) refreshes the list.
  8. Folder renamed while shown → "Folder not available", no crash; the next refresh after restoring works.
  9. Restart with the same profile: the pane is open again; a previously pinned folder is not restored (follows the current file).
  10. Pinned pane in edit and split mode does not overlap the editor or the preview (rect check); at 200 % zoom the list stays clickable.
  11. No console errors; the app is still running.
- **Regression:** the existing suites (main end-to-end, carry-over, auto reload, unit tests) must stay green.
- **Manual checks (not automatable over CDP):** the native folder picker (Open Folder), refresh on window focus, a folder on a network share.

*Estimate:* about 1–1.25 days. Implementation ~0.75 day, tests ~0.25–0.5 day.

*Before starting:* the E2E harness currently lives only in a scratch folder. Moving it into the repo first (`tests/e2e/`, `npm run test:e2e`) is recommended, so the new suite and the existing ones are kept and can be re-run.

**Plan review (2026-10-11): robustness and usability improvements, in scope of the change**

*Robustness*
- **R1 · Filter on `is_file()` instead of hand-written reparse-point checks.** `DirEntry::file_type()` from `read_dir` never follows links; on Windows Rust's `is_file()` is false for symlinks and junctions but true for OneDrive/Dropbox on-demand placeholders. One check covers all platforms, no `cfg(windows)` branch, and placeholders on synced folders still appear. Keep the junction unit test to prove it. Never call `metadata()` on an entry, since that follows the link.
- **R2 · Skip unreadable entries rather than failing the listing.** The existing `list_directory_contents` in `lib.rs` aborts on the first bad entry. A locked file on a share must not blank the whole pane.
- **R3 · Make the command `async`.** Sync Tauri commands run on the main thread; listing a UNC folder can stall for seconds, and the pane refreshes on every window focus. Add a small throttle on the focus trigger (skip if the last refresh was under 1 s ago) on top of the sequence guard.
- **R4 · Share the path normaliser with `loadMarkdown`.** `loadMarkdown` already has an inline `norm` closure for the one-tab-per-path check. Move it into `folderPane.ts` and reuse it there, so "already open" marks and tab de-duplication can never disagree.
- **R5 · Missing refresh triggers:** in-app rename (`menu-tab-rename` → `rename_file`) and the `navigate: true` path of `loadMarkdown` both change what the list should show. Simplest rule: refresh after any Save, Save As or rename, without a "is it in the shown folder" check.
- **R6 · Click on a vanished file:** if `loadMarkdown` throws because the file was deleted after listing, show the toast and refresh the list.
- **R7 · Two pinned panes:** `isOverhanging` accounts for one 240 px pane. With outline and folder pane both pinned, the centred preview needs 480 px of padding, otherwise the overlay test gives the wrong answer and text gets covered.
- **R8 · Sort in TypeScript, not Rust.** `new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })` gives natural, case-insensitive, locale-aware order in one line. Rust returns names unsorted; this drops ~30 lines of Rust plus their tests (A1 unchanged in effect).
- **R9 · No per-row transitions.** The outline uses `transition:slide` per item; a tech-file folder with several hundred `.md` files would jank on every refresh. Key the `{#each}` by path and assign `files` only when the listing actually changed, so scroll position survives a refresh. Show the loading state only when there is no list yet (no spinner flicker on refresh).

*Usability*
- **U1 · Untitled tab or Home: keep the last folder.** `paneFolder` returning null for untitled tabs means New File empties the pane. A sticky last folder is less surprising.
- **U2 · Empty state with a call to action.** When no folder can be shown, offer an "Open Folder…" button in the pane itself, not only in the ⋮ menu.
- **U3 · Error state when pinned offers Unpin.** Otherwise a renamed pinned folder leaves the user stuck on "Folder not available".
- **U4 · Header folder name opens Explorer.** The `open_file_folder` command already exists; one click on the folder name reveals the folder. Full path as tooltip, as planned.
- **U5 · Rows as `<button>` elements.** Gives Tab/Enter navigation and screen-reader support for free. Long names get CSS ellipsis with the full name as tooltip.
- **U6 · Extension list (owner's call, changes a spec decision).** The spec says `.md` only, but the app itself treats `md, markdown, mdown, mkd` as Markdown. Reusing that constant costs nothing and avoids "why is my `.markdown` file missing".

*Design note for later*
- `watch_file` keeps a single watcher slot that is replaced per active tab. A folder watcher would need its own slot in `WatcherState`. No watcher for v1 (A2), but write `refresh()` so a future `folder-changed` event just calls it.
