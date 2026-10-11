<script lang="ts">
	import { settings } from '../stores/settings.svelte.js';
	import { tabManager } from '../stores/tabs.svelte.js';
	import { folderPane } from '../stores/folderPane.svelte.js';
	import { baseName, samePath } from '../utils/folderPane.js';
	import { t } from '../utils/i18n.js';

	let { side, onopen, onshowTooltip, onhideTooltip } = $props<{
		side: 'left' | 'right';
		onopen: (path: string) => void;
		onshowTooltip?: (e: MouseEvent, text: string, shortcut?: string, align?: 'top' | 'right' | 'left' | 'below') => void;
		onhideTooltip?: () => void;
	}>();

	let isPinned = $derived(folderPane.pinned !== null);
	let activePath = $derived(tabManager.activeTab?.path || '');

	function tabFor(path: string) {
		return tabManager.tabs.find((tab) => tab.path && samePath(tab.path, path));
	}

	function togglePin() {
		if (isPinned) folderPane.unpin();
		else folderPane.pin();
		onhideTooltip?.();
	}
</script>

<div class="folder-pane" class:loading={folderPane.loading}>
	<div class="folder-pane-header" class:on-right={side === 'right'}>
		<span class="folder-pane-title" title={folderPane.folder ?? ''}>
			{folderPane.folder ? baseName(folderPane.folder) : t('folderPane.title', settings.language)}
		</span>
		<button
			class="folder-pane-btn folder-pane-pin"
			class:active={isPinned}
			aria-pressed={isPinned}
			disabled={!isPinned && !folderPane.folder}
			onclick={togglePin}
			onmouseenter={(e) => onshowTooltip?.(e, isPinned ? t('folderPane.unpin', settings.language) : t('folderPane.pin', settings.language), undefined, 'below')}
			onmouseleave={() => onhideTooltip?.()}
			aria-label={isPinned ? t('folderPane.unpin', settings.language) : t('folderPane.pin', settings.language)}>
			<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
				<line x1="12" y1="17" x2="12" y2="22"></line>
				<path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"></path>
			</svg>
		</button>
		<button
			class="folder-pane-btn folder-pane-refresh"
			disabled={!folderPane.folder}
			onclick={() => folderPane.refresh()}
			onmouseenter={(e) => onshowTooltip?.(e, t('folderPane.refresh', settings.language), undefined, 'below')}
			onmouseleave={() => onhideTooltip?.()}
			aria-label={t('folderPane.refresh', settings.language)}>
			<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
				<path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"></path>
				<path d="M21 3v5h-5"></path>
			</svg>
		</button>
		<!-- the pane always sits opposite the outline, so switching sides swaps both, as the outline's own button does -->
		<button
			class="folder-pane-btn folder-pane-switch-side"
			onclick={() => { settings.toggleTocSide(); onhideTooltip?.(); }}
			onmouseenter={(e) => onshowTooltip?.(e, t('tooltip.switchSide', settings.language), undefined, 'below')}
			onmouseleave={() => onhideTooltip?.()}
			aria-label={t('tooltip.switchSide', settings.language)}>
			<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
				<path d="m18 8 4 4-4 4"></path>
				<path d="M2 12h20"></path>
				<path d="m6 8-4 4 4 4"></path>
			</svg>
		</button>
	</div>

	{#if folderPane.error}
		<div class="folder-pane-error" title={folderPane.error}>{t('folderPane.notAvailable', settings.language)}</div>
	{:else if !folderPane.folder}
		<div class="folder-pane-empty">{t('folderPane.noFolder', settings.language)}</div>
	{:else if folderPane.files.length > 0}
		<ul class="folder-pane-list">
			{#each folderPane.files as file (file.path)}
				{@const tab = tabFor(file.path)}
				<li
					class="folder-pane-item"
					class:active={activePath !== '' && samePath(activePath, file.path)}
					class:open={!!tab}
					class:dirty={!!tab?.isDirty}
					data-path={file.path}>
					<button class="folder-pane-link" title={file.name} onclick={() => onopen(file.path)}>
						{#if tab?.isDirty}
							<span class="dirty-dot" aria-hidden="true"></span>
						{/if}
						<span class="folder-pane-name">{file.name}</span>
					</button>
				</li>
			{/each}
		</ul>
	{:else if !folderPane.loading}
		<div class="folder-pane-empty">{t('folderPane.empty', settings.language)}</div>
	{/if}
</div>

<style>
	.folder-pane {
		width: 240px;
		flex-shrink: 0;
		height: 100%;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		font-family: var(--win-font);
		position: relative;
	}

	.folder-pane-header {
		display: flex;
		align-items: center;
		gap: 4px;
		/* the outer side leaves room for the floating toggle button */
		padding: 10px 14px 10px 56px;
		flex-shrink: 0;
	}

	.folder-pane-header.on-right {
		padding: 10px 56px 10px 14px;
	}

	.folder-pane-title {
		flex: 1;
		min-width: 0;
		font-size: 13px;
		font-weight: 500;
		color: var(--color-fg-default);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		user-select: none;
	}

	.folder-pane-btn {
		background: none;
		border: none;
		padding: 6px;
		cursor: pointer;
		color: var(--color-fg-muted);
		opacity: 0.7;
		border-radius: 4px;
		transition: opacity 0.2s, background-color 0.2s, color 0.2s;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}

	.folder-pane-btn:hover:not(:disabled) {
		opacity: 1;
		background-color: var(--color-canvas-subtle);
		color: var(--color-fg-default);
	}

	.folder-pane-btn.active {
		opacity: 0.9;
		background-color: var(--color-canvas-subtle);
		color: var(--color-fg-default);
	}

	.folder-pane-btn:disabled {
		opacity: 0.3;
		cursor: default;
	}

	.folder-pane-list {
		margin: 0;
		padding: 0 0 16px;
		list-style: none;
		overflow-y: auto;
		overflow-x: hidden;
		flex: 1;
		transition: opacity 0.2s ease;
		-webkit-mask-image: linear-gradient(to bottom, transparent, black 8px, black calc(100% - 20px), transparent);
		mask-image: linear-gradient(to bottom, transparent, black 8px, black calc(100% - 20px), transparent);
	}

	/* subtle loading state: keep the previous list, just dim it */
	.folder-pane.loading .folder-pane-list {
		opacity: 0.6;
	}

	.folder-pane-item {
		padding: 1px 0;
	}

	.folder-pane-link {
		display: flex;
		align-items: center;
		gap: 6px;
		width: 100%;
		text-align: left;
		background: none;
		border: none;
		padding: 3px 16px;
		color: var(--color-fg-muted);
		font-size: 13px;
		line-height: 20px;
		font-family: inherit;
		cursor: pointer;
		outline: none;
		user-select: none;
		transition: color 0.1s ease;
	}

	.folder-pane-link:hover,
	.folder-pane-link:focus-visible {
		color: var(--color-fg-default);
	}

	.folder-pane-name {
		min-width: 0;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.folder-pane-item.open .folder-pane-link {
		color: var(--color-fg-default);
	}

	.folder-pane-item.active .folder-pane-link {
		background-color: var(--color-canvas-subtle);
		text-shadow: 0.5px 0 0 currentColor;
	}

	/* same look as the tab's unsaved-changes dot */
	.dirty-dot {
		flex-shrink: 0;
		width: 8px;
		height: 8px;
		background-color: var(--color-fg-default);
		border-radius: 50%;
		display: block;
	}

	.folder-pane-empty,
	.folder-pane-error {
		padding: 16px;
		color: var(--color-fg-muted);
		font-size: 13px;
		text-align: center;
	}
</style>
