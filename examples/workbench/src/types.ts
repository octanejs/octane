export interface Task {
	id: string;
	name: string;
	summary: string;
}

export interface TaskDetail {
	id: string;
	command: string;
	workingDirectory: string;
	lastRun: string;
	averageMs: number;
}

export interface LogLine {
	taskId: string;
	seq: number;
	text: string;
	done: boolean;
}
