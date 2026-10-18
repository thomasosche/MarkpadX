<script lang="ts">
	import { tick } from 'svelte';
	import {
		activeFilterCount, defaultViewState, STATUS_ICON, STATUS_LABEL, STATUS_ORDER, toggleChip,
		type ActionPlanViewState, type SortKey, type StatusClass,
	} from '../utils/actionPlan.js';
	import { ownerCounts, sevCounts, statusCounts, unclassifiableCount, type PlanModel } from '../utils/actionPlanDom.js';

	interface Props {
		view: ActionPlanViewState;
		model: PlanModel;
		shown: number;
		onchange: () => void;
		onclose: () => void;
	}
	let { view = $bindable(), model, shown, onchange, onclose }: Props = $props();

	let findEl = $state<HTMLInputElement | null>(null);
	let ownerEl = $state<HTMLInputElement | null>(null);
	let suggOpen = $state(false);
	let suggIndex = $state(0);
	let findTimer: ReturnType<typeof setTimeout> | null = null;

	const total = $derived(model.tables.reduce((n, t) => n + t.rows.length, 0));
	const counts = $derived(statusCounts(model));
	const unclassifiable = $derived(unclassifiableCount(model));
	const sevs = $derived(sevCounts(model));
	const sevNames = $derived(sevs.map(([v]) => v));
	const owners = $derived(ownerCounts(model));
	const suggestions = $derived.by(() => {
		const q = view.ownerQuery.trim().toLowerCase();
		return owners.filter(([o]) => !view.owners.includes(o) && (!q || o.toLowerCase().includes(q)));
	});
	const activeCount = $derived(activeFilterCount(view));

	export async function focusFind() {
		await tick();
		findEl?.focus();
	}

	// Esc inside the view: clear text filters first, then let the caller close the view.
	export function escape(): boolean {
		if (suggOpen) { suggOpen = false; return true; }
		if (view.find || view.ownerQuery) {
			view.find = ''; view.ownerQuery = '';
			onchange();
			return true;
		}
		return false;
	}

	function statusClick(e: MouseEvent, cls: StatusClass) {
		view.statuses = toggleChip(view.statuses, cls, STATUS_ORDER, e.shiftKey);
		onchange();
	}

	function sevClick(e: MouseEvent, sev: string) {
		const current = view.sevs.length ? view.sevs : sevNames;
		let next = toggleChip(current, sev, sevNames, e.shiftKey);
		if (next.length === sevNames.length) next = [];
		view.sevs = next;
		onchange();
	}

	function statusTitle(cls: StatusClass): string {
		const base = model.legend[cls] || `${STATUS_ICON[cls]} ${STATUS_LABEL[cls]}`;
		return cls === 'none' && unclassifiable ? `${base} · includes ${unclassifiable} not classifiable (marked ? in the cell)` : base;
	}

	function onFindInput() {
		if (findTimer) clearTimeout(findTimer);
		findTimer = setTimeout(() => onchange(), 100);
	}

	function onFindKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') { if (escape()) e.stopPropagation(); }
		if (e.key === 'Enter') { if (findTimer) clearTimeout(findTimer); onchange(); }
	}

	function pinOwner(o: string) {
		if (!view.owners.includes(o)) view.owners = [...view.owners, o];
		view.ownerQuery = '';
		suggOpen = false;
		onchange();
		ownerEl?.focus();
	}

	function removeOwner(o: string) {
		view.owners = view.owners.filter((x) => x !== o);
		onchange();
	}

	function onOwnerInput() {
		suggIndex = 0;
		suggOpen = true;
		onchange();
	}

	function onOwnerKeydown(e: KeyboardEvent) {
		if (e.key === 'ArrowDown') { suggOpen = true; suggIndex = Math.min(suggIndex + 1, suggestions.length - 1); e.preventDefault(); }
		else if (e.key === 'ArrowUp') { suggIndex = Math.max(suggIndex - 1, 0); e.preventDefault(); }
		else if (e.key === 'Enter') { if (suggOpen && suggestions[suggIndex]) pinOwner(suggestions[suggIndex][0]); e.preventDefault(); }
		else if (e.key === 'Escape') { if (escape()) e.stopPropagation(); }
		else if (e.key === 'Backspace' && !view.ownerQuery && view.owners.length) { view.owners = view.owners.slice(0, -1); onchange(); }
	}

	function setSort(v: string) {
		view.sort = v as SortKey;
		onchange();
	}

	function flipDir() {
		view.dir = view.dir === 'asc' ? 'desc' : 'asc';
		onchange();
	}

	function toggleCompact() {
		view.compact = !view.compact;
		onchange();
	}

	function reset() {
		const d = defaultViewState();
		view.statuses = d.statuses; view.sevs = d.sevs; view.owners = d.owners; view.ownerQuery = '';
		view.find = ''; view.sort = d.sort; view.dir = d.dir; view.compact = d.compact; view.overrides = d.overrides;
		onchange();
	}
