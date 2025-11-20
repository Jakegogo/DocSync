"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// main.ts
var main_exports = {};
__export(main_exports, {
  default: () => VaultFolderSyncPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian2 = require("obsidian");
var fs2 = __toESM(require("fs"));
var path2 = __toESM(require("path"));

// reverse-sync.ts
var import_obsidian = require("obsidian");
var fs = __toESM(require("fs"));
var path = __toESM(require("path"));
var MTIME_EPS_MS = 1;
async function runReverseSyncForTargets(app, sourceRoot, targetRoots) {
  if (targetRoots.length === 0) return;
  const deletionLogPath = getDeletionLogPath(sourceRoot);
  let log = await loadDeletionLog(deletionLogPath);
  for (const targetRoot of targetRoots) {
    log = await syncOneTarget(
      app,
      sourceRoot,
      targetRoot,
      log,
      deletionLogPath
    );
  }
}
function getDeletionLogPath(sourceRoot) {
  return path.join(
    sourceRoot,
    ".obsidian",
    "vault-folder-sync-deleted.json"
  );
}
async function loadDeletionLog(p) {
  try {
    const raw = await fs.promises.readFile(p, "utf8");
    const log = {};
    const lines = raw.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let entry;
      try {
        entry = JSON.parse(trimmed);
      } catch {
        continue;
      }
      if (!entry.targetRoot || !entry.relPath) continue;
      if (!log[entry.targetRoot]) {
        log[entry.targetRoot] = {};
      }
      const existing = log[entry.targetRoot][entry.relPath];
      if (entry.deletedAt == null) {
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
async function appendDeletionLogEntry(logPath, entry) {
  await ensureDir(path.dirname(logPath));
  const line = JSON.stringify(entry);
  await fs.promises.appendFile(logPath, line + "\n", "utf8");
}
async function syncOneTarget(app, sourceRoot, targetRoot, log, logPath) {
  const normalizedTarget = path.resolve(targetRoot);
  if (!log[normalizedTarget]) {
    log[normalizedTarget] = {};
  }
  const perTargetLog = log[normalizedTarget];
  await ensureDir(normalizedTarget);
  await traverseTargetAndSync(app, sourceRoot, normalizedTarget, perTargetLog);
  await handleDeletions(
    app,
    sourceRoot,
    normalizedTarget,
    perTargetLog,
    logPath
  );
  log[normalizedTarget] = perTargetLog;
  return log;
}
async function traverseTargetAndSync(app, sourceRoot, targetRoot, perTargetLog) {
  async function walk(currentTargetDir) {
    const relDir = path.relative(targetRoot, currentTargetDir);
    const sourceDir = relDir === "" ? sourceRoot : path.join(sourceRoot, relDir);
    await ensureDir(sourceDir);
    const entries = await fs.promises.readdir(currentTargetDir, {
      withFileTypes: true
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
          () => null
        );
        const tgtStat = await fs.promises.stat(targetPath);
        if (!srcStat || !srcStat.isFile()) {
          await ensureDir(path.dirname(sourcePath));
          await copyFileWithMetadata(targetPath, sourcePath);
          delete perTargetLog[relPath];
          continue;
        }
        const diff = Math.abs(tgtStat.mtimeMs - srcStat.mtimeMs);
        if (diff <= MTIME_EPS_MS) {
          continue;
        }
        if (tgtStat.mtimeMs > srcStat.mtimeMs + MTIME_EPS_MS) {
          await ensureDir(path.dirname(sourcePath));
          await copyFileWithMetadata(targetPath, sourcePath);
          delete perTargetLog[relPath];
        } else {
          new import_obsidian.Notice(
            `Vault Folder Sync: \u53CD\u5411\u540C\u6B65\u51B2\u7A81\uFF08\u6E90\u6587\u4EF6\u8F83\u65B0\uFF09\uFF1A${relPath}`
          );
        }
      }
    }
  }
  await walk(targetRoot);
}
async function handleDeletions(app, sourceRoot, targetRoot, perTargetLog, logPath) {
  async function walkSourceDir(currentSourceDir) {
    const relDir = path.relative(sourceRoot, currentSourceDir);
    const currentTargetDir = relDir === "" ? targetRoot : path.join(targetRoot, relDir);
    const entries = await fs.promises.readdir(currentSourceDir, {
      withFileTypes: true
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
            targetRoot
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
            targetRoot
          );
        }
      }
    }
  }
  await walkSourceDir(sourceRoot);
}
async function handleSingleDeletion(app, sourcePath, relPath, perTargetLog, logPath, targetRoot) {
  const srcStat = await fs.promises.stat(sourcePath).catch(() => null);
  if (!srcStat) {
    delete perTargetLog[relPath];
    await appendDeletionLogEntry(logPath, {
      targetRoot,
      relPath,
      deletedAt: null
    });
    return;
  }
  const nowIso = (/* @__PURE__ */ new Date()).toISOString();
  const existing = perTargetLog[relPath];
  if (!existing) {
    perTargetLog[relPath] = nowIso;
    await appendDeletionLogEntry(logPath, {
      targetRoot,
      relPath,
      deletedAt: nowIso
    });
    return;
  }
  const deletionTime = Date.parse(existing);
  if (Number.isNaN(deletionTime)) {
    perTargetLog[relPath] = nowIso;
    await appendDeletionLogEntry(logPath, {
      targetRoot,
      relPath,
      deletedAt: nowIso
    });
    return;
  }
  if (deletionTime > srcStat.mtimeMs + MTIME_EPS_MS) {
    await deletePathIfExists(sourcePath);
    delete perTargetLog[relPath];
    await appendDeletionLogEntry(logPath, {
      targetRoot,
      relPath,
      deletedAt: null
    });
  } else {
    new import_obsidian.Notice(
      `Vault Folder Sync: \u53CD\u5411\u540C\u6B65\u5220\u9664\u51B2\u7A81\uFF08\u6E90\u6587\u4EF6\u8F83\u65B0\uFF09\uFF1A${relPath}`
    );
  }
}
function shouldSkipMetaFile(relPath) {
  const normalized = relPath.split(path.sep).join("/");
  if (normalized === ".obsidian/vault-folder-sync.json" || normalized === ".obsidian/vault-folder-sync-deleted.json") {
    return true;
  }
  return false;
}
async function ensureDir(dirPath) {
  await fs.promises.mkdir(dirPath, { recursive: true });
}
async function pathExists(p) {
  try {
    await fs.promises.access(p);
    return true;
  } catch {
    return false;
  }
}
async function deletePathIfExists(p) {
  if (!await pathExists(p)) return;
  const stat = await fs.promises.stat(p);
  if (stat.isDirectory()) {
    await fs.promises.rm(p, { recursive: true, force: true });
  } else {
    await fs.promises.unlink(p);
  }
}
async function copyFileWithMetadata(sourceFile, targetFile) {
  const stat = await fs.promises.stat(sourceFile);
  await fs.promises.copyFile(sourceFile, targetFile);
  try {
    await fs.promises.utimes(targetFile, stat.atime, stat.mtime);
  } catch (err) {
    console.error(
      "Vault Folder Sync: failed to preserve file times for",
      targetFile,
      err
    );
  }
}

// main.ts
var DEFAULT_SETTINGS = {
  targets: [],
  syncIntervalSeconds: 30
};
var VaultFolderSyncPlugin = class extends import_obsidian2.Plugin {
  constructor() {
    super(...arguments);
    this.settings = DEFAULT_SETTINGS;
    this.changedFiles = /* @__PURE__ */ new Map();
    this.pendingRenames = [];
    this.isSyncing = false;
    this.statusBarItem = null;
  }
  async onload() {
    await this.loadSettings();
    this.statusBarItem = this.addStatusBarItem();
    this.setStatusSyncing();
    this.registerVaultEvents();
    this.registerCommands();
    this.addSettingTab(new VaultFolderSyncSettingTab(this.app, this));
    const intervalMs = (this.settings.syncIntervalSeconds || 30) * 1e3;
    this.registerInterval(
      window.setInterval(() => {
        this.runPeriodicSync();
      }, intervalMs)
    );
    const sourceRoot = this.getVaultRootPath();
    const enabledTargets = this.settings.targets.filter(
      (t) => t.enabled && t.path.trim().length > 0
    );
    this.triggerSync(false).then(() => this.verifyTargetsByMtime(sourceRoot, enabledTargets)).then(() => this.runReverseSyncOnce(sourceRoot)).catch((err) => {
      console.error("Initial sync error:", err);
      new import_obsidian2.Notice(
        "Vault Folder Sync: Initial sync failed, see console for details."
      );
    });
  }
  async runPeriodicSync() {
    if (this.isSyncing) return;
    await this.triggerSync(false);
    const sourceRoot = this.getVaultRootPath();
    await this.runReverseSyncOnce(sourceRoot);
  }
  onunload() {
    this.triggerSync(false).catch((err) => {
      console.error("Final sync error:", err);
    });
  }
  registerVaultEvents() {
    this.registerEvent(
      this.app.vault.on("create", (file) => {
        if (file instanceof import_obsidian2.TFile) {
          this.markFileChanged(file, "created");
        }
      })
    );
    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        if (file instanceof import_obsidian2.TFile) {
          this.markFileChanged(file, "modified");
        }
      })
    );
    this.registerEvent(
      this.app.vault.on("delete", (file) => {
        this.markPathDeleted(file.path);
      })
    );
    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        this.markRename(oldPath, file.path);
      })
    );
  }
  registerCommands() {
    this.addCommand({
      id: "vault-folder-sync-now",
      name: "\u7ACB\u5373\u540C\u6B65\u6240\u6709\u76EE\u6807\u76EE\u5F55",
      callback: () => {
        this.triggerSync(false, true).catch((err) => {
          console.error("Manual sync error:", err);
          new import_obsidian2.Notice("Vault Folder Sync: Manual sync failed, see console for details.");
        });
      }
    });
  }
  markFileChanged(file, type) {
    const relPath = file.path;
    const existing = this.changedFiles.get(relPath);
    if (existing === "deleted") {
      return;
    }
    this.changedFiles.set(relPath, type);
    if (!this.isSyncing) {
      this.setStatusPending();
    }
  }
  markPathDeleted(relPath) {
    this.changedFiles.set(relPath, "deleted");
    if (!this.isSyncing) {
      this.setStatusPending();
    }
  }
  markRename(fromPath, toPath) {
    if (fromPath === toPath) return;
    this.pendingRenames.push({ from: fromPath, to: toPath });
    this.changedFiles.set(toPath, "modified");
    if (!this.isSyncing) {
      this.setStatusPending();
    }
  }
  getVaultRootPath() {
    const adapter = this.app.vault.adapter;
    if (adapter instanceof import_obsidian2.FileSystemAdapter) {
      return adapter.getBasePath();
    }
    throw new Error("Vault Folder Sync works only on desktop with FileSystemAdapter.");
  }
  async triggerSync(forceFull, manual = false) {
    if (this.isSyncing) {
      if (manual) {
        new import_obsidian2.Notice("Vault Folder Sync: \u5DF2\u6709\u540C\u6B65\u4EFB\u52A1\u5728\u6267\u884C\u4E2D\u3002");
      }
      return;
    }
    this.isSyncing = true;
    try {
      const sourceRoot = this.getVaultRootPath();
      const enabledTargets = this.settings.targets.filter(
        (t) => t.enabled && t.path.trim().length > 0
      );
      if (enabledTargets.length === 0) {
        this.setStatusSynced();
        return;
      }
      this.setStatusSyncing();
      for (const target of enabledTargets) {
        const needsFull = forceFull || !await this.isInitialFullSyncMarked(target.path);
        if (needsFull) {
          await this.fullSyncTarget(sourceRoot, target);
        } else {
          await this.incrementalSyncTarget(sourceRoot, target);
        }
      }
      this.changedFiles.clear();
      this.pendingRenames = [];
      this.setStatusSynced();
    } catch (err) {
      console.error("Vault Folder Sync error:", err);
      if (manual) {
        new import_obsidian2.Notice("Vault Folder Sync: \u540C\u6B65\u5931\u8D25\uFF0C\u8BF7\u67E5\u770B\u63A7\u5236\u53F0\u65E5\u5FD7\u3002");
      }
    } finally {
      this.isSyncing = false;
    }
  }
  async isInitialFullSyncMarked(targetRoot) {
    const markerPath = this.getTargetMarkerPath(targetRoot);
    return this.pathExists(markerPath);
  }
  async fullSyncTarget(sourceRoot, target) {
    const targetRoot = target.path;
    await this.ensureDir(targetRoot);
    await this.copyDirectoryRecursive(sourceRoot, targetRoot);
    await this.removeExtraneousInTarget(sourceRoot, targetRoot);
    await this.writeInitialFullSyncMarker(targetRoot);
  }
  async incrementalSyncTarget(sourceRoot, target) {
    const targetRoot = target.path;
    await this.ensureDir(targetRoot);
    for (const rename of this.pendingRenames) {
      const fromAbs = path2.join(targetRoot, rename.from);
      const toAbs = path2.join(targetRoot, rename.to);
      try {
        await this.ensureDir(path2.dirname(toAbs));
        if (await this.pathExists(fromAbs)) {
          await fs2.promises.rename(fromAbs, toAbs);
        }
      } catch (err) {
        console.error("Vault Folder Sync rename error:", err);
      }
    }
    for (const [relPath, changeType] of this.changedFiles) {
      const sourceAbs = path2.join(sourceRoot, relPath);
      const targetAbs = path2.join(targetRoot, relPath);
      try {
        if (changeType === "deleted") {
          await this.deletePathIfExists(targetAbs);
        } else {
          const sourceStat = await fs2.promises.stat(sourceAbs).catch(
            () => null
          );
          if (!sourceStat) {
            continue;
          }
          if (sourceStat.isDirectory()) {
            await this.ensureDir(targetAbs);
          } else {
            await this.ensureDir(path2.dirname(targetAbs));
            await this.copyFileWithMetadata(sourceAbs, targetAbs);
          }
        }
      } catch (err) {
        console.error(
          `Vault Folder Sync incremental error for ${relPath}:`,
          err
        );
      }
    }
  }
  async ensureDir(dirPath) {
    await fs2.promises.mkdir(dirPath, { recursive: true });
  }
  async pathExists(p) {
    try {
      await fs2.promises.access(p);
      return true;
    } catch {
      return false;
    }
  }
  async deletePathIfExists(p) {
    if (!await this.pathExists(p)) return;
    const stat = await fs2.promises.stat(p);
    if (stat.isDirectory()) {
      await fs2.promises.rm(p, { recursive: true, force: true });
    } else {
      await fs2.promises.unlink(p);
    }
  }
  async copyDirectoryRecursive(sourceDir, targetDir) {
    await this.ensureDir(targetDir);
    const entries = await fs2.promises.readdir(sourceDir, {
      withFileTypes: true
    });
    for (const entry of entries) {
      const srcPath = path2.join(sourceDir, entry.name);
      const destPath = path2.join(targetDir, entry.name);
      if (entry.isDirectory()) {
        await this.copyDirectoryRecursive(srcPath, destPath);
      } else if (entry.isFile()) {
        await this.ensureDir(path2.dirname(destPath));
        await this.copyFileWithMetadata(srcPath, destPath);
      }
    }
  }
  async verifyTargetsByMtime(sourceRoot, targets) {
    if (targets.length === 0) return;
    if (this.isSyncing) return;
    this.isSyncing = true;
    this.setStatusSyncing();
    try {
      for (const target of targets) {
        const hasInitialFull = await this.isInitialFullSyncMarked(
          target.path
        );
        if (!hasInitialFull) continue;
        await this.verifyDirectoryByMtime(sourceRoot, target.path);
      }
      this.setStatusSynced();
    } catch (err) {
      console.error(
        "Vault Folder Sync: verifyTargetsByMtime error:",
        err
      );
    } finally {
      this.isSyncing = false;
    }
  }
  async verifyDirectoryByMtime(sourceDir, targetDir) {
    await this.ensureDir(targetDir);
    const entries = await fs2.promises.readdir(sourceDir, {
      withFileTypes: true
    });
    for (const entry of entries) {
      const srcPath = path2.join(sourceDir, entry.name);
      const destPath = path2.join(targetDir, entry.name);
      if (entry.isDirectory()) {
        await this.verifyDirectoryByMtime(srcPath, destPath);
      } else if (entry.isFile()) {
        const srcStat = await fs2.promises.stat(srcPath);
        const destStat = await fs2.promises.stat(destPath).catch(
          () => null
        );
        let needCopy = false;
        if (!destStat || !destStat.isFile()) {
          needCopy = true;
        } else {
          const diff = Math.abs(
            srcStat.mtimeMs - destStat.mtimeMs
          );
          if (diff > 1) {
            needCopy = true;
          }
        }
        if (needCopy) {
          await this.ensureDir(path2.dirname(destPath));
          await this.copyFileWithMetadata(srcPath, destPath);
        }
      }
    }
    const targetEntries = await fs2.promises.readdir(targetDir, {
      withFileTypes: true
    });
    for (const entry of targetEntries) {
      const targetPath = path2.join(targetDir, entry.name);
      const sourcePath = path2.join(sourceDir, entry.name);
      const sourceExists = await this.pathExists(sourcePath);
      if (sourceExists) continue;
      const isMarkerFile = entry.isFile() && entry.name === "vault-folder-sync.json" && path2.basename(targetDir) === ".obsidian";
      if (isMarkerFile) {
        continue;
      }
      await this.deletePathIfExists(targetPath);
    }
  }
  async copyFileWithMetadata(sourceFile, targetFile) {
    const stat = await fs2.promises.stat(sourceFile);
    await fs2.promises.copyFile(sourceFile, targetFile);
    try {
      await fs2.promises.utimes(
        targetFile,
        stat.atime,
        stat.mtime
      );
    } catch (err) {
      console.error("Vault Folder Sync: failed to preserve file times for", targetFile, err);
    }
  }
  async removeExtraneousInTarget(sourceDir, targetDir) {
    if (!await this.pathExists(targetDir)) return;
    const entries = await fs2.promises.readdir(targetDir, {
      withFileTypes: true
    });
    for (const entry of entries) {
      const targetPath = path2.join(targetDir, entry.name);
      const sourcePath = path2.join(sourceDir, entry.name);
      const sourceExists = await this.pathExists(sourcePath);
      if (!sourceExists) {
        await this.deletePathIfExists(targetPath);
        continue;
      }
      if (entry.isDirectory()) {
        const srcStat = await fs2.promises.stat(sourcePath);
        if (srcStat.isDirectory()) {
          await this.removeExtraneousInTarget(sourcePath, targetPath);
        }
      }
    }
  }
  getTargetMarkerPath(targetRoot) {
    return path2.join(targetRoot, ".obsidian", "vault-folder-sync.json");
  }
  async writeInitialFullSyncMarker(targetRoot) {
    const markerPath = this.getTargetMarkerPath(targetRoot);
    await this.ensureDir(path2.dirname(markerPath));
    const content = JSON.stringify(
      {
        initialFullSyncDone: true,
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      },
      null,
      2
    );
    await fs2.promises.writeFile(markerPath, content, "utf8");
  }
  async runReverseSyncOnce(sourceRoot) {
    const reverseTargets = this.settings.targets.filter(
      (t) => t.enabled && t.enableReverseSync && t.path.trim().length > 0
    );
    if (reverseTargets.length === 0) return;
    await runReverseSyncForTargets(
      this.app,
      sourceRoot,
      reverseTargets.map((t) => t.path)
    );
  }
  setStatusPending() {
    if (!this.statusBarItem) return;
    this.statusBarItem.empty();
    const iconSpan = this.statusBarItem.createSpan();
    iconSpan.setText("\u25CF");
    const textSpan = this.statusBarItem.createSpan();
    textSpan.setText(" \u5F85\u540C\u6B65");
    this.statusBarItem.setAttr(
      "title",
      "Vault Folder Sync: \u6709\u672A\u540C\u6B65\u7684\u4FEE\u6539\uFF0C\u7B49\u5F85\u4E0B\u4E00\u6B21\u540C\u6B65\u2026"
    );
  }
  setStatusSyncing() {
    if (!this.statusBarItem) return;
    this.statusBarItem.empty();
    const iconSpan = this.statusBarItem.createSpan();
    iconSpan.setText("\u27F3");
    const textSpan = this.statusBarItem.createSpan();
    textSpan.setText(" \u540C\u6B65\u4E2D");
    this.statusBarItem.setAttr(
      "title",
      "Vault Folder Sync: \u672A\u540C\u6B65\u6216\u6B63\u5728\u540C\u6B65\u4E2D\u2026"
    );
  }
  setStatusSynced() {
    if (!this.statusBarItem) return;
    this.statusBarItem.empty();
    const iconSpan = this.statusBarItem.createSpan();
    iconSpan.setText("\u2714");
    const textSpan = this.statusBarItem.createSpan();
    textSpan.setText(" \u5DF2\u540C\u6B65");
    this.statusBarItem.setAttr(
      "title",
      "Vault Folder Sync: \u4E0A\u6B21\u540C\u6B65\u5DF2\u5B8C\u6210\u3002"
    );
  }
  async loadSettings() {
    const data = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
};
var VaultFolderSyncSettingTab = class extends import_obsidian2.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Vault Folder Sync \u8BBE\u7F6E" });
    const rulesSection = containerEl.createEl("div");
    rulesSection.createEl("h3", { text: "\u540C\u6B65\u89C4\u5219\u6982\u89C8" });
    const forwardList = rulesSection.createEl("ul");
    forwardList.createEl("li", {
      text: "\u6B63\u5411\u540C\u6B65\uFF1A\u9996\u6B21\u6309\u9700\u5168\u91CF\u590D\u5236\uFF0C\u4E4B\u540E\u6309\u6587\u4EF6/\u76EE\u5F55\u53D8\u66F4\u548C\u6700\u540E\u4FEE\u6539\u65F6\u95F4\u8FDB\u884C\u589E\u91CF\u540C\u6B65\uFF0C\u4FDD\u6301\u76EE\u6807\u76EE\u5F55\u4E0E\u5F53\u524D vault \u4E00\u81F4\u3002"
    });
    forwardList.createEl("li", {
      text: "\u542F\u52A8\u65F6\u4F1A\u989D\u5916\u6309\u6700\u540E\u4FEE\u6539\u65F6\u95F4\u5168\u9762\u6821\u9A8C\u4E00\u6B21\uFF0C\u4FEE\u6B63\u9057\u6F0F\u7684\u589E\u91CF\u53D8\u66F4\uFF08\u5305\u542B\u65B0\u589E\u3001\u4FEE\u6539\u3001\u5220\u9664\uFF09\u3002"
    });
    const reverseListTitle = rulesSection.createEl("p", {
      text: "\u53CD\u5411\u540C\u6B65\uFF08\u53EF\u9009\uFF0C\u5BF9\u6BCF\u4E2A\u76EE\u6807\u5355\u72EC\u5F00\u542F\uFF09\uFF1A"
    });
    reverseListTitle.style.marginTop = "0.75em";
    const reverseList = rulesSection.createEl("ul");
    reverseList.createEl("li", {
      text: "\u76EE\u6807\u76EE\u5F55\u4E2D\u6587\u4EF6\u8F83\u65B0\u6216\u65B0\u589E\u65F6\uFF0C\u4F1A\u8986\u76D6/\u5199\u56DE\u5F53\u524D vault\uFF1B\u6E90\u6587\u4EF6\u8F83\u65B0\u65F6\u89C6\u4E3A\u51B2\u7A81\uFF0C\u4EC5\u63D0\u793A\u4E0D\u8986\u76D6\u3002"
    });
    reverseList.createEl("li", {
      text: "\u5220\u9664\u64CD\u4F5C\u57FA\u4E8E .obsidian/vault-folder-sync-deleted.json \u4E2D\u7684\u5220\u9664\u65F6\u95F4\uFF0C\u4E0E\u6E90\u6587\u4EF6\u6700\u540E\u4FEE\u6539\u65F6\u95F4\u6BD4\u8F83\u540E\u518D\u51B3\u5B9A\u662F\u5426\u540C\u6B65\u5220\u9664\u3002"
    });
    rulesSection.createEl("p", {
      text: "\u6CE8\u610F\uFF1A\u53CD\u5411\u540C\u6B65\u4EC5\u505A\u589E\u91CF\u68C0\u67E5\uFF0C\u4E0D\u4F1A\u8FDB\u884C\u5168\u91CF\u8986\u76D6\uFF0C\u8BF7\u8C28\u614E\u5F00\u542F\u3002"
    });
    new import_obsidian2.Setting(containerEl).setName("\u540C\u6B65\u95F4\u9694\uFF08\u79D2\uFF09").setDesc("\u5B9A\u65F6\u589E\u91CF\u540C\u6B65\u7684\u65F6\u95F4\u95F4\u9694\uFF0C\u9ED8\u8BA4 30 \u79D2\u3002").addText(
      (text) => text.setPlaceholder("30").setValue(
        String(this.plugin.settings.syncIntervalSeconds ?? 30)
      ).onChange(async (value) => {
        const num = Number(value);
        if (!Number.isNaN(num) && num > 0) {
          this.plugin.settings.syncIntervalSeconds = num;
          await this.plugin.saveSettings();
          new import_obsidian2.Notice(
            "Vault Folder Sync: \u540C\u6B65\u95F4\u9694\u5DF2\u4FDD\u5B58\uFF0C\u4E0B\u6B21\u91CD\u542F\u63D2\u4EF6\u540E\u751F\u6548\u3002"
          );
        }
      })
    );
    containerEl.createEl("h3", { text: "\u540C\u6B65\u76EE\u6807\u76EE\u5F55" });
    this.plugin.settings.targets.forEach((target) => {
      const s = new import_obsidian2.Setting(containerEl).setName(target.path || "(\u672A\u8BBE\u7F6E\u8DEF\u5F84)").setDesc("\u5C06\u5F53\u524D vault \u540C\u6B65\u5230\u8BE5\u76EE\u5F55\u3002").addToggle((toggle) => {
        const wrapper = toggle.toggleEl.parentElement;
        toggle.setValue(target.enabled).setTooltip("\u542F\u7528\u6B63\u5411\u540C\u6B65\uFF08\u4ECE\u5F53\u524D vault \u540C\u6B65\u5230\u8BE5\u76EE\u5F55\uFF09").onChange(async (value) => {
          target.enabled = value;
          await this.plugin.saveSettings();
        });
        if (wrapper) {
          wrapper.style.display = "flex";
          wrapper.style.alignItems = "center";
          const label = wrapper.createSpan({ text: "\u6B63\u5411" });
          label.style.marginLeft = "0.25em";
          label.style.whiteSpace = "nowrap";
        }
      }).addToggle((toggle) => {
        const wrapper = toggle.toggleEl.parentElement;
        toggle.setValue(target.enableReverseSync ?? false).setTooltip("\u542F\u7528\u53CD\u5411\u540C\u6B65\uFF08\u4ECE\u8BE5\u76EE\u5F55\u540C\u6B65\u56DE\u5F53\u524D vault\uFF09").onChange(async (value) => {
          target.enableReverseSync = value;
          await this.plugin.saveSettings();
        });
        if (wrapper) {
          wrapper.style.display = "flex";
          wrapper.style.alignItems = "center";
          const label = wrapper.createSpan({ text: "\u53CD\u5411" });
          label.style.marginLeft = "0.25em";
          label.style.whiteSpace = "nowrap";
        }
      }).addText(
        (text) => text.setPlaceholder("\u8F93\u5165\u76EE\u6807\u76EE\u5F55\u7684\u7EDD\u5BF9\u8DEF\u5F84").setValue(target.path).onChange(async (value) => {
          target.path = value.trim();
          await this.plugin.saveSettings();
        })
      ).addExtraButton(
        (button) => button.setIcon("trash").setTooltip("\u5220\u9664\u8BE5\u76EE\u6807\u76EE\u5F55\u914D\u7F6E").onClick(async () => {
          this.plugin.settings.targets = this.plugin.settings.targets.filter(
            (t) => t.id !== target.id
          );
          await this.plugin.saveSettings();
          this.display();
        })
      );
      s.infoEl.style.whiteSpace = "pre-wrap";
    });
    containerEl.createEl("h4", { text: "\u65B0\u589E\u76EE\u6807\u76EE\u5F55" });
    let newPathValue = "";
    new import_obsidian2.Setting(containerEl).setName("\u76EE\u6807\u76EE\u5F55\u8DEF\u5F84").setDesc("\u8F93\u5165\u4E00\u4E2A\u65B0\u7684\u76EE\u6807\u76EE\u5F55\u7EDD\u5BF9\u8DEF\u5F84\uFF0C\u7528\u4E8E\u540C\u6B65\u672C vault\u3002").addText(
      (text) => text.setPlaceholder("/path/to/another/folder").onChange((value) => {
        newPathValue = value.trim();
      })
    ).addButton(
      (button) => button.setButtonText("\u6DFB\u52A0").onClick(async () => {
        if (!newPathValue) {
          new import_obsidian2.Notice("\u8BF7\u5148\u8F93\u5165\u76EE\u6807\u76EE\u5F55\u8DEF\u5F84\u3002");
          return;
        }
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        this.plugin.settings.targets.push({
          id,
          path: newPathValue,
          enabled: true,
          lastFullSyncDone: false
        });
        await this.plugin.saveSettings();
        newPathValue = "";
        this.display();
      })
    );
  }
};
