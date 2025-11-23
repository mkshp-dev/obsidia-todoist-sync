import { requestUrl, RequestUrlParam } from 'obsidian';
import { 
	TodoistSyncRequest, 
	TodoistSyncResponse, 
	TodoistCommand,
	TodoistTask,
	TodoistProject,
	TodoistSection,
	TodoistLabel
} from '../models/types';
import { Logger } from '../utils/logger';
import { DataValidator } from '../utils/dataValidator';

export class TodoistSyncAPI {
	private apiToken: string;
	private baseUrl = 'https://api.todoist.com/rest/v2';
	private syncBaseUrl = 'https://api.todoist.com/sync/v9';
	private logger: Logger;
	private validator: DataValidator;

	constructor(apiToken: string) {
		this.apiToken = apiToken;
		this.logger = Logger.getInstance();
		this.validator = new DataValidator();
	}

	/**
	 * Perform a sync request to get updated data from Todoist
	 */
	async sync(syncToken: string = '*', resourceTypes: string[] = ['all']): Promise<TodoistSyncResponse> {
		const requestData: TodoistSyncRequest = {
			sync_token: syncToken,
			resource_types: resourceTypes
		};

		const response = await this.makeSyncRequest('/sync', 'POST', requestData);
		return response as TodoistSyncResponse;
	}

	/**
	 * Execute commands (create, update, delete operations)
	 */
	async executeCommands(commands: TodoistCommand[], syncToken: string = '*'): Promise<TodoistSyncResponse> {
		const requestData: TodoistSyncRequest = {
			sync_token: syncToken,
			resource_types: ['all'],
			commands: commands
		};

		const response = await this.makeRequest('/sync', 'POST', requestData);
		return response as TodoistSyncResponse;
	}

	/**
	 * Create a new task
	 */
	createTaskCommand(tempId: string, content: string, projectId?: string, sectionId?: string, priority?: number, dueDate?: string): TodoistCommand {
		const args: Record<string, any> = {
			content: content
		};

		if (projectId) args.project_id = projectId;
		if (sectionId) args.section_id = sectionId;
		if (priority) args.priority = priority;
		if (dueDate) args.due = { date: dueDate };

		return {
			type: 'item_add',
			temp_id: tempId,
			uuid: this.generateUUID(),
			args: args
		};
	}

	/**
	 * Update an existing task
	 */
	updateTaskCommand(taskId: string, updates: Partial<TodoistTask>): TodoistCommand {
		const args: Record<string, any> = { id: taskId };
		
		if (updates.content !== undefined) args.content = updates.content;
		if (updates.priority !== undefined) args.priority = updates.priority;
		if (updates.due !== undefined) args.due = updates.due;
		if (updates.labels !== undefined) args.labels = updates.labels;
		if (updates.project_id !== undefined) args.project_id = updates.project_id;
		if (updates.section_id !== undefined) args.section_id = updates.section_id;

		return {
			type: 'item_update',
			uuid: this.generateUUID(),
			args: args
		};
	}

	/**
	 * Complete a task
	 */
	completeTaskCommand(taskId: string): TodoistCommand {
		return {
			type: 'item_complete',
			uuid: this.generateUUID(),
			args: { id: taskId }
		};
	}

	/**
	 * Delete a task
	 */
	deleteTaskCommand(taskId: string): TodoistCommand {
		return {
			type: 'item_delete',
			uuid: this.generateUUID(),
			args: { id: taskId }
		};
	}

	/**
	 * Create a new project
	 */
	createProjectCommand(tempId: string, name: string, color?: string, parentId?: string): TodoistCommand {
		const args: Record<string, any> = {
			name: name
		};

		if (color) args.color = color;
		if (parentId) args.parent_id = parentId;

		return {
			type: 'project_add',
			temp_id: tempId,
			uuid: this.generateUUID(),
			args: args
		};
	}

	/**
	 * Update an existing project
	 */
	updateProjectCommand(projectId: string, updates: Partial<TodoistProject>): TodoistCommand {
		const args: Record<string, any> = { id: projectId };
		
		if (updates.name !== undefined) args.name = updates.name;
		if (updates.color !== undefined) args.color = updates.color;

		return {
			type: 'project_update',
			uuid: this.generateUUID(),
			args: args
		};
	}

	/**
	 * Create a new section
	 */
	createSectionCommand(tempId: string, name: string, projectId: string): TodoistCommand {
		return {
			type: 'section_add',
			temp_id: tempId,
			uuid: this.generateUUID(),
			args: {
				name: name,
				project_id: projectId
			}
		};
	}

	/**
	 * Test API connection and token validity using REST API
	 */
	async testConnection(): Promise<boolean> {
		const timerId = this.logger.syncStart('Connection Test');
		
		try {
			this.logger.debug('Testing Todoist API connection...');
			// Use the REST API to get projects as a simple connection test
			const response = await this.makeRequest('/projects', 'GET');
			const isValid = response && Array.isArray(response);
			
			if (isValid) {
				this.logger.syncComplete('Connection Test', timerId, { projectCount: response.length });
			} else {
				this.logger.syncError('Connection Test', 'Invalid response format');
			}
			
			return isValid;
		} catch (error) {
			this.logger.syncError('Connection Test', error);
			return false;
		}
	}

