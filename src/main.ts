import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile, ItemView, WorkspaceLeaf } from 'obsidian';
import { SyncEngine } from './sync/syncEngine';
import { Logger } from './utils/logger';

const DEBUG_DASHBOARD_VIEW_TYPE = 'todoist-debug-dashboard';

interface TodoistSyncSettings {
	todoistApiToken: string;
	syncFolderPath: string;
	scopeTag: string;
	autoSyncInterval: number;
	debugMode: boolean;
	dryRunMode: boolean;
	realTimeSyncEnabled: boolean;
	autoSyncEnabled: boolean;
	enabledProperties: {
		content: boolean;
		dueDate: boolean;
		priority: boolean;
		labels: boolean;
		project: boolean;
		section: boolean;
	};
}

const DEFAULT_SETTINGS: TodoistSyncSettings = {
	todoistApiToken: '',
	syncFolderPath: 'TodoistSync',
	scopeTag: 'todoist',
	autoSyncInterval: 300, // 5 minutes in seconds
	debugMode: false,
	dryRunMode: false,
	realTimeSyncEnabled: false,
	autoSyncEnabled: false,
	enabledProperties: {
		content: true,
		dueDate: true,
		priority: true,
		labels: true,
		project: true,
		section: true
	}
}

export default class TodoistSyncPlugin extends Plugin {
	settings: TodoistSyncSettings;
	logger: Logger;
	syncEngine: SyncEngine;
	statusBarItem: HTMLElement;
	syncInterval: number;

	async onload() {
		await this.loadSettings();
		
		// Initialize logger
		this.logger = Logger.getInstance();
		this.logger.setDebugMode(this.settings.debugMode);
		this.logger.info('Plugin loaded');
		
		// Initialize sync engine
		this.initializeSyncEngine();

		// Create ribbon icon for manual sync
		const ribbonIconEl = this.addRibbonIcon('sync', 'Sync with Todoist', (evt: MouseEvent) => {
			this.performSync();
		});
		ribbonIconEl.addClass('todoist-sync-ribbon-class');

		// Add status bar item
		this.statusBarItem = this.addStatusBarItem();
		this.updateStatusBar('Not synced');

		// Add commands
		this.addCommand({
			id: 'sync-todoist',
			name: 'Sync with Todoist',
			callback: () => {
				this.performSync();
			}
		});

		this.addCommand({
			id: 'sync-to-todoist',
			name: 'Sync Obsidian Changes to Todoist',
			callback: async () => {
				await this.syncObsidianToTodoist();
			}
		});

		this.addCommand({
			id: 'test-todoist-connection',
			name: 'Test Todoist Connection',
			callback: async () => {
				await this.testConnection();
			}
		});

		this.addCommand({
			id: 'show-sync-stats',
			name: 'Show Sync Statistics',
			callback: () => {
				new SyncStatsModal(this.app, this.syncEngine).open();
			}
		});

		this.addCommand({
			id: 'toggle-debug-mode',
			name: 'Toggle Debug Mode',
			callback: () => {
				this.toggleDebugMode();
			}
		});

		this.addCommand({
			id: 'show-debug-logs',
			name: 'Show Debug Logs',
			callback: () => {
				new DebugLogsModal(this.app, this.logger).open();
			}
		});

		this.addCommand({
			id: 'toggle-debug-dashboard',
			name: 'Toggle Debug Dashboard',
			callback: () => {
				this.activateView();
			}
		});

		this.addCommand({
			id: 'dry-run-sync',
			name: 'Dry Run Sync (Preview Changes)',
			callback: () => {
				this.performDryRunSync();
			}
		});

		this.addCommand({
			id: 'validate-todoist-data',
			name: 'Validate Todoist Data',
			callback: () => {
				this.validateTodoistData();
			}
		});

		// Add settings tab
		this.addSettingTab(new TodoistSyncSettingTab(this.app, this));

		// Register debug dashboard view
		this.registerView(
			DEBUG_DASHBOARD_VIEW_TYPE,
			(leaf) => new DebugDashboardView(leaf, this)
		);

		// Add ribbon icon for debug dashboard
		this.addRibbonIcon('bug', 'Toggle Debug Dashboard', () => {
			this.activateView();
		});

		// Register file modification events
		this.registerEvent(this.app.vault.on('modify', (file) => {
			if (file instanceof TFile) {
				this.syncEngine.onFileModified(file);
			}
		}));

		this.registerEvent(this.app.vault.on('delete', (file) => {
			if (file instanceof TFile) {
				this.syncEngine.onFileDeleted(file);
			}
		}));

		// Setup auto-sync interval
		this.setupAutoSync();
	}

	onunload() {
		if (this.syncInterval) {
			window.clearInterval(this.syncInterval);
		}
	}

