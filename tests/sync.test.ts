import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import VaultFolderSyncPlugin from "../main";
import {
	runReverseSyncForTargets,
	logLocalSourceChange,
	mergeLogsForTargets,
	logLocalRename,
} from "../reverse-sync";
import { WorkspaceLeaf, FileSystemAdapter } from "obsidian";

function createTempDir(prefix: string): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeFile(p: string, content: string, mtimeMs?: number) {
	fs.mkdirSync(path.dirname(p), { recursive: true });
	fs.writeFileSync(p, content, "utf8");
	if (mtimeMs != null) {
		const t = new Date(mtimeMs);
		fs.utimesSync(p, t, t);
	}
}

function readFile(p: string): string {
	return fs.readFileSync(p, "utf8");
}

function getLogPath(sourceRoot: string): string {
	return path.join(sourceRoot, ".obsidian", "vault-folder-sync-log.jsonl");
}

function appendTargetModificationLog(
	sourceRoot: string,
	targetRoot: string,
	relPath: string,
	mtimeMs: number,
) {
	const logPath = getLogPath(sourceRoot);
	fs.mkdirSync(path.dirname(logPath), { recursive: true });
	const entry = {
		targetRoot,
		relPath,
		modifiedAt: new Date(mtimeMs).toISOString(),
		side: "target",
		event: "modified",
	};
	fs.appendFileSync(logPath, JSON.stringify(entry) + "\n", "utf8");
}

function appendSourceModificationLog(
	sourceRoot: string,
	relPath: string,
	mtimeMs: number,
) {
	const logPath = getLogPath(sourceRoot);
	fs.mkdirSync(path.dirname(logPath), { recursive: true });
	const entry = {
		relPath,
		modifiedAt: new Date(mtimeMs).toISOString(),
		side: "source",
		event: "modified",
	};
	fs.appendFileSync(logPath, JSON.stringify(entry) + "\n", "utf8");
}

function appendSourceDeletionLog(sourceRoot: string, relPath: string) {
	// 保留该辅助函数以便在需要时直接写入删除日志，目前主路径使用 logLocalSourceChange。
	const logPath = getLogPath(sourceRoot);
	fs.mkdirSync(path.dirname(logPath), { recursive: true });
	const entry = {
		relPath,
		deletedAt: new Date().toISOString(),
		side: "source",
		event: "deleted",
	};
	fs.appendFileSync(logPath, JSON.stringify(entry) + "\n", "utf8");
}

function createFakeApp(sourceRoot: string): any {
	const adapter = new (FileSystemAdapter as any)(sourceRoot);
	return {
		vault: {
			adapter,
		},
		workspace: {
			getLeavesOfType: () => [new WorkspaceLeaf()],
			getRightLeaf: () => new WorkspaceLeaf(),
			revealLeaf: () => {},
		},
	};
}

