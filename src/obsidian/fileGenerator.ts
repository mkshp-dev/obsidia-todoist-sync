import { Vault, TFile, TFolder } from 'obsidian';
import { Logger } from '../utils/logger';
import { 
	TodoistTask, 
	TodoistProject, 
	TodoistSection,
	TaskFrontmatter,
	ProjectFrontmatter,
	SectionFrontmatter,
	ObsidianTaskNote,
	ObsidianProjectNote,
	ObsidianSectionNote
} from '../models/types';

/**
 * Handles creation and updating of Obsidian notes from Todoist data
 */
export class FileGenerator {
	private vault: Vault;
	private syncFolderPath: string;
	private scopeTag: string;
	private enabledProperties: Record<string, boolean>;
	private dryRun: boolean = false;

	constructor(
		vault: Vault, 
		syncFolderPath: string, 
		scopeTag: string,
		enabledProperties: Record<string, boolean>
	) {
		this.vault = vault;
		this.syncFolderPath = syncFolderPath;
		this.scopeTag = scopeTag;
		this.enabledProperties = enabledProperties;
	}

	setDryRunMode(dryRun: boolean) {
		this.dryRun = Boolean(dryRun);
	}

	/**
	 * Ensure sync folder exists
	 */
	async ensureSyncFolder(): Promise<void> {
		const folder = this.vault.getAbstractFileByPath(this.syncFolderPath);
		if (!folder) {
			await this.vault.createFolder(this.syncFolderPath);
		}
	}

	/**
	 * Create or update a task note from Todoist task data
	 */
	async createOrUpdateTaskNote(task: TodoistTask, projectName?: string, sectionName?: string, existingFilePath?: string): Promise<ObsidianTaskNote> {
		await this.ensureSyncFolder();

		// If an existing file path is provided (from scanned state), use it to avoid creating duplicates
		let filePath: string;
		let folderPath: string;
		if (existingFilePath) {
			filePath = existingFilePath;
			// derive folderPath from existingFilePath
			const idx = filePath.lastIndexOf('/');
			folderPath = idx >= 0 ? filePath.substring(0, idx) : this.syncFolderPath;
		} else {
			const fileName = this.sanitizeFileName(task.content || `Task ${task.id}`);
			folderPath = this.getTaskFolderPath(projectName, sectionName);
			filePath = `${folderPath}/${fileName}.md`;
		}

		// Ensure the task's folder exists
		const taskFolder = this.vault.getAbstractFileByPath(folderPath);
		if (!taskFolder) {
			await this.vault.createFolder(folderPath);
		}

		// Build frontmatter
		const frontmatter = this.buildTaskFrontmatter(task, projectName, sectionName);
		
		// Build content
		const content = this.buildTaskContent(task, frontmatter);

		// Debug: show how the file path was derived and raw title
		Logger.getInstance().debug('[FileGenerator] createOrUpdateTaskNote: derived filePath=' + filePath, { existingFilePathParam: existingFilePath, rawTitle: task.content });
		const existingFile = this.vault.getAbstractFileByPath(filePath);
		if (this.dryRun) {
			Logger.getInstance().debug(`Dry-run: would create/modify file at ${filePath} (raw title: ${task.content})`);
			return {
				filePath: filePath,
				todoistId: task.id,
				content: content,
				frontmatter: frontmatter,
				lastModified: Date.now()
			};
		}

		if (existingFile && existingFile instanceof TFile) {
			Logger.getInstance().debug('[FileGenerator] modifying existing file: ' + filePath);
			await this.vault.modify(existingFile, content);
		} else {
			Logger.getInstance().debug('[FileGenerator] creating file: ' + filePath + ' from title: ' + task.content);
			// ensure folder exists and create
			await this.vault.create(filePath, content);
		}

		const file = this.vault.getAbstractFileByPath(filePath) as TFile;
		return {
			filePath: filePath,
			todoistId: task.id,
			content: content,
			frontmatter: frontmatter,
			lastModified: file.stat.mtime
		};
	}

