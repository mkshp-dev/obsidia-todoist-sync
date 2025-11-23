import { Vault, MetadataCache, Notice, TFile, TFolder } from 'obsidian';
import { TodoistSyncAPI } from '../api/todoistSync';
import { TodoistState } from '../state/todoistState';
import { ObsidianState } from '../state/obsidianState';
import { FileGenerator } from '../obsidian/fileGenerator';
import { Logger } from '../utils/logger';
import { FrontmatterParser } from '../utils/frontmatterParser';
import { 
	TodoistTask, 
	TodoistProject, 
	TodoistSection,
	SyncConflict,
	ObsidianTaskNote,
	ObsidianProjectNote,
	ObsidianSectionNote
} from '../models/types';

export interface SyncEngineSettings {
	todoistApiToken: string;
	syncFolderPath: string;
	scopeTag: string;
	enabledProperties: Record<string, boolean>;
	realTimeSyncEnabled?: boolean;
	dryRunMode?: boolean;
}

/**
 * Main sync engine that coordinates between Todoist and Obsidian states
 */
export class SyncEngine {
	private vault: Vault;
	private metadataCache: MetadataCache;
	private settings: SyncEngineSettings;
	
	private todoistAPI: TodoistSyncAPI;
	private todoistState: TodoistState;
	private obsidianState: ObsidianState;
	private fileGenerator: FileGenerator;
	private logger: Logger;
	private frontmatterParser: FrontmatterParser;
	
	private isRunning = false;
	private lastSyncTime = 0;
	private pendingChanges: Map<string, { filePath: string; lastModified: number }> = new Map();
	private isWatchingFiles = false;

	constructor(vault: Vault, metadataCache: MetadataCache, settings: SyncEngineSettings) {
		this.vault = vault;
		this.metadataCache = metadataCache;
		this.settings = settings;

		this.todoistAPI = new TodoistSyncAPI(settings.todoistApiToken);
		this.todoistState = new TodoistState();
		this.obsidianState = new ObsidianState(
			vault, 
			metadataCache, 
			settings.syncFolderPath, 
			settings.scopeTag
		);
		this.fileGenerator = new FileGenerator(
			vault,
			settings.syncFolderPath,
			settings.scopeTag,
			settings.enabledProperties
		);
		// propagate dry-run mode to file generator
		if (settings.dryRunMode) {
			this.fileGenerator.setDryRunMode(true);
		}
		this.logger = Logger.getInstance();
		this.frontmatterParser = new FrontmatterParser();
	}

	/**
	 * Public: Fetch latest data from Todoist into local state (no file changes)
	 */
	async fetchFromTodoist(): Promise<{ success: boolean; message: string }> {
		if (this.isRunning) return { success: false, message: 'Sync already in progress' };
		if (!this.settings.todoistApiToken) return { success: false, message: 'Todoist API token not configured' };

		this.isRunning = true;
		try {
			new Notice('Fetching latest data from Todoist...');
			console.log('fetchFromTodoist: starting');
			await this.syncFromTodoist();
			this.lastSyncTime = Date.now();
			console.log('fetchFromTodoist: completed');
			return { success: true, message: 'Fetched from Todoist' };
		} catch (error) {
			console.error('fetchFromTodoist failed:', error);
			return { success: false, message: `Fetch failed: ${error.message}` };
		} finally {
			this.isRunning = false;
		}
	}

	/**
	 * Public: Scan Obsidian vault and update local Obsidian state (no remote changes)
	 */
	async scan(): Promise<{ success: boolean; message: string }> {
		if (this.isRunning) return { success: false, message: 'Sync already in progress' };

		this.isRunning = true;
		try {
			new Notice('Scanning Obsidian for syncable notes...');
			console.log('scan: starting');
			await this.scanObsidianChanges();
			this.lastSyncTime = Date.now();
			console.log('scan: completed');
			return { success: true, message: 'Scanned Obsidian' };
		} catch (error) {
			console.error('scan failed:', error);
			return { success: false, message: `Scan failed: ${error.message}` };
		} finally {
			this.isRunning = false;
		}
	}