	initializeSyncEngine(): void {
		this.syncEngine = new SyncEngine(
			this.app.vault,
			this.app.metadataCache,
			{
				todoistApiToken: this.settings.todoistApiToken,
				syncFolderPath: this.settings.syncFolderPath,
				scopeTag: this.settings.scopeTag,
				enabledProperties: this.settings.enabledProperties,
				realTimeSyncEnabled: this.settings.realTimeSyncEnabled,
				dryRunMode: this.settings.dryRunMode
			}
		);
		
		// Start file watching if enabled
		if (this.settings.realTimeSyncEnabled) {
			this.syncEngine.startFileWatching();
		}
	}

	updateStatusBar(text: string): void {
		if (this.statusBarItem) {
			this.statusBarItem.setText(`Todoist: ${text}`);
		}
	}

	setupAutoSync(): void {
		if (this.syncInterval) {
			window.clearInterval(this.syncInterval);
		}

		if (this.settings.autoSyncEnabled && this.settings.autoSyncInterval > 0 && this.settings.todoistApiToken) {
			this.syncInterval = window.setInterval(() => {
				this.performSync();
			}, this.settings.autoSyncInterval * 1000);
		}
	}

	async testConnection(): Promise<void> {
		if (!this.settings.todoistApiToken) {
			new Notice('Please configure your Todoist API token first');
			return;
		}

		new Notice('Testing Todoist connection...');
		const isConnected = await this.syncEngine.testConnection();
		
		if (isConnected) {
			new Notice('✅ Successfully connected to Todoist!');
		} else {
			new Notice('❌ Failed to connect to Todoist. Check your API token.');
		}
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
		
		// Update logger debug mode
		this.logger.setDebugMode(this.settings.debugMode);
		
		// Update sync engine with new settings
		if (this.syncEngine) {
			this.syncEngine.updateSettings({
				todoistApiToken: this.settings.todoistApiToken,
				syncFolderPath: this.settings.syncFolderPath,
				scopeTag: this.settings.scopeTag,
				enabledProperties: this.settings.enabledProperties,
				realTimeSyncEnabled: this.settings.realTimeSyncEnabled,
				dryRunMode: this.settings.dryRunMode
			});
		}

		// Update auto-sync interval
		this.setupAutoSync();
	}

	toggleDebugMode(): void {
		this.settings.debugMode = !this.settings.debugMode;
		this.logger.setDebugMode(this.settings.debugMode);
		this.saveSettings();
		
		const status = this.settings.debugMode ? 'enabled' : 'disabled';
		new Notice(`Debug mode ${status}`);
		this.logger.info(`Debug mode ${status}`);
	}

	async performDryRunSync(): Promise<void> {
		if (!this.syncEngine) {
			new Notice('Sync engine not initialized');
			return;
		}

		this.logger.info('Starting dry run sync...');
		this.updateStatusBar('Dry run...');
		
		try {
			// Enable dry run mode temporarily
			const originalDryRun = this.settings.dryRunMode;
			this.settings.dryRunMode = true;
			// Propagate to sync engine
			this.syncEngine.updateSettings({
				todoistApiToken: this.settings.todoistApiToken,
				syncFolderPath: this.settings.syncFolderPath,
				scopeTag: this.settings.scopeTag,
				enabledProperties: this.settings.enabledProperties,
				realTimeSyncEnabled: this.settings.realTimeSyncEnabled,
				dryRunMode: true
			});

			// Perform the sync
			const result = await this.syncEngine.performSync();
			
			// Restore original dry run setting
			this.settings.dryRunMode = originalDryRun;
			this.syncEngine.updateSettings({
				todoistApiToken: this.settings.todoistApiToken,
				syncFolderPath: this.settings.syncFolderPath,
				scopeTag: this.settings.scopeTag,
				enabledProperties: this.settings.enabledProperties,
				realTimeSyncEnabled: this.settings.realTimeSyncEnabled,
				dryRunMode: originalDryRun
			});

			if (result.success) {
				new Notice('✅ Dry run completed - check console for details');
				this.updateStatusBar('Dry run completed');
			} else {
				this.updateStatusBar('Dry run failed');
			}
		} catch (error) {
			this.logger.error('Dry run failed', error);
			this.updateStatusBar('Dry run failed');
		}
	}

	async validateTodoistData(): Promise<void> {
		if (!this.syncEngine) {
			new Notice('Sync engine not initialized');
			return;
		}

		this.logger.info('Validating Todoist data...');
		
		try {
			const isConnected = await this.syncEngine.testConnection();
			if (!isConnected) {
				new Notice('❌ Cannot connect to Todoist API');
				return;
			}

			// Get basic stats
			const stats = this.syncEngine.getSyncStats();
			this.logger.info('Todoist data validation', stats);
			
			new Notice(`✅ Validation complete - ${stats.todoist.tasks} tasks, ${stats.todoist.projects} projects`);
		} catch (error) {
			this.logger.error('Data validation failed', error);
		}
	}

