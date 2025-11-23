import { Logger } from './logger';
import { TodoistTask, TodoistProject, TodoistSection } from '../models/types';

export class DataValidator {
	private logger: Logger;

	constructor() {
		this.logger = Logger.getInstance();
	}

	/**
	 * Validate Todoist task data
	 */
	validateTask(task: any): task is TodoistTask {
		const errors: string[] = [];

		if (!task) {
			errors.push('Task is null or undefined');
			return false;
		}

		if (!task.id || typeof task.id !== 'string') {
			errors.push('Invalid or missing task ID');
		}

		if (!task.content || typeof task.content !== 'string') {
			errors.push('Invalid or missing task content');
		}

		if (task.priority !== undefined && (typeof task.priority !== 'number' || task.priority < 1 || task.priority > 4)) {
			errors.push('Invalid task priority (must be 1-4)');
		}

		if (task.labels && !Array.isArray(task.labels)) {
			errors.push('Task labels must be an array');
		}

		if (errors.length > 0) {
			this.logger.warn('Task validation failed', { taskId: task.id, errors });
			return false;
		}

		return true;
	}

	/**
	 * Validate Todoist project data
	 */
	validateProject(project: any): project is TodoistProject {
		const errors: string[] = [];

		if (!project) {
			errors.push('Project is null or undefined');
			return false;
		}

		if (!project.id || typeof project.id !== 'string') {
			errors.push('Invalid or missing project ID');
		}

		if (!project.name || typeof project.name !== 'string') {
			errors.push('Invalid or missing project name');
		}

		if (errors.length > 0) {
			this.logger.warn('Project validation failed', { projectId: project.id, errors });
			return false;
		}

		return true;
	}

	/**
	 * Validate Todoist section data
	 */
	validateSection(section: any): section is TodoistSection {
		const errors: string[] = [];

		if (!section) {
			errors.push('Section is null or undefined');
			return false;
		}

		if (!section.id || typeof section.id !== 'string') {
			errors.push('Invalid or missing section ID');
		}

		if (!section.name || typeof section.name !== 'string') {
			errors.push('Invalid or missing section name');
		}

		if (!section.project_id || typeof section.project_id !== 'string') {
			errors.push('Invalid or missing project ID for section');
		}

		if (errors.length > 0) {
			this.logger.warn('Section validation failed', { sectionId: section.id, errors });
			return false;
		}

		return true;
	}

	/**
	 * Validate API response structure
	 */
	validateApiResponse(response: any, expectedType: 'array' | 'object'): boolean {
		if (!response) {
			this.logger.warn('API response is null or undefined');
			return false;
		}

		if (expectedType === 'array' && !Array.isArray(response)) {
			this.logger.warn('Expected array response but got', typeof response);
			return false;
		}

		if (expectedType === 'object' && typeof response !== 'object') {
			this.logger.warn('Expected object response but got', typeof response);
			return false;
		}

		return true;
	}

	/**
	 * Sanitize and validate file path
	 */
	validateFilePath(filePath: string): { isValid: boolean; sanitized: string } {
		if (!filePath || typeof filePath !== 'string') {
			this.logger.warn('Invalid file path', filePath);
			return { isValid: false, sanitized: '' };
		}

		// Remove invalid characters and normalize
		const sanitized = filePath
			.replace(/[<>:"/\\|?*]/g, '_')
			.replace(/\s+/g, ' ')
			.trim();

		// Check length
		if (sanitized.length > 255) {
			this.logger.warn('File path too long, truncating', { original: filePath.length, truncated: 255 });
			return { isValid: true, sanitized: sanitized.substring(0, 255) };
		}

		return { isValid: true, sanitized };
	}

	/**
	 * Validate sync token
	 */
	validateSyncToken(token: string): boolean {
		if (!token || typeof token !== 'string') {
			return false;
		}

		// Allow '*' for full sync or valid token format
		if (token === '*') {
			return true;
		}

		// Basic token format validation (adjust as needed)
		if (token.length < 10) {
			this.logger.warn('Sync token appears too short', token.length);
			return false;
		}

		return true;
	}

	/**
	 * Filter valid items from array
	 */
	filterValidTasks(tasks: any[]): TodoistTask[] {
		if (!Array.isArray(tasks)) {
			this.logger.warn('Expected array of tasks but got', typeof tasks);
			return [];
		}

		const validTasks = tasks.filter(task => this.validateTask(task));
		const invalidCount = tasks.length - validTasks.length;

		if (invalidCount > 0) {
			this.logger.warn(`Filtered out ${invalidCount} invalid tasks out of ${tasks.length}`);
		}

		return validTasks;
	}

	/**
	 * Filter valid projects from array
	 */
	filterValidProjects(projects: any[]): TodoistProject[] {
		if (!Array.isArray(projects)) {
			this.logger.warn('Expected array of projects but got', typeof projects);
			return [];
		}

		const validProjects = projects.filter(project => this.validateProject(project));
		const invalidCount = projects.length - validProjects.length;

		if (invalidCount > 0) {
			this.logger.warn(`Filtered out ${invalidCount} invalid projects out of ${projects.length}`);
		}

		return validProjects;
	}

	/**
	 * Filter valid sections from array
	 */
	filterValidSections(sections: any[]): TodoistSection[] {
		if (!Array.isArray(sections)) {
			this.logger.warn('Expected array of sections but got', typeof sections);
			return [];
		}

		const validSections = sections.filter(section => this.validateSection(section));
		const invalidCount = sections.length - validSections.length;

		if (invalidCount > 0) {
			this.logger.warn(`Filtered out ${invalidCount} invalid sections out of ${sections.length}`);
		}

		return validSections;
	}
}