	/**
	 * Public: Pull remote changes and reconcile with local (fetch + scan + reconcile)
	 */
	async pull(): Promise<{ success: boolean; message: string }> {
		if (this.isRunning) return { success: false, message: 'Sync already in progress' };
		if (!this.settings.todoistApiToken) return { success: false, message: 'Todoist API token not configured' };

		this.isRunning = true;
		try {
			new Notice('Starting pull (fetch + scan + reconcile)...');
			console.log('pull: starting');
			await this.syncFromTodoist();
			await this.scanObsidianChanges();
			await this.reconcileStates();
			this.lastSyncTime = Date.now();
			console.log('pull: completed');
			return { success: true, message: 'Pull completed' };
		} catch (error) {
			console.error('pull failed:', error);
			return { success: false, message: `Pull failed: ${error.message}` };
		} finally {
			this.isRunning = false;
		}
	}

	/**
	 * Update settings and reinitialize components
	 */
	updateSettings(newSettings: SyncEngineSettings): void {
		this.settings = newSettings;
		this.todoistAPI = new TodoistSyncAPI(newSettings.todoistApiToken);
		this.obsidianState.updateSyncFolderPath(newSettings.syncFolderPath);
		this.obsidianState.updateScopeTag(newSettings.scopeTag);
		this.fileGenerator = new FileGenerator(
			this.vault,
			newSettings.syncFolderPath,
			newSettings.scopeTag,
			newSettings.enabledProperties
		);
		// ensure dry-run mode is applied to file generator
		if (newSettings.dryRunMode) {
			this.fileGenerator.setDryRunMode(true);
		} else {
			this.fileGenerator.setDryRunMode(false);
		}
	}

	/**
	 * Perform a full sync operation
	 */
	async performSync(): Promise<{ success: boolean; message: string }> {
		if (this.isRunning) {
			return { success: false, message: 'Sync already in progress' };
		}

		if (!this.settings.todoistApiToken) {
			return { success: false, message: 'Todoist API token not configured' };
		}

		this.isRunning = true;
		
		try {
			new Notice('Starting Todoist sync...');

			// Test connection first
			const connectionValid = await this.todoistAPI.testConnection();
			if (!connectionValid) {
				throw new Error('Failed to connect to Todoist API');
			}

			// Step 1: Fetch latest data from Todoist
			await this.syncFromTodoist();

			// Step 2: Scan Obsidian for changes
			await this.scanObsidianChanges();

			// Step 3: Sync changes from Obsidian to Todoist
			await this.syncToTodoist();

			// Step 4: Reconcile states (proper 3-way sync)
			await this.reconcileStates();

			this.lastSyncTime = Date.now();
			new Notice('Sync completed successfully!');
			
			return { success: true, message: 'Sync completed successfully' };
			
		} catch (error) {
			console.error('Sync failed:', error);
			new Notice(`Sync failed: ${error.message}`);
			return { success: false, message: `Sync failed: ${error.message}` };
		} finally {
			this.isRunning = false;
		}
	}

	/**
	 * Test API connection
	 */
	async testConnection(): Promise<boolean> {
		try {
			return await this.todoistAPI.testConnection();
		} catch (error) {
			console.error('Connection test failed:', error);
			return false;
		}
	}

	/**
	 * Get sync statistics
	 */
	getSyncStats(): { 
		todoist: { tasks: number; projects: number; sections: number; labels: number };
		obsidian: { tasks: number; projects: number; sections: number };
		lastSync: number;
		isRunning: boolean;
	} {
		return {
			todoist: this.todoistState.getStats(),
			obsidian: this.obsidianState.getStats(),
			lastSync: this.lastSyncTime,
			isRunning: this.isRunning
		};
	}

