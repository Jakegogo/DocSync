import { App, FileSystemAdapter, Setting } from "obsidian";
import * as fs from "fs";
import * as path from "path";

function getVaultBasePath(app: App): string | null {
	const adapter = app.vault.adapter;
	if (adapter instanceof FileSystemAdapter) {
		return adapter.getBasePath();
	}
	return null;
}

export function createLogView(containerEl: HTMLElement, app: App) {
	containerEl.createEl("h3", { text: "日志查看" });

	const logSection = containerEl.createDiv();
	const logInfo = logSection.createEl("p", {
		text: "查看当前 vault 下 .obsidian/vault-folder-sync-log.jsonl 中记录的同步与删除日志（按行追加的 JSON 日志）。",
	});
	logInfo.style.whiteSpace = "pre-wrap";

	const logContainer = logSection.createDiv({
		cls: "vault-folder-sync-log-container",
	});
	logContainer.style.border = "1px solid var(--background-modifier-border)";
	logContainer.style.borderRadius = "4px";
	logContainer.style.marginTop = "0.5em";
	logContainer.style.height = "200px";
	logContainer.style.overflow = "auto";
	logContainer.style.backgroundColor = "var(--background-primary-alt)";

	const logPre = logContainer.createEl("pre", {
		cls: "vault-folder-sync-log-pre",
	});
	logPre.style.margin = "0";
	logPre.style.padding = "0.5em";
	logPre.style.whiteSpace = "pre-wrap";
	logPre.style.fontFamily = "var(--font-monospace)";
	logPre.setText("点击下方按钮加载日志内容…");

	new Setting(logSection)
		.setName("查看同步日志文件")
		.setDesc(".obsidian/vault-folder-sync-log.jsonl")
		.addButton((button) =>
			button
				.setButtonText("加载日志")
				.onClick(async () => {
					try {
						const basePath = getVaultBasePath(app);
						if (!basePath) {
							logPre.setText(
								"当前环境不支持读取本地文件系统日志（需要桌面版 Obsidian）。",
							);
							return;
						}
						const logPath = path.join(
							basePath,
							".obsidian",
							"vault-folder-sync-log.jsonl",
						);
						const exists = await fs.promises
							.access(logPath)
							.then(
								() => true,
								() => false,
							);
						if (!exists) {
							logPre.setText(
								"尚未找到日志文件：.obsidian/vault-folder-sync-log.jsonl",
							);
							return;
						}
						const content = await fs.promises.readFile(
							logPath,
							"utf8",
						);
						logPre.setText(content || "(日志文件为空)");
					} catch (err) {
						console.error(
							"Vault Folder Sync: 读取日志失败",
							err,
						);
						logPre.setText(
							"读取日志失败，请查看开发者控制台获取详细错误信息。",
						);
					}
				}),
		);
}