	/**
	 * Create or update a project note from Todoist project data
	 */
	async createOrUpdateProjectNote(project: TodoistProject): Promise<ObsidianProjectNote> {
		await this.ensureSyncFolder();

		const fileName = this.sanitizeFileName(project.name);
		const filePath = `${this.syncFolderPath}/${fileName}/_project.md`;

		// Ensure the project folder exists
		const projectFolder = `${this.syncFolderPath}/${fileName}`;
		const folder = this.vault.getAbstractFileByPath(projectFolder);
		if (!folder) {
			await this.vault.createFolder(projectFolder);
		}

		// Build frontmatter
		const frontmatter = this.buildProjectFrontmatter(project);
		
		// Build content
		const content = this.buildProjectContent(project, frontmatter);

		const existingFile = this.vault.getAbstractFileByPath(filePath);
		if (this.dryRun) {
			console.debug(`Dry-run: would create/modify project file at ${filePath}`);
			return {
				filePath: filePath,
				todoistId: project.id,
				name: project.name,
				frontmatter: frontmatter,
				lastModified: Date.now()
			};
		}

		if (existingFile && existingFile instanceof TFile) {
			await this.vault.modify(existingFile, content);
		} else {
			await this.vault.create(filePath, content);
		}

		const file = this.vault.getAbstractFileByPath(filePath) as TFile;
		return {
			filePath: filePath,
			todoistId: project.id,
			name: project.name,
			frontmatter: frontmatter,
			lastModified: file.stat.mtime
		};
	}

	/**
	 * Create or update a section note from Todoist section data
	 */
	async createOrUpdateSectionNote(section: TodoistSection, projectName: string): Promise<ObsidianSectionNote> {
		await this.ensureSyncFolder();

		const projectFolderName = this.sanitizeFileName(projectName);
		const sectionFileName = this.sanitizeFileName(section.name);
		const filePath = `${this.syncFolderPath}/${projectFolderName}/${sectionFileName}/_section.md`;

		// Ensure the section folder exists
		const sectionFolder = `${this.syncFolderPath}/${projectFolderName}/${sectionFileName}`;
		const folder = this.vault.getAbstractFileByPath(sectionFolder);
		if (!folder) {
			await this.vault.createFolder(sectionFolder);
		}

		// Build frontmatter
		const frontmatter = this.buildSectionFrontmatter(section);
		
		// Build content
		const content = this.buildSectionContent(section, frontmatter);

		const existingFile = this.vault.getAbstractFileByPath(filePath);
		if (this.dryRun) {
			console.debug(`Dry-run: would create/modify section file at ${filePath}`);
			return {
				filePath: filePath,
				todoistId: section.id,
				name: section.name,
				projectId: section.project_id,
				frontmatter: frontmatter,
				lastModified: Date.now()
			};
		}

		if (existingFile && existingFile instanceof TFile) {
			await this.vault.modify(existingFile, content);
		} else {
			await this.vault.create(filePath, content);
		}

		const file = this.vault.getAbstractFileByPath(filePath) as TFile;
		return {
			filePath: filePath,
			todoistId: section.id,
			name: section.name,
			projectId: section.project_id,
			frontmatter: frontmatter,
			lastModified: file.stat.mtime
		};
	}

	/**
	 * Delete a note file
	 */
	async deleteNote(filePath: string): Promise<void> {
		if (this.dryRun) {
			console.debug(`Dry-run: would delete file at ${filePath}`);
			return;
		}

		const file = this.vault.getAbstractFileByPath(filePath);
		if (file && file instanceof TFile) {
			await this.vault.delete(file);
		}
	}

	/**
	 * Build task frontmatter
	 */
	private buildTaskFrontmatter(task: TodoistTask, projectName?: string, sectionName?: string): TaskFrontmatter {
		const frontmatter: TaskFrontmatter = {
			todoist_id: task.id,
			todoist_type: 'task',
			sync_status: 'synced',
			last_sync: new Date().toISOString()
		};

		if (this.enabledProperties.content) {
			frontmatter.title = task.content;
		}

		if (this.enabledProperties.dueDate && task.due) {
			if (task.due.date) frontmatter.due_date = task.due.date;
			if (task.due.datetime) frontmatter.due_datetime = task.due.datetime;
		}

		if (this.enabledProperties.priority) {
			frontmatter.priority = task.priority;
		}

		if (this.enabledProperties.labels && task.labels.length > 0) {
			frontmatter.labels = task.labels;
		}

		if (this.enabledProperties.project && projectName) {
			frontmatter.todoist_project = projectName;
		}

		if (this.enabledProperties.section && sectionName) {
			frontmatter.todoist_section = sectionName;
		}

		frontmatter.completed = task.checked;

		if (task.description) {
			frontmatter.description = task.description;
		}

		if (task.parent_id) {
			frontmatter.parent_task = task.parent_id;
		}

		return frontmatter;
	}