	/**
	 * Get all projects using REST API
	 */
	async getProjects(): Promise<TodoistProject[]> {
		const timerId = this.logger.syncStart('Fetch Projects');
		
		try {
			this.logger.debug('Fetching projects from Todoist...');
			const response = await this.makeRequest('/projects', 'GET');
			const projects = response || [];
			
			this.logger.syncComplete('Fetch Projects', timerId, { count: projects.length });
			return projects;
		} catch (error) {
			this.logger.syncError('Fetch Projects', error);
			return [];
		}
	}

	/**
	 * Get all tasks using REST API
	 */
	async getTasks(projectId?: string): Promise<TodoistTask[]> {
		const timerId = this.logger.syncStart('Fetch Tasks');
		
		try {
			let url = '/tasks';
			if (projectId) {
				url += `?project_id=${projectId}`;
				this.logger.debug(`Fetching tasks for project ${projectId}...`);
			} else {
				this.logger.debug('Fetching all tasks...');
			}
			
			const response = await this.makeRequest(url, 'GET');
			
			if (!this.validator.validateApiResponse(response, 'array')) {
				this.logger.syncError('Fetch Tasks', 'Invalid response format');
				return [];
			}
			
			const validTasks = this.validator.filterValidTasks(response);
			this.logger.syncComplete('Fetch Tasks', timerId, { 
				total: response.length,
				valid: validTasks.length,
				projectId: projectId || 'all'
			});
			
			return validTasks;
		} catch (error) {
			this.logger.syncError('Fetch Tasks', error);
			return [];
		}
	}

	/**
	 * Get all sections using REST API
	 */
	async getSections(projectId?: string): Promise<TodoistSection[]> {
		let url = '/sections';
		if (projectId) {
			url += `?project_id=${projectId}`;
		}
		const response = await this.makeRequest(url, 'GET');
		return response || [];
	}

	/**
	 * Get all labels using REST API
	 */
	async getLabels(): Promise<TodoistLabel[]> {
		const response = await this.makeRequest('/labels', 'GET');
		return response || [];
	}

	/**
	 * Create a new task using REST API
	 */
	async createTask(content: string, projectId?: string, sectionId?: string, priority?: number, dueDate?: string): Promise<TodoistTask> {
		const data: any = { content };
		
		if (projectId) data.project_id = projectId;
		if (sectionId) data.section_id = sectionId;
		if (priority) data.priority = priority;
		if (dueDate) data.due_string = dueDate;

		const response = await this.makeRequest('/tasks', 'POST', data);
		return response;
	}

	/**
	 * Update a task using REST API
	 */
	async updateTask(taskId: string, updates: Partial<TodoistTask>): Promise<TodoistTask> {
		const response = await this.makeRequest(`/tasks/${taskId}`, 'POST', updates);
		return response;
	}

	/**
	 * Close a task using REST API
	 */
	async closeTask(taskId: string): Promise<boolean> {
		try {
			await this.makeRequest(`/tasks/${taskId}/close`, 'POST');
			return true;
		} catch (error) {
			console.error('Failed to close task:', error);
			return false;
		}
	}

	/**
	 * Reopen a task using REST API
	 */
	async reopenTask(taskId: string): Promise<boolean> {
		try {
			await this.makeRequest(`/tasks/${taskId}/reopen`, 'POST');
			return true;
		} catch (error) {
			console.error('Failed to reopen task:', error);
			return false;
		}
	}

	/**
	 * Make authenticated request to Todoist REST API
	 */
	private async makeRequest(endpoint: string, method: string = 'GET', data?: any): Promise<any> {
		const url = `${this.baseUrl}${endpoint}`;
		
		const requestParams: RequestUrlParam = {
			url: url,
			method: method,
			headers: {
				'Authorization': `Bearer ${this.apiToken}`,
				'Content-Type': 'application/json'
			}
		};

		if (data && method !== 'GET') {
			requestParams.body = JSON.stringify(data);
		}

		try {
			const response = await requestUrl(requestParams);
			
			if (response.status >= 400) {
				throw new Error(`Todoist API error: ${response.status} - ${response.text}`);
			}

			return response.json;
		} catch (error) {
			console.error('Todoist API request failed:', error);
			throw error;
		}
	}

	/**
	 * Make authenticated request to Todoist Sync API
	 */
	private async makeSyncRequest(endpoint: string, method: string = 'GET', data?: any): Promise<any> {
		const url = `${this.syncBaseUrl}${endpoint}`;
		
		const requestParams: RequestUrlParam = {
			url: url,
			method: method,
			headers: {
				'Authorization': `Bearer ${this.apiToken}`,
				'Content-Type': 'application/json'
			}
		};

		if (data && method !== 'GET') {
			requestParams.body = JSON.stringify(data);
		}

		try {
			const response = await requestUrl(requestParams);
			
			if (response.status >= 400) {
				throw new Error(`Todoist API error: ${response.status} - ${response.text}`);
			}

			return response.json;
		} catch (error) {
			console.error('Todoist Sync API request failed:', error);
			throw error;
		}
	}

	/**
	 * Generate a UUID for command identification
	 */
	private generateUUID(): string {
		return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
			const r = Math.random() * 16 | 0;
			const v = c == 'x' ? r : (r & 0x3 | 0x8);
			return v.toString(16);
		});
	}

	/**
	 * Generate a temporary ID for new items
	 */
	generateTempId(): string {
		return `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
	}
}