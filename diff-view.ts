import {
	App,
	FileSystemAdapter,
	ItemView,
	MarkdownView,
	Plugin,
	TFile,
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
		resolveBtn.setAttr(
			"title",
			"标记该文件冲突已解决，并默认以当前 Vault（源目录）中的内容为准覆盖目标目录。",
		);

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

			// 默认采用源 vault（当前打开目录）的文件为准：
			// 如果存在目标路径，则直接用源文件覆盖目标文件。
			if (current.targetPath) {
				try {
					const stat = await fs.promises.stat(current.sourcePath).catch(
						() => null,
					);
					if (stat && stat.isFile()) {
						await ensureDirForView(path.dirname(current.targetPath));
						await fs.promises.copyFile(
							current.sourcePath,
							current.targetPath,
						);
						// 尽量保留原有的时间戳信息，方便后续基于 mtime 的判断
						await fs.promises
							.utimes(
								current.targetPath,
								stat.atime,
								stat.mtime,
							)
							.catch(() => {});
					}
				} catch (err) {
					console.error(
						"Vault Folder Sync: failed to resolve conflict by keeping source file for",
						current.relPath,
						err,
					);
				}
			}

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
		pre.style.whiteSpace = "pre";
		pre.style.fontFamily = "var(--font-monospace)";
		pre.style.overflowY = "auto";

		if (current && current.patch) {
			this.renderPatchWithNavigation(pre, current);
		} else if (current) {
			pre.setText("(无差异或无法加载内容)");
		} else {
			pre.setText("(当前没有可显示的冲突 diff)");
		}
	}

	private renderPatchWithNavigation(
		pre: HTMLElement,
		conflict: ConflictEntry,
	) {
		const lines = conflict.patch.split(/\r?\n/);
		const sourceLineMap = buildSourceLineMap(lines);

		pre.empty();

		for (let i = 0; i < lines.length; i++) {
			const lineText = lines[i];
			const span = pre.createSpan({
				text: lineText === "" ? " " : lineText,
			});
			span.addClass("vault-folder-sync-diff-line");
			span.setAttr("data-line-index", String(i));

			const srcLine = sourceLineMap[i];
			if (typeof srcLine === "number") {
				span.setAttr("data-source-line", String(srcLine));
			}

			// 每行后面补一个换行，保持 diff 视觉结构
			pre.createEl("br");
		}

		pre.onclick = (ev: MouseEvent) => {
			const target = ev.target as HTMLElement | null;
			if (!target) return;
			const lineEl = target.closest(
				".vault-folder-sync-diff-line",
			) as HTMLElement | null;
			if (!lineEl) return;

			const sourceLineAttr = lineEl.getAttr("data-source-line");
			if (!sourceLineAttr) return;
			const sourceLine = Number(sourceLineAttr);
			if (!Number.isFinite(sourceLine) || sourceLine <= 0) return;

			scrollVaultToSourceLine(this.app, conflict.relPath, sourceLine);
		};
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
	let leaf: WorkspaceLeaf | null = null;
	try {
		const leaves = app.workspace.getLeavesOfType(DIFF_VIEW_TYPE);
		if (leaves.length > 0) {
			// 关闭多余的 diff 叶子，只保留一个
			for (let i = 1; i < leaves.length; i++) {
				leaves[i].detach();
			}
			leaf = leaves[0];
		} else {
			// 某些启动早期阶段，getRightLeaf 内部可能因为工作区尚未完全初始化而抛错，
			// 这里用 try/catch 包裹，避免影响整体同步流程。
			const maybeLeaf = app.workspace.getRightLeaf(false);
			if (!maybeLeaf) {
				return;
			}
			leaf = maybeLeaf;
		}

		await leaf.setViewState({
			type: DIFF_VIEW_TYPE,
			active: true,
			state: {
				index: currentConflictIndex,
			},
		});
		app.workspace.revealLeaf(leaf);
	} catch (err) {
		console.error(
			"Vault Folder Sync: failed to open conflict diff view",
			err,
		);
		// 打不开 diff 面板不应中断同步流程，这里吞掉异常即可。
	}
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

function buildSourceLineMap(lines: string[]): Array<number | null> {
	const map: Array<number | null> = new Array(lines.length).fill(null);
	let origLine = 0;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (line.startsWith("@@")) {
			// 解析 hunk 头，更新源文件起始行号
			const m = /@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
			if (m) {
				origLine = Number(m[1]);
			}
			continue;
		}

		if (!origLine) continue;

		const prefix = line[0];
		if (prefix === " " || prefix === "-") {
			map[i] = origLine;
			origLine += 1;
		} else if (prefix === "+") {
			// 插入行：近似映射到插入位置附近的源文件行
			map[i] = origLine > 0 ? origLine : null;
		}
	}

	return map;
}

async function scrollVaultToSourceLine(
	app: App,
	relPath: string,
	sourceLine: number,
) {
	const file = app.vault.getAbstractFileByPath(relPath);
	if (!(file instanceof TFile)) return;

	const leaf = app.workspace.getLeaf(false);
	if (!leaf) return;

	await leaf.openFile(file);

	const view = app.workspace.getActiveViewOfType(MarkdownView);
	if (!view) return;

	const editor = view.editor;
	const maxLine = editor.lineCount() - 1;
	const lineIndex = Math.max(0, Math.min(maxLine, sourceLine - 1));

	editor.setCursor({ line: lineIndex, ch: 0 });

	// 滚动到对应行附近，中心显示
	const from = { line: lineIndex, ch: 0 };
	const to = { line: Math.min(maxLine, lineIndex + 1), ch: 0 };
	// 部分版本 Editor.scrollIntoView 的类型签名不一致，这里宽松处理
	(editor as any).scrollIntoView({ from, to }, true);
}


