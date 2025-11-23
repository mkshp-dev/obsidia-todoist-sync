import { TFile } from 'obsidian';
import { TaskFrontmatter, ProjectFrontmatter, SectionFrontmatter } from '../models/types';
import { Logger } from './logger';

export class FrontmatterParser {
	private logger: Logger;

	constructor() {
		this.logger = Logger.getInstance();
	}

	/**
	 * Parse YAML frontmatter from file content
	 */
	parseFrontmatter(content: string): { frontmatter: any; body: string } | null {
		const lines = content.split('\n');
		
		if (lines[0] !== '---') {
			return null;
		}

		let frontmatterEnd = -1;
		for (let i = 1; i < lines.length; i++) {
			if (lines[i] === '---') {
				frontmatterEnd = i;
				break;
			}
		}

		if (frontmatterEnd === -1) {
			return null;
		}

		const frontmatterLines = lines.slice(1, frontmatterEnd);
		const bodyLines = lines.slice(frontmatterEnd + 1);

		try {
			const frontmatter = this.parseYaml(frontmatterLines.join('\n'));
			return {
				frontmatter,
				body: bodyLines.join('\n')
			};
		} catch (error) {
			this.logger.warn('Failed to parse frontmatter', { error: error.message });
			return null;
		}
	}

	/**
	 * Simple YAML parser for frontmatter
	 */
	private parseYaml(yamlContent: string): any {
		const result: any = {};
		const lines = yamlContent.split('\n');

		for (const line of lines) {
			const trimmed = line.trim();
			if (!trimmed || trimmed.startsWith('#')) continue;

			const colonIndex = trimmed.indexOf(':');
			if (colonIndex === -1) continue;

			const key = trimmed.substring(0, colonIndex).trim();
			let value = trimmed.substring(colonIndex + 1).trim();

			// Remove quotes if present
			if ((value.startsWith('"') && value.endsWith('"')) || 
				(value.startsWith("'") && value.endsWith("'"))) {
				value = value.slice(1, -1);
			}

			// Handle arrays (simple format)
			if (value.startsWith('[') && value.endsWith(']')) {
				const arrayContent = value.slice(1, -1).trim();
				if (arrayContent) {
					result[key] = arrayContent.split(',').map(item => item.trim().replace(/['"]/g, ''));
				} else {
					result[key] = [];
				}
			}
			// Handle booleans
			else if (value === 'true' || value === 'false') {
				result[key] = value === 'true';
			}
			// Handle numbers
			else if (!isNaN(Number(value)) && value !== '') {
				result[key] = Number(value);
			}
			// Handle strings
			else {
				result[key] = value;
			}
		}

		return result;
	}

	/**
	 * Extract task changes from note content
	 */
	extractTaskChanges(content: string): {
		frontmatter: TaskFrontmatter | null;
		completed: boolean;
		title: string | null;
	} {
		const parsed = this.parseFrontmatter(content);
		
		if (!parsed) {
			return { frontmatter: null, completed: false, title: null };
		}

		// Check if this is a task note
		if (!parsed.frontmatter.todoist_id || parsed.frontmatter.todoist_type === 'project' || parsed.frontmatter.todoist_type === 'section') {
			return { frontmatter: null, completed: false, title: null };
		}

		// Extract checkbox completion from content
		const completed = this.extractCheckboxStatus(parsed.body);
		
		// Extract title from first heading if not in frontmatter
		const title = parsed.frontmatter.title || this.extractTitleFromContent(parsed.body);

		return {
			frontmatter: parsed.frontmatter as TaskFrontmatter,
			completed,
			title
		};
	}

	/**
	 * Extract checkbox completion status from note body
	 */
	private extractCheckboxStatus(body: string): boolean {
		const checkboxRegex = /\[([x\s])\]/g;
		const matches = body.match(checkboxRegex);
		
		if (!matches) return false;
		
		// Look for completed checkboxes [x]
		return matches.some(match => match.includes('x'));
	}

	/**
	 * Extract title from first heading in content
	 */
	private extractTitleFromContent(body: string): string | null {
		const lines = body.split('\n');
		
		for (const line of lines) {
			const trimmed = line.trim();
			if (trimmed.startsWith('#')) {
				// Remove heading markers and return title
				return trimmed.replace(/^#+\s*/, '').trim();
			}
		}
		
		return null;
	}

	/**
	 * Check if file content has Todoist sync scope (only files with todoist_id)
	 */
	isInSyncScope(content: string, scopeTag: string): boolean {
		const parsed = this.parseFrontmatter(content);
		return parsed?.frontmatter?.todoist_id !== undefined;
	}

	/**
	 * Extract project changes from note content
	 */
	extractProjectChanges(content: string): {
		frontmatter: ProjectFrontmatter | null;
		title: string | null;
	} {
		const parsed = this.parseFrontmatter(content);
		
		if (!parsed || parsed.frontmatter.todoist_type !== 'project') {
			return { frontmatter: null, title: null };
		}

		const title = parsed.frontmatter.title || this.extractTitleFromContent(parsed.body);

		return {
			frontmatter: parsed.frontmatter as ProjectFrontmatter,
			title
		};
	}

	/**
	 * Extract section changes from note content
	 */
	extractSectionChanges(content: string): {
		frontmatter: SectionFrontmatter | null;
		title: string | null;
	} {
		const parsed = this.parseFrontmatter(content);
		
		if (!parsed || parsed.frontmatter.todoist_type !== 'section') {
			return { frontmatter: null, title: null };
		}

		const title = parsed.frontmatter.title || this.extractTitleFromContent(parsed.body);

		return {
			frontmatter: parsed.frontmatter as SectionFrontmatter,
			title
		};
	}

	/**
	 * Compare two frontmatter objects for changes
	 */
	hasChanges(oldFrontmatter: any, newFrontmatter: any): boolean {
		const relevantFields = ['title', 'completed', 'priority', 'due_date', 'labels'];
		
		for (const field of relevantFields) {
			if (this.normalizeValue(oldFrontmatter[field]) !== this.normalizeValue(newFrontmatter[field])) {
				return true;
			}
		}
		
		return false;
	}

	/**
	 * Normalize values for comparison
	 */
	private normalizeValue(value: any): string {
		if (value === undefined || value === null) return '';
		if (Array.isArray(value)) return JSON.stringify(value.sort());
		return String(value);
	}
}