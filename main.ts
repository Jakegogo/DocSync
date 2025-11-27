import {
	Plugin,
	FileSystemAdapter,
	TAbstractFile,
	TFile,
	PluginSettingTab,
	App,
	Setting,
	Notice,
} from "obsidian";
import * as fs from "fs";
import * as path from "path";
import { closeDiffViewIfNoConflicts, registerDiffView } from "./diff-view";
import { createLogView } from "./log-view";
import {
	DEFAULT_FILENAME_RULES,
	FilenameMappingRule,
	getSourceAbsolutePath,
	getTargetAbsolutePath,
	mapSegmentBackward,
	mapSegmentForward,
} from "./filename-map";
import {
	logLocalSourceChange,
	logLocalRename,
	mergeLogsForTargets,
	runReverseSyncForTargets,
} from "./reverse-sync";

interface SyncTarget {
	id: string;
	path: string;
	enabled: boolean;
	lastFullSyncDone: boolean;
	enableReverseSync?: boolean;
}

interface VaultFolderSyncSettings {
	targets: SyncTarget[];
	syncIntervalSeconds: number;
	filenameRules: FilenameMappingRule[];
}

const DEFAULT_SETTINGS: VaultFolderSyncSettings = {
	targets: [],
	syncIntervalSeconds: 30,
	filenameRules: DEFAULT_FILENAME_RULES.map((r) => ({ ...r })),
};

type ChangeType = "created" | "modified" | "deleted";

interface RenameChange {
	from: string;
	to: string;
}

export default class VaultFolderSyncPlugin extends Plugin {
	settings: VaultFolderSyncSettings = DEFAULT_SETTINGS;

	private changedFiles: Map<string, ChangeType> = new Map();
	private pendingRenames: RenameChange[] = [];
	private isSyncing = false;
	private statusBarItem: HTMLElement | null = null;

	async onload() {
		await this.loadSettings();

		registerDiffView(this);

		this.statusBarItem = this.addStatusBarItem();
		this.setStatusSyncing();

		this.registerVaultEvents();
		this.registerCommands();
		this.addSettingTab(new VaultFolderSyncSettingTab(this.app, this));

		// 定时增量同步
		const intervalMs = (this.settings.syncIntervalSeconds || 30) * 1000;
		this.registerInterval(
			window.setInterval(() => {
				this.runPeriodicSync();
			}, intervalMs),
		);

		// 启动时先根据标记文件做一次全量/增量同步，然后再做一次基于 mtime 的全面校验
		const sourceRoot = this.getVaultRootPath();
		const enabledTargets = this.settings.targets.filter(
			(t) => t.enabled && t.path.trim().length > 0,
		);
		const enabledTargetPaths = enabledTargets.map((t) => t.path);

		mergeLogsForTargets(sourceRoot, enabledTargetPaths)
			// 如果开启了反向同步，先尝试从对端拉回变更，再做正向/校验
			.then(() => this.runReverseSyncOnce(sourceRoot))
			.then(() => this.triggerSync(false))
			.then(() => this.verifyTargetsByMtime(sourceRoot, enabledTargets))
			.then(() => {
				// 启动时如果没有冲突文件，则关闭已有的冲突面板
				closeDiffViewIfNoConflicts(this.app);
			})
			.catch((err) => {
				console.error("Initial sync error:", err);
				new Notice(
					"Vault Folder Sync: Initial sync failed, see console for details.",
				);
			});
	}