	async performSync(): Promise<void> {
		if (!this.syncEngine) {
			new Notice('Sync engine not initialized');
			return;
		}

		this.updateStatusBar('Syncing...');
		const result = await this.syncEngine.performSync();
		
		if (result.success) {
			this.updateStatusBar(`Synced at ${new Date().toLocaleTimeString()}`);
		} else {
			this.updateStatusBar('Sync failed');
		}

		// Refresh debug dashboard if it's open
		this.refreshDebugDashboard();
	}

	async syncObsidianToTodoist(): Promise<void> {
		if (!this.syncEngine) {
			new Notice('Sync engine not initialized');
			return;
		}

		try {
			this.updateStatusBar('Syncing to Todoist...');
			new Notice('Scanning for changes in Obsidian notes...');
			
			// Process all pending changes
			await this.syncEngine.processPendingChanges();
			
			// Also scan all files in sync folder for any changes
			await this.syncEngine.scanAndSyncToTodoist();
			
			this.updateStatusBar(`Synced to Todoist at ${new Date().toLocaleTimeString()}`);
			new Notice('Successfully synced changes to Todoist');
			
		} catch (error) {
			this.logger.error('Failed to sync to Todoist:', error);
			this.updateStatusBar('Sync to Todoist failed');
			new Notice('Failed to sync changes to Todoist. Check debug logs for details.');
		}
	}

	async testChangeDetection(): Promise<void> {
		if (!this.syncEngine) {
			new Notice('Sync engine not initialized');
			return;
		}

		try {
			// Enable debug mode temporarily for testing
			const wasDebugEnabled = this.settings.debugMode;
			this.settings.debugMode = true;
			this.logger.setDebugMode(true);

			new Notice('Testing change detection - check console/debug logs for details');
			
			// Test scanning files in sync folder
			await this.syncEngine.scanAndSyncToTodoist();
			
			// Show pending changes
			const pendingCount = this.syncEngine['pendingChanges']?.size || 0;
			new Notice(`Found ${pendingCount} pending changes`);
			
			// Restore debug mode
			this.settings.debugMode = wasDebugEnabled;
			this.logger.setDebugMode(wasDebugEnabled);
			
		} catch (error) {
			this.logger.error('Change detection test failed:', error);
			new Notice('Change detection test failed. Check debug logs.');
		}
	}

	getStateComparison(): any {
		if (!this.syncEngine) {
			return {
				onlyInTodoist: [],
				onlyInObsidian: [],
				propertyMismatches: []
			};
		}

		const todoistState = this.syncEngine['todoistState'];
		const obsidianState = this.syncEngine['obsidianState'];

		if (!todoistState || !obsidianState) {
			return {
				onlyInTodoist: [],
				onlyInObsidian: [],
				propertyMismatches: []
			};
		}

		const onlyInTodoist: any[] = [];
		const onlyInObsidian: any[] = [];
		const propertyMismatches: any[] = [];

		// Check tasks
		const todoistTasks = todoistState.getAllTasks();
		const obsidianTasks = obsidianState.getAllTaskNotes();

		// Find tasks only in Todoist
		todoistTasks.forEach(task => {
			if (!obsidianState.getTaskNote(task.id)) {
				onlyInTodoist.push({
					id: task.id,
					name: task.content,
					type: 'task'
				});
			}
		});

		// Find tasks only in Obsidian
		obsidianTasks.forEach(note => {
			if (note.todoistId && !todoistState.getTask(note.todoistId)) {
				onlyInObsidian.push({
					id: note.todoistId,
					name: note.frontmatter.title || 'Untitled',
					path: note.filePath,
					type: 'task'
				});
			}
		});

		// Check for property mismatches
		obsidianTasks.forEach(note => {
			if (note.todoistId) {
				const todoistTask = todoistState.getTask(note.todoistId);
				if (todoistTask) {
					// Check title mismatch
					if (todoistTask.content !== note.frontmatter.title) {
						propertyMismatches.push({
							id: note.todoistId,
							property: 'title',
							todoistValue: todoistTask.content,
							obsidianValue: note.frontmatter.title
						});
					}
					// Check completion mismatch
					if (todoistTask.checked !== note.frontmatter.completed) {
						propertyMismatches.push({
							id: note.todoistId,
							property: 'completed',
							todoistValue: todoistTask.checked,
							obsidianValue: note.frontmatter.completed
						});
					}
				}
			}
		});

		return {
			onlyInTodoist,
			onlyInObsidian,
			propertyMismatches
		};
	}

	async activateView() {
		const { workspace } = this.app;

		let leaf = workspace.getLeavesOfType(DEBUG_DASHBOARD_VIEW_TYPE)[0];
		if (!leaf) {
			leaf = workspace.getRightLeaf(false);
			await leaf.setViewState({ type: DEBUG_DASHBOARD_VIEW_TYPE, active: true });
		}

		workspace.revealLeaf(leaf);
	}

