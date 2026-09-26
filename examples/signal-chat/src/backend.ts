import { is_rpc_request, type Context } from '@octanejs/app-core';
import type { ServerCallContext } from 'octane/server';
import type {
	AnswerFrame,
	AnswerInput,
	ChatMessage,
	HistoryFrame,
	LabConfig,
	LabScenario,
	RunTrace,
	ToolFrame,
	TraceEvent,
} from './types.ts';

const scenarios: LabScenario[] = [
	'steady',
	'burst',
	'unicode',
	'fail-before',
	'fail-after',
	'empty',
];
const runs = new Map<string, { origin: number; trace: RunTrace }>();
const requestConfigs = new WeakMap<Request, LabConfig>();
const encoder = new TextEncoder();
const configKeys = [
	'run',
	'scenario',
	'prompt',
	'authDelay',
	'answerDelay',
	'historyDelay',
	'interval',
	'waves',
	'turns',
	'historyRows',
];

function runId(value: unknown): string {
	if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(value)) {
		throw new TypeError('Run must contain 1–80 letters, numbers, underscores or hyphens');
	}
	return value;
}

function scenario(value: unknown): LabScenario {
	if (typeof value !== 'string' || !scenarios.includes(value as LabScenario)) {
		throw new TypeError('Unknown streaming scenario');
	}
	return value as LabScenario;
}

function integer(value: unknown, minimum: number, maximum: number): number {
	if (
		typeof value !== 'number' ||
		!Number.isSafeInteger(value) ||
		value < minimum ||
		value > maximum
	) {
		throw new TypeError(`Expected an integer from ${minimum} to ${maximum}`);
	}
	return value;
}

function promptInput(value: unknown): string {
	if (typeof value !== 'string' || value.length > 4_000) {
		throw new TypeError('Prompt must contain at most 4000 characters');
	}
	return value;
}

/** Copy the serializable RPC data so a running producer never follows caller mutations. */
function configInput(value: unknown): LabConfig {
	if (
		value === null ||
		typeof value !== 'object' ||
		Array.isArray(value) ||
		Object.keys(value).some((key) => !configKeys.includes(key))
	) {
		throw new TypeError('Invalid streaming configuration');
	}
	const config = value as Record<string, unknown>;
	return {
		run: runId(config.run),
		scenario: scenario(config.scenario),
		prompt: promptInput(config.prompt),
		authDelay: integer(config.authDelay, 0, 2_000),
		answerDelay: integer(config.answerDelay, 0, 2_000),
		historyDelay: integer(config.historyDelay, 0, 2_000),
		interval: integer(config.interval, 0, 2_000),
		waves: integer(config.waves, 1, 64),
		turns: integer(config.turns, 1, 200),
		historyRows: integer(config.historyRows, 1, 200),
	};
}

function urlInteger(
	params: URLSearchParams,
	key: string,
	fallback: number,
	maximum: number,
	minimum = 0,
) {
	const raw = params.get(key);
	if (raw === null || raw === '') return fallback;
	if (!/^\d+$/.test(raw)) throw new TypeError(`${key} must be a non-negative integer`);
	const value = Number(raw);
	if (!Number.isSafeInteger(value)) throw new TypeError(`${key} is too large`);
	return Math.max(minimum, Math.min(maximum, value));
}

function requestConfig(request: Request): LabConfig {
	const existing = requestConfigs.get(request);
	if (existing !== undefined) return existing;
	const params = new URL(request.url).searchParams;
	const turns = urlInteger(params, 'turns', 4, 200, 1);
	const config: LabConfig = {
		run: runId(params.get('run') ?? crypto.randomUUID()),
		scenario: scenario(params.get('scenario') ?? 'steady'),
		prompt: promptInput(params.get('q') ?? 'Explain how SSR streaming signals work.'),
		authDelay: urlInteger(params, 'auth', 250, 2_000),
		answerDelay: urlInteger(params, 'answer', 180, 2_000),
		historyDelay: urlInteger(params, 'history', 600, 2_000),
		interval: urlInteger(params, 'interval', 160, 2_000),
		waves: urlInteger(params, 'waves', 8, 64, 1),
		turns,
		historyRows: urlInteger(params, 'historyRows', turns, 200, 1),
	};
	requestConfigs.set(request, config);
	return config;
}