	private async runPeriodicSync() {
		const sourceRoot = this.getVaultRootPath();
		const enabledTargets = this.settings.targets.filter(
			(t) => t.path.trim().length > 0,
		);
		const enabledTargetPaths = enabledTargets.map((t) => t.path);

		// 日志 merge 先于文件同步
		await mergeLogsForTargets(sourceRoot, enabledTargetPaths);

		if (this.isSyncing) return;
		// 如果当前 vault 有本地待同步变更（包含重命名），优先向目标推送，再尝试从目标拉回；
		// 否则按「先反向、后正向」的顺序处理仅目标侧的变更。
		const hasLocalChanges =
			this.changedFiles.size > 0 || this.pendingRenames.length > 0;
		if (hasLocalChanges) {
			await this.triggerSync(false);
			await this.runReverseSyncOnce(sourceRoot);
		} else {
			await this.runReverseSyncOnce(sourceRoot);
			await this.triggerSync(false);
		}
	}

	onunload() {
		// 退出前尽量完成剩余同步
		// 注意：Obsidian 关闭时时间有限，这里只做一次快速尝试
		this.triggerSync(false).catch((err) => {
			console.error("Final sync error:", err);
		});
	}

	private registerVaultEvents() {
		this.registerEvent(
			this.app.vault.on("create", (file) => {
				if (file instanceof TFile) {
					this.markFileChanged(file, "created");
					logLocalSourceChange(this.app, file.path, "modified").catch(
						() => {},
					);
				}
			}),
		);

		this.registerEvent(
			this.app.vault.on("modify", (file) => {
				if (file instanceof TFile) {
					this.markFileChanged(file, "modified");
					logLocalSourceChange(this.app, file.path, "modified").catch(
						() => {},
					);
				}
			}),
		);

		this.registerEvent(
			this.app.vault.on("delete", (file) => {
				// delete 事件的 file 可能是 TFile 或 TFolder，路径相同处理
				this.markPathDeleted(file.path);
				logLocalSourceChange(this.app, file.path, "deleted").catch(
					() => {},
				);
			}),
		);

		this.registerEvent(
			this.app.vault.on("rename", (file, oldPath) => {
				this.markRename(oldPath, file.path);
				logLocalRename(this.app, oldPath, file.path).catch(() => {});
			}),
		);
	}

	private registerCommands() {
		this.addCommand({
			id: "vault-folder-sync-now",
			name: "立即同步所有目标目录",
			callback: () => {
				this.triggerSync(false, true).catch((err) => {
					console.error("Manual sync error:", err);
					new Notice("Vault Folder Sync: Manual sync failed, see console for details.");
				});
			},
		});
	}

	private markFileChanged(file: TAbstractFile, type: ChangeType) {
		const relPath = file.path;
		// 对同一文件，删除优先级最高，其次是创建/修改
		const existing = this.changedFiles.get(relPath);
		if (existing === "deleted") {
			return;
		}
		this.changedFiles.set(relPath, type);
		if (!this.isSyncing) {
			this.setStatusPending();
		}
	}

	private markPathDeleted(relPath: string) {
		this.changedFiles.set(relPath, "deleted");
		if (!this.isSyncing) {
			this.setStatusPending();
		}
	}

	private markRename(fromPath: string, toPath: string) {
		if (fromPath === toPath) return;
		this.pendingRenames.push({ from: fromPath, to: toPath });
		// 额外记录新路径修改，确保内容同步
		this.changedFiles.set(toPath, "modified");
		if (!this.isSyncing) {
			this.setStatusPending();
		}
	}

	private getVaultRootPath(): string {
		const adapter = this.app.vault.adapter;
		if (adapter instanceof FileSystemAdapter) {
			return adapter.getBasePath();
		}
		throw new Error("Vault Folder Sync works only on desktop with FileSystemAdapter.");
	}

