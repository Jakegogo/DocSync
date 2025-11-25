import {
	App,
	Notice,
	Plugin,
	ItemView,
	WorkspaceLeaf,
	FileSystemAdapter,
} from "obsidian";
import * as fs from "fs";
import * as path from "path";
import { createTwoFilesPatch } from "diff";

interface DeletionLog {
	[targetRoot: string]: {
		[relPath: string]: string;
	};
}

interface DeletionLogEntry {
	targetRoot: string;
	relPath: string;
	deletedAt: string | null;
}

const MTIME_EPS_MS = 1;
const DIFF_VIEW_TYPE = "vault-folder-sync-diff-view";
const LOG_FILE_NAME = "vault-folder-sync-log.jsonl";
const LOG_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface ConflictEntry {
	relPath: string;
	sourcePath: string;
	targetPath: string;
	patch: string;
}

let conflictEntries: ConflictEntry[] = [];
let currentConflictIndex = 0;

export type LogSide = "source" | "target";

class VaultFolderSyncDiffView extends ItemView {
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

async function openDiffForConflict(
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

async function markConflictResolved(app: App, relPath: string) {
	const adapter = app.vault.adapter;
	if (!(adapter instanceof FileSystemAdapter)) return;
	const root = adapter.getBasePath();
	const logPath = getDeletionLogPath(root);
	const entries = await readRawLogEntries(logPath);
	const updated = entries.map((e) =>
		e.relPath === relPath ? { ...e, resolved: true } : e,
	);
	const text =
		updated.length > 0
			? updated.map((e) => JSON.stringify(e)).join("\n") + "\n"
			: "";
	await ensureDir(path.dirname(logPath));
	await fs.promises.writeFile(logPath, text, "utf8");
	currentRawLogEntries = updated;
}

export async function runReverseSyncForTargets(
	app: App,
	sourceRoot: string,
	targetRoots: string[],
) {
	if (targetRoots.length === 0) return;

	const deletionLogPath = getDeletionLogPath(sourceRoot);
	let log = await loadDeletionLog(deletionLogPath);
	currentRawLogEntries = await readRawLogEntries(deletionLogPath);

	for (const targetRoot of targetRoots) {
		log = await syncOneTarget(
			app,
			sourceRoot,
			targetRoot,
			log,
			deletionLogPath,
		);
	}
}

export async function mergeLogsForTargets(
	sourceRoot: string,
	targetRoots: string[],
) {
	if (targetRoots.length === 0) return;
	for (const targetRoot of targetRoots) {
		await mergeLogsBetween(sourceRoot, targetRoot);
	}
}

export async function logLocalSourceChange(
	app: App,
	relPath: string,
	kind: "modified" | "deleted",
) {
	const adapter = app.vault.adapter;
	if (!(adapter instanceof FileSystemAdapter)) return;
	const root = adapter.getBasePath();
	const logPath = getDeletionLogPath(root);

	const nowIso = new Date().toISOString();
	const base: RawLogEntry = {
		relPath,
		side: "source",
		event: kind,
		merged: false,
		resolved: false,
	};

	const entry: RawLogEntry =
		kind === "deleted"
			? { ...base, deletedAt: nowIso }
			: { ...base, modifiedAt: nowIso };

	await ensureDir(path.dirname(logPath));
	const line = JSON.stringify(entry);
	await fs.promises.appendFile(logPath, line + "\n", "utf8");
}

function getDeletionLogPath(sourceRoot: string): string {
	return path.join(
		sourceRoot,
		".obsidian",
		LOG_FILE_NAME,
	);
}

async function loadDeletionLog(p: string): Promise<DeletionLog> {
	try {
		const raw = await fs.promises.readFile(p, "utf8");
		const log: DeletionLog = {};
		const lines = raw.split(/\r?\n/);
		for (const line of lines) {
			const trimmed = line.trim();
			if (!trimmed) continue;
			let entry: any;
			try {
				entry = JSON.parse(trimmed);
			} catch {
				continue;
			}
			if (!entry.targetRoot || !entry.relPath) continue;
			// 已标记为 resolved 的记录在删除判断中忽略
			if (entry.resolved === true) continue;
			// 只处理包含 deletedAt 字段的记录，其余类型（例如修改日志）忽略
			if (!Object.prototype.hasOwnProperty.call(entry, "deletedAt")) {
				continue;
			}
			if (!log[entry.targetRoot]) {
				log[entry.targetRoot] = {};
			}
			const existing = log[entry.targetRoot][entry.relPath];
			if (entry.deletedAt == null) {
				// 标记为清理
				delete log[entry.targetRoot][entry.relPath];
				continue;
			}
			if (!existing) {
				log[entry.targetRoot][entry.relPath] = entry.deletedAt;
				continue;
			}
			const existingTs = Date.parse(existing);
			const newTs = Date.parse(entry.deletedAt);
			if (!Number.isNaN(newTs) && newTs >= existingTs) {
				log[entry.targetRoot][entry.relPath] = entry.deletedAt;
			}
		}
		return log;
	} catch {
		return {};
	}
}

async function appendDeletionLogEntry(
	logPath: string,
	entry: DeletionLogEntry,
) {
	await ensureDir(path.dirname(logPath));
	const enriched: RawLogEntry = {
		...entry,
		side: "target",
		event: "deleted",
	};
	const line = JSON.stringify(enriched);
	await fs.promises.appendFile(logPath, line + "\n", "utf8");
}

async function mergeLogsBetween(rootA: string, rootB: string) {
	const logPathA = getDeletionLogPath(rootA);
	const logPathB = getDeletionLogPath(rootB);

	const [entriesA, entriesB] = await Promise.all([
		readRawLogEntries(logPathA),
		readRawLogEntries(logPathB),
	]);

	const merged = mergeRawEntries(entriesA, entriesB);
	const text =
		merged.length > 0
			? merged.map((e) => JSON.stringify(e)).join("\n") + "\n"
			: "";

	await ensureDir(path.dirname(logPathA));
	await ensureDir(path.dirname(logPathB));
	await Promise.all([
		fs.promises.writeFile(logPathA, text, "utf8"),
		fs.promises.writeFile(logPathB, text, "utf8"),
	]);
}

type RawLogEntry = {
	targetRoot?: string;
	relPath: string;
	deletedAt?: string | null;
	modifiedAt?: string;
	merged?: boolean;
	resolved?: boolean;
	side?: LogSide;
	event?: "modified" | "deleted";
	[key: string]: any;
};

let currentRawLogEntries: RawLogEntry[] = [];

async function readRawLogEntries(p: string): Promise<RawLogEntry[]> {
	try {
		const raw = await fs.promises.readFile(p, "utf8");
		const lines = raw.split(/\r?\n/);
		const result: RawLogEntry[] = [];
		for (const line of lines) {
			const trimmed = line.trim();
			if (!trimmed) continue;
			try {
				const entry = JSON.parse(trimmed) as RawLogEntry;
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

function getEntryTimeMs(entry: RawLogEntry): number | undefined {
	const t =
		entry.deletedAt && typeof entry.deletedAt === "string"
			? Date.parse(entry.deletedAt)
			: entry.modifiedAt && typeof entry.modifiedAt === "string"
				? Date.parse(entry.modifiedAt)
				: NaN;
	if (Number.isNaN(t)) return undefined;
	return t;
}

function mergeRawEntries(
	a: RawLogEntry[],
	b: RawLogEntry[],
): RawLogEntry[] {
	const byKey = new Map<string, RawLogEntry>();

	const add = (entry: RawLogEntry) => {
		// 合并时忽略 merged 字段的差异
		const copy: RawLogEntry = { ...entry };
		delete copy.merged;
		const key = JSON.stringify(copy);
		const existing = byKey.get(key);
		if (!existing) {
			byKey.set(key, entry);
			return;
		}
		// 已存在则保留时间更新的那条
		const tNew = getEntryTimeMs(entry);
		const tOld = getEntryTimeMs(existing);
		if (
			tNew !== undefined &&
			(tOld === undefined || tNew >= tOld)
		) {
			byKey.set(key, entry);
		}
	};

	a.forEach(add);
	b.forEach(add);

	const now = Date.now();
	const entries = Array.from(byKey.values());

	const filtered = entries.filter((e) => {
		const t = getEntryTimeMs(e);
		if (t === undefined) return true;
		if (e.merged && now - t > LOG_TTL_MS) {
			return false;
		}
		return true;
	});

	for (const e of filtered) {
		e.merged = true;
	}

	filtered.sort((e1, e2) => {
		const t1 = getEntryTimeMs(e1) ?? 0;
		const t2 = getEntryTimeMs(e2) ?? 0;
		return t1 - t2;
	});

	return filtered;
}

interface LatestEvents {
	sourceModified?: RawLogEntry;
	targetModified?: RawLogEntry;
	sourceDeleted?: RawLogEntry;
	targetDeleted?: RawLogEntry;
}

function getLatestUnresolvedEventsFor(relPath: string): LatestEvents {
	const result: LatestEvents = {};
	for (const e of currentRawLogEntries) {
		if (e.relPath !== relPath) continue;
		if (e.resolved) continue;
		const t = getEntryTimeMs(e);
		if (t === undefined) continue;

		const isDeleted = typeof e.deletedAt === "string";
		const isModified = typeof e.modifiedAt === "string";
		const side = e.side;

		if (side === "source") {
			if (isModified) {
				if (
					!result.sourceModified ||
					(getEntryTimeMs(result.sourceModified) ?? 0) < t
				) {
					result.sourceModified = e;
				}
			}
			if (isDeleted) {
				if (
					!result.sourceDeleted ||
					(getEntryTimeMs(result.sourceDeleted) ?? 0) < t
				) {
					result.sourceDeleted = e;
				}
			}
		} else if (side === "target") {
			if (isModified) {
				if (
					!result.targetModified ||
					(getEntryTimeMs(result.targetModified) ?? 0) < t
				) {
					result.targetModified = e;
				}
			}
			if (isDeleted) {
				if (
					!result.targetDeleted ||
					(getEntryTimeMs(result.targetDeleted) ?? 0) < t
				) {
					result.targetDeleted = e;
				}
			}
		}
	}
	return result;
}

async function syncOneTarget(
	app: App,
	sourceRoot: string,
	targetRoot: string,
	log: DeletionLog,
	logPath: string,
): Promise<DeletionLog> {
	const normalizedTarget = path.resolve(targetRoot);
	if (!log[normalizedTarget]) {
		log[normalizedTarget] = {};
	}
	const perTargetLog = log[normalizedTarget];

	await ensureDir(normalizedTarget);

	// 第一步：遍历目标目录，将新增/更新的内容反向同步回源目录
	await traverseTargetAndSync(app, sourceRoot, normalizedTarget, perTargetLog);

	// 第二步：遍历源目录，处理目标目录中已删除的内容（基于删除时间和删除日志）
	await handleDeletions(
		app,
		sourceRoot,
		normalizedTarget,
		perTargetLog,
		logPath,
	);

	log[normalizedTarget] = perTargetLog;
	return log;
}

async function traverseTargetAndSync(
	app: App,
	sourceRoot: string,
	targetRoot: string,
	perTargetLog: { [relPath: string]: string },
) {
	async function walk(currentTargetDir: string) {
		const relDir = path.relative(targetRoot, currentTargetDir);
		const sourceDir =
			relDir === "" ? sourceRoot : path.join(sourceRoot, relDir);

		await ensureDir(sourceDir);

		const entries = await fs.promises.readdir(currentTargetDir, {
			withFileTypes: true,
		});

		for (const entry of entries) {
			const targetPath = path.join(currentTargetDir, entry.name);
			const relPath = path.relative(targetRoot, targetPath);
			const sourcePath = path.join(sourceRoot, relPath);

			if (shouldSkipMetaFile(relPath)) {
				continue;
			}

			if (entry.isDirectory()) {
				await walk(targetPath);
			} else if (entry.isFile()) {
				const srcStat = await fs.promises.stat(sourcePath).catch(
					() => null,
				);
				const tgtStat = await fs.promises.stat(targetPath);

				// 目标新增文件：直接拷贝到源目录
				if (!srcStat || !srcStat.isFile()) {
					await ensureDir(path.dirname(sourcePath));
					await copyFileWithMetadata(targetPath, sourcePath);
					delete perTargetLog[relPath];
					// 记录修改日志，表示该文件最后一次由目标写回源
					await appendModificationLogEntry(
						getDeletionLogPath(sourceRoot),
						{
							targetRoot,
							relPath,
							modifiedAt: new Date(tgtStat.mtimeMs).toISOString(),
						},
					);
					continue;
				}

				const diff = Math.abs(tgtStat.mtimeMs - srcStat.mtimeMs);
				if (diff <= MTIME_EPS_MS) {
					// 认为一致，无需处理
					continue;
				}

				const latest = getLatestUnresolvedEventsFor(relPath);
				const hasSourceChange =
					!!latest.sourceModified || !!latest.sourceDeleted;
				const hasTargetChange =
					!!latest.targetModified || !!latest.targetDeleted;

				if (tgtStat.mtimeMs > srcStat.mtimeMs + MTIME_EPS_MS) {
					// 目标文件比源文件新
					if (hasSourceChange && hasTargetChange) {
						// 双方都有未处理变更，视为冲突
						new Notice(
							`Vault Folder Sync: 反向同步冲突（两端均有修改）：${relPath}`,
						);
						await openDiffForConflict(
							app,
							relPath,
							sourcePath,
							targetPath,
						);
					} else {
						// 只有目标侧有变更，安全地反向覆盖源文件
						await ensureDir(path.dirname(sourcePath));
						await copyFileWithMetadata(targetPath, sourcePath);
						delete perTargetLog[relPath];
						await appendModificationLogEntry(
							getDeletionLogPath(sourceRoot),
							{
								targetRoot,
								relPath,
								modifiedAt: new Date(
									tgtStat.mtimeMs,
								).toISOString(),
							},
						);
					}
				} else {
					// 源文件比目标文件新
					if (hasSourceChange && hasTargetChange) {
						// 双方都有未处理变更，视为冲突
						new Notice(
							`Vault Folder Sync: 反向同步冲突（两端均有修改）：${relPath}`,
						);
						await openDiffForConflict(
							app,
							relPath,
							sourcePath,
							targetPath,
						);
					}
					// 其他情况（仅源侧有变更或仅目标较旧）保留现状，交给正向同步处理
				}
			}
		}
	}

	await walk(targetRoot);
}

async function handleDeletions(
	app: App,
	sourceRoot: string,
	targetRoot: string,
	perTargetLog: { [relPath: string]: string },
	logPath: string,
) {
	async function walkSourceDir(currentSourceDir: string) {
		const relDir = path.relative(sourceRoot, currentSourceDir);
		const currentTargetDir =
			relDir === "" ? targetRoot : path.join(targetRoot, relDir);

		const entries = await fs.promises.readdir(currentSourceDir, {
			withFileTypes: true,
		});

		for (const entry of entries) {
			const sourcePath = path.join(currentSourceDir, entry.name);
			const relPath = path.relative(sourceRoot, sourcePath);
			const targetPath = path.join(targetRoot, relPath);

			if (shouldSkipMetaFile(relPath)) {
				continue;
			}

			const targetExists = await pathExists(targetPath);

			if (entry.isDirectory()) {
				if (targetExists) {
					await walkSourceDir(sourcePath);
				} else {
					await handleSingleDeletion(
						app,
						sourcePath,
						relPath,
						perTargetLog,
						logPath,
						targetRoot,
					);
				}
			} else if (entry.isFile()) {
				if (!targetExists) {
					await handleSingleDeletion(
						app,
						sourcePath,
						relPath,
						perTargetLog,
						logPath,
						targetRoot,
					);
				}
			}
		}
	}

	await walkSourceDir(sourceRoot);
}

async function handleSingleDeletion(
	app: App,
	sourcePath: string,
	relPath: string,
	perTargetLog: { [relPath: string]: string },
	logPath: string,
	targetRoot: string,
) {
	const srcStat = await fs.promises.stat(sourcePath).catch(() => null);
	if (!srcStat) {
		// 源文件本身已不存在，清理日志即可
		delete perTargetLog[relPath];
		await appendDeletionLogEntry(logPath, {
			targetRoot,
			relPath,
			deletedAt: null,
		});
		return;
	}

	const nowIso = new Date().toISOString();
	const existing = perTargetLog[relPath];

	if (!existing) {
		// 第一次发现目标已删除，先记录一次删除时间，下次再判断是否真正删除源文件
		perTargetLog[relPath] = nowIso;
		await appendDeletionLogEntry(logPath, {
			targetRoot,
			relPath,
			deletedAt: nowIso,
		});
		return;
	}

	const deletionTime = Date.parse(existing);
	if (Number.isNaN(deletionTime)) {
		perTargetLog[relPath] = nowIso;
		await appendDeletionLogEntry(logPath, {
			targetRoot,
			relPath,
			deletedAt: nowIso,
		});
		return;
	}

	// 删除时间需要晚于源文件的最后修改时间，才会真正删除源文件
	if (deletionTime > srcStat.mtimeMs + MTIME_EPS_MS) {
		await deletePathIfExists(sourcePath);
		delete perTargetLog[relPath];
		await appendDeletionLogEntry(logPath, {
			targetRoot,
			relPath,
			deletedAt: null,
		});
	} else {
		// 结合日志判断是否存在未处理的双端事件
		const latest = getLatestUnresolvedEventsFor(relPath);
		const hasSourceChange =
			!!latest.sourceModified || !!latest.sourceDeleted;
		const hasTargetChange =
			!!latest.targetModified || !!latest.targetDeleted;
		if (hasSourceChange && hasTargetChange) {
			new Notice(
				`Vault Folder Sync: 反向同步删除冲突（两端均有修改/删除）：${relPath}`,
			);
			// 删除冲突时，也展示当前源文件内容与“空文件”的差异，方便用户决策
			await openDiffForConflict(app, relPath, sourcePath, "");
		}
	}
}

function shouldSkipMetaFile(relPath: string): boolean {
	const normalized = relPath.split(path.sep).join("/");
	if (
		normalized === ".obsidian/vault-folder-sync.json" ||
		normalized === ".obsidian/vault-folder-sync-log.jsonl"
	) {
		return true;
	}
	return false;
}

async function ensureDir(dirPath: string) {
	await fs.promises.mkdir(dirPath, { recursive: true });
}

async function pathExists(p: string): Promise<boolean> {
	try {
		await fs.promises.access(p);
		return true;
	} catch {
		return false;
	}
}

async function deletePathIfExists(p: string) {
	if (!(await pathExists(p))) return;
	const stat = await fs.promises.stat(p);
	if (stat.isDirectory()) {
		await fs.promises.rm(p, { recursive: true, force: true });
	} else {
		await fs.promises.unlink(p);
	}
}

async function copyFileWithMetadata(sourceFile: string, targetFile: string) {
	const stat = await fs.promises.stat(sourceFile);
	await fs.promises.copyFile(sourceFile, targetFile);
	try {
		await fs.promises.utimes(targetFile, stat.atime, stat.mtime);
	} catch (err) {
		console.error(
			"Vault Folder Sync: failed to preserve file times for",
			targetFile,
			err,
		);
	}
}

async function readFileSafe(p: string): Promise<string> {
	try {
		const buf = await fs.promises.readFile(p);
		return buf.toString("utf8");
	} catch {
		return "";
	}
}

async function appendModificationLogEntry(
	logPath: string,
	entry: { targetRoot: string; relPath: string; modifiedAt: string },
) {
	await ensureDir(path.dirname(logPath));
	const enriched: RawLogEntry = {
		...entry,
		side: "target",
		event: "modified",
	};
	const line = JSON.stringify(enriched);
	await fs.promises.appendFile(logPath, line + "\n", "utf8");
}