function recorder(
	config: LabConfig,
	context: ServerCallContext,
	channel: TraceEvent['channel'],
	generation?: number,
) {
	let run = runs.get(config.run);
	if (run === undefined) {
		if (runs.size >= 64) runs.delete(runs.keys().next().value!);
		run = {
			origin: performance.now(),
			trace: { run: config.run, scenario: config.scenario, truncated: false, events: [] },
		};
		runs.set(config.run, run);
	}
	const activeRun = run;
	const transport = is_rpc_request(new URL(context.request.url).pathname) ? 'rpc' : 'document';
	return (type: TraceEvent['type'], revision?: number, value?: unknown) => {
		if (activeRun.trace.events.length >= 4_096) {
			activeRun.trace.truncated = true;
			return;
		}
		activeRun.trace.events.push({
			channel,
			type,
			at: Math.round((performance.now() - activeRun.origin) * 100) / 100,
			...(generation === undefined ? {} : { generation }),
			...(revision === undefined ? {} : { revision }),
			transport,
			...(value === undefined ? {} : { bytes: encoder.encode(JSON.stringify(value)).byteLength }),
		});
	};
}

async function wait(milliseconds: number, signal: AbortSignal): Promise<void> {
	signal.throwIfAborted();
	if (milliseconds === 0) {
		await Promise.resolve();
		signal.throwIfAborted();
		return;
	}
	await new Promise<void>((resolve, reject) => {
		const abort = () => {
			clearTimeout(timer);
			reject(signal.reason);
		};
		const timer = setTimeout(() => {
			signal.removeEventListener('abort', abort);
			resolve();
		}, milliseconds);
		signal.addEventListener('abort', abort, { once: true });
	});
	signal.throwIfAborted();
}

/** This is an artificial readiness gate, not an authentication implementation. */
export async function session(context: ServerCallContext): Promise<LabConfig> {
	const config = requestConfig(context.request);
	const record = recorder(config, context, 'session');
	record('start');
	try {
		await wait(config.authDelay, context.signal);
		record('complete');
		return { ...config };
	} catch (error) {
		record(context.signal.aborted ? 'abort' : 'error');
		throw error;
	} finally {
		record('finally');
	}
}

function answerInput(value: unknown): AnswerInput {
	if (
		value === null ||
		typeof value !== 'object' ||
		Array.isArray(value) ||
		Object.keys(value).some((key) => !['config', 'prompt', 'generation'].includes(key))
	) {
		throw new TypeError('Invalid answer request');
	}
	const input = value as Record<string, unknown>;
	return {
		config: configInput(input.config),
		prompt: promptInput(input.prompt),
		generation: integer(input.generation, 0, 1_000_000),
	};
}

function previousMessages(config: LabConfig): ChatMessage[] {
	const messages: ChatMessage[] = [];
	for (let turn = 1; turn < config.turns; turn++) {
		messages.push(
			{ id: `turn-${turn}-user`, role: 'user', content: `Explain streaming observation ${turn}.` },
			{
				id: `turn-${turn}-assistant`,
				role: 'assistant',
				content: `Observation ${turn}: the latest accepted value replaces the earlier frame while this message keeps its identity.`,
			},
		);
	}
	return messages;
}

function finalAnswer(prompt: string, config: LabConfig, generation: number): string {
	const introduction = `You asked: “${prompt}”\n\nThis reply arrives in ${config.waves} complete signal values. The shell can render while history, this answer, and tool activity progress independently.\n\n`;
	const explanation =
		'Each revision replaces the cumulative answer. Hydration adopts the accepted server state; sending another prompt selects a new generation. Canceling a generation closes its producer and leaves the last accepted text available for inspection.\n\n';
	const unicode =
		'Unicode checkpoint: café · e\u0301 · 東京 · مرحبًا · 👩🏽‍💻 · 🧪. Streaming preserves valid Unicode code points, including emoji and combining marks.\n\n';
	const unicodeStress =
		config.scenario === 'unicode'
			? 'Grapheme stress: 👨‍👩‍👧‍👦 🇬🇧 🏳️‍🌈 नमस्ते 한글 שלום. Escaping checkpoint: <script> is text, & stays visible, and "quoted" content survives every revision.\n\n'.repeat(
					4,
				)
			: '';
	const code =
		'```ts\nconst answer$ = query$(\n  () => request$.get(),\n  (request, { signal }) => watchAnswer(request, { signal }),\n  { key: "answer", kind: "stream" },\n);\n```\n\n';
	return `${introduction}${explanation}${unicode}${unicodeStress}${code}Generation ${generation} complete. Inspect the trace to compare producer yields with transport chunks and visible revisions.`;
}

function waveDelay(config: LabConfig, revision: number, firstDelay: number): number {
	if (revision === 1) return firstDelay;
	return config.scenario === 'burst' && (revision - 1) % 4 !== 0 ? 0 : config.interval;
}

