import { derived$, query$, signal$, skip } from 'octane/signals';
import { openSession, watchAnswer, watchHistory, watchTools } from './Calls.tsrx';
import type { AnswerFrame, HistoryFrame, LabConfig, ToolFrame } from './types.ts';

export const session$ = query$<string, LabConfig>(
	() => 'current-document',
	(_, { signal }) => openSession({ signal }),
);
export const selection$ = signal$({
	prompt: '',
	generation: 0,
	stopped: false,
	recover: false,
});
export const answer$ = query$<
	{ config: LabConfig; prompt: string; generation: number },
	AnswerFrame
>(() => {
	const config = session$.get();
	const selection = selection$.get();
	if (selection.stopped) return skip;
	return {
		config: selection.recover ? { ...config, scenario: 'steady' as const } : config,
		prompt: selection.prompt || config.prompt,
		generation: selection.generation,
	};
}, (input, { signal }) => watchAnswer(input, { signal }), { kind: 'stream' });
export const history$ = query$<LabConfig, HistoryFrame>(
	() => session$.get(),
	(config, { signal }) => watchHistory(config, { signal }),
	{ kind: 'stream' },
);
export const tools$ = query$<LabConfig, ToolFrame>(
	() => session$.get(),
	(config, { signal }) => watchTools(config, { signal }),
	{ kind: 'stream' },
);

export const draft$ = signal$('');
export const draftLength$ = derived$(() => String(draft$.get().length));
export const answerActivity$ = derived$(() => {
	const snapshot = answer$.snapshot();
	return `${snapshot.status} · ${snapshot.connection}${snapshot.refreshing ? ' · refreshing' : ''}${
		snapshot.complete ? ' · complete' : ''
	}`;
});
export const answerComplete$ = derived$(() => answer$.snapshot().complete);

export function sendMessage() {
	const prompt = draft$.get().trim();
	if (prompt === '') return;
	selection$.set(
		(previous) => ({
			prompt,
			generation: previous.generation + 1,
			stopped: false,
			recover: previous.recover,
		}),
	);
	draft$.set('');
}

export function stopResponse() {
	selection$.set((previous) => ({ ...previous, stopped: true }));
}

export function resumeResponse() {
	selection$.set(
		(previous) => ({
			...previous,
			stopped: false,
			generation: previous.generation + 1,
		}),
	);
}

export function retryResponse() {
	selection$.set(
		(previous) => ({
			...previous,
			stopped: false,
			recover: true,
			generation: previous.generation + 1,
		}),
	);
}