	private async triggerSync(forceFull: boolean, manual = false) {
		if (this.isSyncing) {
			if (manual) {
				new Notice("Vault Folder Sync: 已有同步任务在执行中。");
			}
			return;
		}

		this.isSyncing = true;
		try {
			const sourceRoot = this.getVaultRootPath();
			const enabledTargets = this.settings.targets.filter(
				(t) => t.enabled && t.path.trim().length > 0,
			);
			if (enabledTargets.length === 0) {
				this.setStatusSynced();
				return;
			}

			this.setStatusSyncing();

			for (const target of enabledTargets) {
				const needsFull =
					forceFull ||
					!(await this.isInitialFullSyncMarked(target.path));
				if (needsFull) {
					await this.fullSyncTarget(sourceRoot, target);
				} else {
					await this.incrementalSyncTarget(sourceRoot, target);
				}
			}

			// 增量同步完成后，清空队列
			this.changedFiles.clear();
			this.pendingRenames = [];

			this.setStatusSynced();
		} catch (err) {
			console.error("Vault Folder Sync error:", err);
			if (manual) {
				new Notice("Vault Folder Sync: 同步失败，请查看控制台日志。");
			}
		} finally {
			this.isSyncing = false;
		}
	}

	private async isInitialFullSyncMarked(targetRoot: string): Promise<boolean> {
		const markerPath = this.getTargetMarkerPath(targetRoot);
		return this.pathExists(markerPath);
	}

	private async fullSyncTarget(sourceRoot: string, target: SyncTarget) {
		const targetRoot = target.path;
		await this.ensureDir(targetRoot);

		// 全量复制源目录到目标目录（目标目录使用 Windows 兼容的文件名）
		await this.copyDirectoryRecursive(sourceRoot, targetRoot);

		// 删除目标中多余的文件/目录，使其结构与源保持一致
		await this.removeExtraneousInTarget(sourceRoot, targetRoot);

		// 标记该目标目录已经完成过一次全量同步
		await this.writeInitialFullSyncMarker(targetRoot);
	}

	private async incrementalSyncTarget(sourceRoot: string, target: SyncTarget) {
		const targetRoot = target.path;
		await this.ensureDir(targetRoot);

		// 先处理重命名，再处理普通的增删改
		for (const rename of this.pendingRenames) {
			const fromAbs = getTargetAbsolutePath(
				targetRoot,
				rename.from,
				this.settings.filenameRules,
			);
			const toAbs = getTargetAbsolutePath(
				targetRoot,
				rename.to,
				this.settings.filenameRules,
			);
			try {
				await this.ensureDir(path.dirname(toAbs));
				if (await this.pathExists(fromAbs)) {
					await fs.promises.rename(fromAbs, toAbs);
				}
			} catch (err) {
				console.error("Vault Folder Sync rename error:", err);
			}
		}

		for (const [relPath, changeType] of this.changedFiles) {
			const sourceAbs = getSourceAbsolutePath(sourceRoot, relPath);
			const targetAbs = getTargetAbsolutePath(
				targetRoot,
				relPath,
				this.settings.filenameRules,
			);

			try {
				if (changeType === "deleted") {
					// 删除文件或目录
					await this.deletePathIfExists(targetAbs);
				} else {
					// 创建或修改文件（目录会在 ensureDir 中自动创建）
					const sourceStat = await fs.promises.stat(sourceAbs).catch(
						() => null,
					);
					if (!sourceStat) {
						continue;
					}
					if (sourceStat.isDirectory()) {
						await this.ensureDir(targetAbs);
					} else {
						await this.ensureDir(path.dirname(targetAbs));
						await this.copyFileWithMetadata(sourceAbs, targetAbs);
					}
				}
			} catch (err) {
				console.error(
					`Vault Folder Sync incremental error for ${relPath}:`,
					err,
				);
			}
		}
	}

	private async ensureDir(dirPath: string) {
		await fs.promises.mkdir(dirPath, { recursive: true });
	}

	private async pathExists(p: string): Promise<boolean> {
		try {
			await fs.promises.access(p);
			return true;
		} catch {
			return false;
		}
	}

	private async deletePathIfExists(p: string) {
		if (!(await this.pathExists(p))) return;
		const stat = await fs.promises.stat(p);
		if (stat.isDirectory()) {
			await fs.promises.rm(p, { recursive: true, force: true });
		} else {
			await fs.promises.unlink(p);
		}
	}