export async function* answer(
	inputValue: AnswerInput,
	context: ServerCallContext,
): AsyncIterable<AnswerFrame> {
	const { config, prompt, generation } = answerInput(inputValue);
	const record = recorder(config, context, 'answer', generation);
	let terminal = false;
	record('start');
	try {
		await wait(config.answerDelay, context.signal);
		if (config.scenario === 'fail-before')
			throw new Error('Planned failure before the first answer');
		if (config.scenario !== 'empty') {
			const codePoints = Array.from(finalAnswer(prompt, config, generation));
			const prior = previousMessages(config);
			for (let revision = 1; revision <= config.waves; revision++) {
				if (revision > 1)
					await wait(waveDelay(config, revision, config.answerDelay), context.signal);
				context.signal.throwIfAborted();
				const text = codePoints
					.slice(0, Math.ceil((codePoints.length * revision) / config.waves))
					.join('');
				const frame: AnswerFrame = {
					conversationId: `${config.run}:conversation`,
					generation,
					prompt,
					revision,
					total: config.waves,
					answer: text,
					tokens: text.trim() === '' ? 0 : text.trim().split(/\s+/u).length,
					messages: [
						...prior,
						{ id: `turn-${config.turns}-user`, role: 'user', content: prompt },
						{ id: `turn-${config.turns}-assistant`, role: 'assistant', content: text },
					],
				};
				record('yield', revision, frame);
				yield frame;
				if (config.scenario === 'fail-after' && revision === Math.min(3, config.waves)) {
					throw new Error(`Planned failure after answer revision ${revision}`);
				}
			}
		}
		terminal = true;
		record('complete');
	} catch (error) {
		terminal = true;
		record(context.signal.aborted ? 'abort' : 'error');
		throw error;
	} finally {
		if (!terminal) record('abort');
		record('finally');
	}
}

export async function* history(
	configValue: LabConfig,
	context: ServerCallContext,
): AsyncIterable<HistoryFrame> {
	const config = configInput(configValue);
	const record = recorder(config, context, 'history');
	let terminal = false;
	record('start');
	try {
		const rows = Array.from({ length: config.historyRows }, (_, index) => ({
			id: `history-${index + 1}`,
			title: ['Streaming and hydration', 'Independent tool activity', 'A Unicode conversation'][
				index % 3
			]!,
			preview: `Conversation ${index + 1}: deterministic history arriving from its own producer.`,
		}));
		for (let revision = 1; revision <= config.waves; revision++) {
			await wait(waveDelay(config, revision, config.historyDelay), context.signal);
			const frame: HistoryFrame = {
				revision,
				total: config.waves,
				rows: rows.slice(0, Math.ceil((rows.length * revision) / config.waves)),
			};
			record('yield', revision, frame);
			yield frame;
		}
		terminal = true;
		record('complete');
	} catch (error) {
		terminal = true;
		record(context.signal.aborted ? 'abort' : 'error');
		throw error;
	} finally {
		if (!terminal) record('abort');
		record('finally');
	}
}

export async function* tools(
	configValue: LabConfig,
	context: ServerCallContext,
): AsyncIterable<ToolFrame> {
	const config = configInput(configValue);
	const record = recorder(config, context, 'tools');
	let terminal = false;
	record('start');
	try {
		const labels = [
			'Read the prompt',
			'Retrieve context',
			'Compare streaming revisions',
			'Compose the answer',
		];
		for (let revision = 1; revision <= config.waves; revision++) {
			await wait(waveDelay(config, revision, Math.round(config.answerDelay / 2)), context.signal);
			const progress = (revision * labels.length) / config.waves;
			const frame: ToolFrame = {
				revision,
				total: config.waves,
				steps: labels.map((label, index) => ({
					id: `tool-${index + 1}`,
					label,
					status: index + 1 <= progress ? 'done' : index <= progress ? 'running' : 'waiting',
				})),
			};
			record('yield', revision, frame);
			yield frame;
		}
		terminal = true;
		record('complete');
	} catch (error) {
		terminal = true;
		record(context.signal.aborted ? 'abort' : 'error');
		throw error;
	} finally {
		if (!terminal) record('abort');
		record('finally');
	}
}

/** Local, bounded diagnostics: traces contain timing and sizes, never prompt or answer text. */
export function traceResponse(context: Context): Response {
	const run = new URL(context.request.url).searchParams.get('run') ?? '';
	if (!/^[a-zA-Z0-9_-]{1,80}$/.test(run)) return new Response('Invalid run', { status: 400 });
	const trace = runs.get(run)?.trace;
	if (trace === undefined) return new Response('Run not found or evicted', { status: 404 });
	return Response.json(trace, { headers: { 'Cache-Control': 'no-store' } });
}
