import { Notice } from 'obsidian';

export enum LogLevel {
	ERROR = 0,
	WARN = 1,
	INFO = 2,
	DEBUG = 3
}

export class Logger {
	private static instance: Logger;
	private logLevel: LogLevel = LogLevel.INFO;
	private debugMode: boolean = false;
	private logs: string[] = [];
	private maxLogs: number = 1000;

	private constructor() {}

	static getInstance(): Logger {
		if (!Logger.instance) {
			Logger.instance = new Logger();
		}
		return Logger.instance;
	}

	setLogLevel(level: LogLevel): void {
		this.logLevel = level;
	}

	setDebugMode(enabled: boolean): void {
		this.debugMode = enabled;
		if (enabled) {
			this.setLogLevel(LogLevel.DEBUG);
		}
	}

	private shouldLog(level: LogLevel): boolean {
		return level <= this.logLevel;
	}

	private formatMessage(level: LogLevel, message: string, data?: any): string {
		const timestamp = new Date().toISOString();
		const levelStr = LogLevel[level];
		let formattedMessage = `[${timestamp}] [${levelStr}] ${message}`;
		
		if (data !== undefined) {
			formattedMessage += ` | Data: ${JSON.stringify(data, null, 2)}`;
		}
		
		return formattedMessage;
	}

	private addToLog(formattedMessage: string): void {
		this.logs.push(formattedMessage);
		if (this.logs.length > this.maxLogs) {
			this.logs.shift();
		}
	}

	error(message: string, error?: any): void {
		const formattedMessage = this.formatMessage(LogLevel.ERROR, message, error);
		
		if (this.shouldLog(LogLevel.ERROR)) {
			console.error(`[Todoist Sync] ${message}`, error);
			this.addToLog(formattedMessage);
			
			// Show user-friendly error notice
			new Notice(`❌ ${message}`, 5000);
		}
	}

	warn(message: string, data?: any): void {
		const formattedMessage = this.formatMessage(LogLevel.WARN, message, data);
		
		if (this.shouldLog(LogLevel.WARN)) {
			console.warn(`[Todoist Sync] ${message}`, data);
			this.addToLog(formattedMessage);
			
			if (this.debugMode) {
				new Notice(`⚠️ ${message}`, 3000);
			}
		}
	}

	info(message: string, data?: any): void {
		const formattedMessage = this.formatMessage(LogLevel.INFO, message, data);
		
		if (this.shouldLog(LogLevel.INFO)) {
			console.log(`[Todoist Sync] ${message}`, data);
			this.addToLog(formattedMessage);
			
			if (this.debugMode) {
				new Notice(`ℹ️ ${message}`, 2000);
			}
		}
	}

	debug(message: string, data?: any): void {
		const formattedMessage = this.formatMessage(LogLevel.DEBUG, message, data);
		
		if (this.shouldLog(LogLevel.DEBUG)) {
			console.log(`[Todoist Sync DEBUG] ${message}`, data);
			this.addToLog(formattedMessage);
		}
	}

	// Performance timing methods
	startTiming(operation: string): string {
		const timerId = `${operation}_${Date.now()}`;
		this.debug(`Starting operation: ${operation}`, { timerId });
		return timerId;
	}

	endTiming(timerId: string, operation: string): number {
		const duration = Date.now() - parseInt(timerId.split('_')[1]);
		this.debug(`Completed operation: ${operation}`, { timerId, duration: `${duration}ms` });
		
		if (duration > 5000) { // Warn about slow operations
			this.warn(`Slow operation detected: ${operation} took ${duration}ms`);
		}
		
		return duration;
	}

	// Get recent logs for debugging
	getRecentLogs(count: number = 50): string[] {
		return this.logs.slice(-count);
	}

	// Export all logs
	exportLogs(): string {
		return this.logs.join('\n');
	}

	// Clear logs
	clearLogs(): void {
		this.logs = [];
		this.info('Log history cleared');
	}

	// Sync-specific logging methods
	syncStart(operation: string): string {
		const timerId = this.startTiming(operation);
		this.info(`🔄 Starting sync operation: ${operation}`);
		return timerId;
	}

	syncProgress(operation: string, current: number, total: number): void {
		const percentage = Math.round((current / total) * 100);
		this.debug(`Progress ${operation}: ${current}/${total} (${percentage}%)`);
		
		if (this.debugMode) {
			new Notice(`📊 ${operation}: ${percentage}%`, 1000);
		}
	}

	syncComplete(operation: string, timerId: string, results?: any): void {
		const duration = this.endTiming(timerId, operation);
		this.info(`✅ Completed sync operation: ${operation} in ${duration}ms`, results);
		
		if (results) {
			new Notice(`✅ ${operation} completed successfully`, 2000);
		}
	}

	syncError(operation: string, error: any): void {
		this.error(`❌ Sync operation failed: ${operation}`, error);
	}

	// Data validation logging
	validateData(dataType: string, data: any, expected: any): boolean {
		const isValid = this.performValidation(data, expected);
		
		if (!isValid) {
			this.warn(`Data validation failed for ${dataType}`, {
				received: data,
				expected: expected
			});
		} else {
			this.debug(`Data validation passed for ${dataType}`);
		}
		
		return isValid;
	}

	private performValidation(data: any, expected: any): boolean {
		// Simple validation - can be expanded
		if (expected.type && typeof data !== expected.type) {
			return false;
		}
		
		if (expected.required && (data === undefined || data === null)) {
			return false;
		}
		
		if (expected.minLength && data.length < expected.minLength) {
			return false;
		}
		
		return true;
	}
}