	refreshDebugDashboard() {
		const { workspace } = this.app;
		const leaf = workspace.getLeavesOfType(DEBUG_DASHBOARD_VIEW_TYPE)[0];
		if (leaf && leaf.view instanceof DebugDashboardView) {
			leaf.view.refresh();
		}
	}
}

class DebugDashboardView extends ItemView {
	plugin: TodoistSyncPlugin;
	activeTab: string = 'todoist';

	constructor(leaf: WorkspaceLeaf, plugin: TodoistSyncPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType() {
		return DEBUG_DASHBOARD_VIEW_TYPE;
	}

	getDisplayText() {
		return 'Todoist Debug';
	}

	getIcon() {
		return 'bug';
	}

	async onOpen() {
		const container = this.containerEl.children[1];
		container.empty();
		container.addClass('debug-dashboard');

		// Title
		container.createEl('h2', {text: 'Debug Dashboard'});

		// Quick action buttons (Fetch / Scan / Pull)
		const actionsDiv = container.createDiv('debug-actions');
		actionsDiv.style.marginBottom = '10px';

		const fetchBtn = actionsDiv.createEl('button', {text: 'Fetch (Todoist)'});
		fetchBtn.style.marginRight = '8px';
		fetchBtn.onclick = async () => {
			new Notice('Fetching from Todoist...');
			await this.plugin.syncEngine.fetchFromTodoist();
			this.plugin.updateStatusBar('Fetched from Todoist');
			this.plugin.refreshDebugDashboard();
		};

		const scanBtn = actionsDiv.createEl('button', {text: 'Scan (Obsidian)'});
		scanBtn.style.marginRight = '8px';
		scanBtn.onclick = async () => {
			new Notice('Scanning Obsidian for changes...');
			await this.plugin.syncEngine.scan();
			this.plugin.updateStatusBar('Scanned Obsidian');
			this.plugin.refreshDebugDashboard();
		};

		const pullBtn = actionsDiv.createEl('button', {text: 'Pull (Fetch+Scan+Reconcile)'});
		pullBtn.onclick = async () => {
			new Notice('Running pull (fetch + scan + reconcile)...');
			await this.plugin.syncEngine.pull();
			this.plugin.updateStatusBar('Pull completed');
			this.plugin.refreshDebugDashboard();
		};

		// Tab navigation
		const tabContainer = container.createDiv('tab-container');
		const tabs = [
			{id: 'todoist', name: 'Todoist State'},
			{id: 'obsidian', name: 'Obsidian State'},
			{id: 'comparison', name: 'State Comparison'},
			{id: 'logs', name: 'Sync Logs'}
		];

		tabs.forEach(tab => {
			const tabEl = tabContainer.createEl('button', {
				text: tab.name,
				cls: this.activeTab === tab.id ? 'active-tab' : 'tab-button'
			});
			tabEl.onclick = () => {
				this.activeTab = tab.id;
				this.renderContent();
			};
		});

		// Content area
		this.renderContent();

		// Add CSS styles
		this.addStyles();
	}

	renderContent() {
		const container = this.containerEl.children[1];
		let contentArea = container.querySelector('.tab-content');
		if (contentArea) {
			contentArea.remove();
		}

		contentArea = container.createDiv('tab-content');

		switch (this.activeTab) {
			case 'todoist':
				this.renderTodoistState(contentArea as HTMLElement);
				break;
			case 'obsidian':
				this.renderObsidianState(contentArea as HTMLElement);
				break;
			case 'comparison':
				this.renderStateComparison(contentArea as HTMLElement);
				break;
			case 'logs':
				this.renderSyncLogs(contentArea as HTMLElement);
				break;
		}

		// Update tab buttons
		const tabs = container.querySelectorAll('.tab-button, .active-tab');
		tabs.forEach((tab, index) => {
			const tabIds = ['todoist', 'obsidian', 'comparison', 'logs'];
			tab.className = this.activeTab === tabIds[index] ? 'active-tab' : 'tab-button';
		});
	}

	renderTodoistState(container: HTMLElement) {
		if (!this.plugin.syncEngine) {
			container.createEl('p', {text: 'Sync engine not initialized'});
			return;
		}

		const todoistState = this.plugin.syncEngine['todoistState'];
		if (!todoistState) {
			container.createEl('p', {text: 'Todoist state not available'});
			return;
		}

		const stats = todoistState.getStats();
		const statsEl = container.createDiv('stats-section');
		statsEl.createEl('h3', {text: 'Statistics'});
		statsEl.createEl('p', {text: `Tasks: ${stats.tasks}`});
		statsEl.createEl('p', {text: `Projects: ${stats.projects}`});
		statsEl.createEl('p', {text: `Sections: ${stats.sections}`});
		statsEl.createEl('p', {text: `Labels: ${stats.labels}`});

		const syncState = todoistState.getSyncState();
		const syncEl = container.createDiv('sync-section');
		syncEl.createEl('h3', {text: 'Sync Information'});
		syncEl.createEl('p', {text: `Sync Token: ${syncState.syncToken}`});
		syncEl.createEl('p', {text: `Last Full Sync: ${new Date(syncState.lastFullSync).toLocaleString()}`});
		syncEl.createEl('p', {text: `Last Incremental Sync: ${new Date(syncState.lastIncrementalSync).toLocaleString()}`});

		const tasksEl = container.createDiv('tasks-section');
		tasksEl.createEl('h3', {text: 'Tasks'});
		const tasks = todoistState.getAllTasks();
		tasks.forEach(task => {
			const taskEl = tasksEl.createDiv('item-detail');
			taskEl.createEl('strong', {text: task.content});
			taskEl.createEl('br');
			taskEl.createEl('span', {text: `ID: ${task.id}, Project: ${task.project_id}, Completed: ${task.checked}`});
		});
	}

	renderObsidianState(container: HTMLElement) {
		if (!this.plugin.syncEngine) {
			container.createEl('p', {text: 'Sync engine not initialized'});
			return;
		}

		const obsidianState = this.plugin.syncEngine['obsidianState'];
		if (!obsidianState) {
			container.createEl('p', {text: 'Obsidian state not available'});
			return;
		}

		const stats = obsidianState.getStats();
		const statsEl = container.createDiv('stats-section');
		statsEl.createEl('h3', {text: 'Statistics'});
		statsEl.createEl('p', {text: `Task Notes: ${stats.tasks}`});
		statsEl.createEl('p', {text: `Project Notes: ${stats.projects}`});
		statsEl.createEl('p', {text: `Section Notes: ${stats.sections}`});

		// Add debug info to identify duplicates
		const debugInfo = obsidianState.getDebugInfo?.();
		if (debugInfo) {
			const debugEl = container.createDiv('debug-section');
			debugEl.createEl('h3', {text: 'Debug Information'});
			debugEl.createEl('p', {text: `Total File Mappings: ${debugInfo.totalFiles}`});
			
			const showDetails = debugEl.createEl('button', {text: 'Show File Details'});
			showDetails.style.marginBottom = '10px';
			const detailsEl = debugEl.createDiv('debug-details');
			detailsEl.style.display = 'none';
			detailsEl.style.fontSize = '0.8em';
			detailsEl.style.marginTop = '10px';
			
			showDetails.onclick = () => {
				if (detailsEl.style.display === 'none') {
					detailsEl.style.display = 'block';
					showDetails.textContent = 'Hide File Details';
					
					detailsEl.empty();
					detailsEl.createEl('h4', {text: 'Task Files:'});
					debugInfo.tasks.forEach(task => {
						detailsEl.createEl('div', {text: `${task.id}: ${task.path}`});
					});
					
					detailsEl.createEl('h4', {text: 'Project Files:'});
					debugInfo.projects.forEach(project => {
						detailsEl.createEl('div', {text: `${project.id}: ${project.path}`});
					});
					
					detailsEl.createEl('h4', {text: 'Section Files:'});
					debugInfo.sections.forEach(section => {
						detailsEl.createEl('div', {text: `${section.id}: ${section.path}`});
					});
				} else {
					detailsEl.style.display = 'none';
					showDetails.textContent = 'Show File Details';
				}
			};
		}

		const taskNotesEl = container.createDiv('notes-section');
		taskNotesEl.createEl('h3', {text: 'Task Notes'});
		const taskNotes = obsidianState.getAllTaskNotes();
		taskNotes.forEach(note => {
			const noteEl = taskNotesEl.createDiv('item-detail');
			noteEl.createEl('strong', {text: note.frontmatter.title || 'Untitled'});
			noteEl.createEl('br');
			noteEl.createEl('span', {text: `Path: ${note.filePath}`});
			noteEl.createEl('br');
			noteEl.createEl('span', {text: `Todoist ID: ${note.todoistId}`});
			noteEl.createEl('br');
			noteEl.createEl('span', {text: `Completed: ${note.frontmatter.completed}`});
		});

		const projectNotesEl = container.createDiv('notes-section');
		projectNotesEl.createEl('h3', {text: 'Project Notes'});
		const projectNotes = obsidianState.getAllProjectNotes();
		projectNotes.forEach(note => {
			const noteEl = projectNotesEl.createDiv('item-detail');
			noteEl.createEl('strong', {text: note.name});
			noteEl.createEl('br');
			noteEl.createEl('span', {text: `Path: ${note.filePath}`});
			noteEl.createEl('br');
			noteEl.createEl('span', {text: `Todoist ID: ${note.todoistId}`});
		});
	}

	renderStateComparison(container: HTMLElement) {
		if (!this.plugin.syncEngine) {
			container.createEl('p', {text: 'Sync engine not initialized'});
			return;
		}

		const comparison = this.plugin.getStateComparison();

		const summaryEl = container.createDiv('comparison-summary');
		summaryEl.createEl('h3', {text: 'Comparison Summary'});
		summaryEl.createEl('p', {text: `Items only in Todoist: ${comparison.onlyInTodoist.length}`});
		summaryEl.createEl('p', {text: `Items only in Obsidian: ${comparison.onlyInObsidian.length}`});
		summaryEl.createEl('p', {text: `Property mismatches: ${comparison.propertyMismatches.length}`});

		if (comparison.onlyInTodoist.length > 0) {
			const todoistOnlyEl = container.createDiv('todoist-only-section');
			todoistOnlyEl.createEl('h3', {text: 'Only in Todoist'});
			comparison.onlyInTodoist.forEach((item: any) => {
				const itemEl = todoistOnlyEl.createDiv('item-detail');
				itemEl.createEl('span', {text: `${item.type}: ${item.name} (ID: ${item.id})`});
			});
		}

		if (comparison.onlyInObsidian.length > 0) {
			const obsidianOnlyEl = container.createDiv('obsidian-only-section');
			obsidianOnlyEl.createEl('h3', {text: 'Only in Obsidian'});
			comparison.onlyInObsidian.forEach((item: any) => {
				const itemEl = obsidianOnlyEl.createDiv('item-detail');
				itemEl.createEl('span', {text: `${item.type}: ${item.name} (Path: ${item.path})`});
			});
		}

		if (comparison.propertyMismatches.length > 0) {
			const mismatchEl = container.createDiv('mismatch-section');
			mismatchEl.createEl('h3', {text: 'Property Mismatches'});
			comparison.propertyMismatches.forEach((mismatch: any) => {
				const itemEl = mismatchEl.createDiv('item-detail');
				itemEl.createEl('strong', {text: mismatch.id});
				itemEl.createEl('br');
				itemEl.createEl('span', {text: `${mismatch.property}: Todoist="${mismatch.todoistValue}" vs Obsidian="${mismatch.obsidianValue}"`});
			});
		}
	}

	renderSyncLogs(container: HTMLElement) {
		const logs = this.plugin.logger.getRecentLogs?.(50) || [];
		if (logs.length === 0) {
			container.createEl('p', {text: 'No recent logs available (logger may not support getRecentLogs)'});
			return;
		}

		const logsEl = container.createDiv('logs-section');
		logsEl.createEl('h3', {text: 'Recent Sync Logs'});

		logs.forEach((log: any) => {
			const level = typeof log === 'string' ? 'info' : (log.level || 'info');
			const message = typeof log === 'string' ? log : (log.message || log.toString());
			const timestamp = typeof log === 'object' && log.timestamp ? log.timestamp : Date.now();

			const logEl = logsEl.createDiv(`log-entry log-${level}`);
			logEl.createEl('span', {
				text: `[${new Date(timestamp).toLocaleTimeString()}] ${level.toUpperCase()}: ${message}`,
				cls: 'log-message'
			});

			if (typeof log === 'object' && log.data) {
				logEl.createEl('pre', {text: JSON.stringify(log.data, null, 2), cls: 'log-data'});
			}
		});
	}

	addStyles() {
		const style = document.createElement('style');
		style.textContent = `
			.debug-dashboard .tab-container {
				display: flex;
				margin-bottom: 20px;
				border-bottom: 1px solid var(--background-modifier-border);
			}
			.debug-dashboard .tab-button, .debug-dashboard .active-tab {
				padding: 10px 15px;
				margin-right: 5px;
				border: none;
				background: transparent;
				cursor: pointer;
				border-bottom: 2px solid transparent;
			}
			.debug-dashboard .active-tab {
				border-bottom-color: var(--interactive-accent);
				color: var(--interactive-accent);
			}
			.debug-dashboard .tab-content {
				max-height: 400px;
				overflow-y: auto;
			}
			.debug-dashboard .stats-section, .debug-dashboard .sync-section,
			.debug-dashboard .tasks-section, .debug-dashboard .notes-section,
			.debug-dashboard .comparison-summary, .debug-dashboard .logs-section {
				margin-bottom: 20px;
			}
			.debug-dashboard .item-detail {
				padding: 8px;
				margin: 5px 0;
				background: var(--background-secondary);
				border-radius: 4px;
				font-size: 0.9em;
			}
			.debug-dashboard .log-entry {
				padding: 5px;
				margin: 2px 0;
				border-left: 3px solid var(--background-modifier-border);
			}
			.debug-dashboard .log-error { border-left-color: var(--text-error); }
			.debug-dashboard .log-warn { border-left-color: var(--text-warning); }
			.debug-dashboard .log-info { border-left-color: var(--text-accent); }
			.debug-dashboard .log-debug { border-left-color: var(--text-muted); }
			.debug-dashboard .log-data {
				margin-top: 5px;
				padding: 5px;
				background: var(--background-primary-alt);
				border-radius: 3px;
				font-size: 0.8em;
			}
		`;
		document.head.appendChild(style);
	}

	async onClose(): Promise<void> {
		// Nothing to clean up
	}

	refresh() {
		this.renderContent();
	}
}

class SyncStatsModal extends Modal {
	syncEngine: SyncEngine;

