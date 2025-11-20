import { App, Notice } from "obsidian";
import * as fs from "fs";
import * as path from "path";

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

export async function runReverseSyncForTargets(
	app: App,
	sourceRoot: string,
	targetRoots: string[],
) {
	if (targetRoots.length === 0) return;

	const deletionLogPath = getDeletionLogPath(sourceRoot);
	let log = await loadDeletionLog(deletionLogPath);

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

function getDeletionLogPath(sourceRoot: string): string {
	return path.join(
		sourceRoot,
		".obsidian",
		"vault-folder-sync-deleted.json",
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
			let entry: DeletionLogEntry;
			try {
				entry = JSON.parse(trimmed) as DeletionLogEntry;
			} catch {
				continue;
			}
			if (!entry.targetRoot || !entry.relPath) continue;
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
	const line = JSON.stringify(entry);
	await fs.promises.appendFile(logPath, line + "\n", "utf8");
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
					continue;
				}

				const diff = Math.abs(tgtStat.mtimeMs - srcStat.mtimeMs);
				if (diff <= MTIME_EPS_MS) {
					// 认为一致，无需处理
					continue;
				}

				if (tgtStat.mtimeMs > srcStat.mtimeMs + MTIME_EPS_MS) {
					// 目标文件比源文件新：反向覆盖源文件
					await ensureDir(path.dirname(sourcePath));
					await copyFileWithMetadata(targetPath, sourcePath);
					delete perTargetLog[relPath];
				} else {
					// 源文件比目标文件新：认为冲突，提示用户
					new Notice(
						`Vault Folder Sync: 反向同步冲突（源文件较新）：${relPath}`,
					);
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
		new Notice(
			`Vault Folder Sync: 反向同步删除冲突（源文件较新）：${relPath}`,
		);
	}
}

function shouldSkipMetaFile(relPath: string): boolean {
	const normalized = relPath.split(path.sep).join("/");
	if (
		normalized === ".obsidian/vault-folder-sync.json" ||
		normalized === ".obsidian/vault-folder-sync-deleted.json"
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