	private async copyDirectoryRecursive(
		sourceDir: string,
		targetDir: string,
	) {
		await this.ensureDir(targetDir);
		const entries = await fs.promises.readdir(sourceDir, {
			withFileTypes: true,
		});

		for (const entry of entries) {
			const srcPath = path.join(sourceDir, entry.name);
			const safeName = mapSegmentForward(
				entry.name,
				this.settings.filenameRules,
			);
			const destPath = path.join(targetDir, safeName);

			if (entry.isDirectory()) {
				await this.copyDirectoryRecursive(srcPath, destPath);
			} else if (entry.isFile()) {
				await this.ensureDir(path.dirname(destPath));
				await this.copyFileWithMetadata(srcPath, destPath);
			}
		}
	}

	private async verifyTargetsByMtime(
		sourceRoot: string,
		targets: SyncTarget[],
	) {
		if (targets.length === 0) return;
		if (this.isSyncing) return;

		this.isSyncing = true;
		this.setStatusSyncing();

		try {
			for (const target of targets) {
				// 仅对已经做过一次全量同步的目标做校验
				const hasInitialFull = await this.isInitialFullSyncMarked(
					target.path,
				);
				if (!hasInitialFull) continue;

				await this.verifyDirectoryByMtime(sourceRoot, target.path);
			}

			this.setStatusSynced();
		} catch (err) {
			console.error(
				"Vault Folder Sync: verifyTargetsByMtime error:",
				err,
			);
		} finally {
			this.isSyncing = false;
		}
	}

	private async verifyDirectoryByMtime(
		sourceDir: string,
		targetDir: string,
	) {
		await this.ensureDir(targetDir);

		// 第一遍：遍历源目录，确保目标目录中存在对应文件，且 mtime 一致（必要时复制）
		const entries = await fs.promises.readdir(sourceDir, {
			withFileTypes: true,
		});

		for (const entry of entries) {
			const srcPath = path.join(sourceDir, entry.name);
			const safeName = mapSegmentForward(
				entry.name,
				this.settings.filenameRules,
			);
			const destPath = path.join(targetDir, safeName);

			if (entry.isDirectory()) {
				await this.verifyDirectoryByMtime(srcPath, destPath);
			} else if (entry.isFile()) {
				const srcStat = await fs.promises.stat(srcPath);
				const destStat = await fs.promises.stat(destPath).catch(
					() => null,
				);

				let needCopy = false;
				if (!destStat || !destStat.isFile()) {
					needCopy = true;
				} else {
					const diff = Math.abs(
						srcStat.mtimeMs - destStat.mtimeMs,
					);
					// 留一点浮动误差，避免不同文件系统的时间精度差导致的频繁重拷贝
					if (diff > 1) {
						needCopy = true;
					}
				}

				if (needCopy) {
					await this.ensureDir(path.dirname(destPath));
					await this.copyFileWithMetadata(srcPath, destPath);
				}
			}
		}

		// 第二遍：遍历目标目录，删除源目录中已经不存在的文件/目录
		const targetEntries = await fs.promises.readdir(targetDir, {
			withFileTypes: true,
		});

		for (const entry of targetEntries) {
			const targetPath = path.join(targetDir, entry.name);
			const originalName = mapSegmentBackward(
				entry.name,
				this.settings.filenameRules,
			);
			const sourcePath = path.join(sourceDir, originalName);

			const sourceExists = await this.pathExists(sourcePath);
			if (sourceExists) continue;

			// 保留目标 vault 下的标记文件：.obsidian/vault-folder-sync.json
			const isMarkerFile =
				entry.isFile() &&
				entry.name === "vault-folder-sync.json" &&
				path.basename(targetDir) === ".obsidian";
			if (isMarkerFile) {
				continue;
			}

			await this.deletePathIfExists(targetPath);
		}
	}