	constructor(app: App, syncEngine: SyncEngine) {
		super(app);
		this.syncEngine = syncEngine;
	}

	onOpen() {
		const {contentEl} = this;
		contentEl.createEl('h2', {text: 'Todoist Sync Statistics'});
		
		const stats = this.syncEngine.getSyncStats();
		
		const todoistSection = contentEl.createDiv();
		todoistSection.createEl('h3', {text: 'Todoist Data'});
		todoistSection.createEl('p', {text: `Tasks: ${stats.todoist.tasks}`});
		todoistSection.createEl('p', {text: `Projects: ${stats.todoist.projects}`});
		todoistSection.createEl('p', {text: `Sections: ${stats.todoist.sections}`});
		todoistSection.createEl('p', {text: `Labels: ${stats.todoist.labels}`});
		
		const obsidianSection = contentEl.createDiv();
		obsidianSection.createEl('h3', {text: 'Obsidian Notes'});
		obsidianSection.createEl('p', {text: `Task Notes: ${stats.obsidian.tasks}`});
		obsidianSection.createEl('p', {text: `Project Notes: ${stats.obsidian.projects}`});
		obsidianSection.createEl('p', {text: `Section Notes: ${stats.obsidian.sections}`});
		
		const syncSection = contentEl.createDiv();
		syncSection.createEl('h3', {text: 'Sync Status'});
		syncSection.createEl('p', {text: `Last Sync: ${stats.lastSync ? new Date(stats.lastSync).toLocaleString() : 'Never'}`});
		syncSection.createEl('p', {text: `Status: ${stats.isRunning ? 'Running' : 'Idle'}`});
	}

