<script lang="ts">
	import { fade, scale } from 'svelte/transition';
	import { settings } from '../stores/settings.svelte.js';
	import { t } from '../utils/i18n.js';

	let { show = false, onclose } = $props<{ show?: boolean; onclose: () => void }>();

	let modal = $state<HTMLDivElement>();
	let previousActiveElement = $state<HTMLElement | null>(null);

	const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
	const cmd = isMac ? '⌘' : 'Ctrl';

	type Row = { keys: string; desc: string };
	type Group = { title: string; rows: Row[] };

	const groups: Group[] = [
		{
			title: 'File',
			rows: [
				{ keys: `${cmd}+T`, desc: 'Open Home / Recents tab' },
				{ keys: `${cmd}+W`, desc: 'Close current file / tab' },
				{ keys: `${cmd}+Shift+T`, desc: 'Undo close tab' },
				{ keys: `${cmd}+S`, desc: 'Save (in editor or split mode)' },
				{ keys: `${cmd}+Q`, desc: 'Quit window' },
			],
		},
		{
			title: 'View',
			rows: [
				{ keys: `${cmd}+E`, desc: 'Toggle editor / preview' },
				{ keys: `${cmd}+H`, desc: 'Toggle split view' },
				{ keys: `${cmd}+R  •  F5`, desc: 'Reload current file from disk (preview)' },
				{ keys: `${cmd}+,`, desc: 'Settings' },
				{ keys: '?', desc: 'Show this shortcuts dialog' },
			],
		},
		{
			title: 'Find',
			rows: [
				{ keys: `${cmd}+F`, desc: 'Search in preview' },
				{ keys: 'F3', desc: 'Next match' },
				{ keys: 'Shift+F3', desc: 'Previous match' },
				{ keys: 'Esc', desc: 'Close search' },
			],
		},
		{
			title: 'Zoom',
			rows: [
				{ keys: `${cmd}+=  •  ${cmd}++`, desc: 'Zoom in' },
				{ keys: `${cmd}+-`, desc: 'Zoom out' },
				{ keys: `${cmd}+0`, desc: 'Reset zoom' },
				{ keys: `${cmd}+Wheel`, desc: 'Zoom by mouse wheel' },
			],
		},
		{
			title: 'Tabs',
			rows: [
				{ keys: `${cmd}+Tab`, desc: 'Next tab' },
				{ keys: `${cmd}+Shift+Tab`, desc: 'Previous tab' },
				{ keys: `${cmd}+PgDn  •  ${cmd}+PgUp`, desc: 'Next / previous tab' },
				{ keys: '← / →', desc: 'Previous / next tab (preview, no modifier)' },
				{ keys: 'Mouse 4 / 5', desc: 'Back / forward through MRU tab history' },
			],
		},
	];

	function handleBackdropClick(e: MouseEvent) {
		if (e.target === e.currentTarget) onclose();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.preventDefault();
			onclose();
		}
	}

	$effect(() => {
		if (show) {
			previousActiveElement = document.activeElement as HTMLElement;
			setTimeout(() => modal?.focus(), 0);
		} else if (previousActiveElement) {
			previousActiveElement.focus?.();
			previousActiveElement = null;
		}
	});
</script>

{#if show}
	<div class="sc-backdrop" transition:fade={{ duration: 150 }} onclick={handleBackdropClick} role="presentation">
		<div
			class="sc-modal"
			bind:this={modal}
			transition:scale={{ duration: 200, start: 0.95 }}
			role="dialog"
			aria-modal="true"
			aria-labelledby="sc-title"
			tabindex="-1"
			onkeydown={handleKeydown}>
			<div class="sc-header">
				<h1 id="sc-title">{t('shortcuts.title', settings.language)}</h1>
				<button class="close-btn" onclick={onclose} aria-label="Close">
					<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<line x1="18" y1="6" x2="6" y2="18"></line>
						<line x1="6" y1="6" x2="18" y2="18"></line>
					</svg>
				</button>
			</div>
			<div class="sc-body">
				{#each groups as group}
					<section class="sc-group">
						<h2>{group.title}</h2>
						<dl>
							{#each group.rows as row}
								<div class="sc-row">
									<dt>
										{#each row.keys.split(/\s*•\s*/) as combo, i}
											{#if i > 0}<span class="sep">or</span>{/if}
											<span class="combo">
												{#each combo.split('+') as part, j}
													{#if j > 0}<span class="plus">+</span>{/if}
													<kbd>{part}</kbd>
												{/each}
											</span>
										{/each}
									</dt>
									<dd>{row.desc}</dd>
								</div>
							{/each}
						</dl>
					</section>
				{/each}
			</div>
		</div>
	</div>
{/if}

<style>
	.sc-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.4);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 10000;
	}

	.sc-modal {
		background: var(--color-canvas-default);
		border: 1px solid var(--color-border-default);
		border-radius: 6px;
		box-shadow: 0 20px 50px rgba(0, 0, 0, 0.3);
		width: 640px;
		max-width: 92vw;
		max-height: 80vh;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		font-family: var(--win-font);
		outline: none;
	}

	.sc-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 14px 18px;
		border-bottom: 1px solid var(--color-border-default);
	}

	.sc-header h1 {
		margin: 0;
		font-size: 14px;
		font-weight: 600;
	}

	.close-btn {
		background: transparent;
		border: none;
		color: var(--color-fg-muted);
		cursor: pointer;
		padding: 4px;
		border-radius: 4px;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.close-btn:hover {
		background: var(--color-neutral-muted);
		color: var(--color-fg-default);
	}

	.sc-body {
		padding: 14px 18px 18px;
		overflow-y: auto;
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 18px 28px;
	}

	.sc-group h2 {
		margin: 0 0 8px;
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--color-fg-muted);
		font-weight: 600;
	}

	.sc-group dl {
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.sc-row {
		display: grid;
		grid-template-columns: minmax(0, auto) 1fr;
		gap: 12px;
		align-items: baseline;
		font-size: 12px;
		padding: 3px 0;
	}

	.sc-row dt {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 4px;
		white-space: nowrap;
	}

	.combo {
		display: inline-flex;
		align-items: center;
		gap: 2px;
	}

	.plus {
		opacity: 0.5;
		font-size: 10px;
	}

	.sep {
		opacity: 0.5;
		font-size: 10px;
		margin: 0 4px;
	}

	kbd {
		display: inline-block;
		min-width: 18px;
		padding: 1px 6px;
		font-family: var(--win-font);
		font-size: 11px;
		line-height: 1.5;
		text-align: center;
		background: var(--color-canvas-subtle);
		border: 1px solid var(--color-border-default);
		border-bottom-width: 2px;
		border-radius: 4px;
		color: var(--color-fg-default);
	}

	.sc-row dd {
		margin: 0;
		color: var(--color-fg-default);
		min-width: 0;
	}

	@media (max-width: 600px) {
		.sc-body {
			grid-template-columns: 1fr;
		}
	}
</style>
