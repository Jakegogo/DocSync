export class Plugin {
	app: any;
	constructor(app?: any) {
		this.app = app;
	}
}

export class PluginSettingTab {
	app: any;
	plugin: any;
	containerEl: any;

	constructor(app: any, plugin: any) {
		this.app = app;
		this.plugin = plugin;
		this.containerEl = {
			empty: () => {},
			createEl: () => ({ style: {} }),
		};
	}
}

export class FileSystemAdapter {
	private basePath: string;
	constructor(basePath: string) {
		this.basePath = basePath;
	}
	getBasePath(): string {
		return this.basePath;
	}
}

export class Notice {
	message: string;
	constructor(message: string) {
		this.message = message;
	}
}

export class WorkspaceLeaf {
	async setViewState(_state: any): Promise<void> {
		// no-op in tests
	}
	detach(): void {
		// no-op in tests
	}
}

export class ItemView {
	leaf: WorkspaceLeaf;
	constructor(leaf: WorkspaceLeaf) {
		this.leaf = leaf;
	}
	getViewType(): string {
		return "";
	}
	getDisplayText(): string {
		return "";
	}
	async onOpen(): Promise<void> {
		// no-op in tests
	}
}

export class App {
	vault: any;
	workspace: {
		getLeavesOfType: (_type: string) => WorkspaceLeaf[];
		getRightLeaf: (_reveal: boolean) => WorkspaceLeaf;
		revealLeaf: (_leaf: WorkspaceLeaf) => void;
	};

	constructor(vault: any) {
		this.vault = vault;
		this.workspace = {
			getLeavesOfType: () => [],
			getRightLeaf: () => new WorkspaceLeaf(),
			revealLeaf: () => {},
		};
	}
}

export class TAbstractFile {
	path: string;
	constructor(path: string) {
		this.path = path;
	}
}

export class TFile extends TAbstractFile {}


