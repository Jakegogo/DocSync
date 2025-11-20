"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runReverseSyncForTargets = runReverseSyncForTargets;
const obsidian_1 = require("obsidian");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const MTIME_EPS_MS = 1;
function runReverseSyncForTargets(app, sourceRoot, targetRoots) {
    return __awaiter(this, void 0, void 0, function* () {
        if (targetRoots.length === 0)
            return;
        const deletionLogPath = getDeletionLogPath(sourceRoot);
        let log = yield loadDeletionLog(deletionLogPath);
        for (const targetRoot of targetRoots) {
            log = yield syncOneTarget(app, sourceRoot, targetRoot, log, deletionLogPath);
        }
    });
}
function getDeletionLogPath(sourceRoot) {
    return path.join(sourceRoot, ".obsidian", "vault-folder-sync-deleted.json");
}
function loadDeletionLog(p) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const raw = yield fs.promises.readFile(p, "utf8");
            const log = {};
            const lines = raw.split(/\r?\n/);
            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed)
                    continue;
                let entry;
                try {
                    entry = JSON.parse(trimmed);
                }
                catch (_a) {
                    continue;
                }
                if (!entry.targetRoot || !entry.relPath)
                    continue;
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
        }
        catch (_b) {
            return {};
        }
    });
}
function appendDeletionLogEntry(logPath, entry) {
    return __awaiter(this, void 0, void 0, function* () {
        yield ensureDir(path.dirname(logPath));
        const line = JSON.stringify(entry);
        yield fs.promises.appendFile(logPath, line + "\n", "utf8");
    });
}
function syncOneTarget(app, sourceRoot, targetRoot, log, logPath) {
    return __awaiter(this, void 0, void 0, function* () {
        const normalizedTarget = path.resolve(targetRoot);
        if (!log[normalizedTarget]) {
            log[normalizedTarget] = {};
        }
        const perTargetLog = log[normalizedTarget];
        yield ensureDir(normalizedTarget);
        // 第一步：遍历目标目录，将新增/更新的内容反向同步回源目录
        yield traverseTargetAndSync(app, sourceRoot, normalizedTarget, perTargetLog);
        // 第二步：遍历源目录，处理目标目录中已删除的内容（基于删除时间和删除日志）
        yield handleDeletions(app, sourceRoot, normalizedTarget, perTargetLog, logPath);
        log[normalizedTarget] = perTargetLog;
        return log;
    });
}
function traverseTargetAndSync(app, sourceRoot, targetRoot, perTargetLog) {
    return __awaiter(this, void 0, void 0, function* () {
        function walk(currentTargetDir) {
            return __awaiter(this, void 0, void 0, function* () {
                const relDir = path.relative(targetRoot, currentTargetDir);
                const sourceDir = relDir === "" ? sourceRoot : path.join(sourceRoot, relDir);
                yield ensureDir(sourceDir);
                const entries = yield fs.promises.readdir(currentTargetDir, {
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
                        yield walk(targetPath);
                    }
                    else if (entry.isFile()) {
                        const srcStat = yield fs.promises.stat(sourcePath).catch(() => null);
                        const tgtStat = yield fs.promises.stat(targetPath);
                        // 目标新增文件：直接拷贝到源目录
                        if (!srcStat || !srcStat.isFile()) {
                            yield ensureDir(path.dirname(sourcePath));
                            yield copyFileWithMetadata(targetPath, sourcePath);
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
                            yield ensureDir(path.dirname(sourcePath));
                            yield copyFileWithMetadata(targetPath, sourcePath);
                            delete perTargetLog[relPath];
                        }
                        else {
                            // 源文件比目标文件新：认为冲突，提示用户
                            new obsidian_1.Notice(`Vault Folder Sync: 反向同步冲突（源文件较新）：${relPath}`);
                        }
                    }
                }
            });
        }
        yield walk(targetRoot);
    });
}
function handleDeletions(app, sourceRoot, targetRoot, perTargetLog, logPath) {
    return __awaiter(this, void 0, void 0, function* () {
        function walkSourceDir(currentSourceDir) {
            return __awaiter(this, void 0, void 0, function* () {
                const relDir = path.relative(sourceRoot, currentSourceDir);
                const currentTargetDir = relDir === "" ? targetRoot : path.join(targetRoot, relDir);
                const entries = yield fs.promises.readdir(currentSourceDir, {
                    withFileTypes: true,
                });
                for (const entry of entries) {
                    const sourcePath = path.join(currentSourceDir, entry.name);
                    const relPath = path.relative(sourceRoot, sourcePath);
                    const targetPath = path.join(targetRoot, relPath);
                    if (shouldSkipMetaFile(relPath)) {
                        continue;
                    }
                    const targetExists = yield pathExists(targetPath);
                    if (entry.isDirectory()) {
                        if (targetExists) {
                            yield walkSourceDir(sourcePath);
                        }
                        else {
                            yield handleSingleDeletion(app, sourcePath, relPath, perTargetLog, logPath, targetRoot);
                        }
                    }
                    else if (entry.isFile()) {
                        if (!targetExists) {
                            yield handleSingleDeletion(app, sourcePath, relPath, perTargetLog, logPath, targetRoot);
                        }
                    }
                }
            });
        }
        yield walkSourceDir(sourceRoot);
    });
}
function handleSingleDeletion(app, sourcePath, relPath, perTargetLog, logPath, targetRoot) {
    return __awaiter(this, void 0, void 0, function* () {
        const srcStat = yield fs.promises.stat(sourcePath).catch(() => null);
        if (!srcStat) {
            // 源文件本身已不存在，清理日志即可
            delete perTargetLog[relPath];
            yield appendDeletionLogEntry(logPath, {
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
            yield appendDeletionLogEntry(logPath, {
                targetRoot,
                relPath,
                deletedAt: nowIso,
            });
            return;
        }
        const deletionTime = Date.parse(existing);
        if (Number.isNaN(deletionTime)) {
            perTargetLog[relPath] = nowIso;
            yield appendDeletionLogEntry(logPath, {
                targetRoot,
                relPath,
                deletedAt: nowIso,
            });
            return;
        }
        // 删除时间需要晚于源文件的最后修改时间，才会真正删除源文件
        if (deletionTime > srcStat.mtimeMs + MTIME_EPS_MS) {
            yield deletePathIfExists(sourcePath);
            delete perTargetLog[relPath];
            yield appendDeletionLogEntry(logPath, {
                targetRoot,
                relPath,
                deletedAt: null,
            });
        }
        else {
            new obsidian_1.Notice(`Vault Folder Sync: 反向同步删除冲突（源文件较新）：${relPath}`);
        }
    });
}
function shouldSkipMetaFile(relPath) {
    const normalized = relPath.split(path.sep).join("/");
    if (normalized === ".obsidian/vault-folder-sync.json" ||
        normalized === ".obsidian/vault-folder-sync-deleted.json") {
        return true;
    }
    return false;
}
function ensureDir(dirPath) {
    return __awaiter(this, void 0, void 0, function* () {
        yield fs.promises.mkdir(dirPath, { recursive: true });
    });
}
function pathExists(p) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            yield fs.promises.access(p);
            return true;
        }
        catch (_a) {
            return false;
        }
    });
}
function deletePathIfExists(p) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!(yield pathExists(p)))
            return;
        const stat = yield fs.promises.stat(p);
        if (stat.isDirectory()) {
            yield fs.promises.rm(p, { recursive: true, force: true });
        }
        else {
            yield fs.promises.unlink(p);
        }
    });
}
function copyFileWithMetadata(sourceFile, targetFile) {
    return __awaiter(this, void 0, void 0, function* () {
        const stat = yield fs.promises.stat(sourceFile);
        yield fs.promises.copyFile(sourceFile, targetFile);
        try {
            yield fs.promises.utimes(targetFile, stat.atime, stat.mtime);
        }
        catch (err) {
            console.error("Vault Folder Sync: failed to preserve file times for", targetFile, err);
        }
    });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmV2ZXJzZS1zeW5jLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsicmV2ZXJzZS1zeW5jLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBa0JBLDREQW1CQztBQXJDRCx1Q0FBdUM7QUFDdkMsdUNBQXlCO0FBQ3pCLDJDQUE2QjtBQWM3QixNQUFNLFlBQVksR0FBRyxDQUFDLENBQUM7QUFFdkIsU0FBc0Isd0JBQXdCLENBQzdDLEdBQVEsRUFDUixVQUFrQixFQUNsQixXQUFxQjs7UUFFckIsSUFBSSxXQUFXLENBQUMsTUFBTSxLQUFLLENBQUM7WUFBRSxPQUFPO1FBRXJDLE1BQU0sZUFBZSxHQUFHLGtCQUFrQixDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBQ3ZELElBQUksR0FBRyxHQUFHLE1BQU0sZUFBZSxDQUFDLGVBQWUsQ0FBQyxDQUFDO1FBRWpELEtBQUssTUFBTSxVQUFVLElBQUksV0FBVyxFQUFFLENBQUM7WUFDdEMsR0FBRyxHQUFHLE1BQU0sYUFBYSxDQUN4QixHQUFHLEVBQ0gsVUFBVSxFQUNWLFVBQVUsRUFDVixHQUFHLEVBQ0gsZUFBZSxDQUNmLENBQUM7UUFDSCxDQUFDO0lBQ0YsQ0FBQztDQUFBO0FBRUQsU0FBUyxrQkFBa0IsQ0FBQyxVQUFrQjtJQUM3QyxPQUFPLElBQUksQ0FBQyxJQUFJLENBQ2YsVUFBVSxFQUNWLFdBQVcsRUFDWCxnQ0FBZ0MsQ0FDaEMsQ0FBQztBQUNILENBQUM7QUFFRCxTQUFlLGVBQWUsQ0FBQyxDQUFTOztRQUN2QyxJQUFJLENBQUM7WUFDSixNQUFNLEdBQUcsR0FBRyxNQUFNLEVBQUUsQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLENBQUMsRUFBRSxNQUFNLENBQUMsQ0FBQztZQUNsRCxNQUFNLEdBQUcsR0FBZ0IsRUFBRSxDQUFDO1lBQzVCLE1BQU0sS0FBSyxHQUFHLEdBQUcsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLENB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LElBQUksSUFBSSxDQUFDLFdBQVcsRUFBRSxFQUFFLENBQUM7WUFDeEIsTUFBTSxFQUFFLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsRUFBRSxTQUFTLEVBQUUsSUFBSSxFQUFFLEtBQUssRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO1FBQzNELENBQUM7YUFBTSxDQUFDO1lBQ1AsTUFBTSxFQUFFLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUM3QixDQUFDO0lBQ0YsQ0FBQztDQUFBO0FBRUQsU0FBZSxvQkFBb0IsQ0FBQyxVQUFrQixFQUFFLFVBQWtCOztRQUN6RSxNQUFNLElBQUksR0FBRyxNQUFNLEVBQUUsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBQ2hELE1BQU0sRUFBRSxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsVUFBVSxFQUFFLFVBQVUsQ0FBQyxDQUFDO1FBQ25ELElBQUksQ0FBQztZQUNKLE1BQU0sRUFBRSxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsVUFBVSxFQUFFLElBQUksQ0FBQyxLQUFLLEVBQUUsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQzlELENBQUM7UUFBQyxPQUFPLEdBQUcsRUFBRSxDQUFDO1lBQ2QsT0FBTyxDQUFDLEtBQUssQ0FDWixzREFBc0QsRUFDdEQsVUFBVSxFQUNWLEdBQUcsQ0FDSCxDQUFDO1FBQ0gsQ0FBQztJQUNGLENBQUM7Q0FBQSIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IEFwcCwgTm90aWNlIH0gZnJvbSBcIm9ic2lkaWFuXCI7XG5pbXBvcnQgKiBhcyBmcyBmcm9tIFwiZnNcIjtcbmltcG9ydCAqIGFzIHBhdGggZnJvbSBcInBhdGhcIjtcblxuaW50ZXJmYWNlIERlbGV0aW9uTG9nIHtcblx0W3RhcmdldFJvb3Q6IHN0cmluZ106IHtcblx0XHRbcmVsUGF0aDogc3RyaW5nXTogc3RyaW5nO1xuXHR9O1xufVxuXG5pbnRlcmZhY2UgRGVsZXRpb25Mb2dFbnRyeSB7XG5cdHRhcmdldFJvb3Q6IHN0cmluZztcblx0cmVsUGF0aDogc3RyaW5nO1xuXHRkZWxldGVkQXQ6IHN0cmluZyB8IG51bGw7XG59XG5cbmNvbnN0IE1USU1FX0VQU19NUyA9IDE7XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBydW5SZXZlcnNlU3luY0ZvclRhcmdldHMoXG5cdGFwcDogQXBwLFxuXHRzb3VyY2VSb290OiBzdHJpbmcsXG5cdHRhcmdldFJvb3RzOiBzdHJpbmdbXSxcbikge1xuXHRpZiAodGFyZ2V0Um9vdHMubGVuZ3RoID09PSAwKSByZXR1cm47XG5cblx0Y29uc3QgZGVsZXRpb25Mb2dQYXRoID0gZ2V0RGVsZXRpb25Mb2dQYXRoKHNvdXJjZVJvb3QpO1xuXHRsZXQgbG9nID0gYXdhaXQgbG9hZERlbGV0aW9uTG9nKGRlbGV0aW9uTG9nUGF0aCk7XG5cblx0Zm9yIChjb25zdCB0YXJnZXRSb290IG9mIHRhcmdldFJvb3RzKSB7XG5cdFx0bG9nID0gYXdhaXQgc3luY09uZVRhcmdldChcblx0XHRcdGFwcCxcblx0XHRcdHNvdXJjZVJvb3QsXG5cdFx0XHR0YXJnZXRSb290LFxuXHRcdFx0bG9nLFxuXHRcdFx0ZGVsZXRpb25Mb2dQYXRoLFxuXHRcdCk7XG5cdH1cbn1cblxuZnVuY3Rpb24gZ2V0RGVsZXRpb25Mb2dQYXRoKHNvdXJjZVJvb3Q6IHN0cmluZyk6IHN0cmluZyB7XG5cdHJldHVybiBwYXRoLmpvaW4oXG5cdFx0c291cmNlUm9vdCxcblx0XHRcIi5vYnNpZGlhblwiLFxuXHRcdFwidmF1bHQtZm9sZGVyLXN5bmMtZGVsZXRlZC5qc29uXCIsXG5cdCk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGxvYWREZWxldGlvbkxvZyhwOiBzdHJpbmcpOiBQcm9taXNlPERlbGV0aW9uTG9nPiB7XG5cdHRyeSB7XG5cdFx0Y29uc3QgcmF3ID0gYXdhaXQgZnMucHJvbWlzZXMucmVhZEZpbGUocCwgXCJ1dGY4XCIpO1xuXHRcdGNvbnN0IGxvZzogRGVsZXRpb25Mb2cgPSB7fTtcblx0XHRjb25zdCBsaW5lcyA9IHJhdy5zcGxpdCgvXFxyP1xcbi8pO1xuXHRcdGZvciAoY29uc3QgbGluZSBvZiBsaW5lcykge1xuXHRcdFx0Y29uc3QgdHJpbW1lZCA9IGxpbmUudHJpbSgpO1xuXHRcdFx0aWYgKCF0cmltbWVkKSBjb250aW51ZTtcblx0XHRcdGxldCBlbnRyeTogRGVsZXRpb25Mb2dFbnRyeTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGVudHJ5ID0gSlNPTi5wYXJzZSh0cmltbWVkKSBhcyBEZWxldGlvbkxvZ0VudHJ5O1xuXHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCFlbnRyeS50YXJnZXRSb290IHx8ICFlbnRyeS5yZWxQYXRoKSBjb250aW51ZTtcblx0XHRcdGlmICghbG9nW2VudHJ5LnRhcmdldFJvb3RdKSB7XG5cdFx0XHRcdGxvZ1tlbnRyeS50YXJnZXRSb290XSA9IHt9O1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgZXhpc3RpbmcgPSBsb2dbZW50cnkudGFyZ2V0Um9vdF1bZW50cnkucmVsUGF0aF07XG5cdFx0XHRpZiAoZW50cnkuZGVsZXRlZEF0ID09IG51bGwpIHtcblx0XHRcdFx0Ly8g5qCH6K6w5Li65riF55CGXG5cdFx0XHRcdGRlbGV0ZSBsb2dbZW50cnkudGFyZ2V0Um9vdF1bZW50cnkucmVsUGF0aF07XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCFleGlzdGluZykge1xuXHRcdFx0XHRsb2dbZW50cnkudGFyZ2V0Um9vdF1bZW50cnkucmVsUGF0aF0gPSBlbnRyeS5kZWxldGVkQXQ7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgZXhpc3RpbmdUcyA9IERhdGUucGFyc2UoZXhpc3RpbmcpO1xuXHRcdFx0Y29uc3QgbmV3VHMgPSBEYXRlLnBhcnNlKGVudHJ5LmRlbGV0ZWRBdCk7XG5cdFx0XHRpZiAoIU51bWJlci5pc05hTihuZXdUcykgJiYgbmV3VHMgPj0gZXhpc3RpbmdUcykge1xuXHRcdFx0XHRsb2dbZW50cnkudGFyZ2V0Um9vdF1bZW50cnkucmVsUGF0aF0gPSBlbnRyeS5kZWxldGVkQXQ7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBsb2c7XG5cdH0gY2F0Y2gge1xuXHRcdHJldHVybiB7fTtcblx0fVxufVxuXG5hc3luYyBmdW5jdGlvbiBhcHBlbmREZWxldGlvbkxvZ0VudHJ5KFxuXHRsb2dQYXRoOiBzdHJpbmcsXG5cdGVudHJ5OiBEZWxldGlvbkxvZ0VudHJ5LFxuKSB7XG5cdGF3YWl0IGVuc3VyZURpcihwYXRoLmRpcm5hbWUobG9nUGF0aCkpO1xuXHRjb25zdCBsaW5lID0gSlNPTi5zdHJpbmdpZnkoZW50cnkpO1xuXHRhd2FpdCBmcy5wcm9taXNlcy5hcHBlbmRGaWxlKGxvZ1BhdGgsIGxpbmUgKyBcIlxcblwiLCBcInV0ZjhcIik7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHN5bmNPbmVUYXJnZXQoXG5cdGFwcDogQXBwLFxuXHRzb3VyY2VSb290OiBzdHJpbmcsXG5cdHRhcmdldFJvb3Q6IHN0cmluZyxcblx0bG9nOiBEZWxldGlvbkxvZyxcblx0bG9nUGF0aDogc3RyaW5nLFxuKTogUHJvbWlzZTxEZWxldGlvbkxvZz4ge1xuXHRjb25zdCBub3JtYWxpemVkVGFyZ2V0ID0gcGF0aC5yZXNvbHZlKHRhcmdldFJvb3QpO1xuXHRpZiAoIWxvZ1tub3JtYWxpemVkVGFyZ2V0XSkge1xuXHRcdGxvZ1tub3JtYWxpemVkVGFyZ2V0XSA9IHt9O1xuXHR9XG5cdGNvbnN0IHBlclRhcmdldExvZyA9IGxvZ1tub3JtYWxpemVkVGFyZ2V0XTtcblxuXHRhd2FpdCBlbnN1cmVEaXIobm9ybWFsaXplZFRhcmdldCk7XG5cblx0Ly8g56ys5LiA5q2l77ya6YGN5Y6G55uu5qCH55uu5b2V77yM5bCG5paw5aKeL+abtOaWsOeahOWGheWuueWPjeWQkeWQjOatpeWbnua6kOebruW9lVxuXHRhd2FpdCB0cmF2ZXJzZVRhcmdldEFuZFN5bmMoYXBwLCBzb3VyY2VSb290LCBub3JtYWxpemVkVGFyZ2V0LCBwZXJUYXJnZXRMb2cpO1xuXG5cdC8vIOesrOS6jOatpe+8mumBjeWOhua6kOebruW9le+8jOWkhOeQhuebruagh+ebruW9leS4reW3suWIoOmZpOeahOWGheWuue+8iOWfuuS6juWIoOmZpOaXtumXtOWSjOWIoOmZpOaXpeW/l++8iVxuXHRhd2FpdCBoYW5kbGVEZWxldGlvbnMoXG5cdFx0YXBwLFxuXHRcdHNvdXJjZVJvb3QsXG5cdFx0bm9ybWFsaXplZFRhcmdldCxcblx0XHRwZXJUYXJnZXRMb2csXG5cdFx0bG9nUGF0aCxcblx0KTtcblxuXHRsb2dbbm9ybWFsaXplZFRhcmdldF0gPSBwZXJUYXJnZXRMb2c7XG5cdHJldHVybiBsb2c7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHRyYXZlcnNlVGFyZ2V0QW5kU3luYyhcblx0YXBwOiBBcHAsXG5cdHNvdXJjZVJvb3Q6IHN0cmluZyxcblx0dGFyZ2V0Um9vdDogc3RyaW5nLFxuXHRwZXJUYXJnZXRMb2c6IHsgW3JlbFBhdGg6IHN0cmluZ106IHN0cmluZyB9LFxuKSB7XG5cdGFzeW5jIGZ1bmN0aW9uIHdhbGsoY3VycmVudFRhcmdldERpcjogc3RyaW5nKSB7XG5cdFx0Y29uc3QgcmVsRGlyID0gcGF0aC5yZWxhdGl2ZSh0YXJnZXRSb290LCBjdXJyZW50VGFyZ2V0RGlyKTtcblx0XHRjb25zdCBzb3VyY2VEaXIgPVxuXHRcdFx0cmVsRGlyID09PSBcIlwiID8gc291cmNlUm9vdCA6IHBhdGguam9pbihzb3VyY2VSb290LCByZWxEaXIpO1xuXG5cdFx0YXdhaXQgZW5zdXJlRGlyKHNvdXJjZURpcik7XG5cblx0XHRjb25zdCBlbnRyaWVzID0gYXdhaXQgZnMucHJvbWlzZXMucmVhZGRpcihjdXJyZW50VGFyZ2V0RGlyLCB7XG5cdFx0XHR3aXRoRmlsZVR5cGVzOiB0cnVlLFxuXHRcdH0pO1xuXG5cdFx0Zm9yIChjb25zdCBlbnRyeSBvZiBlbnRyaWVzKSB7XG5cdFx0XHRjb25zdCB0YXJnZXRQYXRoID0gcGF0aC5qb2luKGN1cnJlbnRUYXJnZXREaXIsIGVudHJ5Lm5hbWUpO1xuXHRcdFx0Y29uc3QgcmVsUGF0aCA9IHBhdGgucmVsYXRpdmUodGFyZ2V0Um9vdCwgdGFyZ2V0UGF0aCk7XG5cdFx0XHRjb25zdCBzb3VyY2VQYXRoID0gcGF0aC5qb2luKHNvdXJjZVJvb3QsIHJlbFBhdGgpO1xuXG5cdFx0XHRpZiAoc2hvdWxkU2tpcE1ldGFGaWxlKHJlbFBhdGgpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoZW50cnkuaXNEaXJlY3RvcnkoKSkge1xuXHRcdFx0XHRhd2FpdCB3YWxrKHRhcmdldFBhdGgpO1xuXHRcdFx0fSBlbHNlIGlmIChlbnRyeS5pc0ZpbGUoKSkge1xuXHRcdFx0XHRjb25zdCBzcmNTdGF0ID0gYXdhaXQgZnMucHJvbWlzZXMuc3RhdChzb3VyY2VQYXRoKS5jYXRjaChcblx0XHRcdFx0XHQoKSA9PiBudWxsLFxuXHRcdFx0XHQpO1xuXHRcdFx0XHRjb25zdCB0Z3RTdGF0ID0gYXdhaXQgZnMucHJvbWlzZXMuc3RhdCh0YXJnZXRQYXRoKTtcblxuXHRcdFx0XHQvLyDnm67moIfmlrDlop7mlofku7bvvJrnm7TmjqXmi7fotJ3liLDmupDnm67lvZVcblx0XHRcdFx0aWYgKCFzcmNTdGF0IHx8ICFzcmNTdGF0LmlzRmlsZSgpKSB7XG5cdFx0XHRcdFx0YXdhaXQgZW5zdXJlRGlyKHBhdGguZGlybmFtZShzb3VyY2VQYXRoKSk7XG5cdFx0XHRcdFx0YXdhaXQgY29weUZpbGVXaXRoTWV0YWRhdGEodGFyZ2V0UGF0aCwgc291cmNlUGF0aCk7XG5cdFx0XHRcdFx0ZGVsZXRlIHBlclRhcmdldExvZ1tyZWxQYXRoXTtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IGRpZmYgPSBNYXRoLmFicyh0Z3RTdGF0Lm10aW1lTXMgLSBzcmNTdGF0Lm10aW1lTXMpO1xuXHRcdFx0XHRpZiAoZGlmZiA8PSBNVElNRV9FUFNfTVMpIHtcblx0XHRcdFx0XHQvLyDorqTkuLrkuIDoh7TvvIzml6DpnIDlpITnkIZcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmICh0Z3RTdGF0Lm10aW1lTXMgPiBzcmNTdGF0Lm10aW1lTXMgKyBNVElNRV9FUFNfTVMpIHtcblx0XHRcdFx0XHQvLyDnm67moIfmlofku7bmr5TmupDmlofku7bmlrDvvJrlj43lkJHopobnm5bmupDmlofku7Zcblx0XHRcdFx0XHRhd2FpdCBlbnN1cmVEaXIocGF0aC5kaXJuYW1lKHNvdXJjZVBhdGgpKTtcblx0XHRcdFx0XHRhd2FpdCBjb3B5RmlsZVdpdGhNZXRhZGF0YSh0YXJnZXRQYXRoLCBzb3VyY2VQYXRoKTtcblx0XHRcdFx0XHRkZWxldGUgcGVyVGFyZ2V0TG9nW3JlbFBhdGhdO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdC8vIOa6kOaWh+S7tuavlOebruagh+aWh+S7tuaWsO+8muiupOS4uuWGsueqge+8jOaPkOekuueUqOaIt1xuXHRcdFx0XHRcdG5ldyBOb3RpY2UoXG5cdFx0XHRcdFx0XHRgVmF1bHQgRm9sZGVyIFN5bmM6IOWPjeWQkeWQjOatpeWGsueqge+8iOa6kOaWh+S7tui+g+aWsO+8ie+8miR7cmVsUGF0aH1gLFxuXHRcdFx0XHRcdCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRhd2FpdCB3YWxrKHRhcmdldFJvb3QpO1xufVxuXG5hc3luYyBmdW5jdGlvbiBoYW5kbGVEZWxldGlvbnMoXG5cdGFwcDogQXBwLFxuXHRzb3VyY2VSb290OiBzdHJpbmcsXG5cdHRhcmdldFJvb3Q6IHN0cmluZyxcblx0cGVyVGFyZ2V0TG9nOiB7IFtyZWxQYXRoOiBzdHJpbmddOiBzdHJpbmcgfSxcblx0bG9nUGF0aDogc3RyaW5nLFxuKSB7XG5cdGFzeW5jIGZ1bmN0aW9uIHdhbGtTb3VyY2VEaXIoY3VycmVudFNvdXJjZURpcjogc3RyaW5nKSB7XG5cdFx0Y29uc3QgcmVsRGlyID0gcGF0aC5yZWxhdGl2ZShzb3VyY2VSb290LCBjdXJyZW50U291cmNlRGlyKTtcblx0XHRjb25zdCBjdXJyZW50VGFyZ2V0RGlyID1cblx0XHRcdHJlbERpciA9PT0gXCJcIiA/IHRhcmdldFJvb3QgOiBwYXRoLmpvaW4odGFyZ2V0Um9vdCwgcmVsRGlyKTtcblxuXHRcdGNvbnN0IGVudHJpZXMgPSBhd2FpdCBmcy5wcm9taXNlcy5yZWFkZGlyKGN1cnJlbnRTb3VyY2VEaXIsIHtcblx0XHRcdHdpdGhGaWxlVHlwZXM6IHRydWUsXG5cdFx0fSk7XG5cblx0XHRmb3IgKGNvbnN0IGVudHJ5IG9mIGVudHJpZXMpIHtcblx0XHRcdGNvbnN0IHNvdXJjZVBhdGggPSBwYXRoLmpvaW4oY3VycmVudFNvdXJjZURpciwgZW50cnkubmFtZSk7XG5cdFx0XHRjb25zdCByZWxQYXRoID0gcGF0aC5yZWxhdGl2ZShzb3VyY2VSb290LCBzb3VyY2VQYXRoKTtcblx0XHRcdGNvbnN0IHRhcmdldFBhdGggPSBwYXRoLmpvaW4odGFyZ2V0Um9vdCwgcmVsUGF0aCk7XG5cblx0XHRcdGlmIChzaG91bGRTa2lwTWV0YUZpbGUocmVsUGF0aCkpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHRhcmdldEV4aXN0cyA9IGF3YWl0IHBhdGhFeGlzdHModGFyZ2V0UGF0aCk7XG5cblx0XHRcdGlmIChlbnRyeS5pc0RpcmVjdG9yeSgpKSB7XG5cdFx0XHRcdGlmICh0YXJnZXRFeGlzdHMpIHtcblx0XHRcdFx0XHRhd2FpdCB3YWxrU291cmNlRGlyKHNvdXJjZVBhdGgpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGF3YWl0IGhhbmRsZVNpbmdsZURlbGV0aW9uKFxuXHRcdFx0XHRcdFx0YXBwLFxuXHRcdFx0XHRcdFx0c291cmNlUGF0aCxcblx0XHRcdFx0XHRcdHJlbFBhdGgsXG5cdFx0XHRcdFx0XHRwZXJUYXJnZXRMb2csXG5cdFx0XHRcdFx0XHRsb2dQYXRoLFxuXHRcdFx0XHRcdFx0dGFyZ2V0Um9vdCxcblx0XHRcdFx0XHQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2UgaWYgKGVudHJ5LmlzRmlsZSgpKSB7XG5cdFx0XHRcdGlmICghdGFyZ2V0RXhpc3RzKSB7XG5cdFx0XHRcdFx0YXdhaXQgaGFuZGxlU2luZ2xlRGVsZXRpb24oXG5cdFx0XHRcdFx0XHRhcHAsXG5cdFx0XHRcdFx0XHRzb3VyY2VQYXRoLFxuXHRcdFx0XHRcdFx0cmVsUGF0aCxcblx0XHRcdFx0XHRcdHBlclRhcmdldExvZyxcblx0XHRcdFx0XHRcdGxvZ1BhdGgsXG5cdFx0XHRcdFx0XHR0YXJnZXRSb290LFxuXHRcdFx0XHRcdCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRhd2FpdCB3YWxrU291cmNlRGlyKHNvdXJjZVJvb3QpO1xufVxuXG5hc3luYyBmdW5jdGlvbiBoYW5kbGVTaW5nbGVEZWxldGlvbihcblx0YXBwOiBBcHAsXG5cdHNvdXJjZVBhdGg6IHN0cmluZyxcblx0cmVsUGF0aDogc3RyaW5nLFxuXHRwZXJUYXJnZXRMb2c6IHsgW3JlbFBhdGg6IHN0cmluZ106IHN0cmluZyB9LFxuXHRsb2dQYXRoOiBzdHJpbmcsXG5cdHRhcmdldFJvb3Q6IHN0cmluZyxcbikge1xuXHRjb25zdCBzcmNTdGF0ID0gYXdhaXQgZnMucHJvbWlzZXMuc3RhdChzb3VyY2VQYXRoKS5jYXRjaCgoKSA9PiBudWxsKTtcblx0aWYgKCFzcmNTdGF0KSB7XG5cdFx0Ly8g5rqQ5paH5Lu25pys6Lqr5bey5LiN5a2Y5Zyo77yM5riF55CG5pel5b+X5Y2z5Y+vXG5cdFx0ZGVsZXRlIHBlclRhcmdldExvZ1tyZWxQYXRoXTtcblx0XHRhd2FpdCBhcHBlbmREZWxldGlvbkxvZ0VudHJ5KGxvZ1BhdGgsIHtcblx0XHRcdHRhcmdldFJvb3QsXG5cdFx0XHRyZWxQYXRoLFxuXHRcdFx0ZGVsZXRlZEF0OiBudWxsLFxuXHRcdH0pO1xuXHRcdHJldHVybjtcblx0fVxuXG5cdGNvbnN0IG5vd0lzbyA9IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKTtcblx0Y29uc3QgZXhpc3RpbmcgPSBwZXJUYXJnZXRMb2dbcmVsUGF0aF07XG5cblx0aWYgKCFleGlzdGluZykge1xuXHRcdC8vIOesrOS4gOasoeWPkeeOsOebruagh+W3suWIoOmZpO+8jOWFiOiusOW9leS4gOasoeWIoOmZpOaXtumXtO+8jOS4i+asoeWGjeWIpOaWreaYr+WQpuecn+ato+WIoOmZpOa6kOaWh+S7tlxuXHRcdHBlclRhcmdldExvZ1tyZWxQYXRoXSA9IG5vd0lzbztcblx0XHRhd2FpdCBhcHBlbmREZWxldGlvbkxvZ0VudHJ5KGxvZ1BhdGgsIHtcblx0XHRcdHRhcmdldFJvb3QsXG5cdFx0XHRyZWxQYXRoLFxuXHRcdFx0ZGVsZXRlZEF0OiBub3dJc28sXG5cdFx0fSk7XG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0Y29uc3QgZGVsZXRpb25UaW1lID0gRGF0ZS5wYXJzZShleGlzdGluZyk7XG5cdGlmIChOdW1iZXIuaXNOYU4oZGVsZXRpb25UaW1lKSkge1xuXHRcdHBlclRhcmdldExvZ1tyZWxQYXRoXSA9IG5vd0lzbztcblx0XHRhd2FpdCBhcHBlbmREZWxldGlvbkxvZ0VudHJ5KGxvZ1BhdGgsIHtcblx0XHRcdHRhcmdldFJvb3QsXG5cdFx0XHRyZWxQYXRoLFxuXHRcdFx0ZGVsZXRlZEF0OiBub3dJc28sXG5cdFx0fSk7XG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0Ly8g5Yig6Zmk5pe26Ze06ZyA6KaB5pma5LqO5rqQ5paH5Lu255qE5pyA5ZCO5L+u5pS55pe26Ze077yM5omN5Lya55yf5q2j5Yig6Zmk5rqQ5paH5Lu2XG5cdGlmIChkZWxldGlvblRpbWUgPiBzcmNTdGF0Lm10aW1lTXMgKyBNVElNRV9FUFNfTVMpIHtcblx0XHRhd2FpdCBkZWxldGVQYXRoSWZFeGlzdHMoc291cmNlUGF0aCk7XG5cdFx0ZGVsZXRlIHBlclRhcmdldExvZ1tyZWxQYXRoXTtcblx0XHRhd2FpdCBhcHBlbmREZWxldGlvbkxvZ0VudHJ5KGxvZ1BhdGgsIHtcblx0XHRcdHRhcmdldFJvb3QsXG5cdFx0XHRyZWxQYXRoLFxuXHRcdFx0ZGVsZXRlZEF0OiBudWxsLFxuXHRcdH0pO1xuXHR9IGVsc2Uge1xuXHRcdG5ldyBOb3RpY2UoXG5cdFx0XHRgVmF1bHQgRm9sZGVyIFN5bmM6IOWPjeWQkeWQjOatpeWIoOmZpOWGsueqge+8iOa6kOaWh+S7tui+g+aWsO+8ie+8miR7cmVsUGF0aH1gLFxuXHRcdCk7XG5cdH1cbn1cblxuZnVuY3Rpb24gc2hvdWxkU2tpcE1ldGFGaWxlKHJlbFBhdGg6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRjb25zdCBub3JtYWxpemVkID0gcmVsUGF0aC5zcGxpdChwYXRoLnNlcCkuam9pbihcIi9cIik7XG5cdGlmIChcblx0XHRub3JtYWxpemVkID09PSBcIi5vYnNpZGlhbi92YXVsdC1mb2xkZXItc3luYy5qc29uXCIgfHxcblx0XHRub3JtYWxpemVkID09PSBcIi5vYnNpZGlhbi92YXVsdC1mb2xkZXItc3luYy1kZWxldGVkLmpzb25cIlxuXHQpIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXHRyZXR1cm4gZmFsc2U7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGVuc3VyZURpcihkaXJQYXRoOiBzdHJpbmcpIHtcblx0YXdhaXQgZnMucHJvbWlzZXMubWtkaXIoZGlyUGF0aCwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHBhdGhFeGlzdHMocDogc3RyaW5nKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdHRyeSB7XG5cdFx0YXdhaXQgZnMucHJvbWlzZXMuYWNjZXNzKHApO1xuXHRcdHJldHVybiB0cnVlO1xuXHR9IGNhdGNoIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cbn1cblxuYXN5bmMgZnVuY3Rpb24gZGVsZXRlUGF0aElmRXhpc3RzKHA6IHN0cmluZykge1xuXHRpZiAoIShhd2FpdCBwYXRoRXhpc3RzKHApKSkgcmV0dXJuO1xuXHRjb25zdCBzdGF0ID0gYXdhaXQgZnMucHJvbWlzZXMuc3RhdChwKTtcblx0aWYgKHN0YXQuaXNEaXJlY3RvcnkoKSkge1xuXHRcdGF3YWl0IGZzLnByb21pc2VzLnJtKHAsIHsgcmVjdXJzaXZlOiB0cnVlLCBmb3JjZTogdHJ1ZSB9KTtcblx0fSBlbHNlIHtcblx0XHRhd2FpdCBmcy5wcm9taXNlcy51bmxpbmsocCk7XG5cdH1cbn1cblxuYXN5bmMgZnVuY3Rpb24gY29weUZpbGVXaXRoTWV0YWRhdGEoc291cmNlRmlsZTogc3RyaW5nLCB0YXJnZXRGaWxlOiBzdHJpbmcpIHtcblx0Y29uc3Qgc3RhdCA9IGF3YWl0IGZzLnByb21pc2VzLnN0YXQoc291cmNlRmlsZSk7XG5cdGF3YWl0IGZzLnByb21pc2VzLmNvcHlGaWxlKHNvdXJjZUZpbGUsIHRhcmdldEZpbGUpO1xuXHR0cnkge1xuXHRcdGF3YWl0IGZzLnByb21pc2VzLnV0aW1lcyh0YXJnZXRGaWxlLCBzdGF0LmF0aW1lLCBzdGF0Lm10aW1lKTtcblx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0Y29uc29sZS5lcnJvcihcblx0XHRcdFwiVmF1bHQgRm9sZGVyIFN5bmM6IGZhaWxlZCB0byBwcmVzZXJ2ZSBmaWxlIHRpbWVzIGZvclwiLFxuXHRcdFx0dGFyZ2V0RmlsZSxcblx0XHRcdGVycixcblx0XHQpO1xuXHR9XG59XG5cblxuIl19