	onClose() {
		const {contentEl} = this;
		contentEl.empty();
	}
}

class DebugLogsModal extends Modal {
	logger: Logger;

	constructor(app: App, logger: Logger) {
		super(app);
		this.logger = logger;
	}

	onOpen() {
		const {contentEl} = this;
		contentEl.createEl('h2', {text: 'Debug Logs'});
		
		const controlsDiv = contentEl.createDiv();
		controlsDiv.style.marginBottom = '10px';
		
		const refreshButton = controlsDiv.createEl('button', {text: 'Refresh'});
		refreshButton.onclick = () => this.refreshLogs();
		
		const clearButton = controlsDiv.createEl('button', {text: 'Clear Logs'});
		clearButton.onclick = () => this.clearLogs();
		clearButton.style.marginLeft = '10px';
		
		const exportButton = controlsDiv.createEl('button', {text: 'Export Logs'});
		exportButton.onclick = () => this.exportLogs();
		exportButton.style.marginLeft = '10px';
		
		this.logsContainer = contentEl.createDiv();
		this.logsContainer.style.maxHeight = '400px';
		this.logsContainer.style.overflow = 'auto';
		this.logsContainer.style.border = '1px solid var(--background-modifier-border)';
		this.logsContainer.style.padding = '10px';
		this.logsContainer.style.fontFamily = 'monospace';
		this.logsContainer.style.fontSize = '12px';
		
		this.refreshLogs();
	}