	/**
	 * Step 1: Sync data from Todoist to local state
	 */
	private async syncFromTodoist(): Promise<void> {
		const syncToken = this.todoistState.getSyncState().syncToken;
		const needsFullSync = this.todoistState.needsFullSync();
		
		console.log(`Syncing from Todoist (full: ${needsFullSync}, token: ${syncToken})`);
		
		try {
			// Try sync API first for incremental updates
			if (!needsFullSync && syncToken !== '*') {
				const syncResponse = await this.todoistAPI.sync(syncToken, ['all']);
				this.todoistState.updateFromSync(syncResponse);
				console.log(`Synced ${syncResponse.items?.length || 0} tasks, ${syncResponse.projects?.length || 0} projects, ${syncResponse.sections?.length || 0} sections`);
				return;
			}
		} catch (error) {
			console.log('Sync API failed, falling back to REST API:', error.message);
		}

		// Fallback to REST API for full data fetch
		console.log('Using REST API for full data fetch');
		
		const [projects, tasks, sections, labels] = await Promise.all([
			this.todoistAPI.getProjects(),
			this.todoistAPI.getTasks(),
			this.todoistAPI.getSections(),
			this.todoistAPI.getLabels()
		]);

		// Convert REST API response to sync format
		const mockSyncResponse = {
			sync_token: `rest_${Date.now()}`,
			full_sync: true,
			projects: projects,
			items: tasks,
			sections: sections,
			labels: labels,
			temp_id_mapping: {}
		};

		this.todoistState.updateFromSync(mockSyncResponse);
		console.log(`Fetched ${tasks.length} tasks, ${projects.length} projects, ${sections.length} sections via REST API`);
	}

	/**
	 * Step 2: Scan Obsidian vault for changes
	 */
	private async scanObsidianChanges(): Promise<void> {
		console.log('Scanning Obsidian for changes...');
		await this.obsidianState.scanVault();
		
		const stats = this.obsidianState.getStats();
		console.log(`Found ${stats.tasks} task notes, ${stats.projects} project notes, ${stats.sections} section notes`);
	}

	/**
	 * Step 3: Sync changes from Obsidian to Todoist
	 */
	private async syncToTodoist(): Promise<void> {
		const timerId = this.logger.syncStart('Obsidian → Todoist Sync');
		
		try {
			// Process pending file changes first
			await this.processPendingChanges();
			
			// Then check for any other modified notes since last sync
			const modifiedNotes = this.obsidianState.getModifiedSince(this.lastSyncTime);
			
			if (modifiedNotes.tasks.length === 0 && modifiedNotes.projects.length === 0 && modifiedNotes.sections.length === 0 && this.pendingChanges.size === 0) {
				this.logger.debug('No Obsidian changes to sync');
				return;
			}

			this.logger.info(`Syncing ${modifiedNotes.tasks.length} tasks, ${modifiedNotes.projects.length} projects, ${modifiedNotes.sections.length} sections to Todoist`);

			// Process modified tasks using REST API
			let syncedCount = 0;
			for (const taskNote of modifiedNotes.tasks) {
				const success = await this.syncTaskToTodoist(taskNote);
				if (success) syncedCount++;
			}

			// Process modified projects
			for (const projectNote of modifiedNotes.projects) {
				await this.syncProjectToTodoist(projectNote);
			}

			this.logger.syncComplete('Obsidian → Todoist Sync', timerId, { 
				synced: syncedCount,
				total: modifiedNotes.tasks.length 
			});
		} catch (error) {
			this.logger.syncError('Obsidian → Todoist Sync', error);
		}
	}

