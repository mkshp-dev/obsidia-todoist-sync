import { TFile, TFolder, Vault, MetadataCache } from 'obsidian';
import { 
	ObsidianTaskNote, 
	ObsidianProjectNote, 
	ObsidianSectionNote,
	TaskFrontmatter,
	ProjectFrontmatter,
	SectionFrontmatter
} from '../models/types';

/**
 * Source B: Represents the current state of Obsidian notes
 * This tracks all notes that belong to our sync scope
 */
export class ObsidianState {
	private vault: Vault;
	private metadataCache: MetadataCache;
	private syncFolderPath: string;
	private scopeTag: string;

	private taskNotes: Map<string, ObsidianTaskNote> = new Map(); // key: todoist_id
	private projectNotes: Map<string, ObsidianProjectNote> = new Map(); // key: todoist_id
	private sectionNotes: Map<string, ObsidianSectionNote> = new Map(); // key: todoist_id
	
	// Reverse mappings for file path lookups
	private filePathToTodoistId: Map<string, string> = new Map();

	constructor(vault: Vault, metadataCache: MetadataCache, syncFolderPath: string, scopeTag: string) {
		this.vault = vault;
		this.metadataCache = metadataCache;
		this.syncFolderPath = syncFolderPath;
		this.scopeTag = scopeTag;
	}

	/**
	 * Scan the vault for all notes in our sync scope
	 */
	async scanVault(): Promise<void> {
		this.taskNotes.clear();
		this.projectNotes.clear();
		this.sectionNotes.clear();
		this.filePathToTodoistId.clear();

		const syncFolder = this.vault.getAbstractFileByPath(this.syncFolderPath);
		if (!syncFolder || !(syncFolder instanceof TFolder)) {
			console.log(`Sync folder ${this.syncFolderPath} does not exist`);
			return;
		}

		console.debug(`[ObsidianState] Starting vault scan in: ${this.syncFolderPath}`);
		await this.scanFolderRecursively(syncFolder);
		console.debug(`[ObsidianState] Scan complete - Tasks: ${this.taskNotes.size}, Projects: ${this.projectNotes.size}, Sections: ${this.sectionNotes.size}`);
	}

	/**
	 * Recursively scan folder for sync notes
	 */
	private async scanFolderRecursively(folder: TFolder): Promise<void> {
		for (const child of folder.children) {
			if (child instanceof TFile && child.extension === 'md') {
				await this.processFile(child);
			} else if (child instanceof TFolder) {
				await this.scanFolderRecursively(child);
			}
		}
	}

	/**
	 * Process a single file to check if it's in our sync scope
	 */
	private async processFile(file: TFile): Promise<void> {
		const cache = this.metadataCache.getFileCache(file);
		if (!cache || !cache.frontmatter) return;

		const frontmatter = cache.frontmatter;
		
		// Only include files that have a todoist_id (simplified scope)
		const hasTodoistId = frontmatter.todoist_id;
		
		if (!hasTodoistId) return;

		console.debug(`[ObsidianState] Processing file: ${file.path}, todoist_id: ${hasTodoistId}, type: ${frontmatter.todoist_type || 'task'}`);

		try {
			const content = await this.vault.read(file);
			const todoistId = frontmatter.todoist_id;

			if (todoistId) {
				this.filePathToTodoistId.set(file.path, todoistId);
			}

			// Determine the type of note based on frontmatter
			const todoistType = frontmatter.todoist_type;

			if (todoistType === 'project') {
				// Check for duplicate project
				if (this.projectNotes.has(todoistId)) {
					console.warn(`[ObsidianState] Duplicate project found! ID: ${todoistId}, existing: ${this.projectNotes.get(todoistId)?.filePath}, new: ${file.path}`);
				}
				const projectNote: ObsidianProjectNote = {
					filePath: file.path,
					todoistId: todoistId,
					name: frontmatter.title || file.basename,
					frontmatter: frontmatter as ProjectFrontmatter,
					lastModified: file.stat.mtime
				};
				if (todoistId) {
					this.projectNotes.set(todoistId, projectNote);
					console.debug(`[ObsidianState] Added project: ${todoistId} -> ${file.path}`);
				}
			} else if (todoistType === 'section') {
				// Check for duplicate section
				if (this.sectionNotes.has(todoistId)) {
					console.warn(`[ObsidianState] Duplicate section found! ID: ${todoistId}, existing: ${this.sectionNotes.get(todoistId)?.filePath}, new: ${file.path}`);
				}
				const sectionNote: ObsidianSectionNote = {
					filePath: file.path,
					todoistId: todoistId,
					name: frontmatter.title || file.basename,
					projectId: frontmatter.todoist_project || '',
					frontmatter: frontmatter as SectionFrontmatter,
					lastModified: file.stat.mtime
				};
				if (todoistId) {
					this.sectionNotes.set(todoistId, sectionNote);
					console.debug(`[ObsidianState] Added section: ${todoistId} -> ${file.path}`);
				}
			} else {
				// Default to task note
				// Check for duplicate task
				if (this.taskNotes.has(todoistId)) {
					console.warn(`[ObsidianState] Duplicate task found! ID: ${todoistId}, existing: ${this.taskNotes.get(todoistId)?.filePath}, new: ${file.path}`);
				}
				const taskNote: ObsidianTaskNote = {
					filePath: file.path,
					todoistId: todoistId || '',
					content: content,
					frontmatter: frontmatter as TaskFrontmatter,
					lastModified: file.stat.mtime
				};
				if (todoistId) {
					this.taskNotes.set(todoistId, taskNote);
					console.debug(`[ObsidianState] Added task: ${todoistId} -> ${file.path}`);
				}
			}
		} catch (error) {
			console.error(`Error processing file ${file.path}:`, error);
		}
	}