	private async copyFileWithMetadata(sourceFile: string, targetFile: string) {
		const stat = await fs.promises.stat(sourceFile);
		await fs.promises.copyFile(sourceFile, targetFile);
		try {
			// 只能可靠地设置 atime/mtime，创建时间通常由文件系统决定
			await fs.promises.utimes(
				targetFile,
				stat.atime,
				stat.mtime,
			);
		} catch (err) {
			console.error("Vault Folder Sync: failed to preserve file times for", targetFile, err);
		}
	}

	private async removeExtraneousInTarget(
		sourceDir: string,
		targetDir: string,
	) {
		if (!(await this.pathExists(targetDir))) return;

		const entries = await fs.promises.readdir(targetDir, {
			withFileTypes: true,
		});

		for (const entry of entries) {
			const targetPath = path.join(targetDir, entry.name);
			const originalName = mapSegmentBackward(
				entry.name,
				this.settings.filenameRules,
			);
			const sourcePath = path.join(sourceDir, originalName);

			const sourceExists = await this.pathExists(sourcePath);
			if (!sourceExists) {
				// 目标中存在但源中不存在，直接删除
				await this.deletePathIfExists(targetPath);
				continue;
			}

			if (entry.isDirectory()) {
				const srcStat = await fs.promises.stat(sourcePath);
				if (srcStat.isDirectory()) {
					await this.removeExtraneousInTarget(sourcePath, targetPath);
				}
			}
		}
	}

	private getTargetMarkerPath(targetRoot: string): string {
		// 将标记文件写到目标 vault 的 .obsidian 目录下，但该文件本身不会被同步过去
		return path.join(targetRoot, ".obsidian", "vault-folder-sync.json");
	}

	private async writeInitialFullSyncMarker(targetRoot: string) {
		const markerPath = this.getTargetMarkerPath(targetRoot);
		await this.ensureDir(path.dirname(markerPath));
		const content = JSON.stringify(
			{
				initialFullSyncDone: true,
				timestamp: new Date().toISOString(),
			},
			null,
			2,
		);
		await fs.promises.writeFile(markerPath, content, "utf8");
	}

	private async runReverseSyncOnce(sourceRoot: string) {
		const reverseTargets = this.settings.targets.filter(
			(t) => t.enabled && t.enableReverseSync && t.path.trim().length > 0,
		);
		if (reverseTargets.length === 0) return;
		await runReverseSyncForTargets(
			this.app,
			sourceRoot,
			reverseTargets.map((t) => t.path),
		);
	}

	private setStatusPending() {
		if (!this.statusBarItem) return;
		this.statusBarItem.empty();
		const iconSpan = this.statusBarItem.createSpan();
		iconSpan.setText("●");
		const textSpan = this.statusBarItem.createSpan();
		textSpan.setText(" 待同步");
		this.statusBarItem.setAttr(
			"title",
			"Vault Folder Sync: 有未同步的修改，等待下一次同步…",
		);
	}

	private setStatusSyncing() {
		if (!this.statusBarItem) return;
		this.statusBarItem.empty();
		const iconSpan = this.statusBarItem.createSpan();
		iconSpan.setText("⟳");
		const textSpan = this.statusBarItem.createSpan();
		textSpan.setText(" 同步中");
		this.statusBarItem.setAttr(
			"title",
			"Vault Folder Sync: 未同步或正在同步中…",
		);
	}

	private setStatusSynced() {
		if (!this.statusBarItem) return;
		this.statusBarItem.empty();
		const iconSpan = this.statusBarItem.createSpan();
		iconSpan.setText("✔");
		const textSpan = this.statusBarItem.createSpan();
		textSpan.setText(" 已同步");
		this.statusBarItem.setAttr(
			"title",
			"Vault Folder Sync: 上次同步已完成。",
		);
	}