	refreshLogs(): void {
		const logs = this.logger.getRecentLogs(100);
		this.logsContainer.empty();
		
		if (logs.length === 0) {
			this.logsContainer.createEl('p', {text: 'No logs available'});
			return;
		}
		
		logs.forEach(log => {
			const logDiv = this.logsContainer.createDiv();
			logDiv.style.marginBottom = '5px';
			logDiv.style.whiteSpace = 'pre-wrap';
			logDiv.textContent = log;
			
			// Color code by log level
			if (log.includes('[ERROR]')) {
				logDiv.style.color = 'var(--text-error)';
			} else if (log.includes('[WARN]')) {
				logDiv.style.color = 'var(--text-warning)';
			} else if (log.includes('[DEBUG]')) {
				logDiv.style.color = 'var(--text-muted)';
			}
		});
		
		// Scroll to bottom
		this.logsContainer.scrollTop = this.logsContainer.scrollHeight;
	}

	clearLogs(): void {
		this.logger.clearLogs();
		this.refreshLogs();
	}

	async exportLogs(): Promise<void> {
		const logs = this.logger.exportLogs();
		const filename = `todoist-sync-logs-${new Date().toISOString().split('T')[0]}.txt`;
		
		try {
			// Create a blob and download (if supported)
			const blob = new Blob([logs], { type: 'text/plain' });
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = filename;
			a.click();
			URL.revokeObjectURL(url);
			
			new Notice('Logs exported successfully');
		} catch (error) {
			// Fallback: copy to clipboard
			navigator.clipboard.writeText(logs);
			new Notice('Logs copied to clipboard');
		}
	}

	onClose() {
		const {contentEl} = this;
		contentEl.empty();
	}