	/**
	 * Step 4: Reconcile Todoist and Obsidian states (proper 3-way sync)
	 */
	private async reconcileStates(): Promise<void> {
		console.log('Starting three-way reconciliation...');

		const stats = {
			created: { tasks: 0, projects: 0, sections: 0 },
			updated: { tasks: 0, projects: 0, sections: 0 },
			skipped: { tasks: 0, projects: 0, sections: 0 }
		};

		// Build lookup maps for efficiency
		const projectMap = new Map<string, string>();
		const sectionMap = new Map<string, string>();

		// Reconcile projects first
		const todoistProjects = this.todoistState.getAllProjects();
		for (const project of todoistProjects) {
			const result = await this.reconcileProject(project);
			stats[result].projects++;
			projectMap.set(project.id, project.name);
		}

		// Reconcile sections
		const todoistSections = this.todoistState.getAllSections();
		for (const section of todoistSections) {
			const projectName = projectMap.get(section.project_id);
			if (projectName) {
				const result = await this.reconcileSection(section, projectName);
				stats[result].sections++;
				sectionMap.set(section.id, section.name);
			}
		}

		// Reconcile tasks
		const todoistTasks = this.todoistState.getAllTasks();
		for (const task of todoistTasks) {
			const projectName = projectMap.get(task.project_id);
			const sectionName = task.section_id ? sectionMap.get(task.section_id) : undefined;
			
			const result = await this.reconcileTask(task, projectName, sectionName);
			stats[result].tasks++;
		}

		console.log(`Reconciliation complete:`);
		console.log(`  Created: ${stats.created.tasks} tasks, ${stats.created.projects} projects, ${stats.created.sections} sections`);
		console.log(`  Updated: ${stats.updated.tasks} tasks, ${stats.updated.projects} projects, ${stats.updated.sections} sections`);
		console.log(`  Skipped: ${stats.skipped.tasks} tasks, ${stats.skipped.projects} projects, ${stats.skipped.sections} sections`);
	}

	/**
	 * Process pending file changes from real-time detection
	 */
	async processPendingChanges(): Promise<void> {
		if (this.pendingChanges.size === 0) return;
		
		this.logger.debug(`Processing ${this.pendingChanges.size} pending file changes`);
		
		for (const [filePath, changeInfo] of this.pendingChanges.entries()) {
			try {
				await this.processFileChange(filePath);
			} catch (error) {
				this.logger.error(`Failed to process file change: ${filePath}`, error);
			}
		}
		
		this.pendingChanges.clear();
	}

	/**
	 * Process a single file change
	 */
	private async processFileChange(filePath: string): Promise<void> {
		const file = this.vault.getAbstractFileByPath(filePath);
		if (!(file instanceof TFile)) {
			this.logger.debug(`File not found or not a file: ${filePath}`);
			return;
		}

		try {
			const content = await this.vault.read(file);
			
			// Check if file is in sync scope (has todoist_id)
			if (!this.frontmatterParser.isInSyncScope(content, this.settings.scopeTag)) {
				return;
			}

			// Extract changes based on file type
			const taskChanges = this.frontmatterParser.extractTaskChanges(content);
			if (taskChanges.frontmatter?.todoist_id) {
				await this.syncTaskChangesToTodoist(taskChanges.frontmatter.todoist_id, taskChanges, file);
				return;
			}

			const projectChanges = this.frontmatterParser.extractProjectChanges(content);
			if (projectChanges.frontmatter?.todoist_id) {
				await this.syncProjectChangesToTodoist(projectChanges.frontmatter.todoist_id, projectChanges);
				return;
			}

		} catch (error) {
			this.logger.error(`Failed to process file ${filePath}`, error);
		}
	}

