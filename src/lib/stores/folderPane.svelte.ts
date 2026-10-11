import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { paneFolder, samePath } from '../utils/folderPane.js';

export interface FolderFile {
	name: string;
	path: string;
}

class FolderPaneStore {
	// Pinned folder lives in memory only; it is intentionally not persisted.
	pinned = $state<string | null>(null);
	activePath = $state<string | null>(null);
	files = $state<FolderFile[]>([]);
	error = $state<string | null>(null);
	loading = $state(false);

	folder = $derived(paneFolder(this.pinned, this.activePath));

	private seq = 0;

	async setActivePath(path: string | null) {
		const before = this.folder;
		this.activePath = path;
		const after = this.folder;
		const changed = before === null || after === null ? before !== after : !samePath(before, after);
		if (changed) await this.refresh();
	}

	async refresh() {
		const dir = this.folder;
		const id = ++this.seq;
		if (!dir) {
			this.files = [];
			this.error = null;
			this.loading = false;
			return;
		}
		this.loading = true;
		try {
			const result = await invoke<FolderFile[]>('list_markdown_files', { dir });
			if (id !== this.seq) return;
			this.files = result;
			this.error = null;
		} catch (e) {
			if (id !== this.seq) return;
			this.files = [];
			this.error = String(e);
		} finally {
			if (id === this.seq) this.loading = false;
		}
	}

	async pin(folder?: string) {
		const target = folder ?? this.folder;
		if (!target) return;
		this.pinned = target;
		await this.refresh();
	}

	async unpin() {
		this.pinned = null;
		await this.refresh();
	}

	async openFolder(): Promise<string | null> {
		const picked = await open({ directory: true, multiple: false });
		if (typeof picked !== 'string') return null;
		await this.pin(picked);
		return picked;
	}
}

export const folderPane = new FolderPaneStore();