	/**
	 * Build project frontmatter
	 */
	private buildProjectFrontmatter(project: TodoistProject): ProjectFrontmatter {
		return {
			todoist_id: project.id,
			todoist_type: 'project',
			title: project.name,
			color: project.color,
			parent_project: project.parent_id || undefined,
			is_favorite: project.is_favorite,
			sync_status: 'synced',
			last_sync: new Date().toISOString()
		};
	}

	/**
	 * Build section frontmatter
	 */
	private buildSectionFrontmatter(section: TodoistSection): SectionFrontmatter {
		return {
			todoist_id: section.id,
			todoist_type: 'section',
			title: section.name,
			todoist_project: section.project_id,
			sync_status: 'synced',
			last_sync: new Date().toISOString()
		};
	}

	/**
	 * Build task content with frontmatter
	 */
	private buildTaskContent(task: TodoistTask, frontmatter: TaskFrontmatter): string {
		const frontmatterStr = this.serializeFrontmatter(frontmatter);
		// No body content for tasks by design; only frontmatter is written
		return `${frontmatterStr}\n`;
	}

	/**
	 * Build project content with frontmatter
	 */
	private buildProjectContent(project: TodoistProject, frontmatter: ProjectFrontmatter): string {
		const frontmatterStr = this.serializeFrontmatter(frontmatter);
		// No body content for projects; only frontmatter is written
		return `${frontmatterStr}\n`;
	}

	/**
	 * Build section content with frontmatter
	 */
	private buildSectionContent(section: TodoistSection, frontmatter: SectionFrontmatter): string {
		const frontmatterStr = this.serializeFrontmatter(frontmatter);
		// No body content for sections; only frontmatter is written
		return `${frontmatterStr}\n`;
	}

	/**
	 * Serialize frontmatter to YAML
	 */
	private serializeFrontmatter(frontmatter: any): string {
		let yaml = '---\n';

		for (const [key, value] of Object.entries(frontmatter)) {
			if (value === undefined || value === null) continue;

			// Arrays
			if (Array.isArray(value)) {
				yaml += `${key}:\n`;
				for (const item of value) {
					yaml += `  - ${item}\n`;
				}
				continue;
			}

			// Multi-line strings -> YAML block scalar
			if (typeof value === 'string' && value.includes('\n')) {
				const normalized = value.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n+$/, '');
				const lines = normalized.split('\n');
				yaml += `${key}: |\n`;
				for (const line of lines) {
					yaml += `  ${line}\n`;
				}
				continue;
			}

			// Single-line string: treat literal booleans as booleans, otherwise always quote
			if (typeof value === 'string') {
				if (value === 'true') {
					yaml += `${key}: true\n`;
					continue;
				}
				if (value === 'false') {
					yaml += `${key}: false\n`;
					continue;
				}

				// Otherwise always quote single-line strings (escape internal quotes)
				const escaped = value.replace(/"/g, '\\"');
				yaml += `${key}: "${escaped}"\n`;
				continue;
			}

			// Other primitive types (number, boolean)
			yaml += `${key}: ${value}\n`;
		}

		yaml += '---';
		return yaml;
	}

	/**
	 * Get the folder path for a task based on project and section
	 */
	private getTaskFolderPath(projectName?: string, sectionName?: string): string {
		let path = this.syncFolderPath;
		
		if (projectName) {
			path += `/${this.sanitizeFileName(projectName)}`;
			
			if (sectionName) {
				path += `/${this.sanitizeFileName(sectionName)}`;
			}
		}
		
		return path;
	}

	/**
	 * Sanitize filename for file system compatibility
	 */
	private sanitizeFileName(name: string): string {
		// Debug: log input to sanitizer
		// Logger.getInstance().debug('[FileGenerator] sanitizeFileName input: ' + name);
		// Convert markdown links like [display text](url) -> display text
		let v = name.replace(/\[([^\]]+)\]\((.*?)\)/g, '$1');



		// Basic cleanup for filesystem compatibility
		v = v
			.replace(/[<>:\"/\\|?*]/g, '_')
			.replace(/\./g, '_')
			.trim()
			.substring(0, 100); // Limit length

		// Collapse multiple underscores
		v = v.replace(/_+/g, '_');

		// If name becomes empty after sanitization, provide a fallback
		if (!v) {
			Logger.getInstance().debug('[FileGenerator] sanitizeFileName output: untitled');
			return 'untitled';
		}

		// Logger.getInstance().debug('[FileGenerator] sanitizeFileName output: ' + v);
		return v;
	}
}