	async loadSettings() {
		const data = await this.loadData();
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
		if (
			!Array.isArray(this.settings.filenameRules) ||
			this.settings.filenameRules.length === 0
		) {
			this.settings.filenameRules = DEFAULT_FILENAME_RULES.map((r) => ({
				...r,
			}));
		}
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class VaultFolderSyncSettingTab extends PluginSettingTab {
	plugin: VaultFolderSyncPlugin;

	constructor(app: App, plugin: VaultFolderSyncPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("h2", { text: "Vault Folder Sync 设置" });

		const rulesSection = containerEl.createEl("div");
		rulesSection.createEl("h3", { text: "同步规则概览" });
		const forwardList = rulesSection.createEl("ul");
		forwardList.createEl("li", {
			text: "正向同步：首次按需全量复制，之后按文件/目录变更和最后修改时间进行增量同步，保持目标目录与当前 vault 一致。",
		});
		forwardList.createEl("li", {
			text: "启动时会额外按最后修改时间全面校验一次，修正遗漏的增量变更（包含新增、修改、删除）。",
		});
		const reverseListTitle = rulesSection.createEl("p", {
			text: "反向同步（可选，对每个目标单独开启）：",
		});
		reverseListTitle.style.marginTop = "0.75em";
		const reverseList = rulesSection.createEl("ul");
		reverseList.createEl("li", {
			text: "目标目录中文件较新或新增时，会覆盖/写回当前 vault；源文件较新时视为冲突，仅提示不覆盖。",
		});
		reverseList.createEl("li", {
			text: "删除操作基于 .obsidian/vault-folder-sync-deleted.json 中的删除时间，与源文件最后修改时间比较后再决定是否同步删除。",
		});
		rulesSection.createEl("p", {
			text: "注意：反向同步仅做增量检查，不会进行全量覆盖，请谨慎开启。",
		});

		new Setting(containerEl)
			.setName("同步间隔（秒）")
			.setDesc("定时增量同步的时间间隔，默认 30 秒。")
			.addText((text) =>
				text
					.setPlaceholder("30")
					.setValue(
						String(this.plugin.settings.syncIntervalSeconds ?? 30),
					)
					.onChange(async (value) => {
						const num = Number(value);
						if (!Number.isNaN(num) && num > 0) {
							this.plugin.settings.syncIntervalSeconds = num;
							await this.plugin.saveSettings();
							new Notice(
								"Vault Folder Sync: 同步间隔已保存，下次重启插件后生效。",
							);
						}
					}),
			);

		containerEl.createEl("h3", { text: "同步目标目录" });

		this.plugin.settings.targets.forEach((target) => {
			const s = new Setting(containerEl)
				.setName(target.path || "(未设置路径)")
				.setDesc("将当前 vault 同步到该目录。")
				.addToggle((toggle) => {
					const wrapper = toggle.toggleEl.parentElement;
					toggle
						.setValue(target.enabled)
						.setTooltip("启用正向同步（从当前 vault 同步到该目录）")
						.onChange(async (value) => {
							target.enabled = value;
							await this.plugin.saveSettings();
						});
					if (wrapper) {
						wrapper.style.display = "flex";
						wrapper.style.alignItems = "center";
						const label = wrapper.createSpan({ text: "正向" });
						label.style.marginLeft = "0.25em";
						label.style.whiteSpace = "nowrap";
					}
				})
				.addToggle((toggle) => {
					const wrapper = toggle.toggleEl.parentElement;
					toggle
						.setValue(target.enableReverseSync ?? false)
						.setTooltip("启用反向同步（从该目录同步回当前 vault）")
						.onChange(async (value) => {
							target.enableReverseSync = value;
							await this.plugin.saveSettings();
						});
					if (wrapper) {
						wrapper.style.display = "flex";
						wrapper.style.alignItems = "center";
						const label = wrapper.createSpan({ text: "反向" });
						label.style.marginLeft = "0.25em";
						label.style.whiteSpace = "nowrap";
					}
				})
				.addText((text) =>
					text
						.setPlaceholder("输入目标目录的绝对路径")
						.setValue(target.path)
						.onChange(async (value) => {
							target.path = value.trim();
							await this.plugin.saveSettings();
						}),
				)
				.addExtraButton((button) =>
					button
						.setIcon("trash")
						.setTooltip("删除该目标目录配置")
						.onClick(async () => {
							this.plugin.settings.targets =
								this.plugin.settings.targets.filter(
									(t) => t.id !== target.id,
								);
							await this.plugin.saveSettings();
							this.display();
						}),
				);

			s.infoEl.style.whiteSpace = "pre-wrap";
		});

		containerEl.createEl("h4", { text: "新增目标目录" });

		let newPathValue = "";
		new Setting(containerEl)
			.setName("目标目录路径")
			.setDesc("输入一个新的目标目录绝对路径，用于同步本 vault。")
			.addText((text) =>
				text
					.setPlaceholder("/path/to/another/folder")
					.onChange((value) => {
						newPathValue = value.trim();
					}),
			)
			.addButton((button) =>
				button
					.setButtonText("添加")
					.onClick(async () => {
						if (!newPathValue) {
							new Notice("请先输入目标目录路径。");
							return;
						}
						const id = `${Date.now()}-${Math.random()
							.toString(36)
							.slice(2, 8)}`;
						this.plugin.settings.targets.push({
							id,
							path: newPathValue,
							enabled: true,
							lastFullSyncDone: false,
						});
						await this.plugin.saveSettings();
						newPathValue = "";
						this.display();
					}),
			);
		createLogView(containerEl, this.app);

		containerEl.createEl("h3", { text: "Windows 文件名兼容" });
		new Setting(containerEl)
			.setName("文件名字符替换规则")
			.setDesc(
				"在同步到目标目录时，将文件名中的特殊字符替换为 Windows 支持的字符；反向同步时会自动反向映射。下面每一行是一条规则：左边是源字符，右边是目标字符。",
			);

		const rulesContainer = containerEl.createEl("div");
		const renderRules = () => {
			rulesContainer.empty();
			this.plugin.settings.filenameRules.forEach((rule, index) => {
				const s = new Setting(rulesContainer)
					.setName(`规则 ${index + 1}`)
					.setDesc("源字符 => 目标字符")
					.addText((text) =>
						text
							.setPlaceholder("源字符，例如 :")
							.setValue(rule.from)
							.onChange(async (value) => {
								this.plugin.settings.filenameRules[index].from =
									value;
								await this.plugin.saveSettings();
							}),
					)
					.addText((text) =>
						text
							.setPlaceholder("目标字符，例如 ：")
							.setValue(rule.to)
							.onChange(async (value) => {
								this.plugin.settings.filenameRules[index].to =
									value;
								await this.plugin.saveSettings();
							}),
					)
					.addExtraButton((button) =>
						button
							.setIcon("trash")
							.setTooltip("删除该规则")
							.onClick(async () => {
								this.plugin.settings.filenameRules.splice(
									index,
									1,
								);
								await this.plugin.saveSettings();
								renderRules();
							}),
					);
				s.infoEl.style.whiteSpace = "pre-wrap";
			});

			new Setting(rulesContainer)
				.setName("新增规则")
				.setDesc("添加一条新的字符替换规则。")
				.addButton((button) =>
					button
						.setButtonText("添加规则")
						.onClick(async () => {
							this.plugin.settings.filenameRules.push({
								from: "",
								to: "",
							});
							await this.plugin.saveSettings();
							renderRules();
						}),
				)
				.addButton((button) =>
					button
						.setButtonText("重置为默认规则")
						.onClick(async () => {
							this.plugin.settings.filenameRules =
								DEFAULT_FILENAME_RULES.map((r) => ({ ...r }));
							await this.plugin.saveSettings();
							renderRules();
							new Notice(
								"Vault Folder Sync: 已重置为默认的 Windows 文件名兼容规则。",
							);
						}),
				);
		};
		renderRules();
	}
}


