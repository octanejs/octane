export type LabScenario = 'steady' | 'burst' | 'unicode' | 'fail-before' | 'fail-after' | 'empty';

export type LabConfig = {
	run: string;
	scenario: LabScenario;
	prompt: string;
	authDelay: number;
	answerDelay: number;
	historyDelay: number;
	interval: number;
	waves: number;
	turns: number;
	historyRows: number;
};

export type Session = LabConfig;

export type ChatMessage = { id: string; role: 'user' | 'assistant'; content: string };
export type AnswerFrame = {
	conversationId: string;
	generation: number;
	prompt: string;
	revision: number;
	total: number;
	answer: string;
	tokens: number;
	messages: ChatMessage[];
};

export type HistoryFrame = {
	revision: number;
	total: number;
	rows: Array<{ id: string; title: string; preview: string }>;
};

export type ToolFrame = {
	revision: number;
	total: number;
	steps: Array<{ id: string; label: string; status: 'waiting' | 'running' | 'done' }>;
};

export type AnswerInput = { config: LabConfig; prompt: string; generation: number };

export type TraceEvent = {
	channel: 'session' | 'answer' | 'history' | 'tools';
	type: 'start' | 'yield' | 'complete' | 'error' | 'abort' | 'finally';
	at: number;
	generation?: number;
	revision?: number;
	transport: 'document' | 'rpc';
	bytes?: number;
};

export type RunTrace = {
	run: string;
	scenario: LabScenario;
	truncated: boolean;
	events: TraceEvent[];
};