	/**
	 * Sync task changes to Todoist
	 */
	private async syncTaskChangesToTodoist(todoistId: string, changes: any, file: TFile): Promise<void> {
		const existingTask = this.todoistState.getTask(todoistId);
		if (!existingTask) {
			this.logger.warn(`Task ${todoistId} not found in Todoist state, skipping update`);
			return;
		}

		try {
			let hasUpdates = false;

			// Check for completion status changes first
			if (changes.completed !== undefined && changes.completed !== existingTask.checked) {
				if (this.settings.dryRunMode) {
					this.logger.info(`Dry-run: would change completion for ${todoistId} -> ${changes.completed}`);
				} else {
					if (changes.completed) {
						await this.todoistAPI.closeTask(todoistId);
						this.logger.info(`Completed task: ${existingTask.content}`);
					} else {
						await this.todoistAPI.reopenTask(todoistId);
						this.logger.info(`Reopened task: ${existingTask.content}`);
					}
				}
				hasUpdates = true;
			}

			// Check for other property changes
			const updates: any = {};
			
			if (changes.title && changes.title !== existingTask.content) {
				updates.content = changes.title;
			}

			if (changes.frontmatter?.priority !== undefined && changes.frontmatter.priority !== existingTask.priority) {
				updates.priority = changes.frontmatter.priority;
			}

			if (Object.keys(updates).length > 0) {
				if (this.settings.dryRunMode) {
					this.logger.info(`Dry-run: would update task ${todoistId}`, updates);
				} else {
					await this.todoistAPI.updateTask(todoistId, updates);
					this.logger.info(`Updated task ${todoistId}`, updates);
				}
				hasUpdates = true;
			}

			if (hasUpdates) {
				// Update the file's last_sync timestamp unless dry-run
				if (this.settings.dryRunMode) {
					this.logger.info(`Dry-run: would update last_sync for file ${file.path}`);
				} else {
					await this.updateFileSyncTimestamp(file);
				}
			}

		} catch (error) {
			this.logger.error(`Failed to sync task ${todoistId}`, error);
		}
	}

	/**
	 * Sync project changes to Todoist
	 */
	private async syncProjectChangesToTodoist(todoistId: string, changes: any): Promise<void> {
		const existingProject = this.todoistState.getProject(todoistId);
		if (!existingProject) {
			this.logger.warn(`Project ${todoistId} not found in Todoist state, skipping update`);
			return;
		}

		try {
			const updates: any = {};
			
			if (changes.title && changes.title !== existingProject.name) {
				updates.name = changes.title;
			}

			if (Object.keys(updates).length > 0) {
				if (this.settings.dryRunMode) {
					this.logger.info(`Dry-run: would update project ${todoistId}`, updates);
				} else {
					await this.todoistAPI.updateTask(todoistId, updates); // Note: This should be updateProject when available
					this.logger.info(`Updated project ${todoistId}`, updates);
				}
			}

		} catch (error) {
			this.logger.error(`Failed to sync project ${todoistId}`, error);
		}
	}

	/**
	 * Reconcile a single task (create, update, or skip)
	 */
	private async reconcileTask(task: TodoistTask, projectName?: string, sectionName?: string): Promise<'created' | 'updated' | 'skipped'> {
		const existingNote = this.obsidianState.getTaskNote(task.id);

		if (!existingNote) {
			// NEW: Create file for new Todoist task
			if (task.content.toLowerCase().includes('calendar')) {
				console.debug(`******(contains 'calendar'): ${task.content}`);
			}
			console.debug(`Creating new task file: ${task.content}`);
			const taskNote = await this.fileGenerator.createOrUpdateTaskNote(task, projectName, sectionName);
			this.obsidianState.setTaskNote(task.id, taskNote);
			return 'created';
		}

		// Check if Todoist version is newer than our last sync
		const todoistModified = new Date(task.date_added).getTime();
		const lastSyncTime = this.parseLastSyncTime(existingNote.frontmatter.last_sync);

		if (todoistModified > lastSyncTime) {
			// UPDATED: Todoist is newer, update the file (preserve existing file path to avoid duplicates)
			console.debug(`Updating task file: ${task.content} (Todoist newer)`);
			const updatedNote = await this.fileGenerator.createOrUpdateTaskNote(task, projectName, sectionName, existingNote.filePath);
			this.obsidianState.setTaskNote(task.id, updatedNote);
			return 'updated';
		}

		// UNCHANGED: Local version is current, skip
		console.debug(`Skipping task file: ${task.content} (local is current)`);
		return 'skipped';
	}