</script>

<svelte:window onclick={(e) => { if (!(e.target as HTMLElement)?.closest?.('.ap-owner')) suggOpen = false; }} />

<div class="ap-bar" role="toolbar" aria-label="Action plan filters">
	<div class="ap-grp">
		<span class="ap-lbl">Status</span>
		{#each STATUS_ORDER as cls (cls)}
			<button type="button" class="ap-chip" aria-pressed={view.statuses.includes(cls)} title={statusTitle(cls)} onclick={(e) => statusClick(e, cls)} onmousedown={(e) => e.preventDefault()}>
				{STATUS_ICON[cls]} <span class="ap-n">{counts[cls]}</span>
			</button>
		{/each}
	</div>

	{#if sevs.length}
		<div class="ap-grp">
			<span class="ap-lbl">Sev</span>
			{#each sevs as [sev, n] (sev)}
				<button type="button" class="ap-chip" aria-pressed={view.sevs.length === 0 || view.sevs.includes(sev)} onclick={(e) => sevClick(e, sev)} onmousedown={(e) => e.preventDefault()}>
					{sev} <span class="ap-n">{n}</span>
				</button>
			{/each}
		</div>
	{/if}

	<div class="ap-grp ap-owner">
		<span class="ap-lbl">Owner</span>
		{#each view.owners as o (o)}
			<span class="ap-chip" aria-pressed="true">{o} <span class="ap-n">{owners.find(([x]) => x === o)?.[1] ?? 0}</span><button type="button" class="ap-x" title="remove" onclick={() => removeOwner(o)}>×</button></span>
		{/each}
		<span class="ap-ownerbox">
			<input bind:this={ownerEl} bind:value={view.ownerQuery} class="ap-inp" placeholder="Owner…" autocomplete="off" spellcheck="false"
				oninput={onOwnerInput} onfocus={() => (suggOpen = true)} onkeydown={onOwnerKeydown} />
			{#if suggOpen && suggestions.length}
				<div class="ap-sugg">
					{#each suggestions as [o, n], i (o)}
						<button type="button" class:hi={i === suggIndex} onmousedown={(e) => { e.preventDefault(); pinOwner(o); }}><span>{o}</span><span class="ap-n">{n}</span></button>
					{/each}
				</div>
			{/if}
		</span>
	</div>

	<div class="ap-grp">
		<span class="ap-lbl">Find</span>
		<input bind:this={findEl} bind:value={view.find} class="ap-inp ap-find" placeholder="G2 / DEC- / text" spellcheck="false" oninput={onFindInput} onkeydown={onFindKeydown} />
	</div>

	<div class="ap-grp">
		<span class="ap-lbl">Sort</span>
		<select class="ap-inp ap-sel" value={view.sort} onchange={(e) => setSort((e.currentTarget as HTMLSelectElement).value)}>
			<option value="doc">Document order</option>
			<option value="status">Status (open first)</option>
			<option value="owner">Owner</option>
			<option value="id">ID</option>
		</select>
		<button type="button" class="ap-dir" title="Direction" onclick={flipDir} disabled={view.sort === 'doc'}>{view.dir === 'asc' ? '↓' : '↑'}</button>
	</div>

	<label class="ap-check" title="Single-line cells; click a row to expand it"><input type="checkbox" checked={view.compact} onchange={toggleCompact} /> Compact</label>

	<span class="ap-count">{model.tables.length ? `shown ${shown} / ${total}` : 'no action-plan tables recognised'}</span>
	<button type="button" class="ap-reset" onclick={reset}>Reset{#if activeCount} <span class="ap-n ap-active">{activeCount}</span>{/if}</button>
	<button type="button" class="ap-close" title="Leave Action Plan view (Esc)" onclick={onclose}>×</button>
</div>

<style>
	.ap-bar {
		display: flex; flex-wrap: wrap; align-items: center; gap: 4px 12px;
		padding: 5px 12px; font-size: 12.5px; font-family: var(--win-font);
		background: var(--color-canvas-subtle); border-bottom: 1px solid var(--color-border-default);
		color: var(--color-fg-default); flex-shrink: 0;
	}
	.ap-grp { display: inline-flex; align-items: center; gap: 4px; flex-wrap: wrap; min-width: 0; }
	.ap-lbl { color: var(--color-fg-muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; margin-right: 2px; }
	.ap-chip {
		display: inline-flex; align-items: center; gap: 4px; border: 1px solid var(--color-border-default);
		background: transparent; color: var(--color-fg-default); border-radius: 999px; padding: 1px 8px; font: inherit; line-height: 1.5; cursor: pointer;
	}
	.ap-chip[aria-pressed='true'] { background: var(--color-accent-subtle, var(--color-neutral-muted)); border-color: var(--color-accent-fg); }
	.ap-chip:hover { background: var(--color-neutral-muted); }
	.ap-n { color: var(--color-fg-muted); font-size: 11px; font-variant-numeric: tabular-nums; }
	.ap-chip[aria-pressed='true'] .ap-n { color: inherit; }
	.ap-x { border: none; background: none; color: var(--color-fg-muted); padding: 0 0 0 2px; cursor: pointer; font: inherit; line-height: 1; }
	.ap-inp {
		border: 1px solid var(--color-border-default); background: var(--color-canvas-default); color: var(--color-fg-default);
		border-radius: 6px; padding: 2px 7px; font: inherit; min-width: 0; width: 9em; outline: none;
	}
	.ap-inp:focus { border-color: var(--color-accent-fg); }
	.ap-inp::placeholder { color: var(--color-fg-muted); }
	.ap-find { width: 12em; }
	.ap-sel { width: auto; cursor: pointer; }
	.ap-ownerbox { position: relative; display: inline-block; }
	.ap-sugg {
		position: absolute; top: 100%; left: 0; margin-top: 2px; z-index: 300; min-width: 12em;
		background: var(--color-canvas-default); border: 1px solid var(--color-border-default); border-radius: 6px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
	}
	.ap-sugg button { display: flex; justify-content: space-between; gap: 12px; width: 100%; border: none; background: none; color: inherit; padding: 4px 9px; text-align: left; font: inherit; cursor: pointer; }
	.ap-sugg button:hover, .ap-sugg button.hi { background: var(--color-neutral-muted); }
	.ap-dir, .ap-reset {
		border: 1px solid var(--color-border-default); background: transparent; color: var(--color-fg-default);
		border-radius: 6px; padding: 1px 7px; font: inherit; cursor: pointer;
	}
	.ap-dir:disabled { opacity: 0.4; cursor: default; }
	.ap-active { color: var(--color-accent-fg); }
	.ap-check { display: inline-flex; align-items: center; gap: 4px; cursor: pointer; }
	.ap-count { color: var(--color-fg-muted); font-variant-numeric: tabular-nums; margin-left: auto; white-space: nowrap; }
	.ap-close { border: none; background: none; color: var(--color-fg-muted); font-size: 16px; line-height: 1; padding: 0 4px; cursor: pointer; }
	.ap-close:hover { color: var(--color-fg-default); }
</style>
