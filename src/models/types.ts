// Todoist API data models based on Sync API v1

export interface TodoistTask {
	id: string;
	user_id: number;
	project_id: string;
	content: string;
	description: string;
	priority: number;
	due?: TodoistDue | null;
	parent_id?: string | null;
	child_order: number;
	section_id?: string | null;
	day_order: number;
	collapsed: boolean;
	labels: string[];
	added_by_uid: number;
	assigned_by_uid?: number | null;
	responsible_uid?: number | null;
	checked: boolean;
	in_history: boolean;
	is_deleted: boolean;
	date_added: string;
	date_completed?: string | null;
	sync_id?: string | null;
}

export interface TodoistProject {
	id: string;
	name: string;
	color: string;
	parent_id?: string | null;
	child_order: number;
	collapsed: boolean;
	shared: boolean;
	is_deleted: boolean;
	is_archived: boolean;
	is_favorite: boolean;
	sync_id?: string | null;
	inbox_project?: boolean;
	team_inbox?: boolean;
}

export interface TodoistSection {
	id: string;
	name: string;
	project_id: string;
	section_order: number;
	collapsed: boolean;
	sync_id?: string | null;
	is_deleted: boolean;
	date_added: string;
}

export interface TodoistLabel {
	id: string;
	name: string;
	color: string;
	item_order: number;
	is_deleted: boolean;
	is_favorite: boolean;
}

export interface TodoistDue {
	date: string;
	is_recurring: boolean;
	datetime?: string | null;
	string: string;
	timezone?: string | null;
}

export interface TodoistSyncResponse {
	sync_token: string;
	full_sync: boolean;
	projects: TodoistProject[];
	items: TodoistTask[];
	sections: TodoistSection[];
	labels: TodoistLabel[];
	temp_id_mapping: Record<string, string>;
}

export interface TodoistSyncRequest {
	sync_token: string;
	resource_types: string[];
	commands?: TodoistCommand[];
}

export interface TodoistCommand {
	type: string;
	temp_id?: string;
	uuid: string;
	args: Record<string, any>;
}

// Obsidian-specific models for our plugin

export interface ObsidianTaskNote {
	filePath: string;
	todoistId: string;
	content: string;
	frontmatter: TaskFrontmatter;
	lastModified: number;
}

export interface TaskFrontmatter {
	todoist_id?: string;
		todoist_type?: 'task';
	todoist_project?: string;
	todoist_section?: string;
	title?: string;
	due_date?: string;
	due_datetime?: string;
	priority?: number;
	labels?: string[];
	completed?: boolean;
	content?: string;
	description?: string;
	parent_task?: string;
	sync_status?: 'synced' | 'pending' | 'conflict';
	last_sync?: string;
}

export interface ObsidianProjectNote {
	filePath: string;
	todoistId: string;
	name: string;
	frontmatter: ProjectFrontmatter;
	lastModified: number;
}

export interface ProjectFrontmatter {
	todoist_id?: string;
	todoist_type: 'project';
	title?: string;
	color?: string;
	parent_project?: string;
	is_favorite?: boolean;
	sync_status?: 'synced' | 'pending' | 'conflict';
	last_sync?: string;
}

export interface ObsidianSectionNote {
	filePath: string;
	todoistId: string;
	name: string;
	projectId: string;
	frontmatter: SectionFrontmatter;
	lastModified: number;
}

export interface SectionFrontmatter {
	todoist_id?: string;
	todoist_type: 'section';
	title?: string;
	todoist_project?: string;
	sync_status?: 'synced' | 'pending' | 'conflict';
	last_sync?: string;
}

// Sync state tracking

export interface SyncState {
	syncToken: string;
	lastFullSync: number;
	lastIncrementalSync: number;
}

export interface SyncConflict {
	type: 'task' | 'project' | 'section';
	todoistId: string;
	filePath: string;
	todoistData: TodoistTask | TodoistProject | TodoistSection;
	obsidianData: ObsidianTaskNote | ObsidianProjectNote | ObsidianSectionNote;
	conflictReason: 'content_mismatch' | 'deleted_remote' | 'deleted_local' | 'moved';
}