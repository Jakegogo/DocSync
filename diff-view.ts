import {
	App,
	FileSystemAdapter,
	ItemView,
	Plugin,
	WorkspaceLeaf,
} from "obsidian";
import * as fs from "fs";
import * as path from "path";
import { createTwoFilesPatch } from "diff";

export const DIFF_VIEW_TYPE = "vault-folder-sync-diff-view";

interface ConflictEntry {
	relPath: string;
	sourcePath: string;
	targetPath: string;
	patch: string;
}

let conflictEntries: ConflictEntry[] = [];
let currentConflictIndex = 0;

export class VaultFolderSyncDiffView extends ItemView {
	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
	}

	getViewType(): string {
		return DIFF_VIEW_TYPE;
	}

	getDisplayText(): string {
		return "Vault Folder Sync Diff";
	}

	async onOpen() {
		this.render();
	}

	async setState(state: any, result: any): Promise<void> {
		if (state && typeof state.index === "number") {
			const idx = state.index as number;
			if (!Number.isNaN(idx) && idx >= 0 && idx < conflictEntries.length) {
				currentConflictIndex = idx;
			}
		}
		this.render();
	}

	getState(): any {
		return { index: currentConflictIndex };
	}

	private render() {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.style.height = "100%";
		containerEl.style.display = "flex";
		containerEl.style.flexDirection = "column";

		const total = conflictEntries.length;
		const index =
			total === 0
				? -1
				: Math.min(Math.max(currentConflictIndex, 0), total - 1);
		const current =
			index >= 0 && index < total ? conflictEntries[index] : null;

		const header = containerEl.createDiv({
			cls: "vault-folder-sync-diff-header",
		});
		header.style.display = "flex";
		header.style.alignItems = "center";
		header.style.justifyContent = "space-between";

		const titleText =
			current != null
				? `冲突文件：${current.relPath}`
				: "当前没有冲突文件";

		header.createEl("h3", {
			text: titleText,
		});

		const nav = header.createDiv({
			cls: "vault-folder-sync-diff-nav",
		});
		nav.style.display = "flex";
		nav.style.alignItems = "center";
		nav.style.gap = "0.5em";

		const info = nav.createSpan({
			text:
				total > 0
					? `${index + 1} / ${total}`
					: "0 / 0",
		});

		const prevBtn = nav.createEl("button", { text: "← 上一个" });
		const nextBtn = nav.createEl("button", { text: "下一个 →" });
		const resolveBtn = nav.createEl("button", { text: "已解决冲突" });

		prevBtn.disabled = total <= 1;
		nextBtn.disabled = total <= 1;
		resolveBtn.disabled = !current;

		prevBtn.onclick = () => {
			if (conflictEntries.length === 0) return;
			currentConflictIndex =
				(currentConflictIndex - 1 + conflictEntries.length) %
				conflictEntries.length;
			this.render();
		};

		nextBtn.onclick = () => {
			if (conflictEntries.length === 0) return;
			currentConflictIndex =
				(currentConflictIndex + 1) % conflictEntries.length;
			this.render();
		};

		resolveBtn.onclick = async () => {
			if (!current) return;
			await markConflictResolved(this.app, current.relPath);
			conflictEntries = conflictEntries.filter(
				(e) => e.relPath !== current.relPath,
			);
			if (currentConflictIndex >= conflictEntries.length) {
				currentConflictIndex = conflictEntries.length - 1;
			}
			if (currentConflictIndex < 0) currentConflictIndex = 0;
			this.render();
		};

		const pre = containerEl.createEl("pre", {
			cls: "vault-folder-sync-diff-pre",
		});
		pre.style.flex = "1 1 auto";
		pre.style.width = "100%";
		pre.style.whiteSpace = "pre-wrap";
		pre.style.fontFamily = "var(--font-monospace)";
		pre.style.overflowY = "auto";
		if (current) {
			pre.setText(current.patch || "(无差异或无法加载内容)");
		} else {
			pre.setText("(当前没有可显示的冲突 diff)");
		}
	}
}