	/**
	 * Reconcile a single project (create, update, or skip)
	 */
	private async reconcileProject(project: TodoistProject): Promise<'created' | 'updated' | 'skipped'> {
		const existingNote = this.obsidianState.getProjectNote(project.id);

		if (!existingNote) {
			// NEW: Create file for new Todoist project
			console.debug(`Creating new project file: ${project.name}`);
			const projectNote = await this.fileGenerator.createOrUpdateProjectNote(project);
			this.obsidianState.setProjectNote(project.id, projectNote);
			return 'created';
		}

		// Check for content changes
		const contentChanged = existingNote.name !== project.name || 
			existingNote.frontmatter.color !== project.color ||
			existingNote.frontmatter.is_favorite !== project.is_favorite;

		if (contentChanged) {
			// UPDATED: Content changed, update the file
			console.debug(`Updating project file: ${project.name} (content changed)`);
			const updatedNote = await this.fileGenerator.createOrUpdateProjectNote(project);
			this.obsidianState.setProjectNote(project.id, updatedNote);
			return 'updated';
		}

		// UNCHANGED: No changes, skip
		console.debug(`Skipping project file: ${project.name} (no changes)`);
		return 'skipped';
	}

	/**
	 * Reconcile a single section (create, update, or skip)
	 */
	private async reconcileSection(section: TodoistSection, projectName: string): Promise<'created' | 'updated' | 'skipped'> {
		const existingNote = this.obsidianState.getSectionNote(section.id);

		if (!existingNote) {
			// NEW: Create file for new Todoist section
			console.debug(`Creating new section file: ${section.name}`);
			const sectionNote = await this.fileGenerator.createOrUpdateSectionNote(section, projectName);
			this.obsidianState.setSectionNote(section.id, sectionNote);
			return 'created';
		}

		// Check for content changes
		const contentChanged = existingNote.name !== section.name;

		if (contentChanged) {
			// UPDATED: Content changed, update the file
			console.debug(`Updating section file: ${section.name} (content changed)`);
			const updatedNote = await this.fileGenerator.createOrUpdateSectionNote(section, projectName);
			this.obsidianState.setSectionNote(section.id, updatedNote);
			return 'updated';
		}

		// UNCHANGED: No changes, skip
		console.debug(`Skipping section file: ${section.name} (no changes)`);
		return 'skipped';
	}

	/**
	 * Parse last_sync timestamp from frontmatter
	 */
	private parseLastSyncTime(lastSync: string | undefined): number {
		if (!lastSync) return 0; // Never synced
		const parsed = new Date(lastSync).getTime();
		return isNaN(parsed) ? 0 : parsed;
	}

	/**
	 * Update file's sync timestamp in frontmatter
	 */
	private async updateFileSyncTimestamp(file: TFile): Promise<void> {
		try {
			const content = await this.vault.read(file);
			const parsed = this.frontmatterParser.parseFrontmatter(content);
			
			if (parsed) {
				parsed.frontmatter.last_sync = new Date().toISOString();
				parsed.frontmatter.sync_status = 'synced';
				
				// Reconstruct file content with updated frontmatter
				const newFrontmatter = this.serializeFrontmatter(parsed.frontmatter);
				const newContent = `${newFrontmatter}\n${parsed.body}`;
				
				await this.vault.modify(file, newContent);
			}
		} catch (error) {
			this.logger.error(`Failed to update sync timestamp for ${file.path}`, error);
		}
	}

	/**
	 * Serialize frontmatter to YAML format
	 */
	private serializeFrontmatter(frontmatter: any): string {
		let yaml = '---\n';
		
		for (const [key, value] of Object.entries(frontmatter)) {
			if (value !== undefined && value !== null) {
				if (Array.isArray(value)) {
					yaml += `${key}:\n`;
					for (const item of value) {
						yaml += `  - ${item}\n`;
					}
				} else if (typeof value === 'string' && value.includes(':')) {
					yaml += `${key}: "${value}"\n`;
				} else {
					yaml += `${key}: ${value}\n`;
				}
			}
		}
		
		yaml += '---';
		return yaml;
	}