	private logsContainer: HTMLDivElement;
}

class TodoistSyncSettingTab extends PluginSettingTab {
	plugin: TodoistSyncPlugin;

	constructor(app: App, plugin: TodoistSyncPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Todoist API Token')
			.setDesc('Your personal Todoist API token. Get it from https://todoist.com/prefs/integrations')
			.addText(text => text
				.setPlaceholder('Enter your API token')
				.setValue(this.plugin.settings.todoistApiToken)
				.onChange(async (value) => {
					this.plugin.settings.todoistApiToken = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Sync Folder Path')
			.setDesc('Folder where Todoist notes will be stored')
			.addText(text => text
				.setPlaceholder('TodoistSync')
				.setValue(this.plugin.settings.syncFolderPath)
				.onChange(async (value) => {
					this.plugin.settings.syncFolderPath = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Scope Tag')
			.setDesc('Tag used to identify notes that should be synced with Todoist')
			.addText(text => text
				.setPlaceholder('todoist')
				.setValue(this.plugin.settings.scopeTag)
				.onChange(async (value) => {
					this.plugin.settings.scopeTag = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Auto Sync Interval')
			.setDesc('How often to automatically sync (in minutes)')
			.addSlider(slider => slider
				.setLimits(1, 60, 1)
				.setValue(this.plugin.settings.autoSyncInterval / 60)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.autoSyncInterval = value * 60;
					await this.plugin.saveSettings();
				}));

		// Property mapping settings
		containerEl.createEl('h3', {text: 'Property Mapping'});
		containerEl.createEl('p', {text: 'Choose which Todoist properties to include in note frontmatter:'});

		const properties = [
			{key: 'content', name: 'Task Content', desc: 'The main task description'},
			{key: 'dueDate', name: 'Due Date', desc: 'Task due date and time'},
			{key: 'priority', name: 'Priority', desc: 'Task priority level (1-4)'},
			{key: 'labels', name: 'Labels', desc: 'Task labels/tags'},
			{key: 'project', name: 'Project', desc: 'Project association'},
			{key: 'section', name: 'Section', desc: 'Section within project'}
		];

		properties.forEach(prop => {
			new Setting(containerEl)
				.setName(prop.name)
				.setDesc(prop.desc)
				.addToggle(toggle => toggle
					.setValue(this.plugin.settings.enabledProperties[prop.key as keyof typeof this.plugin.settings.enabledProperties])
					.onChange(async (value) => {
						this.plugin.settings.enabledProperties[prop.key as keyof typeof this.plugin.settings.enabledProperties] = value;
						await this.plugin.saveSettings();
					}));
		});

		// Debug settings
		containerEl.createEl('h3', {text: 'Debug & Testing'});
		
		new Setting(containerEl)
			.setName('Debug Mode')
			.setDesc('Enable detailed logging and debug notifications')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.debugMode)
				.onChange(async (value) => {
					this.plugin.settings.debugMode = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Dry Run Mode')
			.setDesc('Preview changes without actually modifying files or Todoist')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.dryRunMode)
				.onChange(async (value) => {
					this.plugin.settings.dryRunMode = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Real-time Sync')
			.setDesc('Automatically sync changes when you modify notes in Obsidian')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.realTimeSyncEnabled)
				.onChange(async (value) => {
					this.plugin.settings.realTimeSyncEnabled = value;
					await this.plugin.saveSettings();
					
					// Restart sync engine to apply the setting
					if (this.plugin.syncEngine) {
						if (value) {
							this.plugin.syncEngine.startFileWatching();
						} else {
							this.plugin.syncEngine.stopFileWatching();
						}
					}
				}));

		new Setting(containerEl)
			.setName('Enable Auto Sync')
			.setDesc('Automatically sync with Todoist at regular intervals')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.autoSyncEnabled)
				.onChange(async (value) => {
					this.plugin.settings.autoSyncEnabled = value;
					await this.plugin.saveSettings();
					this.plugin.setupAutoSync();
				}));

		// Debug actions
		const debugActionsDiv = containerEl.createDiv();
		debugActionsDiv.style.marginTop = '10px';
		
		const testConnectionBtn = debugActionsDiv.createEl('button', {text: 'Test Connection'});
		testConnectionBtn.onclick = () => this.plugin.testConnection();
		testConnectionBtn.style.marginRight = '10px';
		
		const validateDataBtn = debugActionsDiv.createEl('button', {text: 'Validate Data'});
		validateDataBtn.onclick = () => this.plugin.validateTodoistData();
		validateDataBtn.style.marginRight = '10px';
		
		const showLogsBtn = debugActionsDiv.createEl('button', {text: 'Show Logs'});
		showLogsBtn.onclick = () => new DebugLogsModal(this.app, this.plugin.logger).open();
		showLogsBtn.style.marginRight = '10px';
		
		const dryRunBtn = debugActionsDiv.createEl('button', {text: 'Dry Run Sync'});
		dryRunBtn.onclick = () => this.plugin.performDryRunSync();
	}
}