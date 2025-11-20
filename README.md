## Vault Folder Sync 插件

一个 Obsidian 插件，用于将当前 vault 中新增、修改、删除的文件自动同步到一个或多个外部目录，保持目录结构一致（包含 `.obsidian`、图片和其他附件）。

### 功能概览

- **首次全量同步**：首次对某个目标目录执行同步时，会将整个 vault 目录完整复制过去，并删除目标目录中多余的文件，使两边结构一致。
- **后续增量同步**：之后通过监听 Obsidian 的文件事件（创建 / 修改 / 删除 / 重命名）以及定时任务，仅同步有变更的文件或目录。
- **多目标目录支持**：可以配置多个同步目标目录（绝对路径），每个目录可独立开启 / 关闭。
- **包含 `.obsidian` 和附件**：全量同步时不做过滤，`.obsidian` 目录和图片、PDF 等附件都会一并复制。
- **定时同步与退出前同步**：默认每 30 秒做一次增量同步，退出 Obsidian 或关闭 vault 前会尝试做一次最终同步。
- **状态栏同步状态**：右下角状态栏显示当前同步状态：
  - `⟳ 同步中`：插件加载后、或当前正在进行同步时显示。
  - `✔ 已同步`：最近一次同步已完成或当前没有需要同步的目标目录。

### 开发与构建

#### 安装依赖

在项目根目录执行：

```bash
cd /Users/jake/Documents/Projects/DocSync
npm install
```

#### TypeScript 构建

直接使用 npm 脚本：

- 一次性构建：

```bash
npm run build
```

- 开发时监听变更：

```bash
npm run dev
```

构建完成后会在项目根目录生成打包后的 `main.js`，与 `manifest.json` 一起作为 Obsidian 插件入口（内部已包含反向同步模块的代码）。

### 构建脚本使用方法

项目提供了简化的构建 + 部署脚本，分别适用于 macOS/Linux 和 Windows。

#### macOS / Linux：`build-vault-folder-sync.sh`

在项目根目录执行：

```bash
./build-vault-folder-sync.sh
```

行为：

- 如果不存在 `node_modules`，会自动执行 `npm install`。
- 执行 `npm run build`，使用 esbuild 打包生成最新的 `main.js`。

可选参数：`DEST`，用于一键部署插件到 Obsidian：

```bash
./build-vault-folder-sync.sh "/path/to/your/vault"
./build-vault-folder-sync.sh "/path/to/ObsidianDocumentsRoot"
./build-vault-folder-sync.sh "/path/to/your/vault/.obsidian/plugins/vault-folder-sync"
```

- **情况 1：DEST 为单个 vault 根目录（包含 `.obsidian`）**
  - 部署到：`DEST/.obsidian/plugins/vault-folder-sync`
- **情况 2：DEST 已经是插件目录**
  - 直接将 `manifest.json` 和 `main.js` 复制到该目录。
- **情况 3：DEST 为多个 vault 的父目录**
  - 脚本会扫描 `DEST` 下的子目录，凡是包含 `.obsidian` 的子目录都视为一个 vault，并分别部署到各自的 `…/.obsidian/plugins/vault-folder-sync`。

#### Windows：`build-vault-folder-sync.bat`

在项目根目录执行：

```bat
build-vault-folder-sync.bat
```

行为：

- 如果不存在 `node_modules`，会自动执行 `npm install`。
- 执行 `npm run build`，使用 esbuild 打包生成最新的 `main.js`。

可选参数：`DEST`，与 Unix 脚本类似，用于一键部署：

```bat
build-vault-folder-sync.bat "C:\Users\you\Documents\SomeVault"
build-vault-folder-sync.bat "C:\Users\you\Documents\ObsidianVaults"
build-vault-folder-sync.bat "C:\Users\you\Documents\SomeVault\.obsidian\plugins\vault-folder-sync"
```

三种情况与上面完全一致：

- `DEST\.obsidian` 存在 → 视为 vault 根目录，部署到 `DEST\.obsidian\plugins\vault-folder-sync`。
- `DEST` 路径中包含 `.obsidian\plugins\vault-folder-sync` → 视为插件目录，直接复制文件。
- 其余存在的目录 → 视为多个 vault 的父目录，扫描其下各个子目录中是否存在 `.obsidian`，逐个部署。

### 在 Obsidian 中启用插件

1. 使用上述构建脚本或手动将以下文件复制到插件目录：
   - `manifest.json`
   - `main.js`
2. 插件目录一般为：`<VaultRoot>/.obsidian/plugins/vault-folder-sync`。
3. 打开 Obsidian → `设置` → `社区插件` → 启用 “Vault Folder Sync” 插件。

### 插件设置说明

在 Obsidian 设置的插件面板中：

- **同步间隔（秒）**：
  - 控制定时增量同步的时间间隔，默认 30 秒。
  - 修改后保存，下次重启插件后生效。
- **同步目标目录**：
  - 为每个目标配置一个 **绝对路径**。
  - 每个目标可单独启用 / 禁用。
  - 支持新增和删除多个目标目录。

### 同步行为简述

- 启动时：
  - 为尚未做过全量同步的目标执行全量复制。
  - 状态栏显示 `⟳ 同步中`，完成后显示 `✔ 已同步`。
- 运行中：
  - 监听文件创建 / 修改 / 删除 / 重命名事件，将变更记录到队列。
  - 每隔 N 秒（默认 30）执行一次增量同步，只处理队列中的变更。
- 退出前：
  - 插件卸载时会尝试执行一次同步，把余下的变更尽量同步出去（受 Obsidian 关闭时间限制，不能保证一定完成）。