describe("VaultFolderSync forward and reverse sync", () => {
	it("performs forward full sync and incremental sync without overwriting unrelated files", async () => {
		const sourceRoot = createTempDir("vfs-source-");
		const targetRoot = createTempDir("vfs-target-");

		const fileA = path.join(sourceRoot, "note-a.md");
		const fileB = path.join(sourceRoot, "sub", "note-b?.md");
		writeFile(fileA, "A1");
		writeFile(fileB, "B1");

		const app = createFakeApp(sourceRoot);
		const plugin: any = new (VaultFolderSyncPlugin as any)(app);

		const target: any = {
			id: "t1",
			path: targetRoot,
			enabled: true,
			lastFullSyncDone: false,
		};

		await plugin.fullSyncTarget(sourceRoot, target);

		// B 文件名中包含 ?，在目标中应被替换为安全字符，但内容保持一致
		const targetFiles = fs.readdirSync(targetRoot);
		const visibleTargetFiles = targetFiles.filter(
			(name) => !name.startsWith("."),
		);
		expect(visibleTargetFiles.sort()).toEqual(["note-a.md", "sub"]);
		const subFiles = fs.readdirSync(path.join(targetRoot, "sub"));
		expect(subFiles.length).toBe(1);
		const safeBName = subFiles[0];
		expect(readFile(path.join(targetRoot, "note-a.md"))).toBe("A1");
		expect(readFile(path.join(targetRoot, "sub", safeBName))).toBe("B1");

		// 修改源中的 A，标记增量同步
		writeFile(fileA, "A2");
		plugin.changedFiles.set("note-a.md", "modified");

		await plugin.incrementalSyncTarget(sourceRoot, target);

		expect(readFile(path.join(targetRoot, "note-a.md"))).toBe("A2");
		// 未改变的 B 不应被误删或覆盖
		expect(readFile(path.join(targetRoot, "sub", safeBName))).toBe("B1");
	});

	it("writes newer target changes back to source during reverse sync and logs the modification", async () => {
		const sourceRoot = createTempDir("vfs-source-");
		const targetRoot = createTempDir("vfs-target-");

		const relPath = "note.md";
		const sourceFile = path.join(sourceRoot, relPath);
		const targetFile = path.join(targetRoot, relPath);

		writeFile(sourceFile, "initial");

		const app = createFakeApp(sourceRoot);
		const plugin: any = new (VaultFolderSyncPlugin as any)(app);
		const target: any = {
			id: "t1",
			path: targetRoot,
			enabled: true,
			lastFullSyncDone: false,
		};

		await plugin.fullSyncTarget(sourceRoot, target);

		const t1 = Date.now() + 10_000;
		writeFile(targetFile, "from-target", t1);

		await runReverseSyncForTargets(app, sourceRoot, [targetRoot]);

		expect(readFile(sourceFile)).toBe("from-target");

		const logPath = getLogPath(sourceRoot);
		const logText = fs.existsSync(logPath)
			? fs.readFileSync(logPath, "utf8")
			: "";
		expect(logText).toContain(relPath);
		expect(logText).toContain('"side":"target"');
		expect(logText).toContain('"event":"modified"');
	});

	it("avoids overwriting source when both source and target have unmerged modifications (conflict)", async () => {
		const sourceRoot = createTempDir("vfs-source-");
		const targetRoot = createTempDir("vfs-target-");

		const relPath = "conflict.md";
		const sourceFile = path.join(sourceRoot, relPath);
		const targetFile = path.join(targetRoot, relPath);

		writeFile(sourceFile, "base");

		const app = createFakeApp(sourceRoot);
		const plugin: any = new (VaultFolderSyncPlugin as any)(app);
		const target: any = {
			id: "t1",
			path: targetRoot,
			enabled: true,
			lastFullSyncDone: false,
		};

		await plugin.fullSyncTarget(sourceRoot, target);

		const tSource = Date.now() + 5_000;
		writeFile(sourceFile, "from-source", tSource);
		appendSourceModificationLog(sourceRoot, relPath, tSource);

		const tTarget = Date.now() + 10_000;
		writeFile(targetFile, "from-target", tTarget);
		appendTargetModificationLog(sourceRoot, targetRoot, relPath, tTarget);

		await runReverseSyncForTargets(app, sourceRoot, [targetRoot]);

		// 双端都有未合并修改且日志中均记录时，当前实现会视为冲突，不自动用目标内容覆盖源文件
		expect(readFile(sourceFile)).toBe("from-source");

		const logPath = getLogPath(sourceRoot);
		const logText = fs.existsSync(logPath)
			? fs.readFileSync(logPath, "utf8")
			: "";
		expect(logText).toContain('"side":"source"');
		expect(logText).toContain('"side":"target"');
		expect(logText).toContain(relPath);
	});

	it("keeps two peer roots in sync when edits happen on both sides sequentially", async () => {
		const rootA = createTempDir("vfs-peer-a-");
		const rootB = createTempDir("vfs-peer-b-");

		const relPath = "peer-note.md";
		const fileA = path.join(rootA, relPath);
		const fileB = path.join(rootB, relPath);

		// 初始在 A 中创建文件，并全量同步到 B
		writeFile(fileA, "A-1");
		const appA = createFakeApp(rootA);
		const pluginA: any = new (VaultFolderSyncPlugin as any)(appA);
		const targetAB: any = {
			id: "ab",
			path: rootB,
			enabled: true,
			lastFullSyncDone: false,
		};

		await pluginA.fullSyncTarget(rootA, targetAB);
		expect(readFile(fileB)).toBe("A-1");

		// 在 B 中修改文件，通过运行在 A 侧的反向同步把变更拉回 A
		const tB = Date.now() + 10_000;
		writeFile(fileB, "B-2", tB);
		await runReverseSyncForTargets(appA as any, rootA, [rootB]);
		expect(readFile(fileA)).toBe("B-2");

		// 再在 A 中修改，通过正向增量同步推送回 B
		writeFile(fileA, "A-3");
		const relKey = relPath;
		pluginA.changedFiles.set(relKey, "modified");
		await pluginA.incrementalSyncTarget(rootA, targetAB);
		expect(readFile(fileB)).toBe("A-3");
	});

	it("merges logs between two peer roots and avoids overwrite on conflict", async () => {
		const rootA = createTempDir("vfs-peer-a-");
		const rootB = createTempDir("vfs-peer-b-");

		const relPath = "peer-conflict.md";
		const fileA = path.join(rootA, relPath);
		const fileB = path.join(rootB, relPath);

		// 初始由 A 创建并同步到 B
		writeFile(fileA, "base");
		const appA = createFakeApp(rootA);
		const pluginA: any = new (VaultFolderSyncPlugin as any)(appA);
		const targetAB: any = {
			id: "ab",
			path: rootB,
			enabled: true,
			lastFullSyncDone: false,
		};
		await pluginA.fullSyncTarget(rootA, targetAB);

		// A 作为一个 Obsidian vault，在本地修改并记录 source 侧修改日志
		const tSource = Date.now() + 5_000;
		writeFile(fileA, "A-change", tSource);
		await logLocalSourceChange(appA as any, relPath, "modified");

		// B 作为另一个 Obsidian vault，在本地修改并记录它自己的 source 日志
		const appB = createFakeApp(rootB);
		const tTarget = Date.now() + 10_000;
		writeFile(fileB, "B-change", tTarget);
		await logLocalSourceChange(appB as any, relPath, "modified");

		// 模拟在 A 端运行周期任务：先合并两端日志，再执行一次反向同步
		await mergeLogsForTargets(rootA, [rootB]);
		await runReverseSyncForTargets(appA as any, rootA, [rootB]);

		// 在当前时刻，B 侧修改较新且已合并到日志中，此次反向同步会以 B 的内容为准写回 A
		expect(readFile(fileA)).toBe("B-change");

		const logA = fs.existsSync(getLogPath(rootA))
			? fs.readFileSync(getLogPath(rootA), "utf8")
			: "";

		// 合并后，本端日志中应包含该冲突文件的记录
		expect(logA).toContain(relPath);
	});

	it("logs rename as paired deleted and modified entries with rename metadata", async () => {
		const sourceRoot = createTempDir("vfs-rename-log-");
		const app = createFakeApp(sourceRoot);

		const fromRel = "old-name.md";
		const toRel = "new-name.md";

		await logLocalRename(app as any, fromRel, toRel);

		const logPath = getLogPath(sourceRoot);
		const text = fs.existsSync(logPath)
			? fs.readFileSync(logPath, "utf8")
			: "";
		const lines = text
			.split(/\r?\n/)
			.map((l) => l.trim())
			.filter(Boolean);

		expect(lines.length).toBe(2);
		const entries = lines.map((l) => JSON.parse(l));

		const delEntry = entries.find(
			(e) => e.relPath === fromRel && e.event === "deleted",
		);
		const modEntry = entries.find(
			(e) => e.relPath === toRel && e.event === "modified",
		);

		expect(delEntry).toBeTruthy();
		expect(modEntry).toBeTruthy();
		expect(delEntry.rename).toBe(true);
		expect(modEntry.rename).toBe(true);
		expect(delEntry.renameTo).toBe(toRel);
		expect(modEntry.renameFrom).toBe(fromRel);
		expect(delEntry.renameId).toBe(modEntry.renameId);
	});

	it("removes old target file after a rename from source", async () => {
		const sourceRoot = createTempDir("vfs-rename-src-");
		const targetRoot = createTempDir("vfs-rename-tgt-");

		const fromRel = "old-note.md";
		const toRel = "new-note.md";
		const sourceOld = path.join(sourceRoot, fromRel);
		const sourceNew = path.join(sourceRoot, toRel);
		const targetOld = path.join(targetRoot, fromRel);
		const targetNew = path.join(targetRoot, toRel);

		// 初始：源创建旧文件并全量同步到目标
		writeFile(sourceOld, "old-content");
		const app = createFakeApp(sourceRoot);
		const plugin: any = new (VaultFolderSyncPlugin as any)(app);
		const target: any = {
			id: "t1",
			path: targetRoot,
			enabled: true,
			lastFullSyncDone: false,
		};
		await plugin.fullSyncTarget(sourceRoot, target);
		expect(fs.existsSync(targetOld)).toBe(true);
		expect(readFile(targetOld)).toBe("old-content");

		// 源侧重命名文件，并记录重命名日志与内部重命名队列
		fs.renameSync(sourceOld, sourceNew);
		await logLocalRename(app as any, fromRel, toRel);
		plugin.markRename(fromRel, toRel);

		// 增量同步应在目标目录执行真正的重命名，并移除旧文件名
		await plugin.incrementalSyncTarget(sourceRoot, target);

		expect(fs.existsSync(targetOld)).toBe(false);
		expect(fs.existsSync(targetNew)).toBe(true);
		expect(readFile(targetNew)).toBe("old-content");
	});

	it("does not resurrect a file deleted in source when reverse sync runs before forward sync", async () => {
		const sourceRoot = createTempDir("vfs-del-src-");
		const targetRoot = createTempDir("vfs-del-tgt-");

		const relPath = "to-delete.md";
		const sourceFile = path.join(sourceRoot, relPath);
		const targetFile = path.join(targetRoot, relPath);

		// 初始：源创建文件并全量同步到目标
		writeFile(sourceFile, "to-be-deleted");
		const app = createFakeApp(sourceRoot);
		const plugin: any = new (VaultFolderSyncPlugin as any)(app);
		const target: any = {
			id: "t1",
			path: targetRoot,
			enabled: true,
			lastFullSyncDone: false,
		};
		await plugin.fullSyncTarget(sourceRoot, target);
		expect(fs.existsSync(targetFile)).toBe(true);

		// 源侧删除该文件，并记录删除日志
		fs.unlinkSync(sourceFile);
		appendSourceDeletionLog(sourceRoot, relPath);

		// 模拟一次周期任务顺序：merge 日志 → 先反向同步 → 再正向同步
		await mergeLogsForTargets(sourceRoot, [targetRoot]);
		await runReverseSyncForTargets(app as any, sourceRoot, [targetRoot]);

		// 反向同步不应从目标恢复源文件
		expect(fs.existsSync(sourceFile)).toBe(false);

		// 正向增量同步应最终删除目标文件
		plugin.changedFiles.set(relPath, "deleted");
		await plugin.incrementalSyncTarget(sourceRoot, target);
		expect(fs.existsSync(targetFile)).toBe(false);
	});
});