	/**
	 * Legacy method - updated to return boolean for compatibility
	 */
	private async syncTaskToTodoist(taskNote: ObsidianTaskNote): Promise<boolean> {
		try {
			await this.syncTaskChangesToTodoist(taskNote.todoistId, {
				title: taskNote.frontmatter.title,
				completed: taskNote.frontmatter.completed,
				frontmatter: taskNote.frontmatter
			}, null as any);
			return true;
		} catch (error) {
			this.logger.error(`Failed to sync task note`, error);
			return false;
		}
	}

	/**
	 * Legacy method for project sync
	 */
	private async syncProjectToTodoist(projectNote: ObsidianProjectNote): Promise<void> {
		await this.syncProjectChangesToTodoist(projectNote.todoistId, {
			title: projectNote.frontmatter.title
		});
	}

	/**
	 * Create update command for a modified project note
	 */
	private async createProjectUpdateCommand(projectNote: ObsidianProjectNote): Promise<any | null> {
		const existingProject = this.todoistState.getProject(projectNote.todoistId);
		if (!existingProject) {
			console.log(`Project ${projectNote.todoistId} not found in Todoist state, skipping update`);
			return null;
		}

		const updates: any = {};
		
		// Check for name changes
		if (projectNote.frontmatter.title !== existingProject.name) {
			updates.name = projectNote.frontmatter.title;
		}

		if (Object.keys(updates).length > 0) {
			if (this.settings.dryRunMode) {
				this.logger.info(`Dry-run: would create project update command for ${projectNote.todoistId}`, updates);
				return null;
			}

			return this.todoistAPI.updateProjectCommand(projectNote.todoistId, updates);
		}

		return null;
	}



	/**
	 * Handle file deletion events
	 */
	async onFileDeleted(file: TFile): Promise<void> {
		const todoistId = this.obsidianState.getTodoistIdForPath(file.path);
		if (todoistId) {
			console.log(`Sync file deleted: ${file.path}, Todoist ID: ${todoistId}`);
			this.obsidianState.removeNote(todoistId);
			// In the future, we could optionally delete from Todoist as well
		}
	}

	/**
	 * Start watching files for changes
	 */
	startFileWatching(): void {
		if (this.isWatchingFiles) return;
		
		this.isWatchingFiles = true;
		this.logger.debug('Started file watching for real-time sync');
		
		// Set up periodic processing of pending changes
		setInterval(() => {
			if (this.pendingChanges.size > 0) {
				this.processPendingChanges().catch(error => {
					this.logger.error('Error processing pending changes:', error);
				});
			}
		}, 2000); // Process every 2 seconds
	}

	/**
	 * Stop watching files
	 */
	stopFileWatching(): void {
		this.isWatchingFiles = false;
		this.pendingChanges.clear();
		this.logger.debug('Stopped file watching');
	}

	/**
	 * Handle file modification (called from plugin)
	 */
	onFileModified(file: TFile): void {
		if (!this.isWatchingFiles) return;
		
		// Only track files in our sync folder
		if (!file.path.startsWith(this.settings.syncFolderPath)) return;
		
		// Track the change with current timestamp
		this.pendingChanges.set(file.path, {
			filePath: file.path,
			lastModified: Date.now()
		});
		
		this.logger.debug(`File change detected: ${file.path}`);
	}

	/**
	 * Scan all files in sync folder and sync changes to Todoist
	 */
	async scanAndSyncToTodoist(): Promise<void> {
		this.logger.debug('Scanning sync folder for changes to sync to Todoist');
		
		const syncFolder = this.vault.getAbstractFileByPath(this.settings.syncFolderPath);
		if (!syncFolder || !(syncFolder instanceof TFolder)) {
			this.logger.warn(`Sync folder not found: ${this.settings.syncFolderPath}`);
			return;
		}

		const files = this.vault.getAllLoadedFiles()
			.filter(file => file instanceof TFile && file.path.startsWith(this.settings.syncFolderPath))
			.map(file => file as TFile);

		for (const file of files) {
			try {
				await this.processFileChange(file.path);
			} catch (error) {
				this.logger.error(`Failed to process file ${file.path}:`, error);
			}
		}
		
		this.logger.info(`Processed ${files.length} files for Todoist sync`);
	}
}