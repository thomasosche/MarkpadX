<script lang="ts">
	import { invoke, convertFileSrc } from '@tauri-apps/api/core';
	import { listen } from '@tauri-apps/api/event';
	import { getCurrentWindow } from '@tauri-apps/api/window';
	import { onMount, tick, untrack } from 'svelte';
	import { fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { openUrl, openPath } from '@tauri-apps/plugin-opener';
	import { open, save, ask } from '@tauri-apps/plugin-dialog';
	import Installer from './Installer.svelte';
	import Uninstaller from './Uninstaller.svelte';
	import Settings from './components/Settings.svelte';
	import TitleBar from './components/TitleBar.svelte';
	import Editor from './components/Editor.svelte';
	import Modal from './components/Modal.svelte';
	import ContextMenu, { type ContextMenuItem } from './components/ContextMenu.svelte';
	import Toc from './components/Toc.svelte';
	import FolderPane from './components/FolderPane.svelte';
	import Toast from './components/Toast.svelte';
	import { exportAsHtml as _exportHtml, exportAsPdf } from './utils/export';
	import ZoomOverlay from './components/ZoomOverlay.svelte';
import { processMarkdownHtml } from './utils/markdown';
import { findTaskMarkers, resolveTaskLine, setTaskMarkerOnLine, sourceposLine, taskMarkerOnLine, type RenderedTask } from './utils/tasks.js';
import { mapLines, type LineMapping } from './utils/linemap.js';
	import {
		byteColToIndex,
		findAll,
		normalize,
		normalizeWithMap,
		parseSourcepos,
		sourceposContains,
		sourceToPlain,
		type SourceSelection,
	} from './utils/selection';

	const appWindow = getCurrentWindow();

	import DOMPurify from 'dompurify';
	import HomePage from './components/HomePage.svelte';
	import Shortcuts from './components/Shortcuts.svelte';
import { tabManager } from './stores/tabs.svelte.js';
import { settings } from './stores/settings.svelte.js';
import { folderPane } from './stores/folderPane.svelte.js';
import { dirname, samePath } from './utils/folderPane.js';
import { t } from './utils/i18n.js';

	// syntax highlighting & latex
	let hljs: any = $state(null);
	let katex: any = $state(null);
	let renderMathInElement: any = $state(null);
	let mermaid: any = $state(null);

	import 'highlight.js/styles/github-dark.css';
	import 'katex/dist/katex.min.css';

	let mode = $state<'loading' | 'app' | 'installer' | 'uninstall'>('loading');

	let showSettings = $state(false);
	let showShortcuts = $state(false);

	let uiLanguage = $state(settings.language);

	$effect(() => {
		uiLanguage = settings.language;
	});

	let recentFiles = $state<string[]>([]);
	let isFocused = $state(true);
	let containerEl: HTMLElement;
	let markdownBody: HTMLElement | null = $state(null);
	const renderDebounceMs = 50;
	let renderTimeout: ReturnType<typeof setTimeout> | null = null;

	const highlightColorMap: Record<string, string> = {
		default: 'color-mix(in srgb, var(--color-accent-fg) 40%, transparent)',
		yellow: 'rgba(255, 208, 0, 0.4)',
		orange: 'rgba(255, 140, 0, 0.4)',
		red: 'rgba(255, 60, 60, 0.4)',
		pink: 'rgba(255, 105, 180, 0.4)',
		purple: 'rgba(164, 108, 244, 0.4)',
		blue: 'rgba(67, 138, 243, 0.4)',
		cyan: 'rgba(43, 185, 178, 0.4)',
		green: 'rgba(77, 177, 88, 0.4)',
	};
	let editorPane = $state<{
		syncScrollToLine: (line: number, ratio?: number) => void;
		handleDroppedFile: (path: string, x: number, y: number) => Promise<void>;
		updateDragCaret: (x: number, y: number) => void;
		hideDragCaret: () => void;
		undo: () => void;
		redo: () => void;
		revealHeader: (text: string) => void;
		getSelectionInfo: () => SourceSelection | null;
		selectSourceText: (info: SourceSelection) => void;
	} | null>(null);
	let liveMode = $state(localStorage.getItem('liveMode') !== 'false');

	let isDragging = $state(false);
	let dragTarget = $state<'editor' | 'preview' | null>(null);
	let editorPaneEl = $state<HTMLElement>();
	let viewerPaneEl = $state<HTMLElement>();
	let isProgrammaticScroll = false;

	let toasts = $state<{ id: string; message: string; type: 'info' | 'error' | 'warning' }[]>([]);
	function addToast(message: string, type: 'info' | 'error' | 'warning' = 'info') {
		const id = crypto.randomUUID();
		toasts.push({ id, message, type });
	}

	// in-page scroll position history for mouse 4/5 nav
	let scrollHistory: number[] = [];
	let scrollFuture: number[] = [];

	// MRU tab activation history for back/forward across tabs
	let tabBackStack: string[] = [];
	let tabForwardStack: string[] = [];
	let suppressTabHistory = false;
	let lastActiveTabId: string | null = null;
	$effect(() => {
		const id = tabManager.activeTabId;
		if (id === lastActiveTabId) return;
		if (lastActiveTabId && !suppressTabHistory) {
			tabBackStack.push(lastActiveTabId);
			if (tabBackStack.length > 100) tabBackStack.shift();
			tabForwardStack = [];
		}
		suppressTabHistory = false;
		lastActiveTabId = id;
	});
	let collapsedHeaders = $state(new Set<string>());
	let zoomData = $state<{ src?: string; html?: string } | null>(null);

	// derived from tab manager
	let activeTab = $derived(tabManager.activeTab);
	let isEditing = $derived(activeTab?.isEditing ?? false);
	let rawContent = $derived(activeTab?.rawContent ?? '');
	let isSplit = $derived(activeTab?.isSplit ?? false);

	// derived from tab manager
	let currentFile = $derived(tabManager.activeTab?.path ?? '');
	let isMarkdown = $derived(['md', 'markdown', 'mdown', 'mkd', 'txt'].includes(currentFile.split('.').pop()?.toLowerCase() || ''));
	let editorLanguage = $derived(getLanguage(currentFile));
	let htmlContent = $derived(tabManager.activeTab?.content ?? '');
	let sanitizedHtml = $derived(DOMPurify.sanitize(htmlContent, {
		ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|asset|tauri):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
	}));
	let scrollTop = $derived(tabManager.activeTab?.scrollTop ?? 0);
	let isScrolled = $derived(scrollTop > 0);
	let windowTitle = $derived(tabManager.activeTab?.title ?? 'MarkpadX');
	let isScrollSynced = $derived(tabManager.activeTab?.isScrollSynced ?? false);

	let loadingTabs = $state<string[]>([]);
	let isAtBottom = $state(false);

	let showHome = $state(false);
	let isFullWidth = $state(localStorage.getItem('isFullWidth') === 'true');
	let viewerWidth = $state(0);

	$effect(() => {
		localStorage.setItem('isFullWidth', String(isFullWidth));
	});

	// the folder pane takes the side opposite the outline
	let folderSide = $derived<'left' | 'right'>(settings.tocSide === 'left' ? 'right' : 'left');
	let folderPaneVisible = $derived(settings.showFolderPane && !settings.zenMode);

	$effect(() => {
		const path = currentFile && currentFile !== 'HOME' ? currentFile : null;
		// setActivePath reads and writes store state; keep it out of this effect's dependencies
		untrack(() => folderPane.setActivePath(path));
	});

	// folder contents may have changed on disk while the pane was closed
	$effect(() => {
		if (folderPaneVisible) untrack(() => folderPane.refresh());
	});

	async function openFolder() {
		const picked = await folderPane.openFolder();
		if (picked) settings.showFolderPane = true;
	}

	function refreshFolderPaneAfterSave(savedPath: string) {
		const dir = dirname(savedPath);
		if (dir && folderPane.folder && samePath(dir, folderPane.folder)) folderPane.refresh();
	}

	import { parseAndApplyVscodeTheme, clearVscodeTheme } from './utils/theme';

	// Theme State
	let theme = $state<string>('system');

	onMount(() => {
		const storedTheme = localStorage.getItem('theme');
		if (storedTheme) theme = storedTheme;
		// Clear the forced background color from app.html
		document.documentElement.style.removeProperty('background-color');
	});

	$effect(() => {
		localStorage.setItem('theme', theme);
		invoke('save_theme', { theme }).catch(console.error);

		if (theme === 'system' || theme === 'light' || theme === 'dark') {
			if (theme === 'system') {
				delete document.documentElement.dataset.theme;
				delete document.documentElement.dataset.themeType;
			} else {
				document.documentElement.dataset.theme = theme;
				document.documentElement.dataset.themeType = theme;
			}
			clearVscodeTheme();
			const monaco = (window as any).monaco;
			if (monaco && monaco.editor) {
				const isSystemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
				const effectiveTheme = theme === 'system' ? (isSystemDark ? 'dark' : 'light') : theme;
				monaco.editor.setTheme(effectiveTheme === 'dark' ? 'vs-dark' : 'vs');
			}
		} else if (theme.startsWith('vscode:')) {
			const name = theme.replace('vscode:', '');
			invoke('read_vscode_theme', { name }).then((json: any) => {
				parseAndApplyVscodeTheme(json, name);
			}).catch(e => {
				console.error("Failed to load vscode theme", e);
				theme = 'system';
			});
		}

		// Re-initialize mermaid or trigger update if needed
		// Note: Mermaid 10+ usually doesn't support dynamic re-init easily but we can try re-rendering rich content
		if (markdownBody && !isEditing) renderRichContent();
	});

	// Preview search state
	let showPreviewSearch = $state(false);
	let previewSearchQuery = $state('');
	let previewSearchCaseSensitive = $state(false);
	let previewSearchMatches = $state<Range[]>([]);
	let previewSearchCurrentIndex = $state(-1);
	let previewSearchInputEl = $state<HTMLInputElement | null>(null);
	let previewSearchHighlights: HTMLElement[] = [];

	async function openPreviewSearch() {
		// Ctrl+F again while the bar is open: reset the old search and start fresh
		if (showPreviewSearch) {
			previewSearchQuery = '';
			clearPreviewSearchHighlights();
			previewSearchMatches = [];
			previewSearchCurrentIndex = -1;
			await tick();
			previewSearchInputEl?.focus();
			return;
		}
		// Refresh content from disk before searching to ensure we search the latest version
		if (currentFile) await reloadCurrentFile();
		showPreviewSearch = true;
		await tick();
		previewSearchInputEl?.focus();
	}

	function closePreviewSearch() {
		showPreviewSearch = false;
		previewSearchQuery = '';
		clearPreviewSearchHighlights();
		previewSearchMatches = [];
		previewSearchCurrentIndex = -1;
	}

	function clearPreviewSearchHighlights() {
		for (const el of previewSearchHighlights) {
			const parent = el.parentNode;
			if (parent) {
				while (el.firstChild) parent.insertBefore(el.firstChild, el);
				parent.removeChild(el);
				parent.normalize(); // merge adjacent text nodes split by previous highlights
			}
		}
		previewSearchHighlights = [];
	}

	// keepIndex: re-highlight after the preview HTML was replaced (tab switch, reload, rich render)
	// and keep the current match without scrolling to it, so the reading position is not touched
	function performPreviewSearch(keepIndex = false) {
		const previousIndex = previewSearchCurrentIndex;
		clearPreviewSearchHighlights();
		previewSearchMatches = [];
		previewSearchCurrentIndex = -1;

		if (!previewSearchQuery || !markdownBody) return;

		const query = previewSearchCaseSensitive ? previewSearchQuery : previewSearchQuery.toLowerCase();
		const ranges: Range[] = [];
		const walker = document.createTreeWalker(markdownBody, NodeFilter.SHOW_TEXT);

		let node: Text | null;
		while ((node = walker.nextNode() as Text | null)) {
			const text = previewSearchCaseSensitive ? node.textContent! : node.textContent!.toLowerCase();
			let startPos = 0;
			let index: number;
			while ((index = text.indexOf(query, startPos)) !== -1) {
				const range = document.createRange();
				range.setStart(node, index);
				range.setEnd(node, index + query.length);
				ranges.push(range);
				startPos = index + query.length;
			}
		}

		// Wrap each match in a highlight span (iterate in reverse to keep ranges valid)
		for (let i = ranges.length - 1; i >= 0; i--) {
			const span = document.createElement('mark');
			span.className = 'preview-search-highlight';
			span.dataset.matchIndex = String(i);
			try {
				ranges[i].surroundContents(span);
				previewSearchHighlights.unshift(span);
			} catch {
				// Range spans multiple elements — fall back to extracting and re-inserting
				const fragment = ranges[i].extractContents();
				span.appendChild(fragment);
				ranges[i].insertNode(span);
				previewSearchHighlights.unshift(span);
			}
		}

		previewSearchMatches = ranges;
		if (ranges.length === 0) return;
		if (keepIndex) {
			previewSearchCurrentIndex = Math.min(Math.max(previousIndex, 0), ranges.length - 1);
			markPreviewMatch(previewSearchCurrentIndex);
		} else {
			previewSearchCurrentIndex = 0;
			scrollToPreviewMatch(0);
		}
	}

	function markPreviewMatch(index: number) {
		const el = previewSearchHighlights[index];
		if (!el) return null;
		// Remove active class from all, add to current
		for (const h of previewSearchHighlights) h.classList.remove('preview-search-active');
		el.classList.add('preview-search-active');
		return el;
	}

	function scrollToPreviewMatch(index: number) {
		markPreviewMatch(index)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
	}

	// Re-apply the open search to freshly rendered preview HTML
	function refreshPreviewSearch() {
		if (showPreviewSearch && previewSearchQuery && markdownBody) performPreviewSearch(true);
	}

	// Each tab keeps its own search (query, case, current match) and preview position; they are
	// saved when the tab is left and restored when it is shown again. Not persisted with the session.
	interface TabViewState {
		search: { open: boolean; query: string; caseSensitive: boolean; index: number };
		anchor: PreviewAnchor | null;
		content: string; // the rendered HTML the anchor was captured on
	}
	const tabViewStates = new Map<string, TabViewState>();
	let shownTabId: string | null = null;
	// set on a tab switch, consumed by the scroll-restore effect
	let pendingTabAnchor: PreviewAnchor | null = null;

	function saveTabViewState(id: string) {
		const tab = tabManager.tabs.find((t) => t.id === id);
		if (!tab) {
			tabViewStates.delete(id);
			return;
		}
		const previewShown = !!markdownBody && (!tab.isEditing || tab.isSplit) && markdownBody.getClientRects().length > 0;
		tabViewStates.set(id, {
			search: { open: showPreviewSearch, query: previewSearchQuery, caseSensitive: previewSearchCaseSensitive, index: previewSearchCurrentIndex },
			anchor: previewShown ? capturePreviewAnchor(markdownBody!) : null,
			content: tab.content
		});
	}

	// Runs before the DOM update of a tab switch, while the preview still shows the old tab
	$effect.pre(() => {
		const id = tabManager.activeTabId;
		untrack(() => {
			if (id === shownTabId) return;
			if (shownTabId) saveTabViewState(shownTabId);
			for (const key of tabViewStates.keys()) {
				if (!tabManager.tabs.some((t) => t.id === key)) tabViewStates.delete(key);
			}
			shownTabId = id;

			const tab = id ? tabManager.tabs.find((t) => t.id === id) : undefined;
			const saved = id ? tabViewStates.get(id) : undefined;
			clearPreviewSearchHighlights();
			previewSearchMatches = [];
			previewSearchCurrentIndex = saved?.search.index ?? -1;
			previewSearchQuery = saved?.search.query ?? '';
			previewSearchCaseSensitive = saved?.search.caseSensitive ?? false;
			showPreviewSearch = !!saved?.search.open && !!tab && !tab.isEditing;
			pendingTabAnchor = saved && tab && saved.content === tab.content && (!tab.isEditing || tab.isSplit) ? saved.anchor : null;
		});
	});

	function previewSearchNext() {
		if (previewSearchMatches.length === 0) return;
		previewSearchCurrentIndex = (previewSearchCurrentIndex + 1) % previewSearchMatches.length;
		scrollToPreviewMatch(previewSearchCurrentIndex);
	}

	function previewSearchPrev() {
		if (previewSearchMatches.length === 0) return;
		previewSearchCurrentIndex = (previewSearchCurrentIndex - 1 + previewSearchMatches.length) % previewSearchMatches.length;
		scrollToPreviewMatch(previewSearchCurrentIndex);
	}

	function handlePreviewSearchInput() {
		if (previewSearchQuery.length >= 3) {
			performPreviewSearch();
		} else {
			// Clear highlights when query is too short
			clearPreviewSearchHighlights();
			previewSearchMatches = [];
			previewSearchCurrentIndex = -1;
		}
	}

	function handlePreviewSearchKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			closePreviewSearch();
		} else if (e.key === 'Enter') {
			if (previewSearchMatches.length === 0 && previewSearchQuery.length > 0) {
				// Force search on Enter regardless of length
				performPreviewSearch();
			} else if (e.shiftKey) {
				previewSearchPrev();
			} else {
				previewSearchNext();
			}
		}
	}

	// ui state
	let tooltip = $state({ show: false, text: '', shortcut: '', html: '', isFootnote: false, x: 0, y: 0, align: 'top' as 'top' | 'right' | 'left' | 'below' });

	function showPaneTooltip(e: MouseEvent, text: string, shortcut?: string, align: 'top' | 'right' | 'left' | 'below' = 'top') {
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		const beside = align === 'right' || align === 'left';
		tooltip = {
			show: true,
			text,
			shortcut: shortcut || '',
			html: '',
			isFootnote: false,
			x: align === 'right' ? rect.right + 8 : align === 'left' ? rect.left - 8 : rect.left + rect.width / 2,
			y: beside ? rect.top + rect.height / 2 : align === 'below' ? rect.bottom + 8 : rect.top - 8,
			align
		};
	}
	let caretEl: HTMLElement;
	let caretAbsoluteTop = 0;
	let modalState = $state<{
		show: boolean;
		title: string;
		message: string;
		kind: 'info' | 'warning' | 'error';
		showSave: boolean;
		resolve: ((v: 'save' | 'discard' | 'cancel') => void) | null;
	}>({
		show: false,
		title: '',
		message: '',
		kind: 'info',
		showSave: false,
		resolve: null,
	});

	let docContextMenu = $state<{
		show: boolean;
		x: number;
		y: number;
		items: ContextMenuItem[];
	}>({
		show: false,
		x: 0,
		y: 0,
		items: [],
	});

	function askCustom(message: string, options: { title: string; kind: 'info' | 'warning' | 'error'; showSave?: boolean }): Promise<'save' | 'discard' | 'cancel'> {
		return new Promise((resolve) => {
			modalState = {
				show: true,
				title: options.title,
				message,
				kind: options.kind,
				showSave: options.showSave ?? false,
				resolve,
			};
		});
	}

	function handleModalSave() {
		if (modalState.resolve) modalState.resolve('save');
		modalState.show = false;
	}

	function handleModalConfirm() {
		if (modalState.resolve) modalState.resolve('discard');
		modalState.show = false;
	}

	function handleModalCancel() {
		if (modalState.resolve) modalState.resolve('cancel');
		modalState.show = false;
	}

	function handleSplitterKeyDown(e: KeyboardEvent) {
		const activeTab = tabManager.activeTab;
		if (!activeTab || !tabManager.activeTabId) return;

		if (e.key === 'ArrowLeft') {
			tabManager.setSplitRatio(tabManager.activeTabId, Math.max(0.1, activeTab.splitRatio - 0.05));
		} else if (e.key === 'ArrowRight') {
			tabManager.setSplitRatio(tabManager.activeTabId, Math.min(0.9, activeTab.splitRatio + 0.05));
		}
	}

	let isForceExiting = $state(false);

	async function appExit() {
		if (settings.restoreStateOnReopen) {
			const hasUnsaved = tabManager.tabs.some((t) => t.isDirty || (t.path === '' && t.rawContent.trim() !== ''));
			if (hasUnsaved) {
				const response = await askCustom(t('modal.exitDiscardsUnsaved', settings.language), {
					title: t('modal.unsavedChanges', settings.language),
					kind: 'warning',
					showSave: false,
				});
				if (response !== 'discard') return;
			}
			localStorage.removeItem('savedTabsData');
			isForceExiting = true;
		}
		appWindow.close();
	}

	function getLanguage(path: string) {
		if (!path) return 'markdown';
		const ext = path.split('.').pop()?.toLowerCase();
		switch (ext) {
			case 'js':
			case 'jsx':
				return 'javascript';
			case 'ts':
			case 'tsx':
				return 'typescript';
			case 'html':
				return 'html';
			case 'css':
				return 'css';
			case 'json':
				return 'json';
			case 'md':
			case 'markdown':
			case 'mdown':
			case 'mkd':
				return 'markdown';
			default:
				return 'plaintext';
		}
	}

	$effect(() => {
		const _ = tabManager.activeTabId;
		showHome = false;
	});


	function processInlineMath(root: Element) {
		const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
			acceptNode(node) {
				let curr = node.parentElement;
				while (curr && curr !== root) {
					if (['CODE', 'PRE', 'SCRIPT', 'STYLE'].includes(curr.tagName)) return NodeFilter.FILTER_REJECT;
					curr = curr.parentElement;
				}
				return NodeFilter.FILTER_ACCEPT;
			},
		});

		const toReplace: { node: Text; newText: string }[] = [];
		let node: Node | null;
		const regex = /(^|[^\\])\$(?!\s)([^$]*?[^\s\\])\$(?![\d])/g;
		while ((node = walker.nextNode())) {
			const text = (node as Text).nodeValue || '';
			if (text.includes('$')) {
				const newText = text.replace(regex, "$1\\($2\\)");
				if (newText !== text) toReplace.push({ node: node as Text, newText });
			}
		}
		for (const { node, newText } of toReplace) {
			node.nodeValue = newText;
		}
	}

	function processHighlights(root: Element) {
		const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
			acceptNode(node) {
				let curr = node.parentElement;
				while (curr && curr !== root) {
					if (['CODE', 'PRE', 'SCRIPT', 'STYLE'].includes(curr.tagName)) return NodeFilter.FILTER_REJECT;
					curr = curr.parentElement;
				}
				return NodeFilter.FILTER_ACCEPT;
			},
		});

		const toReplace: { node: Text; replaced: string }[] = [];
		let node: Node | null;
		while ((node = walker.nextNode())) {
			const text = (node as Text).nodeValue || '';
			if (text.includes('==')) {
				const replaced = text.replace(/==([^=\n]+)==/g, '<mark>$1</mark>');
				if (replaced !== text) toReplace.push({ node: node as Text, replaced });
			}
		}
		for (const { node, replaced } of toReplace) {
			const span = root.ownerDocument!.createElement('span');
			span.innerHTML = replaced;
			node.parentNode?.replaceChild(span, node);
		}
	}

	function processBlockIds(root: Element, doc: Document) {
		// handle pre-emitted block-id spans from rust parser
		for (const el of Array.from(root.querySelectorAll('.block-id, [data-block-id]'))) {
			const rawId = el.getAttribute('data-block-id') || (el as HTMLElement).textContent?.replace(/^\^/, '').trim() || '';
			if (!rawId) continue;
			const anchor = doc.createElement('a');
			anchor.id = rawId;
			anchor.className = 'block-id-anchor';
			anchor.setAttribute('data-label', rawId);
			anchor.setAttribute('aria-hidden', 'true');
			el.replaceWith(anchor);
		}

		// scan text nodes for trailing ^id pattern (text ^blockid at end of block)
		const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
			acceptNode(node) {
				const parent = node.parentElement;
				if (!parent) return NodeFilter.FILTER_REJECT;
				if (['CODE', 'PRE', 'SCRIPT', 'STYLE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(parent.tagName)) return NodeFilter.FILTER_REJECT;
				return NodeFilter.FILTER_ACCEPT;
			},
		});

		const blockIdPattern = / \^([a-zA-Z0-9_-]+)\s*$/;
		const nodes: { node: Text; id: string }[] = [];
		let textNode: Node | null;
		while ((textNode = walker.nextNode())) {
			const text = (textNode as Text).nodeValue || '';
			const match = text.match(blockIdPattern);
			if (match) nodes.push({ node: textNode as Text, id: match[1] });
		}

		for (const { node, id } of nodes) {
			const text = node.nodeValue || '';
			const cleanText = text.replace(blockIdPattern, '');
			const anchor = doc.createElement('a');
			anchor.id = id;
			anchor.className = 'block-id-anchor';
			anchor.setAttribute('data-label', id);
			anchor.setAttribute('aria-hidden', 'true');
			const parent = node.parentNode;
			if (parent) {
				const textBefore = doc.createTextNode(cleanText);
				parent.replaceChild(anchor, node);
				parent.insertBefore(textBefore, anchor);
			}
		}
	}

	function processTaskItems(root: Element) {
		for (const input of Array.from(root.querySelectorAll('li input[type="checkbox"]'))) {
			input.setAttribute('data-task-checkbox', '');
			input.removeAttribute('disabled');
			(input as HTMLInputElement).style.cursor = 'pointer';

			const li = input.closest('li');
			if (!li) continue;

			// wrap bare text/inline nodes after checkbox in a span for CSS targeting
			const nodes = Array.from(li.childNodes);
			const inputIdx = nodes.indexOf(input);
			const afterInput = nodes.slice(inputIdx + 1);

			// we loop until we hit a block child (like a nested UL)
			const inlineNodes = [];
			for (const n of afterInput) {
				if (n.nodeType === 1 && ['P', 'DIV', 'UL', 'OL'].includes((n as Element).tagName)) break;
				inlineNodes.push(n);
			}

			if (inlineNodes.length > 0) {
				const wrapper = root.ownerDocument!.createElement('span');
				wrapper.className = 'task-text';
				for (const n of inlineNodes) wrapper.appendChild(n);
				
				// insert the newly wrapped span after the checkbox
				li.insertBefore(wrapper, afterInput[inlineNodes.length] || null);
			}

			if ((input as HTMLInputElement).checked) {
				li.classList.add('task-done');
			}
		}
	}

	async function loadMarkdown(filePath: string, options: { navigate?: boolean; skipTabManagement?: boolean; preserveEditState?: boolean } = {}) {
		showHome = false;
		let existing = null;
		try {
			if (options.navigate && tabManager.activeTab) {
				tabManager.navigate(tabManager.activeTab.id, filePath);
			} else if (!options.skipTabManagement) {
				const isWin = typeof navigator !== 'undefined' && /^Win/.test(navigator.platform);
				const norm = (p: string) => {
					const s = p.replace(/\\/g, '/');
					return isWin ? s.toLowerCase() : s;
				};
				const target = norm(filePath);
				existing = tabManager.tabs.find((t) => t.path && norm(t.path) === target);
				if (existing) {
					tabManager.setActive(existing.id);
					filePath = existing.path;
				} else if (tabManager.activeTab && tabManager.activeTab.path === '' && !tabManager.activeTab.isDirty && tabManager.activeTab.rawContent.trim() === '') {
					tabManager.updateTabPath(tabManager.activeTab.id, filePath);
				} else {
					tabManager.addTab(filePath);
				}
			}
			const activeId = tabManager.activeTabId;
			if (!activeId) return;

			const ext = filePath.split('.').pop()?.toLowerCase();
			const isMarkdown = ['md', 'markdown', 'mdown', 'mkd', 'txt'].includes(ext || '');
			const tab = tabManager.tabs.find((t) => t.id === activeId);

			if (isMarkdown) {
				// Only set default edit mode if it's a brand new tab or we aren't preserving state
				if (tab && !options.preserveEditState && !existing) {
					tab.isEditing = settings.startInEditor;
				}
				const [html, content, isFull] = await invoke('open_markdown_preview', { path: filePath, maxBytes: 50000 }) as [string, string, boolean];
				const processedInfo = processMarkdownHtml(html, filePath, collapsedHeaders);
				tabManager.updateTabContent(activeId, processedInfo);
				tabManager.setTabRawContent(activeId, content);

				if (!isFull) {
					loadingTabs = [...loadingTabs, activeId];
					tick().then(() => {
						if (markdownBody) isAtBottom = markdownBody.scrollHeight <= markdownBody.clientHeight + 100;
					});
					Promise.all([
						invoke('open_markdown', { path: filePath }) as Promise<string>,
						invoke('read_file_content', { path: filePath }) as Promise<string>
					]).then(([fullHtml, fullContent]) => {
						const applyFull = () => {
							try {
								if (isScrolling) {
									setTimeout(applyFull, 100);
									return;
								}
								if (tabManager.tabs.find((t) => t.id === activeId)?.path === filePath) {
									const fullProcessed = processMarkdownHtml(fullHtml, filePath, collapsedHeaders);
									tabManager.updateTabContent(activeId, fullProcessed);
									tabManager.setTabRawContent(activeId, fullContent);
									loadingTabs = loadingTabs.filter((id) => id !== activeId);
									if (tabManager.activeTabId === activeId) {
										tick().then(() => {
											setTimeout(renderRichContent, 10);
										});
									}
								} else {
									loadingTabs = loadingTabs.filter((id) => id !== activeId);
								}
							} catch (applyErr) {
								console.error("applyFull error:", applyErr);
								addToast('Error processing full markdown: ' + String(applyErr), 'error');
								loadingTabs = loadingTabs.filter((id) => id !== activeId);
							}
						};
						
						if ('requestIdleCallback' in window) {
							(window as any).requestIdleCallback(applyFull, { timeout: 2000 });
						} else {
							setTimeout(applyFull, 100);
						}
					}).catch((e) => {
						console.error("Promise.all error:", e);
						addToast('Backend Error loading full markdown: ' + String(e), 'error');
						loadingTabs = loadingTabs.filter((id) => id !== activeId);
					});
				}
			} else {
				if (tab) tab.isEditing = true;
				const content = (await invoke('read_file_content', { path: filePath })) as string;
				tabManager.setTabRawContent(activeId, content);
			}

			if (liveMode) armWatcher(filePath);

			await tick();
			if (filePath) saveRecentFile(filePath);
		} catch (error) {
			console.error('Error loading file:', error);
			const errStr = String(error);
			if (errStr.includes('The system cannot find the file specified') || errStr.includes('No such file or directory')) {
				deleteRecentFile(filePath);
				if (tabManager.activeTab && tabManager.activeTab.path === filePath) {
					tabManager.closeTab(tabManager.activeTab.id);
				}
			}
		}
	}

	async function renderRichContent() {
		if (!markdownBody) return;

		if (!hljs || !renderMathInElement || !mermaid) return;

		// Initialize Mermaid with theme based on system preference or override
		const isSystemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
		const datasetThemeType = document.documentElement.dataset.themeType;
		const isDark = datasetThemeType === 'dark' || (theme === 'dark') || (theme === 'system' && isSystemDark);
		const effectiveTheme = isDark ? 'dark' : 'neutral';
		mermaid.initialize({ startOnLoad: false, theme: effectiveTheme });

		// Process code blocks
		const codeBlocks = Array.from(markdownBody.querySelectorAll('pre code'));
		for (const block of codeBlocks) {
			const codeEl = block as HTMLElement;
			const preEl = codeEl.parentElement as HTMLPreElement;

			// Check for Mermaid blocks
			if (codeEl.classList.contains('language-mermaid')) {
				try {
					const mermaidCode = codeEl.textContent || '';
					const id = `mermaid-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

					// Render the diagram
					const { svg } = await mermaid.render(id, mermaidCode);

					// Create container and replace the <pre> block
					const container = document.createElement('div');
					container.className = 'mermaid-diagram';
					// Allow foreignObject for Mermaid text rendering
					container.innerHTML = DOMPurify.sanitize(svg, {
						ADD_TAGS: ['foreignObject'],
						ADD_ATTR: ['dominant-baseline', 'text-anchor'],
					});
					preEl.replaceWith(container);
				} catch (error) {
					console.error('Failed to render Mermaid diagram:', error);
					// Display error in place of diagram
					const errorDiv = document.createElement('div');
					errorDiv.className = 'mermaid-error';
					errorDiv.style.color = 'red';
					errorDiv.style.padding = '1em';
					errorDiv.textContent = `Error rendering Mermaid diagram: ${error}`;
					preEl.replaceWith(errorDiv);
				}
				continue; // Skip highlight.js for this block
			}

			// Existing highlight.js logic
			// Check if language was explicitly specified BEFORE highlight.js runs
			const hasExplicitLang = Array.from(codeEl.classList).some((c) => c.startsWith('language-'));
			
			// Only highlight if explicit language is specified
			if (hasExplicitLang) {
				hljs.highlightElement(codeEl);
			}

			const langClass = Array.from(codeEl.classList).find((c) => c.startsWith('language-'));

			if (preEl && preEl.tagName === 'PRE') {
				preEl.querySelectorAll('.lang-label').forEach((l) => l.remove());
				const codeContent = codeEl.textContent || '';
				const existingWrapper = preEl.parentElement?.classList.contains('code-block-shell') ? preEl.parentElement as HTMLDivElement : null;
				existingWrapper?.querySelectorAll(':scope > .lang-label').forEach((l) => l.remove());

				const wrapper = existingWrapper ?? document.createElement('div');
				if (!existingWrapper) {
					wrapper.className = 'code-block-shell';
					preEl.replaceWith(wrapper);
					wrapper.appendChild(preEl);
				}

				const copyCode = () => {
					const codeToCopy = codeContent.replace(/\n$/, '');
					invoke('clipboard_write_text', { text: codeToCopy }).then(() => {
						const originalContent = label.innerHTML;
						label.innerHTML = 'Copied!';
						label.classList.add('copied');
						setTimeout(() => {
							label.innerHTML = originalContent;
							label.classList.remove('copied');
						}, 1500);
					}).catch((err) => {
						console.error('Failed to copy code:', err);
					});
				};

				const label = document.createElement('button');
				label.className = 'lang-label';
				label.title = 'Click to copy code';
				label.onclick = copyCode;

				if (hasExplicitLang && langClass) {
					label.textContent = langClass.replace('language-', '');
					wrapper.appendChild(label);
				} else {
					label.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
					wrapper.appendChild(label);
				}
			}
		}

		// KaTeX math rendering
		if (katex) {
			const mathElements = markdownBody.querySelectorAll('span[data-math]');
			for (const el of Array.from(mathElements)) {
				const isDisplay = el.getAttribute('data-math') === 'display';
				try {
					katex.render(el.textContent || '', el as HTMLElement, {
						displayMode: isDisplay,
						throwOnError: false,
					});
				} catch (e) {
					console.error('KaTeX rendering error:', e);
				}
			}
		}

		if (renderMathInElement) {
			renderMathInElement(markdownBody, {
				delimiters: [
					{ left: '$$', right: '$$', display: true },
					{ left: '\\(', right: '\\)', display: false },
					{ left: '\\[', right: '\\]', display: true },
				],
				throwOnError: false,
			});
		}

		// highlight.js and KaTeX rebuild their elements, dropping search marks inside them
		if (previewSearchHighlights.some((h) => !h.isConnected)) refreshPreviewSearch();
	}

	// One-way sync htmlContent into the article element (no bind:innerHTML to avoid
	// Svelte clobbering DOM modifications like search highlights)
	$effect(() => {
		if (markdownBody && htmlContent !== undefined) {
			markdownBody.innerHTML = htmlContent;
			untrack(() => {
				const tab = tabManager.activeTab;
				if (tab?.isDirty && !tab.isEditing) syncTaskCheckboxes(tab.rawContent);
				refreshPreviewSearch();
			});
		}
	});

	$effect(() => {
		if (htmlContent && markdownBody && !isEditing && hljs && renderMathInElement && mermaid) renderRichContent();
	});

	$effect(() => {
		// Depend on the ID and body existence to trigger restore
		const id = tabManager.activeTabId;
		const body = markdownBody;

		if (id && body) {
			untrack(() => {
				const tab = tabManager.tabs.find((t) => t.id === id);
				const anchor = pendingTabAnchor;
				pendingTabAnchor = null;
				if (tab && anchor) {
					// back to a tab seen before: the exact element and offset it was left at. The
					// pin also holds it while mermaid/KaTeX/highlighting change the page height.
					pinPreviewPositionSettled(anchor);
				} else if (tab) {
					let scrolled = false;

					if (tab.anchorLine > 0) {
						// Interpolated Restore
						// Find element containing the anchor line
						const children = Array.from(body.children) as HTMLElement[];
						for (const el of children) {
							const sourcepos = el.dataset.sourcepos;
							if (sourcepos) {
								const [start, end] = sourcepos.split('-');
								const startLine = parseInt(start.split(':')[0]);
								const endLine = parseInt(end.split(':')[0]);

								if (!isNaN(startLine) && !isNaN(endLine)) {
									if (tab.anchorLine >= startLine && tab.anchorLine <= endLine) {
										// Found the container
										const totalLines = endLine - startLine; // Can be 0 for single line
										let ratio = 0;
										if (totalLines > 0) {
											ratio = (tab.anchorLine - startLine) / totalLines;
										}

										// Calculate target pixel position
										// We want the anchor line to be roughly at offset 60
										const targetOffset = el.offsetTop + el.offsetHeight * ratio - 60;
										body.scrollTop = Math.max(0, targetOffset);
										scrolled = true;
										break;
									}
								}
							}
						}
					}

					if (!scrolled) {
						if (body.scrollHeight > body.clientHeight && tab.scrollPercentage > 0) {
							const targetScroll = tab.scrollPercentage * (body.scrollHeight - body.clientHeight);
							body.scrollTop = targetScroll;
						} else {
							body.scrollTop = tab.scrollTop;
						}
					}
				}
			});
		}
	});

	$effect(() => {
		if (markdownBody && !isEditing && tabManager.activeTabId) {
			tick().then(() => {
				markdownBody?.focus({ preventScroll: true });
			});
		}
	});

	function scrollToLine(line: number, ratio: number = 0) {
		if (!markdownBody) return;

		const children = Array.from(markdownBody.children) as HTMLElement[];
		for (const el of children) {
			const sourcepos = el.dataset.sourcepos;
			if (sourcepos) {
				const [start, end] = sourcepos.split('-');
				const startLine = parseInt(start.split(':')[0]);
				const endLine = parseInt(end.split(':')[0]);

				if (!isNaN(startLine) && !isNaN(endLine)) {
					if (line >= startLine && line <= endLine) {
						const totalLines = endLine - startLine;
						let lineRatio = 0;
						if (totalLines > 0) {
							lineRatio = (line - startLine) / totalLines;
						}
						lineRatio = Math.max(0, Math.min(1, lineRatio));

						const elementTop = el.offsetTop + el.offsetHeight * lineRatio;

						const viewportHeight = markdownBody.clientHeight;
						const targetScroll = elementTop - viewportHeight * ratio;

						if (Math.abs(markdownBody.scrollTop - targetScroll) > 5) {
							isProgrammaticScroll = true;
							markdownBody.scrollTop = Math.max(0, targetScroll);
						}
						return;
					}
				}
			}
		}
	}

	function handleEditorScrollSync(line: number, ratio: number = 0) {
		if (tabManager.activeTab?.isScrollSynced) {
			scrollToLine(line, ratio);
		}
	}

	function syncEditorToPreviewScroll(target: HTMLElement) {
		if (!tabManager.activeTab?.isScrollSynced || !editorPane) return;

		const anchorOffset = target.scrollTop + 60;
		const viewportRatio = target.clientHeight > 0 ? Math.min(1, 60 / target.clientHeight) : 0;
		const children = Array.from(markdownBody?.children || []);

		for (const child of children) {
			const el = child as HTMLElement;
			if (el.offsetTop <= anchorOffset && el.offsetTop + el.offsetHeight > anchorOffset) {
				const sourcepos = el.dataset.sourcepos;
				if (!sourcepos) break;

				const [start, end] = sourcepos.split('-');
				const startLine = parseInt(start.split(':')[0]);
				const endLine = parseInt(end.split(':')[0]);

				if (!isNaN(startLine) && !isNaN(endLine)) {
					const relativeOffset = anchorOffset - el.offsetTop;
					const elementRatio = el.offsetHeight > 0 ? relativeOffset / el.offsetHeight : 0;
					const totalLines = endLine - startLine;
					const estimatedLine = startLine + Math.round(totalLines * elementRatio);

					editorPane.syncScrollToLine(estimatedLine, viewportRatio);
				}
				break;
			}
		}
	}

	let isScrolling = $state(false);
	let scrollIdleTimer: ReturnType<typeof setTimeout>;

	function handleScroll(e: Event) {
		const target = e.target as HTMLElement;

		isAtBottom = Math.abs(target.scrollHeight - target.scrollTop - target.clientHeight) < 100;

		isScrolling = true;
		clearTimeout(scrollIdleTimer);
		scrollIdleTimer = setTimeout(() => {
			isScrolling = false;
		}, 300);

		if (isProgrammaticScroll) {
			isProgrammaticScroll = false;
			if (tabManager.activeTabId) {
				tabManager.updateTabScroll(tabManager.activeTabId, target.scrollTop);
			}
			return;
		}

		if (tabManager.activeTabId) {
			// Update raw scroll pos
			tabManager.updateTabScroll(tabManager.activeTabId, target.scrollTop);

			// Percentage fallback
			if (target.scrollHeight > target.clientHeight) {
				const percentage = target.scrollTop / (target.scrollHeight - target.clientHeight);
				tabManager.updateTabScrollPercentage(tabManager.activeTabId, percentage);
			}

			// Interpolated Anchor Calculation
			const anchorOffset = target.scrollTop + 60;
			const children = Array.from(markdownBody?.children || []);

			for (const child of children) {
				const el = child as HTMLElement;
				// Check intersection
				if (el.offsetTop <= anchorOffset && el.offsetTop + el.offsetHeight > anchorOffset) {
					const sourcepos = el.dataset.sourcepos;
					if (sourcepos) {
						const [start, end] = sourcepos.split('-');
						const startLine = parseInt(start.split(':')[0]);
						const endLine = parseInt(end.split(':')[0]);

						if (!isNaN(startLine) && !isNaN(endLine)) {
							// Calculate relative position within element
							const relativeOffset = anchorOffset - el.offsetTop;
							const ratio = relativeOffset / el.offsetHeight;

							const totalLines = endLine - startLine;
							const estimatedLine = startLine + Math.round(totalLines * ratio);

							tabManager.updateTabAnchorLine(tabManager.activeTabId, estimatedLine);
						}
					}
					break;
				}
			}
		}

		syncEditorToPreviewScroll(target);
	}

	function toggleFold(key: string) {
		const isCurrentlyCollapsed = collapsedHeaders.has(key);

		if (isCurrentlyCollapsed) {
			const next = new Set(collapsedHeaders);
			next.delete(key);
			collapsedHeaders = next;
		} else {
			collapsedHeaders = new Set([...collapsedHeaders, key]);
		}

		if (!markdownBody) return;

		let h = markdownBody.querySelector(`[id="${CSS.escape(key)}"].foldable-header`) as HTMLElement | null;
		if (!h) {
			const allHeaders = markdownBody.querySelectorAll('.foldable-header');
			for (const el of Array.from(allHeaders)) {
				if ((el.textContent?.trim() || '') === key) {
					h = el as HTMLElement;
					break;
				}
			}
		}
		if (!h) return;

		const wrapId = h.getAttribute('data-fold-target');
		const wrapper = wrapId ? document.getElementById(wrapId) : null;
		if (!wrapper) return;

		h.classList.toggle('is-collapsed', !isCurrentlyCollapsed);
		wrapper.classList.toggle('is-collapsed', !isCurrentlyCollapsed);
	}

	function handleLinkClick(e: MouseEvent) {
		const target = e.target as HTMLElement;

		// header fold toggle
		const foldIcon = target.closest('.header-fold-icon');
		const foldableHeader = foldIcon ? foldIcon.closest('.foldable-header') as HTMLElement : null;
		if (foldableHeader) {
			if (e.detail > 1) e.preventDefault(); // prevent double-click selection
			e.stopPropagation();
			const key = foldableHeader.id || foldableHeader.textContent?.trim() || '';
			const wrapId = foldableHeader.getAttribute('data-fold-target');
			const wrapper = wrapId ? document.getElementById(wrapId) : null;
			if (wrapper) {
				const isCollapsed = foldableHeader.classList.toggle('is-collapsed');
				wrapper.classList.toggle('is-collapsed', isCollapsed);
				if (isCollapsed) {
					collapsedHeaders = new Set([...collapsedHeaders, key]);
				} else {
					const next = new Set(collapsedHeaders);
					next.delete(key);
					collapsedHeaders = next;
				}
			}
			return;
		}

		// callout fold toggle
		const calloutToggle = target.closest('.callout-toggle');
		if (calloutToggle) {
			if (e.detail > 1) e.preventDefault(); // prevent double-click selection
			e.stopPropagation();
			const alert = calloutToggle.closest('.callout-foldable');
			const content = alert?.querySelector('.markdown-alert-content');
			if (alert && content) {
				alert.classList.toggle('is-collapsed');
				content.classList.toggle('is-collapsed');
			}
			return;
		}

		const a = target.closest('a');
		if (a) {
			const href = a.getAttribute('href');
			if (href?.startsWith('#') && href.length > 1) {
				e.preventDefault();
				let id = href.substring(1);
				if (id.startsWith('^')) {
					id = id.substring(1);
				}
				const el =
					(markdownBody?.querySelector(`[id="${CSS.escape(id)}"]`) as HTMLElement | null) ||
					(markdownBody?.querySelector(`[name="${CSS.escape(id)}"]`) as HTMLElement | null);
				if (el && markdownBody) {
					pushScrollHistory();
					const containerRect = markdownBody.getBoundingClientRect();
					const elRect = el.getBoundingClientRect();
					const targetScrollTop = elRect.top - containerRect.top + markdownBody.scrollTop - 60;
					markdownBody.scrollTo({ top: targetScrollTop, behavior: 'smooth' });
				}
			}
		}

        // media zoom handling
        const img = target.closest('img');
        if (img) {
            zoomData = { src: img.src };
            return;
        }

        const mermaidDiv = target.closest('.mermaid-diagram');
        if (mermaidDiv) {
            const svg = mermaidDiv.querySelector('svg');
            if (svg) {
                // clone and strip fixed dimensions so viewBox governs scaling
                const clone = svg.cloneNode(true) as SVGElement;
                clone.removeAttribute('width');
                clone.removeAttribute('height');
                clone.style.width = '';
                clone.style.height = '';
                zoomData = { html: clone.outerHTML };
                return;
            }
        }
    }

	// Toggles are applied one after another so fast clicks cannot race on the same raw content
	let taskToggleQueue: Promise<void> = Promise.resolve();

	function renderedTaskBoxes(): HTMLInputElement[] {
		return Array.from(markdownBody?.querySelectorAll('[data-task-checkbox]') || []) as HTMLInputElement[];
	}

	function toggleTaskCheckbox(checkbox: HTMLInputElement) {
		const tab = tabManager.activeTab;
		if (!tab) return;

		const allBoxes = renderedTaskBoxes();
		const index = allBoxes.indexOf(checkbox);
		if (index === -1) return;

		// the browser has already flipped the checkbox when the click handler runs: this is the NEW state
		const nowChecked = checkbox.checked;
		checkbox.closest('li')?.classList.toggle('task-done', nowChecked);

		const task: RenderedTask = {
			index,
			count: allBoxes.length,
			sourceLine: sourceposLine(checkbox.closest('li')?.getAttribute('data-sourcepos')),
			checked: !nowChecked,
		};
		const tabId = tab.id;
		taskToggleQueue = taskToggleQueue
			.then(() => applyTaskToggle(tabId, task, nowChecked))
			.then((ok) => {
				if (!ok) {
					checkbox.checked = !nowChecked;
					checkbox.closest('li')?.classList.toggle('task-done', !nowChecked);
				}
			})
			.catch((e) => {
				console.error('failed to toggle task', e);
				addToast(t('toast.taskToggleFailed', settings.language).replace('{{error}}', String(e)), 'error');
			});
	}

	// Write the toggle into the tab's raw content. The change stays in memory: the tab turns dirty
	// and is saved via Ctrl+S / File > Save, without entering edit mode.
	async function applyTaskToggle(tabId: string, task: RenderedTask, checked: boolean): Promise<boolean> {
		const tab = tabManager.tabs.find((t) => t.id === tabId);
		if (!tab) return false;

		// unsaved toggles live in rawContent (which the DOM reflects); a clean tab is checked against disk
		let raw = tab.rawContent;
		if (!tab.isDirty && tab.path) {
			try {
				raw = (await invoke('read_file_content', { path: tab.path })) as string;
			} catch (e) {
				console.error('failed to read file for task toggle', e);
				addToast(t('toast.taskToggleFailed', settings.language).replace('{{error}}', String(e)), 'error');
				return false;
			}
			if (raw !== tab.rawContent) {
				// the rendered view is older than the file: patching it could hit the wrong line
				addToast(t('toast.taskFileChanged', settings.language), 'warning');
				reloadCurrentFile(true);
				return false;
			}
		}

		const line = resolveTaskLine(raw, task);
		const updated = line === null ? null : setTaskMarkerOnLine(raw, line, checked);
		if (updated === null) {
			addToast(t('toast.taskSourceMismatch', settings.language), 'warning');
			return false;
		}
		tabManager.updateTabRawContent(tab.id, updated);
		return true;
	}

	// Re-apply unsaved checkbox states after the (stale) rendered HTML was put back into the DOM
	function syncTaskCheckboxes(raw: string) {
		const boxes = renderedTaskBoxes();
		const markers = findTaskMarkers(raw);
		boxes.forEach((box, i) => {
			const line = sourceposLine(box.closest('li')?.getAttribute('data-sourcepos'));
			const marker = (line !== null ? taskMarkerOnLine(raw, line) : null) ?? (boxes.length === markers.length ? markers[i] : null);
			if (!marker) return;
			box.checked = marker.checked;
			box.closest('li')?.classList.toggle('task-done', marker.checked);
		});
	}



	function saveRecentFile(path: string) {
		let files = [...recentFiles].filter((f) => f !== path);
		files.unshift(path);
		recentFiles = files.slice(0, 9);
		localStorage.setItem('recent-files', JSON.stringify(recentFiles));
	}

	function loadRecentFiles() {
		const stored = localStorage.getItem('recent-files');
		if (stored) {
			try {
				recentFiles = JSON.parse(stored);
			} catch (e) {
				console.error('Error parsing recent files:', e);
			}
		}
	}

	function deleteRecentFile(path: string) {
		recentFiles = recentFiles.filter((f) => f !== path);
		localStorage.setItem('recent-files', JSON.stringify(recentFiles));
	}

	function removeRecentFile(path: string, event: MouseEvent) {
		event.stopPropagation();
		deleteRecentFile(path);
		if (currentFile === path) tabManager.closeTab(tabManager.activeTabId!);
	}

	function resolvePath(basePath: string, relativePath: string) {
		if (relativePath.match(/^[a-zA-Z]:/) || relativePath.startsWith('/')) return relativePath;
		const parts = basePath.split(/[/\\]/);
		parts.pop();
		for (const p of relativePath.split(/[/\\]/)) {
			if (p === '.') continue;
			if (p === '..') parts.pop();
			else parts.push(p);
		}
		return parts.join('/');
	}

	function isYoutubeLink(url: string) {
		return url.includes('youtube.com/watch') || url.includes('youtu.be/');
	}

	function getYoutubeId(url: string) {
		const match = url.match(/^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/);
		return match && match[2].length === 11 ? match[2] : null;
	}

	function replaceWithYoutubeEmbed(element: Element, videoId: string) {
		const container = element.ownerDocument.createElement('div');
		container.className = 'video-container';
		const iframe = element.ownerDocument.createElement('iframe');
		iframe.src = `https://www.youtube.com/embed/${videoId}`;
		iframe.title = 'YouTube video player';
		iframe.frameBorder = '0';
		iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
		iframe.allowFullscreen = true;
		container.appendChild(iframe);
		element.replaceWith(container);
	}

	async function canCloseTab(tabId: string): Promise<boolean> {
		const tab = tabManager.tabs.find((t) => t.id === tabId);
		if (!tab || (!tab.isDirty && tab.path !== '')) return true;

		if (!tab.isDirty) return true;

		const response = await askCustom(t('modal.youHaveUnsavedChanges', settings.language).replace('{title}', tab.title), {
			title: t('modal.unsavedChanges', settings.language),
			kind: 'warning',
			showSave: true,
		});

		if (response === 'cancel') return false;
		if (response === 'save') {
			// saveContent saves the active tab
			if (tabManager.activeTabId !== tabId) {
				tabManager.setActive(tabId);
				await tick();
			}
			return await saveContent();
		}

		return true; // discard
	}

	// Close several tabs, asking for each one with unsaved changes; stops when the user cancels
	async function closeTabs(ids: string[], keepActiveId: string) {
		for (const id of ids) {
			if (!(await canCloseTab(id))) break;
			tabManager.closeTab(id);
		}
		// saving activates the tab being closed; return to the tab the user acted from
		if (tabManager.tabs.some((t) => t.id === keepActiveId)) tabManager.setActive(keepActiveId);
	}

	// Map the preview's text selection to its source block so the editor can select the same text
	function captureViewSelection(): SourceSelection | null {
		if (!markdownBody) return null;
		return captureVisibleSelection(markdownBody) ?? captureTopRow(markdownBody);
	}

	// No (visible) selection: carry the row at the top of the preview so the editor opens on what was being read
	function captureTopRow(body: HTMLElement): SourceSelection | null {
		const anchor = capturePreviewAnchor(body);
		if (!anchor.sourcepos) return null;
		const [start, end = start] = anchor.sourcepos.split('-');
		const startLine = parseInt(start, 10);
		const endLine = parseInt(end, 10) || startLine;
		const same = body.querySelectorAll<HTMLElement>(`[data-sourcepos="${CSS.escape(anchor.sourcepos)}"]`);
		const el = same[anchor.index] ?? same[0];
		// anchor.delta is in preview units, the rect in screen pixels (zoom)
		const height = (el?.getBoundingClientRect().height || 1) / previewScale(body);
		const line = startLine + Math.round((endLine - startLine) * Math.min(1, Math.max(0, anchor.delta / height)));
		return { text: '', startLine: line, endLine: line, startColumn: 1, occurrence: 0, viewportOffset: PREVIEW_ANCHOR_OFFSET * previewScale(body) };
	}

	function captureVisibleSelection(markdownBody: HTMLElement): SourceSelection | null {
		const sel = window.getSelection();
		if (!sel || sel.rangeCount === 0) return null;
		const range = sel.getRangeAt(0);
		if (!markdownBody.contains(range.startContainer)) return null;

		// A selection scrolled out of view is stale: the reader is looking at something else
		const bodyRect = markdownBody.getBoundingClientRect();
		const rects = range.getClientRects();
		const selRect = rects.length > 0 ? rects[0] : range.getBoundingClientRect();
		if (selRect.bottom < bodyRect.top || selRect.top > bodyRect.bottom) return null;

		const blockOf = (node: Node) => {
			const el = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
			const block = el?.closest('[data-sourcepos]');
			return block && markdownBody!.contains(block) ? block : null;
		};
		const startBlock = blockOf(range.startContainer);
		const startPos = startBlock && parseSourcepos(startBlock);
		if (!startBlock || !startPos) return null;
		const endBlock = blockOf(range.endContainer);
		const endPos = (endBlock && parseSourcepos(endBlock)) || startPos;

		const text = sel.toString();
		const before = document.createRange();
		before.setStart(startBlock, 0);
		before.setEnd(range.startContainer, range.startOffset);

		return {
			text,
			startLine: startPos.startLine,
			endLine: Math.max(startPos.endLine, endPos.endLine),
			startColumn: startPos.startCol,
			occurrence: findAll(normalize(before.toString()), normalize(text)).length,
			viewportOffset: selRect.top - bodyRect.top,
		};
	}

	// Find the (normalized) needle inside an element's rendered text and return it as a DOM range
	function findInElement(el: HTMLElement, needle: string, info: SourceSelection): Range | null {
		const nodes: Text[] = [];
		let full = '';
		const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
		while (walker.nextNode()) {
			nodes.push(walker.currentNode as Text);
			full += (walker.currentNode as Text).data;
		}
		const { text, map } = normalizeWithMap(full);
		const matches = findAll(text, needle);
		if (matches.length === 0) return null;

		let index = matches[0];
		const pos = parseSourcepos(el);
		if (matches.length > 1 && pos) {
			if (pos.startLine === info.startLine && info.lineText !== undefined) {
				// Count earlier occurrences between the element's start and the selection on the same source line
				const prefix = info.lineText.slice(
					byteColToIndex(info.lineText, pos.startCol),
					byteColToIndex(info.lineText, info.startColumn),
				);
				const occurrence = findAll(normalize(sourceToPlain(prefix)), needle).length;
				index = matches[Math.min(occurrence, matches.length - 1)];
			} else {
				// Selection starts further down a multi-line element: pick the match at the closest relative position
				const target = ((info.startLine - pos.startLine) / Math.max(1, pos.endLine - pos.startLine)) * text.length;
				index = matches.reduce((best, m) => (Math.abs(m - target) < Math.abs(best - target) ? m : best));
			}
		}

		const locate = (offset: number): [Text, number] => {
			for (const node of nodes) {
				if (offset <= node.data.length) return [node, offset];
				offset -= node.data.length;
			}
			const last = nodes[nodes.length - 1];
			return [last, last.data.length];
		};
		const range = document.createRange();
		range.setStart(...locate(map[index]));
		range.setEnd(...locate(map[index + needle.length - 1] + 1));
		return range;
	}

	// Marks the editor's caret row in the preview without touching the real selection
	// (CSS Custom Highlight API). Cleared on the next click or key press in the preview.
	// Select the editor's selected text in the rendered preview (or mark the caret row) and scroll it
	// to the height it had in the editor
	function applyViewSelection(info: SourceSelection, scroll = true) {
		if (!markdownBody) return;

		// Visible elements on the selection's line, innermost first; those also containing its column
		// come first (table cells, inline elements), with line-only matches as fallback
		const all = Array.from(markdownBody.querySelectorAll<HTMLElement>('[data-sourcepos]')).filter(
			(el) => el.getClientRects().length > 0,
		);
		const onLine = all
			.filter((el) => {
				const pos = parseSourcepos(el);
				return pos && sourceposContains(pos, info.startLine);
			})
			.reverse();
		const atPoint = onLine.filter((el) => sourceposContains(parseSourcepos(el)!, info.startLine, info.startColumn));
		const candidates = [...atPoint, ...onLine.filter((el) => !atPoint.includes(el))];

		let range: Range | null = null;
		const needle = normalize(sourceToPlain(info.text));
		if (needle) {
			for (const el of candidates) {
				range = findInElement(el, needle, info);
				if (range) break;
			}
		}

		// Plain caret: locate the caret's whole row so it can be positioned exactly (and glow)
		let rowRange: Range | null = null;
		if (!range && info.lineText !== undefined) {
			const rowNeedle = normalize(sourceToPlain(info.lineText));
			if (rowNeedle) {
				for (const el of candidates) {
					rowRange = findInElement(el, rowNeedle, { ...info, startColumn: 1 });
					if (rowRange) break;
				}
			}
		}

		// y of the target row relative to the top of the preview
		const bodyRect = markdownBody.getBoundingClientRect();
		let y: number | null = null;
		let height = 0;
		const target = range ?? rowRange;
		if (target) {
			const rects = target.getClientRects();
			const rect = rects.length > 0 ? rects[0] : target.getBoundingClientRect();
			y = rect.top - bodyRect.top;
			height = rect.height;
		} else {
			// No text match (blank or syntax-only line): interpolate inside the innermost element on the
			// line, or fall back to the closest element above it
			let el: HTMLElement | undefined = candidates[0];
			if (!el) {
				let bestLine = -1;
				for (const e of all) {
					const pos = parseSourcepos(e)!;
					if (pos.startLine <= info.startLine && pos.startLine >= bestLine) {
						el = e;
						bestLine = pos.startLine;
					}
				}
			}
			if (el) {
				const pos = parseSourcepos(el)!;
				const rect = el.getBoundingClientRect();
				const ratio = pos.endLine > pos.startLine
					? Math.min(1, Math.max(0, (info.startLine - pos.startLine) / (pos.endLine - pos.startLine + 1)))
					: 0;
				y = rect.top - bodyRect.top + rect.height * ratio;
			}
		}

		if (y !== null && scroll) {
			// Rects are on-screen pixels, but scrollTop / clientHeight are in the preview's own units,
			// which differ by the zoom factor (zoom is set on an ancestor). Work in screen pixels, like
			// the editor's viewportOffset, and convert only the final scroll distance.
			const scale = previewScale(markdownBody);
			const viewHeight = bodyRect.height;
			const offset = info.viewportOffset !== undefined
				? Math.max(0, Math.min(info.viewportOffset, viewHeight - 40))
				: viewHeight / 2 - height / 2;
			const maxScroll = markdownBody.scrollHeight - markdownBody.clientHeight;
			const startScroll = markdownBody.scrollTop;
			const targetScroll = Math.max(0, Math.min(maxScroll, startScroll + (y - offset) / scale));
			if (Math.abs(startScroll - targetScroll) > 1) {
				isProgrammaticScroll = true;
				markdownBody.scrollTop = targetScroll;
			}
			if (modeSwitchGlowActive) {
				const top = bodyRect.top + y - (markdownBody.scrollTop - startScroll) * scale;
				showModeSwitchGlow(bodyRect.left, top, markdownBody.clientWidth * scale, height || 24 * scale);
			}
		}

		if (range) {
			const sel = window.getSelection();
			sel?.removeAllRanges();
			sel?.addRange(range);
		}
	}

	// Apply the carried selection, then keep re-applying it while the preview settles. The page is
	// re-rendered after the mode switch (full-document load for large files, mermaid/KaTeX/highlight.js,
	// TOC/split re-render), which replaces DOM nodes (dropping the selection) and shifts the layout.
	// Stops on user interaction or after a timeout.
	// Screen pixels per preview CSS pixel (the zoom applied by an ancestor)
	function previewScale(body: HTMLElement): number {
		const scale = body.getBoundingClientRect().height / body.offsetHeight;
		return Number.isFinite(scale) && scale > 0 ? scale : 1;
	}

	// Short glow on the carried row after an edit -> view switch. A fixed overlay outside the zoomed
	// container (screen coordinates); it follows re-applies while the preview settles and fades into
	// nothing (a carried selection stays selected).
	let modeSwitchGlowActive = false;
	let modeSwitchGlowEl: HTMLDivElement | null = null;

	function showModeSwitchGlow(left: number, top: number, width: number, height: number) {
		if (!modeSwitchGlowEl) {
			const el = document.createElement('div');
			el.className = 'mode-switch-glow';
			el.addEventListener('animationend', hideModeSwitchGlow);
			document.body.appendChild(el);
			modeSwitchGlowEl = el;
		}
		Object.assign(modeSwitchGlowEl.style, {
			left: `${left}px`,
			top: `${top - 2}px`,
			width: `${width}px`,
			height: `${height + 4}px`,
		});
	}

	function hideModeSwitchGlow() {
		modeSwitchGlowActive = false;
		modeSwitchGlowEl?.remove();
		modeSwitchGlowEl = null;
	}

	function applyViewSelectionSettled(info: SourceSelection) {
		const body = markdownBody;
		if (!body) return;
		hideModeSwitchGlow();
		modeSwitchGlowActive = true;

		let timer: ReturnType<typeof setTimeout> | undefined;
		const reapply = () => {
			clearTimeout(timer);
			timer = setTimeout(() => applyViewSelection(info), 40);
		};
		const mutations = new MutationObserver(reapply);
		mutations.observe(body, { childList: true, subtree: true, characterData: true });
		const resizes = new ResizeObserver(reapply);
		resizes.observe(body);

		const stop = () => {
			mutations.disconnect();
			resizes.disconnect();
			clearTimeout(timer);
			clearTimeout(deadline);
			body.removeEventListener('wheel', stop);
			body.removeEventListener('mousedown', stop);
			body.removeEventListener('keydown', stop);
			hideModeSwitchGlow(); // a fixed overlay would no longer match the scrolled content
		};
		const deadline = setTimeout(stop, 5000);
		body.addEventListener('wheel', stop, { passive: true });
		body.addEventListener('mousedown', stop);
		body.addEventListener('keydown', stop);

		applyViewSelection(info);
	}

	let cancelReloadPin: (() => void) | null = null;

	interface PreviewAnchor {
		sourcepos: string;
		index: number;
		line: number;
		delta: number;
		scrollTop: number;
	}

	const PREVIEW_ANCHOR_OFFSET = 60;

	// Element top in the preview's own units (comparable with scrollTop): rects are screen pixels,
	// which differ by the zoom factor
	function topInPreview(el: HTMLElement, body: HTMLElement) {
		return (el.getBoundingClientRect().top - body.getBoundingClientRect().top) / previewScale(body) + body.scrollTop;
	}

	// Captures the source element at the top of the preview: the deepest visible [data-sourcepos]
	// element starting at or above the anchor offset, plus the pixel distance into it. The tab's
	// anchorLine is not precise enough here: it only looks at top-level children, and fold wrappers
	// (no sourcepos) hold most of the content, so it lags behind at the last passed heading.
	function capturePreviewAnchor(body: HTMLElement): PreviewAnchor {
		const y = body.scrollTop + PREVIEW_ANCHOR_OFFSET;
		let best: HTMLElement | null = null;
		let bestTop = -Infinity;
		for (const el of Array.from(body.querySelectorAll<HTMLElement>('[data-sourcepos]'))) {
			if (el.getClientRects().length === 0) continue; // hidden, e.g. inside a collapsed section
			const top = topInPreview(el, body);
			if (top <= y && top >= bestTop) {
				best = el;
				bestTop = top;
			}
		}
		if (!best) return { sourcepos: '', index: 0, line: 0, delta: 0, scrollTop: body.scrollTop };

		const sourcepos = best.dataset.sourcepos || '';
		const same = Array.from(body.querySelectorAll(`[data-sourcepos="${CSS.escape(sourcepos)}"]`));
		return {
			sourcepos,
			index: Math.max(0, same.indexOf(best)),
			line: parseInt(sourcepos, 10) || 0,
			delta: y - bestTop,
			scrollTop: body.scrollTop
		};
	}

	// Move a captured anchor to the new text after an external change, so the same content stays in
	// view. An element whose first line was deleted moves to the nearest surviving line above it,
	// which is then placed at the anchor offset. The remapped sourcepos is a prefix ("line:col-").
	function remapPreviewAnchor(anchor: PreviewAnchor, map: LineMapping): PreviewAnchor {
		const m = anchor.sourcepos.match(/^(\d+):(\d+)-/);
		if (!m) return anchor;
		const oldLine = Number(m[1]);
		const line = map.line(oldLine);
		if (map.status(oldLine) !== 'deleted') return { ...anchor, sourcepos: `${line}:${m[2]}-`, line };
		return { ...anchor, sourcepos: `${line}:`, index: 0, line, delta: 0 };
	}

	// Deepest visible element starting on the given line, else the closest one starting above it
	function elementAtOrAbove(body: HTMLElement, line: number): HTMLElement | null {
		let best: HTMLElement | null = null;
		let bestLine = -1;
		for (const el of Array.from(body.querySelectorAll<HTMLElement>('[data-sourcepos]'))) {
			if (el.getClientRects().length === 0) continue;
			const start = parseInt(el.dataset.sourcepos || '', 10);
			if (start <= line && start >= bestLine) {
				best = el;
				bestLine = start;
			}
		}
		return best;
	}

	// Scrolls the captured element back to the same spot. Falls back to the closest element at or
	// above the source line when the element no longer exists, then to the raw scrollTop.
	function restorePreviewAnchor(body: HTMLElement, anchor: PreviewAnchor) {
		const prefix = anchor.sourcepos.endsWith('-') || anchor.sourcepos.endsWith(':');
		const same = anchor.sourcepos
			? body.querySelectorAll<HTMLElement>(`[data-sourcepos${prefix ? '^' : ''}="${CSS.escape(anchor.sourcepos)}"]`)
			: [];
		let el: HTMLElement | null = same[anchor.index] ?? same[0] ?? null;
		let delta = anchor.delta;
		if ((!el || el.getClientRects().length === 0) && anchor.line > 0) {
			el = elementAtOrAbove(body, anchor.line);
			delta = 0;
		}
		let target: number;
		if (el && el.getClientRects().length > 0) {
			target = topInPreview(el, body) + delta - PREVIEW_ANCHOR_OFFSET;
		} else {
			target = anchor.scrollTop;
		}
		target = Math.max(0, Math.min(target, body.scrollHeight - body.clientHeight));
		if (Math.abs(body.scrollTop - target) > 1) {
			isProgrammaticScroll = true;
			body.scrollTop = target;
		}
	}

	// Keep the reader's position pinned while a reloaded preview settles. Swapping innerHTML and the
	// async mermaid/KaTeX/highlight.js passes change the document height, which clamps scrollTop and
	// leaves the view somewhere else. Stops on user interaction or after a timeout.
	function pinPreviewPositionSettled(anchor: PreviewAnchor, selection: SourceSelection | null = null) {
		const body = markdownBody;
		if (!body) return;
		cancelReloadPin?.();

		const apply = () => {
			restorePreviewAnchor(body, anchor);
			if (selection) applyViewSelection(selection, false);
		};

		let timer: ReturnType<typeof setTimeout> | undefined;
		const reapply = () => {
			clearTimeout(timer);
			timer = setTimeout(apply, 40);
		};
		const mutations = new MutationObserver(reapply);
		mutations.observe(body, { childList: true, subtree: true, characterData: true });
		const resizes = new ResizeObserver(reapply);
		resizes.observe(body);

		const stop = () => {
			mutations.disconnect();
			resizes.disconnect();
			clearTimeout(timer);
			clearTimeout(deadline);
			body.removeEventListener('wheel', stop);
			body.removeEventListener('mousedown', stop);
			body.removeEventListener('keydown', stop);
			if (cancelReloadPin === stop) cancelReloadPin = null;
		};
		const deadline = setTimeout(stop, 3000);
		body.addEventListener('wheel', stop, { passive: true });
		body.addEventListener('mousedown', stop);
		body.addEventListener('keydown', stop);
		cancelReloadPin = stop;

		apply();
	}

	// In-place reload of the open file (live-mode file change, F5/Ctrl+R, search refresh). In view
	// mode this loads the full document directly (loadMarkdown first renders a truncated 50 KB
	// preview, which shrinks the page and clamps scrollTop) and pins the previous position until
	// rendering settles.
	// Incremented per reload so a slower, older read (e.g. one that hit the file mid-write) can't
	// overwrite the result of a newer one.
	let reloadSeq = 0;

	async function reloadCurrentFile(force = false) {
		const tab = tabManager.activeTab;
		if (!tab || !tab.path) return;

		// Unsaved changes (editor edits or view-mode checkbox toggles) are never replaced silently:
		// a live reload keeps them and only reports a real change on disk; F5 / Ctrl+R asks first.
		if (tab.isDirty) {
			if (!force) {
				try {
					const disk = (await invoke('read_file_content', { path: tab.path })) as string;
					if (disk !== tab.originalContent) addToast(t('toast.fileChangedUnsavedKept', settings.language), 'warning');
				} catch (e) {
					console.error('Error checking file for changes:', e);
				}
				return;
			}
			const response = await askCustom(t('toast.reloadDiscardsChanges', settings.language), {
				title: t('modal.unsavedChanges', settings.language),
				kind: 'warning',
				showSave: true,
			});
			if (response === 'cancel') return;
			if (response === 'save' && !(await saveContent())) return;
		}

		if (tab.isEditing || !markdownBody) {
			await loadMarkdown(tab.path);
			return;
		}

		const seq = ++reloadSeq;
		const id = tab.id;
		const path = tab.path;
		const anchor = capturePreviewAnchor(markdownBody);
		const oldRaw = tab.rawContent;
		const visibleSelection = captureVisibleSelection(markdownBody);
		const isCurrent = () => seq === reloadSeq && tabManager.activeTabId === id && tab.path === path;

		try {
			// one read: the rendered HTML and the raw text always come from the same file version
			const content = (await invoke('read_file_content', { path })) as string;
			if (!isCurrent()) return;
			if (tab.isDirty && !force) {
				// a checkbox was toggled while the file was being read: keep the unsaved toggle
				if (content !== tab.originalContent) addToast(t('toast.fileChangedUnsavedKept', settings.language), 'warning');
				return;
			}
			if (!force && tab.content && content === tab.rawContent) return;
			const html = (await invoke('render_markdown', { content })) as string;
			if (!isCurrent()) return;
			tabManager.updateTabContent(id, processMarkdownHtml(html, path, collapsedHeaders));
			tabManager.setTabRawContent(id, content);
			await tick();
			// keep the same content in view (and the selection, unless its text was deleted)
			const map = mapLines(oldRaw, content);
			const selection = visibleSelection && visibleSelection.text.trim() && map.status(visibleSelection.startLine) !== 'deleted'
				? { ...visibleSelection, startLine: map.line(visibleSelection.startLine), endLine: map.line(visibleSelection.endLine), viewportOffset: undefined }
				: null;
			pinPreviewPositionSettled(remapPreviewAnchor(anchor, map), selection);
		} catch (e) {
			console.error('Error reloading file:', e);
		} finally {
			// Re-arm the watcher like loadMarkdown does: editors that save via temp file + rename
			// replace the file, which can drop the watch on the original path. Only while this file is
			// still the active one, otherwise the watcher would be pulled away from the new tab's file.
			if (seq === reloadSeq && liveMode && tabManager.activeTab?.path === path) armWatcher(path);
		}
	}

	// Keep the single, app-wide file watcher on the active tab's file. Tab switches and restored
	// sessions don't go through loadMarkdown, so the watcher stayed on the previously loaded file
	// (or was never started) and live reload only began after F5. When the watcher moves to a file,
	// pick up changes made while it wasn't watched; reloadCurrentFile skips unchanged content.
	let watchedPath = '';

	// Point the watcher at a file. Watching fails while the file is briefly missing (save via temp
	// file + rename), so retry a few times; if it never succeeds, drop the claim so the next tab
	// switch or reload tries again instead of assuming the file is watched.
	function armWatcher(path: string, attempt = 0) {
		watchedPath = path;
		invoke('watch_file', { path }).catch((e) => {
			if (watchedPath !== path || !liveMode) return;
			if (attempt < 3) {
				setTimeout(() => {
					if (watchedPath === path && liveMode) armWatcher(path, attempt + 1);
				}, 500);
			} else {
				console.error('Failed to watch file', path, e);
				watchedPath = '';
			}
		});
	}

	$effect(() => {
		const path = currentFile;
		const live = liveMode;
		untrack(() => {
			if (!live || !path) {
				if (watchedPath) invoke('unwatch_file').catch(console.error);
				watchedPath = '';
				return;
			}
			if (path === watchedPath) return;
			armWatcher(path);
			const tab = tabManager.activeTab;
			if (tab && !tab.isEditing && !tab.isDirty) reloadCurrentFile();
		});
	});

	// One save fires several watcher events; coalesce them into a single reload.
	let fileChangedTimer: ReturnType<typeof setTimeout> | undefined;
	function scheduleLiveReload() {
		clearTimeout(fileChangedTimer);
		fileChangedTimer = setTimeout(() => {
			if (liveMode && currentFile) reloadCurrentFile();
		}, 150);
	}

	async function toggleEdit(autoSave = false) {
		const tab = tabManager.activeTab;
		if (!tab || tab.path === undefined) return;
		if (showPreviewSearch) closePreviewSearch();
		hideModeSwitchGlow();

		// Carry the cursor/selection across the mode switch (not needed in split view)
		const carriedSelection = isSplit ? null : isEditing ? editorPane?.getSelectionInfo() ?? null : captureViewSelection();

		if (isEditing) {
			// Switch back to view
			if (tab.isDirty && tab.path !== '') {
				if (autoSave) {
				const success = await saveContent();
				if (!success) return; // If save fails, stay in edit mode?
			} else {
				const response = await askCustom(t('modal.unsavedChangesViewMode', settings.language), {
					title: t('modal.unsavedChanges', settings.language),
					kind: 'warning',
					showSave: true,
				});

					if (response === 'cancel') return;
					if (response === 'save') {
						const success = await saveContent();
						if (!success) return;
					} else if (response === 'discard') {
						tab.rawContent = tab.originalContent;
					}
				}
			}
			tab.isEditing = false;
			if (tab.path !== '') {
				tab.isDirty = false;
				// Render the full document in one pass: loadMarkdown first shows a truncated 50 KB preview
				// and swaps in the rest later, which reflows the page under the carried selection
				try {
					const path = tab.path;
					// one read: the rendered HTML and the raw text come from the same file version
					const content = (await invoke('read_file_content', { path })) as string;
					const html = (await invoke('render_markdown', { content })) as string;
					tabManager.updateTabContent(tab.id, processMarkdownHtml(html, path, collapsedHeaders));
					tabManager.setTabRawContent(tab.id, content);
					if (liveMode) armWatcher(path);
				} catch (e) {
					console.error('Failed to render document for view mode', e);
					await loadMarkdown(tab.path, { preserveEditState: true });
				}
			} else {
				try {
					const html = (await invoke('render_markdown', { content: tab.rawContent })) as string;
					const processedInfo = processMarkdownHtml(html, '', collapsedHeaders);
					tabManager.updateTabContent(tab.id, processedInfo);
				} catch (e) {
					console.error('Failed to render markdown for unsaved file', e);
				}
			}
			if (carriedSelection) {
				// Wait for the rendered HTML (and rich content post-processing) to land in the DOM
				await tick();
				setTimeout(() => applyViewSelectionSettled(carriedSelection), 50);
			}
		} else {
			// Switch to edit
			if (tab.isDirty) {
				// keep unsaved view-mode changes (e.g. toggled task checkboxes)
				tab.isEditing = true;
			} else if (tab.path !== '') {
				try {
					const content = (await invoke('read_file_content', { path: tab.path })) as string;
					tab.rawContent = content;
					tab.isEditing = true;
					tab.isDirty = false;
				} catch (e) {
					console.error('Failed to read file for editing', e);
				}
			} else {
				tab.isEditing = true;
			}
			if (carriedSelection && tab.isEditing) {
				await tick();
				editorPane?.selectSourceText(carriedSelection);
			}
		}
	}

	async function saveContent(): Promise<boolean> {
		const tab = tabManager.activeTab;
		// view mode can still hold unsaved changes (e.g. toggled task checkboxes)
		if (!tab || (!tab.isEditing && !tab.isSplit && !tab.isDirty)) return false;

		let targetPath = tab.path;

		if (!targetPath) {
			// Special handling for new (untitled) files
			const selected = await save({
				filters: [
					{ name: 'Markdown', extensions: ['md'] },
					{ name: 'All Files', extensions: ['*'] },
				],
			});
			if (selected) {
				targetPath = selected;
			} else {
				return false; // User cancelled save dialog
			}
		}

		try {
			await invoke('save_file_content', { path: targetPath, content: tab.rawContent });
			if (tab.path === '') {
				// We just saved an untitled tab for the first time
				tabManager.updateTabPath(tab.id, targetPath);
				saveRecentFile(targetPath);
			}
			tab.isDirty = false;
			tab.originalContent = tab.rawContent;
			refreshFolderPaneAfterSave(targetPath);
			return true;
		} catch (e) {
			console.error('Failed to save file', e);
			addToast(t('toast.saveFailed', settings.language).replace('{{path}}', targetPath).replace('{{error}}', String(e)), 'error');
			return false;
		}
	}

	async function saveContentAs(): Promise<boolean> {
		const tab = tabManager.activeTab;
		if (!tab) return false;

		const selected = await save({
			filters: [
				{ name: 'Markdown', extensions: ['md'] },
				{ name: 'All Files', extensions: ['*'] },
			],
			defaultPath: tab.path || undefined,
		});

		if (selected) {
			try {
				await invoke('save_file_content', { path: selected, content: tab.rawContent });
				tabManager.updateTabPath(tab.id, selected);
				saveRecentFile(selected);
				tab.isDirty = false;
				tab.originalContent = tab.rawContent;
				refreshFolderPaneAfterSave(selected);
				return true;
			} catch (e) {
				console.error('Failed to save file as', e);
				addToast(t('toast.saveFailed', settings.language).replace('{{path}}', selected).replace('{{error}}', String(e)), 'error');
				return false;
			}
		}
		return false;
	}

	async function exportAsHtml() {
		const tab = tabManager.activeTab;
		await _exportHtml({
			htmlContent: htmlContent,
			markdownBody,
			tabTitle: tab?.title || '',
			tabPath: tab?.path || '',
		});
	}

	function handleNewFile() {
		tabManager.addNewTab();
		showHome = false;
	}

	async function selectFile() {
		const selected = await open({
			multiple: false,
			filters: [
				{ name: 'Markdown', extensions: ['md', 'markdown', 'mdown', 'mkd'] },
				{ name: 'All Files', extensions: ['*'] },
			],
		});
		if (selected && typeof selected === 'string') loadMarkdown(selected);
	}

	function toggleHome() {
		showHome = !showHome;
	}

	async function closeFile() {
		if (!tabManager.activeTabId) {
			await destroyWindowAfterTabsClosed();
			return;
		}

		await closeTabAndWindowIfLast(tabManager.activeTabId);
	}

	async function closeTabAndWindowIfLast(tabId: string) {
		if (!(await canCloseTab(tabId))) return;

		tabManager.closeTab(tabId);
		if (tabManager.tabs.length > 0) return;

		if (liveMode) invoke('unwatch_file').catch(console.error);
		await destroyWindowAfterTabsClosed();
	}

	async function destroyWindowAfterTabsClosed() {
		if (settings.restoreStateOnReopen) {
			localStorage.setItem('savedTabsData', tabManager.serializeState());
		}

		await appWindow.destroy();
	}

	async function openFileLocation() {
		if (currentFile) await invoke('open_file_folder', { path: currentFile });
	}

	async function toggleLiveMode() {
		liveMode = !liveMode;
		localStorage.setItem('liveMode', String(liveMode));
		if (liveMode && currentFile) {
			armWatcher(currentFile);
			if (tabManager.activeTabId) await reloadCurrentFile();
		} else {
			await invoke('unwatch_file');
		}
	}

	async function saveImageAs(src: string) {
		let realPath = '';
		if (src.startsWith('asset:')) {
			try {
				const url = new URL(src);
				realPath = decodeURIComponent(url.pathname);
				if (realPath.startsWith('/localhost/')) {
					realPath = realPath.substring(11);
				} else if (realPath.startsWith('/')) {
					realPath = realPath.substring(1);
				}
			} catch (e) {
				console.error('Failed to parse asset URL:', e);
			}
		} else if (src.startsWith('http')) {
			try {
				const response = await fetch(src);
				const buffer = await response.arrayBuffer();
				const dest = await save({ 
					defaultPath: 'image.png',
					filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }]
				});
				if (dest) {
					await invoke('save_file_binary', { path: dest, data: Array.from(new Uint8Array(buffer)) });
					addToast('Image saved successfully');
				}
			} catch (e) {
				addToast('Failed to save remote image', 'error');
			}
			return;
		}

		if (realPath) {
			const ext = realPath.split('.').pop() || 'png';
			const dest = await save({ 
				defaultPath: `image.${ext}`,
				filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'] }]
			});
			if (dest) {
				try {
					await invoke('copy_file', { src: realPath, dest });
					addToast('Image saved successfully');
				} catch (e) {
					addToast(`Failed to save image: ${e}`, 'error');
				}
			}
		}
	}

	async function saveDiagramAs(container: HTMLElement) {
		const svg = container.querySelector('svg')?.outerHTML;
		if (!svg) return;
		const dest = await save({ 
			defaultPath: 'diagram.svg',
			filters: [{ name: 'SVG Image', extensions: ['svg'] }]
		});
		if (dest) {
			try {
				await invoke('save_file_content', { path: dest, content: svg });
				addToast('Diagram saved as SVG');
			} catch (e) {
				addToast(`Failed to save diagram: ${e}`, 'error');
			}
		}
	}

	function handleContextMenu(e: MouseEvent) {
		if (mode !== 'app') return;
		e.preventDefault();

		const selection = window.getSelection();
		const hasSelection = selection ? selection.toString().length > 0 : false;
		const isInsideEditor = (e.target as HTMLElement).closest('.editor-container');

		// detect heading for copy ref
		const heading = (e.target as HTMLElement).closest('h1, h2, h3, h4, h5, h6');
		let copyRefItem: any[] = [];
		if (heading) {
			const text = heading.textContent?.trim() || '';
			const tab = tabManager.activeTab;
			const filename = tab?.path ? tab.path.split(/[/\\]/).pop()?.replace(/\.[^.]+$/, '') || '' : '';
			const ref = filename ? `[[${filename}#${text}]]` : `#${text}`;
			copyRefItem = [
				{ label: t('menu.copyReference', uiLanguage), onClick: () => invoke('clipboard_write_text', { text: ref }) },
				{ separator: true },
			];
		}

		const img = (e.target as HTMLElement).closest('img');
		let mediaItems: any[] = [];
		if (img) {
			mediaItems = [
				{ label: t('menu.saveImageAs', uiLanguage), onClick: () => saveImageAs(img.src) },
				{ separator: true }
			];
		}

		const mermaidDiag = (e.target as HTMLElement).closest('.mermaid-diagram');
		if (mermaidDiag) {
			mediaItems = [
				{ label: t('menu.saveDiagramAsSvg', uiLanguage), onClick: () => saveDiagramAs(mermaidDiag as HTMLElement) },
				{ separator: true }
			];
		}

		docContextMenu = {
			show: true,
			x: e.clientX,
			y: e.clientY,
			items: [
				...copyRefItem,
				...mediaItems,
				...(isEditing && isInsideEditor
					? [
							{ label: t('menu.undo', uiLanguage), shortcut: 'Ctrl+Z', onClick: () => editorPane?.undo() },
							{ label: t('menu.redo', uiLanguage), shortcut: 'Ctrl+Y', onClick: () => editorPane?.redo() },
							{ separator: true }
						]
					: []),
				...(hasSelection ? [{ label: t('menu.copy', uiLanguage), onClick: () => {
					const selection = window.getSelection()?.toString();
					if (selection) invoke('clipboard_write_text', { text: selection });
				} }] : []),
				{ label: t('menu.selectAll', uiLanguage), onClick: () => {
					if (!markdownBody) return;
					const range = document.createRange();
					range.selectNodeContents(markdownBody);
					const selection = window.getSelection();
					selection?.removeAllRanges();
					selection?.addRange(range);
				} },
				{ separator: true },
				{ label: t('menu.openLocation', uiLanguage), onClick: openFileLocation, disabled: !currentFile },
				{ label: t('menu.edit', uiLanguage), onClick: () => toggleEdit() },
				{ separator: true },
				{ label: t('menu.closeFile', uiLanguage), onClick: closeFile },
			],
		};
	}

	function handleMouseOver(event: MouseEvent) {
		if (mode !== 'app') return;
		let target = event.target as HTMLElement;
		while (target && target.tagName !== 'A' && target !== document.body) target = target.parentElement as HTMLElement;
		if (target?.tagName === 'A') {
			const anchor = target as HTMLAnchorElement;
			const rawHref = anchor.getAttribute('href') || '';
			if (!rawHref) return;

			// tooltip for same-page anchor links: show text of target header
			if (rawHref.startsWith('#')) {
				let id = rawHref.substring(1);
				if (id.startsWith('^')) id = id.substring(1);
				const el = markdownBody?.querySelector(`[id="${CSS.escape(id)}"]`) as HTMLElement | null;
				if (el) {
					// Use data-label if it's a block anchor, otherwise use textContent
					let text = el.getAttribute('data-label') || el.textContent || '';
					text = text.replace(/↩.*$/, '').trim(); // remove backrefs if any
					if (text) {
						const rect = anchor.getBoundingClientRect();
						tooltip = { show: true, text, shortcut: '', html: '', isFootnote: false, x: rect.left + rect.width / 2, y: rect.top - 8, align: 'top' };
						return;
					}
				}
				const rect = anchor.getBoundingClientRect();
				tooltip = { show: true, text: rawHref, shortcut: '', html: '', isFootnote: false, x: rect.left + rect.width / 2, y: rect.top - 8, align: 'top' };
				return;
			}

			// footnote references: show footnote content instead of URL
			if (anchor.hasAttribute('data-footnote-ref') || anchor.closest('[data-footnote-ref]') || rawHref.match(/#fn-|#fnref-|#user-content-fn/)) {
				const fnId = rawHref.replace(/^#/, '');
				const fnLi = markdownBody?.querySelector(`#${CSS.escape(fnId)}`) ||
				              markdownBody?.querySelector(`li#${CSS.escape(fnId)}`);
				if (fnLi) {
					// clone to remove backref arrow from tooltip
					const clone = fnLi.cloneNode(true) as HTMLElement;
					const backrefs = clone.querySelectorAll('.footnote-backref, a[href^="#fnref-"]');
					backrefs.forEach(b => b.remove());

					let fnHtml = clone.innerHTML.trim();
					if (fnHtml) {
						const rect = anchor.getBoundingClientRect();
						tooltip = { show: true, text: '', shortcut: '', html: fnHtml, isFootnote: true, x: rect.left + rect.width / 2, y: rect.top - 8, align: 'top' };
						return;
					}
				}
			}

			// resolve folder and markdown file links to absolute paths for the tooltip
			let tooltipText: string;
			if (rawHref.match(/^[a-z]+:\/\//i)) {
				tooltipText = rawHref;
			} else {
				const cleaned = rawHref.endsWith('/') ? rawHref.slice(0, -1) : rawHref.split('#')[0].split('?')[0];
				tooltipText = resolvePath(currentFile, decodeURIComponent(cleaned));
			}

			const rect = anchor.getBoundingClientRect();
			tooltip = { show: true, text: tooltipText, shortcut: '', html: '', isFootnote: false, x: rect.left + rect.width / 2, y: rect.top - 8, align: 'top' };
		}
	}

	function handleMouseOut(event: MouseEvent) {
		let target = event.target as HTMLElement;
		while (target && target.tagName !== 'A' && target !== document.body) target = target.parentElement as HTMLElement;
		if (target?.tagName === 'A') tooltip.show = false;
	}

	async function handleDocumentClick(event: MouseEvent) {
		if (mode !== 'app') return;
		if ((event as any).__markpadHandled) return;
		(event as any).__markpadHandled = true;
		tooltip.show = false;
		let target = event.target as HTMLElement;

		// task checkbox toggle in read mode; the native toggle is kept (no preventDefault)
		if (target?.tagName === 'INPUT' && (target as HTMLInputElement).type === 'checkbox' && target.hasAttribute('data-task-checkbox')) {
			event.stopPropagation();
			if (event.type !== 'click') {
				// Space on a focused checkbox is followed by a native click; Enter is not, so click explicitly
				if ((event as unknown as KeyboardEvent).key === 'Enter') (target as HTMLInputElement).click();
				return;
			}
			toggleTaskCheckbox(target as HTMLInputElement);
			return;
		}

		while (target && target.tagName !== 'A' && target !== document.body) target = target.parentElement as HTMLElement;
		if (target?.tagName === 'A') {
			const anchor = target as HTMLAnchorElement;
			const rawHref = anchor.getAttribute('href');
			if (!rawHref) return;

			// Anchor links: scroll within the preview article
			if (rawHref.startsWith('#') && markdownBody) {
				event.preventDefault();
				const targetId = rawHref.slice(1);
				const targetEl = markdownBody.querySelector(`[id="${CSS.escape(targetId)}"]`);
				if (targetEl) {
					targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
				}
				return;
			}

			// Folder links: open in system file explorer
			if (rawHref.endsWith('/') && !rawHref.match(/^[a-z]+:\/\//i)) {
				event.preventDefault();
				const decoded = decodeURIComponent(rawHref.slice(0, -1));
				const resolved = resolvePath(currentFile, decoded);
				try {
					await invoke('open_file_folder', { path: resolved });
				} catch (e) {
					console.error('Failed to open folder:', e);
				}
				return;
			}

			const isMarkdown = ['.md', '.markdown', '.mdown', '.mkd', '.txt'].some((ext) => {
				const urlNoHash = rawHref.split('#')[0].split('?')[0];
				return urlNoHash.toLowerCase().endsWith(ext);
			});

			if (isMarkdown && !rawHref.match(/^[a-z]+:\/\//i)) {
				event.preventDefault();
				const urlNoHash = rawHref.split('#')[0].split('?')[0];
				const decoded = decodeURIComponent(urlNoHash);
				const resolved = resolvePath(currentFile, decoded);
				await loadMarkdown(resolved);
				return;
			}

			event.preventDefault();
			if (!rawHref.match(/^[a-z]+:\/\//i)) {
				const decoded = decodeURIComponent(rawHref);
				const resolved = resolvePath(currentFile, decoded);
				await openPath(resolved);
			} else {
				await openUrl(rawHref);
			}
		}
	}

	let zoomLevel = $state(parseInt(localStorage.getItem('zoomLevel') || '100', 10));

	$effect(() => {
		localStorage.setItem('zoomLevel', String(zoomLevel));
	});

	function handleWheel(e: WheelEvent) {
		if (e.ctrlKey || e.metaKey) {
			if (e.deltaY < 0) {
				zoomLevel = Math.min(zoomLevel + 10, 500);
			} else {
				zoomLevel = Math.max(zoomLevel - 10, 25);
			}
		}
	}

	let debounceTimer: number;

	$effect(() => {
		const tab = tabManager.activeTab;
		if (tab && (tab.isSplit || (isEditing && settings.showToc)) && tab.rawContent !== undefined) {
			if ((tab as any)._lastRenderedRawContent === tab.rawContent) return;

			clearTimeout(debounceTimer);
			debounceTimer = setTimeout(() => {
				invoke('render_markdown', { content: tab.rawContent })
					.then((html) => {
						const processed = processMarkdownHtml(html as string, tab.path, collapsedHeaders);
						tabManager.updateTabContent(tab.id, processed);
						(tab as any)._lastRenderedRawContent = tab.rawContent;
						tick().then(renderRichContent);
					})
					.catch(console.error);
			}, 16);
		}
	});

	async function toggleSplitView(tabId: string, autoSave = false) {
		const tab = tabManager.tabs.find((t) => t.id === tabId);
		if (!tab) return;

		if (!tab.isSplit) {
			if (!tab.isEditing && !tab.rawContent && tab.path) {
				try {
					const content = (await invoke('read_file_content', { path: tab.path })) as string;
					tab.rawContent = content;
					tab.originalContent = content;
				} catch (e) {
					console.error('Failed to load raw content for split view', e);
				}
			}
			tabManager.setSplitEnabled(tab.id, true);
			if (liveMode) toggleLiveMode();
		} else {
			if (tab.isDirty && tab.path !== '') {
				if (autoSave) {
					const success = await saveContent();
					if (!success) return;
				} else {
					const response = await askCustom(t('modal.unsavedChangesSplitView', settings.language), {
						title: t('modal.unsavedChanges', settings.language),
						kind: 'warning',
						showSave: true,
					});

					if (response === 'cancel') return;
					if (response === 'save') {
						const success = await saveContent();
						if (!success) return;
					} else if (response === 'discard') {
						tab.rawContent = tab.originalContent;
					}
				}
			}
			tabManager.setSplitEnabled(tab.id, false);
			if (tab.path !== '') {
				tab.isDirty = false;
				await loadMarkdown(tab.path);
			} else {
			}
		}
	}

	function handleKeyDown(e: KeyboardEvent) {
		if (mode !== 'app') return;

		const cmdOrCtrl = e.ctrlKey || e.metaKey;
		const key = e.key.toLowerCase();
		const code = e.code;

		const isSplit = tabManager.activeTab?.isSplit;

		if (cmdOrCtrl && !e.shiftKey && key === 'w') {
			e.preventDefault();
			closeFile();
		}
		if (cmdOrCtrl && e.shiftKey && key === 'w') {
			e.preventDefault();
			const activeId = tabManager.activeTabId;
			if (activeId) {
				closeTabs(tabManager.tabs.filter((t) => t.id !== activeId).map((t) => t.id), activeId);
			}
		}
		if (cmdOrCtrl && !e.shiftKey && key === 't') {
			e.preventDefault();
			tabManager.addHomeTab();
		}
		if (cmdOrCtrl && key === 'q') {
			e.preventDefault();
			import('@tauri-apps/api/window').then(({ getCurrentWindow }) => {
				getCurrentWindow().close();
			});
		}
		if (cmdOrCtrl && key === 'h') {
			e.preventDefault();
			if (tabManager.activeTabId) toggleSplitView(tabManager.activeTabId);
		}
		if (cmdOrCtrl && key === 'f' && !isEditing) {
			e.preventDefault();
			openPreviewSearch();
		}
		if (code === 'F3' && !isEditing) {
			e.preventDefault();
			if (!showPreviewSearch) {
				openPreviewSearch();
			} else if (e.shiftKey) {
				previewSearchPrev();
			} else {
				previewSearchNext();
			}
		}
		// A search restored by a tab switch is open while the preview has the focus, so Esc must
		// close it from there too, not only from the search field (dialogs handle their own Esc)
		if (e.key === 'Escape' && showPreviewSearch && !isEditing && !document.querySelector('.modal-content')) {
			closePreviewSearch();
		}
		if ((cmdOrCtrl && key === 'r' && !isEditing) || (code === 'F5' && !isEditing)) {
			e.preventDefault();
			if (currentFile) reloadCurrentFile(true);
		}
		if (cmdOrCtrl && key === 'e') {
			e.preventDefault();
			if (!isSplit) toggleEdit(true);
		}
		if (cmdOrCtrl && key === 's') {
			if (isEditing || isSplit || tabManager.activeTab?.isDirty) {
				e.preventDefault();
				saveContent();
			}
		}

		if (cmdOrCtrl && e.shiftKey && key === 't') {
			e.preventDefault();
			handleUndoCloseTab();
		}
		if (cmdOrCtrl && code === 'Tab') {
			e.preventDefault();
			tabManager.cycleTab(e.shiftKey ? 'prev' : 'next');
		}
		if (cmdOrCtrl && code === 'PageUp') {
			e.preventDefault();
			tabManager.cycleTab('prev');
		}
		if (cmdOrCtrl && code === 'PageDown') {
			e.preventDefault();
			tabManager.cycleTab('next');
		}
		if (e.metaKey && e.altKey && code === 'ArrowLeft') {
			e.preventDefault();
			tabManager.cycleTab('prev');
		}
		if (e.metaKey && e.altKey && code === 'ArrowRight') {
			e.preventDefault();
			tabManager.cycleTab('next');
		}
		if (cmdOrCtrl && (key === '=' || key === '+')) {
			e.preventDefault();
			zoomLevel = Math.min(zoomLevel + 10, 500);
		}
		if (cmdOrCtrl && key === '-') {
			e.preventDefault();
			zoomLevel = Math.max(zoomLevel - 10, 25);
		}
		if (cmdOrCtrl && key === '0') {
			e.preventDefault();
			zoomLevel = 100;
		}
		if (!isEditing && !isSplit && key === 'arrowleft' && !cmdOrCtrl && !e.shiftKey) {
			e.preventDefault();
			const tabs = tabManager.tabs;
			const idx = tabs.findIndex((t) => t.id === tabManager.activeTabId);
			if (idx > 0) tabManager.setActive(tabs[idx - 1].id);
		}
		if (!isEditing && !isSplit && key === 'arrowright' && !cmdOrCtrl && !e.shiftKey) {
			e.preventDefault();
			const tabs = tabManager.tabs;
			const idx = tabs.findIndex((t) => t.id === tabManager.activeTabId);
			if (idx >= 0 && idx < tabs.length - 1) tabManager.setActive(tabs[idx + 1].id);
		}
		if (cmdOrCtrl && key === ',') {
			e.preventDefault();
			showSettings = !showSettings;
		}
		if (!isEditing && !cmdOrCtrl && (key === '?' || (e.shiftKey && key === '/'))) {
			e.preventDefault();
			showShortcuts = !showShortcuts;
		}
	}

	function pushScrollHistory() {
		if (markdownBody) {
			scrollHistory.push(markdownBody.scrollTop);
			scrollFuture = [];
			if (scrollHistory.length > 50) scrollHistory.shift();
		}
	}

	function activateTabFromStack(from: string[], to: string[]) {
		const current = tabManager.activeTabId;
		while (from.length > 0) {
			const id = from.pop()!;
			if (id === current) continue;
			if (!tabManager.tabs.find((t) => t.id === id)) continue;
			if (current) {
				to.push(current);
				if (to.length > 100) to.shift();
			}
			suppressTabHistory = true;
			tabManager.setActive(id);
			return true;
		}
		return false;
	}

	function handleMouseUp(e: MouseEvent) {
		if (e.button === 3) {
			// Back
			e.preventDefault();
			// try in-page scroll history first
			if (scrollHistory.length > 0 && markdownBody) {
				scrollFuture.push(markdownBody.scrollTop);
				const pos = scrollHistory.pop()!;
				isProgrammaticScroll = true;
				markdownBody.scrollTo({ top: pos, behavior: 'smooth' });
			} else {
				activateTabFromStack(tabBackStack, tabForwardStack);
			}
		} else if (e.button === 4) {
			// Forward
			e.preventDefault();
			if (scrollFuture.length > 0 && markdownBody) {
				scrollHistory.push(markdownBody.scrollTop);
				const pos = scrollFuture.pop()!;
				isProgrammaticScroll = true;
				markdownBody.scrollTo({ top: pos, behavior: 'smooth' });
			} else {
				activateTabFromStack(tabForwardStack, tabBackStack);
			}
		}
	}

	async function handleUndoCloseTab() {
		const path = tabManager.popRecentlyClosed();
		if (path) {
			await loadMarkdown(path);
		}
	}

	async function handleDetach(tabId: string) {
		if (!(await canCloseTab(tabId))) return;
		const tab = tabManager.tabs.find((t) => t.id === tabId);
		if (!tab || !tab.path) return;

		const path = tab.path;
		tabManager.closeTab(tabId);

		const label = 'window-' + Date.now();
		const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
		const webview = new WebviewWindow(label, {
			url: 'index.html?file=' + encodeURIComponent(path),
			title: 'MarkpadX - ' + path.split(/[/\\]/).pop(),
			width: 1000,
			height: 800,
		});
	}

	function startDrag(e: MouseEvent, tabId: string | null) {
		if (!tabId) return;
		e.preventDefault();
		const startX = e.clientX;
		const tab = tabManager.tabs.find((t) => t.id === tabId);
		if (!tab) return;

		const startRatio = tab.splitRatio ?? 0.5;
		const containerWidth = window.innerWidth;

		const onMove = (moveEvent: MouseEvent) => {
			const deltaX = moveEvent.clientX - startX;
			const deltaRatio = deltaX / containerWidth;
			tabManager.setSplitRatio(tabId, startRatio + deltaRatio);
		};

		const onUp = () => {
			window.removeEventListener('mousemove', onMove);
			window.removeEventListener('mouseup', onUp);
			document.body.style.cursor = '';
		};

		window.addEventListener('mousemove', onMove);
		window.addEventListener('mouseup', onUp);
		document.body.style.cursor = 'col-resize';
	}

	function getSplitTransition(node: Element, { isEditing, side }: { isEditing: boolean; side: 'left' | 'right' }) {
		let shouldAnimate = false;
		let x = 0;

		if (side === 'left') {
			if (!isEditing) {
				shouldAnimate = true;
				x = -50;
			}
		} else {
			if (isEditing) {
				shouldAnimate = true;
				x = 50;
			}
		}

		if (shouldAnimate) {
			return fly(node, { x, duration: 250 });
		}
		return { duration: 0 };
	}

	onMount(() => {
		loadRecentFiles();

		// @ts-ignore
		Promise.all([import('highlight.js'), import('highlightjs-svelte'), import('katex'), import('mermaid')]).then(async ([hljsModule, svelteModule, katexMainModule, mermaidModule]) => {
			hljs = hljsModule.default;
			try {
				svelteModule.default(hljs);
			} catch(e) { console.error('svelte hljs error', e); }
			
			katex = katexMainModule.default;
			// some extensions bind to window.katex
			(window as any).katex = katex;
			
			// @ts-ignore
			const [autoRenderModule] = await Promise.all([
				import('katex/dist/contrib/auto-render.js'),
				import('katex/dist/contrib/mhchem.js'),
				import('katex/dist/contrib/copy-tex.js')
			]);
			
			renderMathInElement = autoRenderModule.default;
			mermaid = mermaidModule.default;
		});

		let unlisteners: (() => void)[] = [];

		invoke('show_window').catch(console.error);

		const init = async () => {
			const { getCurrentWindow } = await import('@tauri-apps/api/window');
			const appWindow = getCurrentWindow();
			const appMode = (await invoke('get_app_mode')) as any;

			if (settings.restoreStateOnReopen) {
				const savedData = localStorage.getItem('savedTabsData');
				if (savedData) {
					tabManager.restoreState(savedData);
					for (const tab of tabManager.tabs) {
						if (!tab.content && tab.rawContent) {
							invoke('render_markdown', { content: tab.rawContent })
								.then((html) => {
									const processed = processMarkdownHtml(html as string, tab.path, collapsedHeaders);
									tabManager.updateTabContent(tab.id, processed);
									if (tabManager.activeTabId === tab.id) {
										tick().then(renderRichContent);
									}
								})
								.catch(console.error);
						}
					}
				}
			}

			const urlParams = new URLSearchParams(window.location.search);
			const fileParam = urlParams.get('file');
			if (fileParam) {
				const decodedPath = decodeURIComponent(fileParam);
				await loadMarkdown(decodedPath);
			}

			unlisteners.push(
				await appWindow.onFocusChanged(({ payload: focused }) => {
					isFocused = focused;
					// files may have been added or removed outside the app
					if (focused && settings.showFolderPane) folderPane.refresh();
				}),
			);
			unlisteners.push(
				await listen('file-changed', () => {
					scheduleLiveReload();
				}),
			);

			unlisteners.push(
				await listen('file-path', async (event) => {
					const raw: any = (event as any).payload;
					let filePath = '';
					if (typeof raw === 'string') filePath = raw;
					else if (raw && typeof raw === 'object' && typeof raw.path === 'string') filePath = raw.path;
					else if (raw != null) filePath = String(raw);
					filePath = filePath.trim();
					if (!filePath) return;
					try {
						const { getCurrentWindow } = await import('@tauri-apps/api/window');
						const win = getCurrentWindow();
						await win.unminimize();
						await win.setFocus();
					} catch (e) {
						console.error('[file-path] focus failed:', e);
					}
					try {
						await loadMarkdown(filePath);
					} catch (e) {
						console.error('[file-path] loadMarkdown threw:', e);
					}
				}),
			);
			unlisteners.push(
				await listen('menu-close-file', () => {
					closeFile();
				}),
			);
			unlisteners.push(
				await listen('menu-edit-file', () => {
					toggleEdit();
				}),
			);
			unlisteners.push(
				await listen('menu-tab-rename', async (event) => {
					const tabId = event.payload as string;
					const tab = tabManager.tabs.find((t) => t.id === tabId);
					if (!tab || !tab.path) return;

					const newName = window.prompt(t('menu.renameFile', settings.language), tab.title);
					if (newName && newName !== tab.title) {
						const oldPath = tab.path;
						const newPath = oldPath.replace(/[/\\][^/\\]+$/, (m) => m.charAt(0) + newName);
						try {
							await invoke('rename_file', { oldPath, newPath });
							tabManager.renameTab(tabId, newPath);
							// Update recent files if needed
							recentFiles = recentFiles.map((f) => (f === oldPath ? newPath : f));
							localStorage.setItem('recent-files', JSON.stringify(recentFiles));
						} catch (e) {
							console.error('Failed to rename file', e);
							await askCustom(`Failed to rename file: ${e}`, { title: 'Error', kind: 'error' });
						}
					}
				}),
			);
			unlisteners.push(
				await listen('menu-tab-new', () => {
					tabManager.addNewTab();
				}),
			);
			unlisteners.push(
				await listen('menu-tab-undo', () => {
					console.log('Received menu-tab-undo event');
					handleUndoCloseTab();
				}),
			);
			unlisteners.push(
				await listen('menu-tab-close', async (event) => {
					const tabId = event.payload as string;
					await closeTabAndWindowIfLast(tabId);
				}),
			);
			unlisteners.push(
				await listen('menu-tab-close-others', async (event) => {
					const tabId = event.payload as string;
					const tabsToClose = tabManager.tabs.filter((t) => t.id !== tabId).map((t) => t.id);
					await closeTabs(tabsToClose, tabId);
				}),
			);
			unlisteners.push(
				await listen('menu-tab-close-right', async (event) => {
					const tabId = event.payload as string;
					const index = tabManager.tabs.findIndex((t) => t.id === tabId);
					if (index !== -1) {
						const tabsToClose = tabManager.tabs.slice(index + 1).map((t) => t.id);
						await closeTabs(tabsToClose, tabId);
					}
				}),
			);
			unlisteners.push(
				await appWindow.onCloseRequested(async (event) => {
					console.log('onCloseRequested triggered');
					if (isForceExiting) return;

					if (settings.restoreStateOnReopen) {
						try {
							const stateStr = tabManager.serializeState();
							localStorage.setItem('savedTabsData', stateStr);
						} catch (e) {
							console.error('Failed to save state on close:', e);
						}
						return;
					}

					const dirtyTabs = tabManager.tabs.filter((t) => t.isDirty);
					console.log('Dirty tabs:', dirtyTabs.length);
					if (dirtyTabs.length > 0) {
						console.log('Preventing default close');
				event.preventDefault();
				const response = await askCustom(t('modal.youHaveUnsavedFiles', settings.language).replace('{{count}}', dirtyTabs.length.toString()), {
											title: t('modal.unsavedChanges', settings.language),
					kind: 'warning',
					showSave: true,
				});

						if (response === 'save') {
							// Attempt to save all dirty tabs
							for (const tab of dirtyTabs) {
								tabManager.setActive(tab.id);
								await tick();
								const saved = await saveContent();
								if (!saved) return; // Cancelled or failed
							}
							// If all saved successfully, close the app
							appWindow.close();
						} else if (response === 'discard') {
							// Force close by removing this listener or skipping check?
							// Since we are inside the event handler, we can't easily remove "this" listener specifically
							// without refactoring how unlisteners are stored/accessed relative to this callback.
							// However, if we just want to exit, we can use exit() from rust or just appWindow.destroy()?
							// WebviewWindow.close() triggers this event again.
							// Solution: invoke a command to exit forcefully or set a flag.
							// The simplest might be to just clear the dirty flags and close.
							tabManager.tabs.forEach((t) => (t.isDirty = false));
							appWindow.close();
						}
					}
				}),
			);

			unlisteners.push(
				await appWindow.onDragDropEvent((event) => {
					if (event.payload.type === 'enter' || event.payload.type === 'over') {
						const { x, y } = event.payload.position;
						isDragging = true;
						
						if (editorPaneEl) {
							const rect = editorPaneEl.getBoundingClientRect();
							if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
								dragTarget = 'editor';
								if (editorPane) editorPane.updateDragCaret(x, y);
							} else if (viewerPaneEl) {
								const vRect = viewerPaneEl.getBoundingClientRect();
								if (x >= vRect.left && x <= vRect.right && y >= vRect.top && y <= vRect.bottom) {
									dragTarget = 'preview';
									if (editorPane) editorPane.hideDragCaret();
								} else {
									dragTarget = null;
									if (editorPane) editorPane.hideDragCaret();
								}
							} else {
								dragTarget = null;
								if (editorPane) editorPane.hideDragCaret();
							}
						}
					} else if (event.payload.type === 'drop') {
						const { x, y } = event.payload.position;
						const paths = event.payload.paths;
						const currentEditor = editorPane;
						if (currentEditor) currentEditor.hideDragCaret();
						if (dragTarget === 'editor' && currentEditor) {
							paths.forEach(path => {
								const ext = path.split('.').pop()?.toLowerCase();
								if (ext && ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) {
									currentEditor.handleDroppedFile(path, x, y);
								}
							});
						} else if (dragTarget === 'preview' || (!isSplit && !isEditing)) {
							paths.forEach(path => {
								const ext = path.split('.').pop()?.toLowerCase();
								if (ext && ['md', 'markdown', 'txt'].includes(ext)) {
									loadMarkdown(path);
								} else {
									const filename = path.split(/[\/\\]/).pop() || 'File';
									addToast(t('toast.unsupportedFile').replace('{{filename}}', filename), 'error');
								}
							});
						}
						
						isDragging = false;
						dragTarget = null;
					} else if (event.payload.type === 'leave') {
						isDragging = false;
						dragTarget = null;
						if (editorPane) editorPane.hideDragCaret();
					}
				}),
			);

			try {
				const args: string[] = await invoke('send_markdown_path');
				if (args?.length > 0) {
					await loadMarkdown(args[0]);
				}
			} catch (error) {
				console.error('Error receiving Markdown file path:', error);
			}

			mode = appMode;
		};

		init();

		return () => {
			unlisteners.forEach((u) => u());
		};
	});
</script>

<svelte:document
	onclick={handleDocumentClick}
	oncontextmenu={handleContextMenu}
	onmouseover={handleMouseOver}
	onmouseout={handleMouseOut}
	onkeydown={handleKeyDown}
	onmouseup={handleMouseUp} />

{#if mode === 'loading'}
	<TitleBar
		{isFocused}
		isScrolled={false}
		currentFile={''}
		{liveMode}
		windowTitle="Markpad"
		showHome={false}
		{zoomLevel}
		onselectFile={selectFile}
		onnewFile={handleNewFile}
		onopenFile={selectFile}
		onopenFolder={openFolder}
		onsaveFile={saveContent}
		onsaveFileAs={saveContentAs}
		onexportHtml={exportAsHtml}
		onexportPdf={exportAsPdf}
		onexit={appExit}
		ontoggleHome={toggleHome}
		ononpenFileLocation={openFileLocation}
		ontoggleLiveMode={toggleLiveMode}
		ontoggleEdit={() => toggleEdit()}
		ontoggleSplit={() => tabManager.activeTabId && toggleSplitView(tabManager.activeTabId)}
		{isEditing}
		ondetach={handleDetach}
		ontabclick={() => (showHome = false)}
		onresetZoom={() => (zoomLevel = 100)}
		{isFullWidth}
		ontoggleFullWidth={() => (isFullWidth = !isFullWidth)}
		{theme}
		onSetTheme={(t) => (theme = t)}
		onopenSettings={() => (showSettings = true)}
		oncloseTab={closeTabAndWindowIfLast} />
	<div class="loading-screen">
		<svg class="spinner" viewBox="0 0 50 50">
			<circle class="path" cx="25" cy="25" r="20" fill="none" stroke-width="4"></circle>
		</svg>
	</div>
{:else if mode === 'installer'}
	<Installer />
{:else if mode === 'uninstall'}
	<Uninstaller />
{:else}
	<TitleBar
		{isFocused}
		{isScrolled}
		{currentFile}
		{liveMode}
		{windowTitle}
		{showHome}
		{zoomLevel}
		onselectFile={selectFile}
		onnewFile={handleNewFile}
		onopenFile={selectFile}
		onopenFolder={openFolder}
		onsaveFile={saveContent}
		onsaveFileAs={saveContentAs}
		onexportHtml={exportAsHtml}
		onexportPdf={exportAsPdf}
		onexit={appExit}
		ontoggleHome={toggleHome}
		ononpenFileLocation={openFileLocation}
		ontoggleLiveMode={toggleLiveMode}
		ontoggleEdit={() => toggleEdit()}
		ontoggleSplit={() => tabManager.activeTabId && toggleSplitView(tabManager.activeTabId)}
		{isEditing}
		ondetach={handleDetach}
		ontabclick={() => (showHome = false)}
		onresetZoom={() => (zoomLevel = 100)}
		{isScrollSynced}
		ontoggleSync={() => tabManager.activeTabId && tabManager.toggleScrollSync(tabManager.activeTabId)}
		{isFullWidth}
		ontoggleFullWidth={() => (isFullWidth = !isFullWidth)}
		{theme}
		onSetTheme={(t) => (theme = t)}
		onopenSettings={() => (showSettings = true)}
		oncloseTab={closeTabAndWindowIfLast} />

	<Settings show={showSettings} {theme} onSetTheme={(t) => (theme = t)} onclose={() => (showSettings = false)} />

	<Shortcuts show={showShortcuts} onclose={() => (showShortcuts = false)} />

	{#if tabManager.activeTab && (tabManager.activeTab.path !== '' || tabManager.activeTab.title !== 'Recents') && !showHome}
			<div
				class="markdown-container"
				style="zoom: {isEditing && !isSplit ? 1 : zoomLevel / 100}; --code-font: {settings.codeFont}, monospace; --code-font-size: {settings.codeFontSize}px; --highlight-color: {highlightColorMap[settings.highlightColor] || highlightColorMap.yellow};"
				onwheel={handleWheel}
				role="presentation">
				<div class="layout-container" 
					class:split={isSplit} 
					class:editing={isEditing} 
					class:has-pinned-toc={isMarkdown && settings.showToc}
					class:toc-on-left={isMarkdown && settings.tocSide === 'left'}
					class:toc-on-right={isMarkdown && settings.tocSide === 'right'}
					class:has-pinned-folder={folderPaneVisible}
					class:folder-on-left={folderSide === 'left'}
					class:folder-on-right={folderSide === 'right'}>
					<!-- Editor Pane -->
					<div bind:this={editorPaneEl} class="pane editor-pane" class:active={isEditing || isSplit} style="flex: {isSplit ? tabManager.activeTab.splitRatio : isEditing ? 1 : 0}">
						{#if isEditing || isSplit}
							<Editor
								bind:this={editorPane}
								bind:value={tabManager.activeTab.rawContent}
								language={editorLanguage}
								{theme}
								onsave={saveContent}
								bind:zoomLevel
								onnew={handleNewFile}
								onopen={selectFile}
								onclose={closeFile}
								onreveal={openFileLocation}
								ontoggleEdit={() => toggleEdit()}
								ontoggleLive={toggleLiveMode}
								ontoggleSplit={() => tabManager.activeTabId && toggleSplitView(tabManager.activeTabId)}
								onhome={() => (showHome = true)}
								onnextTab={() => tabManager.cycleTab('next')}
								onprevTab={() => tabManager.cycleTab('prev')}
								onundoClose={handleUndoCloseTab}
								onscrollsync={handleEditorScrollSync} />
						{/if}
					</div>

					<!-- Splitter -->
					{#if isSplit}
						<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
						<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
						<div class="split-bar" onmousedown={(e) => startDrag(e, tabManager.activeTabId)} onkeydown={handleSplitterKeyDown} role="separator" aria-orientation="vertical" tabindex="0"></div>
					{/if}

					<!-- Viewer Pane -->
					<div
						bind:this={viewerPaneEl}
						bind:clientWidth={viewerWidth}
						class="pane viewer-pane"
						class:active={!isEditing || isSplit}
						style="flex: {isSplit ? 1 - tabManager.activeTab.splitRatio : (!isEditing) ? 1 : 0}">

						{#if showPreviewSearch}
							<div class="preview-search-bar" transition:fly={{ y: -30, duration: 150 }}>
								<div class="preview-search-inner">
									<svg class="preview-search-icon" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
									<input
										bind:this={previewSearchInputEl}
										bind:value={previewSearchQuery}
										oninput={() => handlePreviewSearchInput()}
										onkeydown={handlePreviewSearchKeydown}
										placeholder="Find in preview (3+ chars)..."
										class="preview-search-input"
										spellcheck="false" />
									<span class="preview-search-count">
										{#if previewSearchMatches.length > 0}
											{previewSearchCurrentIndex + 1} / {previewSearchMatches.length}
										{:else if previewSearchQuery}
											No results
										{/if}
									</span>
									<button class="preview-search-btn" onclick={previewSearchPrev} title="Previous (Shift+Enter)" disabled={previewSearchMatches.length === 0}>
										<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>
									</button>
									<button class="preview-search-btn" onclick={previewSearchNext} title="Next (Enter)" disabled={previewSearchMatches.length === 0}>
										<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
									</button>
									<button class="preview-search-btn preview-search-case" class:active={previewSearchCaseSensitive} onclick={() => { previewSearchCaseSensitive = !previewSearchCaseSensitive; handlePreviewSearchInput(); }} title="Case sensitive">
										Aa
									</button>
									<button class="preview-search-btn" onclick={closePreviewSearch} title="Close (Esc)">
										<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
									</button>
								</div>
							</div>
						{/if}

						<div class="viewer-content">
							<article
								bind:this={markdownBody}
								contenteditable="false"
								class="markdown-body {isFullWidth ? 'full-width' : ''} {settings.showToc ? 'toc-active' : ''}"
								onclick={handleDocumentClick}
								onkeydown={(e) => { if(e.key === 'Enter' || e.key === ' ') handleDocumentClick(e as unknown as MouseEvent); }}
								onscroll={handleScroll}
								tabindex="-1"
								style="outline: none; font-family: {settings.previewFont}, sans-serif; font-size: {settings.previewFontSize}px; flex: 1;">
							</article>
							{#if tabManager.activeTabId && loadingTabs.includes(tabManager.activeTabId) && isAtBottom}
								<div class="loading-chip" transition:fly={{ y: 20, duration: 300, easing: cubicOut }}>
									<div class="loading-spinner"></div>
									<span>{t('common.loadingFullDocument', settings.language)}</span>
								</div>
							{/if}
						</div>
					</div>

					<!-- Unified TOC Support -->
					{#if isMarkdown && !showHome}
						<div class="top-fade-mask" style="{settings.tocSide === 'left' ? 'left: 0;' : 'right: 0; left: auto;'}"></div>
						<button 
							class="toc-toggle-floating {settings.showToc ? 'expanded' : ''}" 
							class:on-right={settings.tocSide === 'right'}
							class:in-edit-mode={isEditing && !settings.showToc}
							onclick={() => settings.toggleToc()}
							aria-label={settings.showToc ? t('tooltip.hideTableOfContents', settings.language) : t('tooltip.showTableOfContents', settings.language)}
							onmouseenter={(e) => {
								const rect = e.currentTarget.getBoundingClientRect();
								tooltip = { 
									show: true, 
									text: settings.showToc ? t('tooltip.hideTableOfContents', settings.language) : t('tooltip.showTableOfContents', settings.language), 
									shortcut: '',
									html: '', 
									isFootnote: false, 
									x: settings.tocSide === 'left' ? rect.right + 8 : rect.left - 8, 
									y: rect.top + rect.height / 2,
									align: settings.tocSide === 'left' ? 'right' : 'left'
								};
							}}
							onmouseleave={() => tooltip.show = false}>
							<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
								<polyline points="9 18 15 12 9 6"></polyline>
							</svg>
						</button>

						{#if settings.showToc}
							<div 
								transition:fly={{ x: settings.tocSide === 'left' ? -240 : 240, duration: 300, opacity: 1, easing: cubicOut }}
								class="toc-overlay-wrapper" 
								class:is-pinned={true}
								class:on-right={settings.tocSide === 'right'}>
								<Toc 
										{markdownBody} 
										{htmlContent} 
										onBeforeJump={pushScrollHistory} 
										{collapsedHeaders} 
										ontoggleFold={toggleFold} 
										oncopyref={(text: string) => { const tab = tabManager.activeTab; const fn = tab?.path ? tab.path.split(/[/\\]/).pop()?.replace(/\.[^.]+$/, '') || '' : ''; invoke('clipboard_write_text', { text: fn ? `[[${fn}#${text}]]` : `#${text}` }); }}
										onjump={(id: string, text: string) => {
											if (isEditing && editorPane) {
												editorPane.revealHeader(text);
											}
										}}
										oncontext={(e, item) => {
											docContextMenu = {
												show: true,
												x: e.clientX,
												y: e.clientY,
												items: [
													{ 
														label: t('menu.copyReference', uiLanguage),
														onClick: () => {
															const tab = tabManager.activeTab;
															const fn = tab?.path ? tab.path.split(/[/\\]/).pop()?.replace(/\.[^.]+$/, '') || '' : '';
															invoke('clipboard_write_text', { text: fn ? `[[${fn}#${item.text}]]` : `#${item.text}` });
															docContextMenu.show = false;
														} 
													}
												]
											};
										}}
										onshowTooltip={(e, text, shortcut, align) => {
											const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
											tooltip = {
												show: true,
												text,
												shortcut: shortcut || '',
												html: '',
												isFootnote: false,
												x: align === 'right' ? rect.right + 8 : (align as any === 'left' ? rect.left - 8 : rect.left + rect.width / 2),
												y: align === 'right' || align as any === 'left' ? rect.top + rect.height / 2 : (align === 'below' ? rect.bottom + 8 : rect.top - 8),
												align: align || 'top'
											};
										}}
										onhideTooltip={() => tooltip.show = false}
								/>
							</div>
						{/if}
					{/if}

					<!-- Folder pane: mirrors the outline on the opposite side -->
					{#if !settings.zenMode}
						<div class="top-fade-mask" style="{folderSide === 'left' ? 'left: 0;' : 'right: 0; left: auto;'}"></div>
						<button
							class="folder-toggle-floating"
							class:expanded={folderPaneVisible}
							class:on-right={folderSide === 'right'}
							class:in-edit-mode={isEditing && !folderPaneVisible}
							onclick={() => { settings.toggleFolderPane(); tooltip.show = false; }}
							aria-label={folderPaneVisible ? t('folderPane.hide', settings.language) : t('folderPane.show', settings.language)}
							onmouseenter={(e) => {
								const rect = e.currentTarget.getBoundingClientRect();
								tooltip = {
									show: true,
									text: folderPaneVisible ? t('folderPane.hide', settings.language) : t('folderPane.show', settings.language),
									shortcut: '',
									html: '',
									isFootnote: false,
									x: folderSide === 'left' ? rect.right + 8 : rect.left - 8,
									y: rect.top + rect.height / 2,
									align: folderSide === 'left' ? 'right' : 'left'
								};
							}}
							onmouseleave={() => tooltip.show = false}>
							<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
								<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
							</svg>
						</button>

						{#if folderPaneVisible}
							<div
								transition:fly={{ x: folderSide === 'left' ? -240 : 240, duration: 300, opacity: 1, easing: cubicOut }}
								class="folder-pane-wrapper"
								class:is-pinned={true}
								class:on-left={folderSide === 'left'}
								class:on-right={folderSide === 'right'}>
								<FolderPane
									side={folderSide}
									onopen={(path: string) => loadMarkdown(path)}
									onshowTooltip={showPaneTooltip}
									onhideTooltip={() => (tooltip.show = false)} />
							</div>
						{/if}
					{/if}
				</div>
			</div>
	{:else}
		<HomePage {recentFiles} onselectFile={selectFile} onloadFile={loadMarkdown} onremoveRecentFile={removeRecentFile} onnewFile={handleNewFile} />
	{/if}

	<div 
		class="tooltip align-{tooltip.align} {tooltip.show ? 'visible' : ''}" 
		class:footnote-tooltip={tooltip.isFootnote} 
		style="left: {tooltip.x}px; top: {tooltip.y}px;">
		{#if tooltip.isFootnote}
			{@html tooltip.html}
		{:else}
			<span class="tooltip-text">{tooltip.text}</span>
			{#if tooltip.shortcut}
				<span class="tooltip-shortcut">{tooltip.shortcut}</span>
			{/if}
		{/if}
	</div>

	<Modal
		show={modalState.show}
		title={modalState.title}
		message={modalState.message}
		kind={modalState.kind}
		showSave={modalState.showSave}
		onconfirm={handleModalConfirm}
		onsave={handleModalSave}
		oncancel={handleModalCancel} />

	<div class="toast-container">
		{#each toasts as toast (toast.id)}
			<Toast 
				message={toast.message} 
				type={toast.type} 
				onremove={() => toasts = toasts.filter(t => t.id !== toast.id)} />
		{/each}
	</div>

	{#if zoomData}
		<ZoomOverlay 
			src={zoomData.src} 
			html={zoomData.html} 
			onclose={() => zoomData = null} 
		/>
	{/if}

	{#if isDragging}
		<div class="drag-overlay" role="presentation">
			<div class="drag-zones" class:split={isSplit}>
				{#if isSplit || isEditing}
					<div class="drag-zone editor-zone" class:active={dragTarget === 'editor'}>
								<div class="drag-message">
									<span>{t('dragAndDrop.embed')}</span>
								</div>
							</div>
				{/if}
				{#if isSplit || !isEditing}
					<div class="drag-zone viewer-zone" class:active={dragTarget === 'preview'}>
								<div class="drag-message">
									<span>{t('dragAndDrop.open')}</span>
								</div>
							</div>
				{/if}
			</div>
		</div>
	{/if}
{/if}

<ContextMenu {...docContextMenu} onhide={() => (docContextMenu.show = false)} />

<style>
	:root {
		--animation: cubic-bezier(0.05, 0.95, 0.05, 0.95);
		scroll-behavior: smooth !important;
		background-color: var(--color-canvas-default);
	}

	:global(body) {
		background-color: var(--color-canvas-default);
		margin: 0;
		padding: 0;
		color: var(--color-fg-default);
		overflow: hidden;
	}

	.markdown-body {
		box-sizing: border-box;
		min-width: 200px;
		margin: 0;
		padding: 50px clamp(24px, 5vw, 50px);
		height: 100%;
		overflow-y: auto;
		overflow-x: hidden;
		transform: translate3d(0, 0, 0);
		max-width: 100%;
		text-align: left;
		overflow-wrap: anywhere;
	}

	.loading-chip {
		position: absolute;
		bottom: 30px;
		left: 50%;
		transform: translateX(-50%);
		background: var(--color-canvas-overlay);
		border: 1px solid var(--color-border-default);
		border-radius: 20px;
		padding: 8px 16px;
		display: flex;
		align-items: center;
		gap: 10px;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
		z-index: 100;
		color: var(--color-fg-muted);
		font-size: 13px;
		font-family: var(--win-font), sans-serif;
	}

	.loading-spinner {
		width: 14px;
		height: 14px;
		border: 2px solid var(--color-border-muted);
		border-top-color: var(--color-accent-fg);
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	@media print {
		.markdown-body {
			height: auto !important;
			overflow: visible !important;
			padding: 0 !important;
		}
	}

	.markdown-container :global(.markdown-body pre),
	.markdown-container :global(.markdown-body pre code),
	.markdown-container :global(.markdown-body pre tt),
	.markdown-container :global(.markdown-body code) {
		font-family: var(--code-font, Consolas, monospace) !important;
		font-size: var(--code-font-size, 14px) !important;
	}

	.markdown-body.full-width {
		padding: 50px clamp(24px, 5vw, 50px);
		max-width: 100%;
	}



	@keyframes slideIn {
		from {
			opacity: 0;
			transform: translateY(12px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	:global(.video-container) {
		position: relative;
		padding-bottom: 56.25%;
		height: 0;
		overflow: hidden;
		max-width: 100%;
		margin: 1em 0;
	}

	:global(.video-container iframe) {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		border-radius: 8px;
	}

	:global(.mermaid-diagram) {
		margin: 1em 0;
		display: flex;
		justify-content: center;
		overflow-x: auto;
	}

	:global(.mermaid-diagram svg) {
		max-width: 100%;
		height: auto;
	}

	.tooltip {
		position: fixed;
		background: var(--color-canvas-overlay);
		color: var(--color-fg-default);
		padding: 4px 8px;
		border-radius: 6px;
		font-size: 11px;
		pointer-events: none;
		z-index: 10007;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
		border: 1px solid var(--color-border-default);
		font-family: var(--win-font), 'Segoe UI', sans-serif;
		white-space: nowrap;
		max-width: 400px;
		overflow: hidden;
		text-overflow: ellipsis;
		transform: translateX(-50%) translateY(calc(-100% + 4px));
		opacity: 0;
		transition: 
			opacity 0.15s ease,
			transform 0.15s ease,
			left 0.15s ease,
			top 0.15s ease;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
	}

	.tooltip.visible {
		opacity: 1;
		transform: translateX(-50%) translateY(-100%);
	}

	.tooltip.align-below {
		transform: translateX(-50%) translateY(-4px);
	}

	.tooltip.align-below.visible {
		transform: translateX(-50%) translateY(0);
	}

	.tooltip-text {
		display: block;
	}

	.tooltip-shortcut {
		color: var(--color-fg-muted);
		font-size: 10px;
		font-family: inherit;
	}

	.tooltip.align-right {
		transform: translateX(4px) translateY(-50%);
	}

	.tooltip.align-right.visible {
		transform: translateX(0) translateY(-50%);
		align-items: flex-start;
	}

	.tooltip.align-left {
		transform: translateX(calc(-100% - 4px)) translateY(-50%);
	}

	.tooltip.align-left.visible {
		transform: translateX(-100%) translateY(-50%);
		align-items: flex-end;
	}


	.tooltip.footnote-tooltip {
		white-space: normal;
		max-width: 500px;
		text-align: left;
		line-height: 1.5;
		padding: 10px 14px;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
		transform: translate(-50%, calc(-100% + 4px));
		margin-top: -8px;
		display: block; /* reset flex for footnotes */
	}

	.tooltip.footnote-tooltip.visible {
		transform: translate(-50%, -100%);
	}
	
	:global(.tooltip.footnote-tooltip p) {
		margin: 0;
		padding: 0;
	}

    :global(.tooltip.footnote-tooltip p + p) {
        margin-top: 8px;
    }

	.tooltip.footnote-tooltip::after {
		content: '';
		position: absolute;
		bottom: -6px;
		left: 50%;
		transform: translateX(-50%);
		border-left: 6px solid transparent;
		border-right: 6px solid transparent;
		border-top: 6px solid var(--color-canvas-overlay);
	}


	.drag-overlay {
		position: fixed;
		top: 36px;
		left: 0;
		right: 0;
		bottom: 0;
		pointer-events: none;
		z-index: 40000;
		animation: fadeIn 0.1s ease-out;
	}

	.drag-message {
		display: flex;
		flex-direction: column;
		align-items: center;
		color: #ffffff;
		font-family: var(--win-font);
		font-weight: 500;
		font-size: 13px;
		position: absolute;
		bottom: 40px;
		left: 50%;
		transform: translateX(-50%);
		white-space: nowrap;
		background: var(--color-accent-fg);
		padding: 6px 14px;
		border-radius: 20px;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
		pointer-events: none;
	}

	.drag-zones {
		display: flex;
		width: 100%;
		height: 100%;
		gap: 12px;
	}

	.drag-zone {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		background: transparent;
		transition: background 0.2s, border-color 0.2s, opacity 0.2s;
		border: 2px dashed transparent;
		opacity: 0;
		position: relative;
		margin: 8px;
		border-radius: 12px;
	}

	.drag-zone.active {
		background: color-mix(in srgb, var(--color-accent-fg) 8%, transparent);
		border-color: color-mix(in srgb, var(--color-accent-fg) 30%, transparent);
		opacity: 1;
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
			transform: scale(0.98);
		}
		to {
			opacity: 1;
			transform: scale(1);
		}
	}

	.loading-screen {
		position: fixed;
		top: 36px;
		left: 0;
		width: 100%;
		height: calc(100% - 36px);
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--color-canvas-default);
		z-index: 5000;
	}

	.spinner {
		animation: rotate 2s linear infinite;
		z-index: 2;
		width: 50px;
		height: 50px;
	}

	.spinner .path {
		stroke: var(--color-accent-fg);
		stroke-linecap: round;
		animation: dash 1.5s ease-in-out infinite;
	}

	@keyframes rotate {
		100% {
			transform: rotate(360deg);
		}
	}

	@keyframes dash {
		0% {
			stroke-dasharray: 1, 150;
			stroke-dashoffset: 0;
		}
		50% {
			stroke-dasharray: 90, 150;
			stroke-dashoffset: -35;
		}
		100% {
			stroke-dasharray: 90, 150;
			stroke-dashoffset: -124;
		}
	}
	/* Layout System */
	.layout-container {
		display: flex;
		width: 100%;
		height: 100%;
		position: absolute;
		top: 0;
		left: 0;
		padding-top: 36px;
		box-sizing: border-box;
		overflow: hidden;
	}

	.pane {
		display: flex;
		flex-direction: column;
		overflow: hidden;
		transition:
			flex 0.3s cubic-bezier(0.16, 1, 0.3, 1),
			transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
		min-width: 0;
	}

	.pane.editor-pane {
		background: var(--color-canvas-default);
	}

	.pane.viewer-pane {
		background: var(--color-canvas-default);
	}

	.viewer-content {
		display: flex;
		flex-direction: row;
		width: 100%;
		height: 100%;
		overflow: hidden;
	}

	/* View Mode */
	.layout-container:not(.split):not(.editing) .editor-pane {
		width: 0 !important;
		flex: 0 !important;
		opacity: 0;
	}

	.layout-container:not(.split):not(.editing) .viewer-pane {
		width: 100%;
		flex: 1 !important;
	}

	/* Edit Mode */
	.layout-container:not(.split).editing .editor-pane {
		width: 100%;
		flex: 1 !important;
	}

	.layout-container:not(.split).editing .viewer-pane {
		width: 0 !important;
		flex: 0 !important;
		opacity: 0;
	}

	/* Split Mode Transition Logic */
	/* Editor slides in from left */
	/* Viewer slides right */

	.pane {
		height: 100%;
		position: relative;
	}

	.split-bar {
		width: 4px;
		background: var(--color-border-default);
		cursor: col-resize;
		position: relative;
		z-index: 100;
		transition: background 0.2s;
	}

	.split-bar:hover {
		background: var(--color-accent-fg);
	}

	@keyframes fadeIn {
		from { opacity: 0; }
		to { opacity: 1; }
	}

	.toast-container {
		position: fixed;
		bottom: 24px;
		right: 24px;
		z-index: 50000;
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		pointer-events: none;
	}
	.top-fade-mask {
		position: absolute;
		top: 0;
		left: 0;
		width: 60px;
		height: 52px;
		background: linear-gradient(to bottom, var(--color-canvas-default) 40%, transparent 100%);
		pointer-events: none;
		z-index: 50;
	}

	.toc-overlay-wrapper {
		position: absolute;
		top: 36px;
		left: 0;
		bottom: 0;
		z-index: 1000;
		height: calc(100% - 36px);
		background-color: var(--color-canvas-default);
		border-right: 1px solid transparent;
		border-left: 1px solid transparent;
		box-shadow: 10px 0 30px rgba(0, 0, 0, 0);
		transition: box-shadow 0.3s ease, border-color 0.3s ease, left 0.3s ease, right 0.3s ease;
		order: -1;
	}

	.toc-overlay-wrapper.is-pinned {
		position: relative;
		top: 0 !important;
		height: 100%;
		z-index: 10;
		background-color: transparent;
		backdrop-filter: none;
		-webkit-backdrop-filter: none;
		box-shadow: none !important;
	}
	.layout-container.editing.has-pinned-toc.toc-on-left .editor-pane {
		padding-left: 40px;
	}
	
	.layout-container.editing.has-pinned-toc.toc-on-right .editor-pane {
		padding-right: 40px;
	}

	.editor-pane {
		transition: padding 0.3s cubic-bezier(0.4, 0, 0.2, 1);
	}

	.toc-overlay-wrapper.on-right {
		left: auto;
		right: 0;
		order: 2;
	}

	.toc-overlay-wrapper.is-pinned.on-right {
		border-left-color: var(--color-border-default);
	}
	
	.toc-overlay-wrapper.is-pinned:not(.on-right) {
		border-right-color: var(--color-border-default);
	}

	.toc-toggle-floating {
		position: absolute;
		top: 48px;
		left: 8px;
		width: 28px;
		height: 28px;
		display: flex;
		align-items: center;
		justify-content: center;
		background-color: transparent;
		border: none;
		border-radius: 4px;
		color: var(--color-fg-muted);
		cursor: pointer;
		z-index: 1001;
		transition: 
			left 0.3s cubic-bezier(0.4, 0, 0.2, 1),
			background-color 0.2s ease,
			color 0.2s ease,
			opacity 0.2s ease,
			transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
		opacity: 0.6;
		padding: 0;
	}

	.toc-toggle-floating.expanded {
		left: 24px;
	}

	.toc-toggle-floating.on-right {
		left: auto;
		right: 8px;
	}

	.toc-toggle-floating.on-right.expanded {
		right: 24px;
	}

	.layout-container:hover .toc-toggle-floating,
	.toc-toggle-floating:hover {
		opacity: 1;
	}

	.toc-toggle-floating:active {
		background-color: var(--color-border-muted);
	}

	.toc-toggle-floating svg {
		transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
		transform: rotate(0deg);
	}
	
	.toc-toggle-floating.on-right svg {
		transform: rotate(180deg);
	}

	.toc-toggle-floating.expanded svg {
		transform: rotate(180deg);
	}
	
	.toc-toggle-floating.on-right.expanded svg {
		transform: rotate(0deg);
	}

	.layout-container {
		transition: padding 0.3s cubic-bezier(0.16, 1, 0.3, 1);
	}

	.layout-container.has-pinned-toc.toc-on-left {
		padding-left: 240px;
	}

	.layout-container.has-pinned-toc.toc-on-right {
		padding-right: 240px;
	}

	.toc-overlay-wrapper {
		width: 240px;
	}

	.toc-overlay-wrapper.is-pinned {
		position: absolute; /* Keep it absolute but it will stay in the padded area */
		top: 36px !important;
		left: 0;
		height: calc(100% - 36px);
		background-color: var(--color-canvas-default);
		border-right: 1px solid var(--color-border-default);
	}

	.toc-overlay-wrapper.is-pinned.on-right {
		left: auto;
		right: 0;
		border-right: none;
		border-left: 1px solid var(--color-border-default);
	}

	.layout-container.editing .toc-overlay-wrapper:not(.on-right) {
		border-right-color: var(--color-border-default);
	}

	.layout-container.editing .toc-overlay-wrapper.on-right {
		border-left-color: var(--color-border-default);
	}

	.toc-toggle-floating.in-edit-mode:not(.expanded) {
		background-color: var(--color-canvas-default);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
		border: 1px solid var(--color-border-default);
		opacity: 0.9;
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
	}

	/* Folder pane: same geometry as the outline wrapper, on the opposite side */
	.folder-pane-wrapper {
		position: absolute;
		top: 36px;
		left: 0;
		bottom: 0;
		width: 240px;
		height: calc(100% - 36px);
		z-index: 1000;
		background-color: var(--color-canvas-default);
		border-right: 1px solid transparent;
		border-left: 1px solid transparent;
		box-shadow: 10px 0 30px rgba(0, 0, 0, 0);
		transition: box-shadow 0.3s ease, border-color 0.3s ease, left 0.3s ease, right 0.3s ease;
	}

	.folder-pane-wrapper.on-right {
		left: auto;
		right: 0;
	}

	.folder-pane-wrapper.is-pinned {
		z-index: 10;
		box-shadow: none !important;
	}

	.folder-pane-wrapper.is-pinned.on-left,
	.layout-container.editing .folder-pane-wrapper.on-left {
		border-right-color: var(--color-border-default);
	}

	.folder-pane-wrapper.is-pinned.on-right,
	.layout-container.editing .folder-pane-wrapper.on-right {
		border-left-color: var(--color-border-default);
	}

	.layout-container.has-pinned-folder.folder-on-left {
		padding-left: 240px;
	}

	.layout-container.has-pinned-folder.folder-on-right {
		padding-right: 240px;
	}

	.layout-container.editing.has-pinned-folder.folder-on-left .editor-pane {
		padding-left: 40px;
	}

	.layout-container.editing.has-pinned-folder.folder-on-right .editor-pane {
		padding-right: 40px;
	}

	.folder-toggle-floating {
		position: absolute;
		top: 48px;
		left: 8px;
		width: 28px;
		height: 28px;
		display: flex;
		align-items: center;
		justify-content: center;
		background-color: transparent;
		border: none;
		border-radius: 4px;
		color: var(--color-fg-muted);
		cursor: pointer;
		z-index: 1001;
		transition:
			left 0.3s cubic-bezier(0.4, 0, 0.2, 1),
			right 0.3s cubic-bezier(0.4, 0, 0.2, 1),
			background-color 0.2s ease,
			color 0.2s ease,
			opacity 0.2s ease;
		opacity: 0.6;
		padding: 0;
	}

	.folder-toggle-floating.expanded {
		left: 24px;
		color: var(--color-fg-default);
	}

	.folder-toggle-floating.on-right {
		left: auto;
		right: 8px;
	}

	.folder-toggle-floating.on-right.expanded {
		right: 24px;
	}

	.layout-container:hover .folder-toggle-floating,
	.folder-toggle-floating:hover {
		opacity: 1;
	}

	.folder-toggle-floating:active {
		background-color: var(--color-border-muted);
	}

	.folder-toggle-floating.in-edit-mode:not(.expanded) {
		background-color: var(--color-canvas-default);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
		border: 1px solid var(--color-border-default);
		opacity: 0.9;
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
	}

	/* Preview Search */
	.preview-search-bar {
		position: absolute;
		top: 0;
		right: 16px;
		z-index: 200;
		padding: 6px;
	}

	.preview-search-inner {
		display: flex;
		align-items: center;
		gap: 4px;
		background: var(--color-canvas-subtle, #161b22);
		border: 1px solid var(--color-border-default);
		border-radius: 6px;
		padding: 4px 8px;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
		font-family: var(--win-font);
	}

	.preview-search-icon {
		color: var(--color-fg-muted);
		flex-shrink: 0;
	}

	.preview-search-input {
		background: transparent;
		border: none;
		outline: none;
		color: var(--color-fg-default);
		font-size: 13px;
		font-family: var(--win-font);
		width: 200px;
		padding: 2px 4px;
	}

	.preview-search-input::placeholder {
		color: var(--color-fg-muted);
	}

	.preview-search-count {
		font-size: 11px;
		color: var(--color-fg-muted);
		white-space: nowrap;
		min-width: 60px;
		text-align: center;
	}

	.preview-search-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		background: transparent;
		border: 1px solid transparent;
		border-radius: 4px;
		color: var(--color-fg-muted);
		cursor: pointer;
		padding: 3px;
		transition: all 0.1s;
	}

	.preview-search-btn:hover:not(:disabled) {
		background: var(--color-neutral-muted);
		color: var(--color-fg-default);
	}

	.preview-search-btn:disabled {
		opacity: 0.35;
		cursor: default;
	}

	.preview-search-case {
		font-size: 12px;
		font-weight: 600;
		padding: 2px 5px;
		font-family: var(--win-font);
	}

	.preview-search-case.active {
		background: var(--color-accent-fg);
		color: #fff;
		border-color: var(--color-accent-fg);
		border-radius: 4px;
	}

	:global(.markdown-body mark.preview-search-highlight) {
		background-color: rgba(255, 200, 0, 0.35);
		border-radius: 0;
		padding: 0;
	}

	:global(.markdown-body mark.preview-search-highlight.preview-search-active) {
		background-color: rgba(255, 165, 0, 0.7);
		outline: 2px solid rgba(255, 165, 0, 0.9);
		border-radius: 0;
	}
</style>