export function registerDiffView(plugin: Plugin) {
	plugin.registerView(
		DIFF_VIEW_TYPE,
		(leaf) => new VaultFolderSyncDiffView(leaf),
	);
}

export async function openDiffForConflict(
	app: App,
	relPath: string,
	sourcePath: string,
	targetPath: string,
) {
	const [sourceText, targetText] = await Promise.all([
		readFileSafe(sourcePath),
		readFileSafe(targetPath),
	]);

	const patch = createTwoFilesPatch(
		`source: ${relPath}`,
		`target: ${relPath}`,
		sourceText,
		targetText,
	);

	// 更新冲突列表，只保留一份视图，通过左右按钮浏览
	const existingIndex = conflictEntries.findIndex(
		(e) =>
			e.relPath === relPath &&
			e.sourcePath === sourcePath &&
			e.targetPath === targetPath,
	);
	if (existingIndex >= 0) {
		conflictEntries[existingIndex].patch = patch;
		currentConflictIndex = existingIndex;
	} else {
		conflictEntries.push({
			relPath,
			sourcePath,
			targetPath,
			patch,
		});
		currentConflictIndex = conflictEntries.length - 1;
	}

	// 始终复用同一个 diff 叶子，确保同一时间只存在一个 diff 标签
	const leaves = app.workspace.getLeavesOfType(DIFF_VIEW_TYPE);
	let leaf: WorkspaceLeaf;
	if (leaves.length > 0) {
		// 关闭多余的 diff 叶子，只保留一个
		for (let i = 1; i < leaves.length; i++) {
			leaves[i].detach();
		}
		leaf = leaves[0];
	} else {
		leaf = app.workspace.getRightLeaf(false);
	}

	await leaf.setViewState({
		type: DIFF_VIEW_TYPE,
		active: true,
		state: {
			index: currentConflictIndex,
		},
	});
	app.workspace.revealLeaf(leaf);
}

export function closeDiffViewIfNoConflicts(app: App) {
	if (conflictEntries.length > 0) return;
	const leaves = app.workspace.getLeavesOfType(DIFF_VIEW_TYPE);
	for (const leaf of leaves) {
		leaf.detach();
	}
}

async function markConflictResolved(app: App, relPath: string) {
	const adapter = app.vault.adapter;
	if (!(adapter instanceof FileSystemAdapter)) return;
	const root = adapter.getBasePath();
	const logPath = path.join(
		root,
		".obsidian",
		"vault-folder-sync-log.jsonl",
	);
	const entries = await readRawLogEntriesForView(logPath);
	const updated = entries.map((e) =>
		e.relPath === relPath ? { ...e, resolved: true } : e,
	);
	const text =
		updated.length > 0
			? updated.map((e) => JSON.stringify(e)).join("\n") + "\n"
			: "";
	await ensureDirForView(path.dirname(logPath));
	await fs.promises.writeFile(logPath, text, "utf8");
}

async function readFileSafe(p: string): Promise<string> {
	try {
		const buf = await fs.promises.readFile(p);
		return buf.toString("utf8");
	} catch {
		return "";
	}
}

type ViewLogEntry = {
	relPath: string;
	[key: string]: any;
};

async function readRawLogEntriesForView(
	p: string,
): Promise<ViewLogEntry[]> {
	try {
		const raw = await fs.promises.readFile(p, "utf8");
		const lines = raw.split(/\r?\n/);
		const result: ViewLogEntry[] = [];
		for (const line of lines) {
			const trimmed = line.trim();
			if (!trimmed) continue;
			try {
				const entry = JSON.parse(trimmed) as ViewLogEntry;
				if (!entry.relPath) continue;
				result.push(entry);
			} catch {
				continue;
			}
		}
		return result;
	} catch {
		return [];
	}
}

async function ensureDirForView(dirPath: string) {
	await fs.promises.mkdir(dirPath, { recursive: true });
}


