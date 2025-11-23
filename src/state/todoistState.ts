import { 
	TodoistTask, 
	TodoistProject, 
	TodoistSection, 
	TodoistLabel,
	SyncState 
} from '../models/types';

/**
 * Source A: Represents the current state of Todoist (from sync API)
 * This is our authoritative source for Todoist data
 */
export class TodoistState {
	private tasks: Map<string, TodoistTask> = new Map();
	private projects: Map<string, TodoistProject> = new Map();
	private sections: Map<string, TodoistSection> = new Map();
	private labels: Map<string, TodoistLabel> = new Map();
	private syncState: SyncState = {
		syncToken: '*',
		lastFullSync: 0,
		lastIncrementalSync: 0
	};

	/**
	 * Update the entire state from a sync response
	 */
	updateFromSync(syncResponse: any): void {
		// Update sync token
		this.syncState.syncToken = syncResponse.sync_token;
		this.syncState.lastIncrementalSync = Date.now();
		
		if (syncResponse.full_sync) {
			this.syncState.lastFullSync = Date.now();
			// Clear existing data for full sync
			this.tasks.clear();
			this.projects.clear();
			this.sections.clear();
			this.labels.clear();
		}

		// Update tasks (items in Todoist API)
		if (syncResponse.items) {
			syncResponse.items.forEach((task: TodoistTask) => {
				if (task.is_deleted) {
					this.tasks.delete(task.id);
				} else {
					this.tasks.set(task.id, task);
				}
			});
		}

		// Update projects
		if (syncResponse.projects) {
			syncResponse.projects.forEach((project: TodoistProject) => {
				if (project.is_deleted) {
					this.projects.delete(project.id);
				} else {
					this.projects.set(project.id, project);
				}
			});
		}

		// Update sections
		if (syncResponse.sections) {
			syncResponse.sections.forEach((section: TodoistSection) => {
				if (section.is_deleted) {
					this.sections.delete(section.id);
				} else {
					this.sections.set(section.id, section);
				}
			});
		}

		// Update labels
		if (syncResponse.labels) {
			syncResponse.labels.forEach((label: TodoistLabel) => {
				if (label.is_deleted) {
					this.labels.delete(label.id);
				} else {
					this.labels.set(label.id, label);
				}
			});
		}
	}

	// Getters for accessing data
	getAllTasks(): TodoistTask[] {
		return Array.from(this.tasks.values()).filter(task => !task.is_deleted);
	}

	getTask(id: string): TodoistTask | undefined {
		return this.tasks.get(id);
	}

	getAllProjects(): TodoistProject[] {
		return Array.from(this.projects.values()).filter(project => !project.is_deleted && !project.is_archived);
	}

	getProject(id: string): TodoistProject | undefined {
		return this.projects.get(id);
	}

	getAllSections(): TodoistSection[] {
		return Array.from(this.sections.values()).filter(section => !section.is_deleted);
	}

	getSection(id: string): TodoistSection | undefined {
		return this.sections.get(id);
	}

	getSectionsForProject(projectId: string): TodoistSection[] {
		return this.getAllSections().filter(section => section.project_id === projectId);
	}

	getTasksForProject(projectId: string): TodoistTask[] {
		return this.getAllTasks().filter(task => task.project_id === projectId);
	}

	getTasksForSection(sectionId: string): TodoistTask[] {
		return this.getAllTasks().filter(task => task.section_id === sectionId);
	}

	getAllLabels(): TodoistLabel[] {
		return Array.from(this.labels.values()).filter(label => !label.is_deleted);
	}

	getLabel(id: string): TodoistLabel | undefined {
		return this.labels.get(id);
	}

	getSyncState(): SyncState {
		return { ...this.syncState };
	}

	setSyncToken(token: string): void {
		this.syncState.syncToken = token;
	}

	// Serialization for persistence
	serialize(): string {
		return JSON.stringify({
			tasks: Array.from(this.tasks.entries()),
			projects: Array.from(this.projects.entries()),
			sections: Array.from(this.sections.entries()),
			labels: Array.from(this.labels.entries()),
			syncState: this.syncState
		});
	}

	deserialize(data: string): void {
		try {
			const parsed = JSON.parse(data);
			
			this.tasks = new Map(parsed.tasks || []);
			this.projects = new Map(parsed.projects || []);
			this.sections = new Map(parsed.sections || []);
			this.labels = new Map(parsed.labels || []);
			this.syncState = parsed.syncState || {
				syncToken: '*',
				lastFullSync: 0,
				lastIncrementalSync: 0
			};
		} catch (error) {
			console.error('Failed to deserialize Todoist state:', error);
			// Reset to default state on error
			this.tasks.clear();
			this.projects.clear();
			this.sections.clear();
			this.labels.clear();
			this.syncState = {
				syncToken: '*',
				lastFullSync: 0,
				lastIncrementalSync: 0
			};
		}
	}

	/**
	 * Check if we need a full sync (no token or old data)
	 */
	needsFullSync(): boolean {
		return this.syncState.syncToken === '*' || 
			   this.syncState.lastFullSync === 0 ||
			   (Date.now() - this.syncState.lastFullSync) > (24 * 60 * 60 * 1000); // 24 hours
	}

	/**
	 * Get statistics about the current state
	 */
	getStats(): { tasks: number; projects: number; sections: number; labels: number } {
		return {
			tasks: this.getAllTasks().length,
			projects: this.getAllProjects().length,
			sections: this.getAllSections().length,
			labels: this.getAllLabels().length
		};
	}
}