	/**
	 * Get all task notes
	 */
	getAllTaskNotes(): ObsidianTaskNote[] {
		return Array.from(this.taskNotes.values());
	}

	/**
	 * Get task note by Todoist ID
	 */
	getTaskNote(todoistId: string): ObsidianTaskNote | undefined {
		return this.taskNotes.get(todoistId);
	}

	/**
	 * Get all project notes
	 */
	getAllProjectNotes(): ObsidianProjectNote[] {
		return Array.from(this.projectNotes.values());
	}

	/**
	 * Get project note by Todoist ID
	 */
	getProjectNote(todoistId: string): ObsidianProjectNote | undefined {
		return this.projectNotes.get(todoistId);
	}

	/**
	 * Get all section notes
	 */
	getAllSectionNotes(): ObsidianSectionNote[] {
		return Array.from(this.sectionNotes.values());
	}

	/**
	 * Get section note by Todoist ID
	 */
	getSectionNote(todoistId: string): ObsidianSectionNote | undefined {
		return this.sectionNotes.get(todoistId);
	}

	/**
	 * Get sections for a specific project
	 */
	getSectionNotesForProject(projectId: string): ObsidianSectionNote[] {
		return this.getAllSectionNotes().filter(section => section.projectId === projectId);
	}

	/**
	 * Get tasks for a specific project
	 */
	getTaskNotesForProject(projectId: string): ObsidianTaskNote[] {
		return this.getAllTaskNotes().filter(task => task.frontmatter.todoist_project === projectId);
	}

	/**
	 * Add or update a task note
	 */
	setTaskNote(todoistId: string, note: ObsidianTaskNote): void {
		this.taskNotes.set(todoistId, note);
		this.filePathToTodoistId.set(note.filePath, todoistId);
	}

	/**
	 * Add or update a project note
	 */
	setProjectNote(todoistId: string, note: ObsidianProjectNote): void {
		this.projectNotes.set(todoistId, note);
		this.filePathToTodoistId.set(note.filePath, todoistId);
	}

	/**
	 * Add or update a section note
	 */
	setSectionNote(todoistId: string, note: ObsidianSectionNote): void {
		this.sectionNotes.set(todoistId, note);
		this.filePathToTodoistId.set(note.filePath, todoistId);
	}

	/**
	 * Remove a note by Todoist ID
	 */
	removeNote(todoistId: string): void {
		const taskNote = this.taskNotes.get(todoistId);
		const projectNote = this.projectNotes.get(todoistId);
		const sectionNote = this.sectionNotes.get(todoistId);

		if (taskNote) {
			this.taskNotes.delete(todoistId);
			this.filePathToTodoistId.delete(taskNote.filePath);
		}
		if (projectNote) {
			this.projectNotes.delete(todoistId);
			this.filePathToTodoistId.delete(projectNote.filePath);
		}
		if (sectionNote) {
			this.sectionNotes.delete(todoistId);
			this.filePathToTodoistId.delete(sectionNote.filePath);
		}
	}

	/**
	 * Get Todoist ID for a file path
	 */
	getTodoistIdForPath(filePath: string): string | undefined {
		return this.filePathToTodoistId.get(filePath);
	}

	/**
	 * Check if a file is in our sync scope
	 */
	isInSyncScope(file: TFile): boolean {
		return this.filePathToTodoistId.has(file.path);
	}

	/**
	 * Update sync folder path
	 */
	updateSyncFolderPath(newPath: string): void {
		this.syncFolderPath = newPath;
	}

	/**
	 * Update scope tag
	 */
	updateScopeTag(newTag: string): void {
		this.scopeTag = newTag;
	}

	/**
	 * Get statistics about current state
	 */
	getStats(): { tasks: number; projects: number; sections: number } {
		return {
			tasks: this.taskNotes.size,
			projects: this.projectNotes.size,
			sections: this.sectionNotes.size
		};
	}

	/**
	 * Get all notes that have been modified since a given timestamp
	 */
	getModifiedSince(timestamp: number): {
		tasks: ObsidianTaskNote[];
		projects: ObsidianProjectNote[];
		sections: ObsidianSectionNote[];
	} {
		return {
			tasks: this.getAllTaskNotes().filter(note => note.lastModified > timestamp),
			projects: this.getAllProjectNotes().filter(note => note.lastModified > timestamp),
			sections: this.getAllSectionNotes().filter(note => note.lastModified > timestamp)
		};
	}

	/**
	 * Get detailed debug information about the current state
	 */
	getDebugInfo(): {
		totalFiles: number;
		tasks: { id: string; path: string }[];
		projects: { id: string; path: string }[];
		sections: { id: string; path: string }[];
		mappings: { [path: string]: string };
	} {
		return {
			totalFiles: this.filePathToTodoistId.size,
			tasks: Array.from(this.taskNotes.entries()).map(([id, note]) => ({ id, path: note.filePath })),
			projects: Array.from(this.projectNotes.entries()).map(([id, note]) => ({ id, path: note.filePath })),
			sections: Array.from(this.sectionNotes.entries()).map(([id, note]) => ({ id, path: note.filePath })),
			mappings: Object.fromEntries(this.filePathToTodoistId.entries())
		};
	}
}