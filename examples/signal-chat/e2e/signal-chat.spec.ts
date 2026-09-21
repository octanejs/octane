import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test as base, expect, type APIRequestContext, type Page } from '@playwright/test';
import { collectBrowserDiagnostics, settleBrowserFrames } from '../../_shared/e2e/browser.ts';

const test = base.extend<{ diagnosticsGate: void }>({
	diagnosticsGate: [
		async ({ page }, use, testInfo) => {
			const diagnostics = collectBrowserDiagnostics(page, {
				failOnConsoleLevels: ['warning', 'error'],
				failOnHydrationWarnings: true,
				hydrationWarningPattern: /hydration.*mismatch|mismatch.*hydrat|recoverable.*hydrat/i,
			});
			try {
				await use();
				await settleBrowserFrames(page);
				diagnostics.assertClean(testInfo.title);
			} finally {
				diagnostics.stop();
			}
		},
		{ auto: true },
	],
});

type TraceEvent = {
	channel: 'session' | 'answer' | 'history' | 'tools';
	type: 'start' | 'yield' | 'complete' | 'error' | 'abort' | 'finally';
	at: number;
	generation?: number;
	revision?: number;
	transport: 'document' | 'rpc';
};

function configuration(options: Record<string, string | number> = {}, eager = false) {
	const run = randomUUID();
	const search = new URLSearchParams({
		run,
		scenario: 'steady',
		auth: '40',
		answer: '60',
		history: '120',
		interval: '30',
		waves: '6',
		turns: '3',
	});
	for (const [key, value] of Object.entries(options)) search.set(key, String(value));
	return { run, path: `${eager ? '/eager' : '/'}?${search}` };
}

async function trace(request: APIRequestContext, run: string) {
	const response = await request.get(`/__lab/trace?run=${encodeURIComponent(run)}`);
	expect(response.ok()).toBe(true);
	const result = (await response.json()) as { truncated: boolean; events: TraceEvent[] };
	expect(result.truncated).toBe(false);
	return result.events;
}

async function open(page: Page, path: string) {
	await page.goto(path, { waitUntil: 'commit' });
	await expect(page.locator('[data-lab-shell]')).toBeVisible();
}

async function completedAnswer(page: Page, waves: number) {
	await expect(page.locator('[data-answer]')).toHaveAttribute('data-revision', String(waves));
	await expect(page.getByRole('region', { name: 'Conversation', exact: true })).toHaveAttribute(
		'data-complete',
		'true',
	);
}

test('streams a public shell and independent first results with one ready HTML snapshot', async ({
	baseURL,
	request,
}) => {
	if (baseURL === undefined) throw new Error('Signal Chat requires a base URL');
	const { run, path } = configuration({ auth: 100, answer: 30, history: 350, waves: 4 });
	const response = await fetch(`${baseURL}${path}`, { signal: AbortSignal.timeout(15_000) });
	expect(response.ok).toBe(true);
	if (response.body === null) throw new Error('The SSR response has no body');
	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let html = '';
	const readyAnswer = /<[a-z][^>]*\sdata-answer(?:\s|=|>)/i;
	const readyHistory = /<[a-z][^>]*\sdata-history(?:\s|=|>)/i;
	let sawShellBeforeAnswer = false;
	let sawAnswerBeforeHistory = false;
	try {
		for (;;) {
			const part = await reader.read();
			html += decoder.decode(part.value, { stream: !part.done });
			if (!sawShellBeforeAnswer && html.includes('data-lab-shell')) {
				expect(html).not.toMatch(readyAnswer);
				sawShellBeforeAnswer = true;
			}
			if (!sawAnswerBeforeHistory && readyAnswer.test(html)) {
				expect(html).not.toMatch(readyHistory);
				sawAnswerBeforeHistory = true;
			}
			if (part.done) break;
		}
	} finally {
		await reader.cancel();
	}
	expect(sawShellBeforeAnswer).toBe(true);
	expect(sawAnswerBeforeHistory).toBe(true);
	expect(html).toMatch(readyHistory);
	expect(html.match(/<[a-z][^>]*\sdata-answer(?:\s|=|>)/gi)).toHaveLength(1);
	const events = await trace(request, run);
	expect(
		events.filter((event) => event.channel === 'answer' && event.type === 'yield'),
	).toHaveLength(4);
	expect(
		events.filter((event) => event.channel === 'answer' && event.type === 'complete'),
	).toHaveLength(1);
});

test('preserves early native input and adopts deferred nodes without repeating the initial request', async ({
	page,
	request,
}) => {
	const { run, path } = configuration({ waves: 8, interval: 45 });
	let releaseScripts!: () => void;
	const scriptsReady = new Promise<void>((resolve) => {
		releaseScripts = resolve;
	});
	await page.route('**/*', async (route) => {
		if (route.request().resourceType() === 'script') await scriptsReady;
		await route.continue();
	});
	try {
		await open(page, path);
		const composer = page.getByRole('textbox', { name: 'Message', exact: true });
		const serverComposer = await composer.elementHandle();
		if (serverComposer === null) throw new Error('The SSR composer is missing');
		const text = 'A draft before the client modules arrive';
		await composer.fill(text);
		await composer.evaluate((element) => {
			const textarea = element as HTMLTextAreaElement;
			textarea.focus();
			textarea.setSelectionRange(5, 14);
		});
		await expect(page.locator('[data-answer]')).toHaveAttribute('data-revision', '1');
		const originalMessage = await page.locator('[data-message-id]').first().elementHandle();
		if (originalMessage === null) throw new Error('The first SSR historical message is missing');
		await expect
			.poll(async () =>
				(await trace(request, run)).some(
					(event) => event.channel === 'answer' && event.type === 'complete',
				),
			)
			.toBe(true);
		await expect(page.locator('[data-answer]')).toHaveAttribute('data-revision', '1');
		releaseScripts();
		await expect(page.locator('[data-draft-length]')).toHaveText(String(text.length));
		await expect(composer).toHaveValue(text);
		expect(
			await composer.evaluate((element, original) => element === original, serverComposer),
		).toBe(true);
		expect(
			await composer.evaluate((element) => {
				const textarea = element as HTMLTextAreaElement;
				return {
					focused: document.activeElement === textarea,
					start: textarea.selectionStart,
					end: textarea.selectionEnd,
				};
			}),
		).toEqual({ focused: true, start: 5, end: 14 });
		await page.getByRole('button', { name: 'Activate conversation', exact: true }).click();
		await completedAnswer(page, 8);
		await page.getByRole('button', { name: 'Activate history', exact: true }).click();
		await expect(page.locator('[data-history]')).toHaveAttribute('data-revision', '8');
		await page.getByRole('button', { name: 'Activate tools', exact: true }).click();
		await expect(page.locator('[data-tools]')).toHaveAttribute('data-revision', '8');
		expect(
			await page
				.locator('[data-message-id]')
				.first()
				.evaluate((element, original) => element === original, originalMessage),
		).toBe(true);
		const events = await trace(request, run);
		for (const channel of ['answer', 'history', 'tools']) {
			const starts = events.filter((event) => event.channel === channel && event.type === 'start');
			expect(starts.map((event) => event.transport)).toEqual(['document']);
		}
		await page.getByRole('button', { name: 'Send message', exact: true }).click();
		await expect(composer).toHaveValue('');
		await expect(page.locator('[data-answer]')).toHaveAttribute('data-generation', '1');
		await completedAnswer(page, 8);
		await expect(page.locator('[data-current-prompt]')).toHaveText(text);
	} finally {
		releaseScripts();
		await page.unroute('**/*');
	}
});

test('eager regions display the complete Unicode answer, history and tools', async ({ page }) => {
	const { path } = configuration({ scenario: 'unicode', waves: 8, interval: 20 }, true);
	await open(page, path);
	await completedAnswer(page, 8);
	await expect(page.locator('[data-current-answer]')).toContainText(/[^\x00-\x7f]/);
	await expect(page.locator('[data-history]')).toHaveAttribute('data-revision', '8');
	await expect(page.locator('[data-tools]')).toHaveAttribute('data-revision', '8');
});

test('a Send captured before composer activation preserves the native draft as its response prompt', async ({
	page,
	request,
}) => {
	const { run, path } = configuration({ waves: 6, interval: 30 });
	let releaseScripts!: () => void;
	const scriptsReady = new Promise<void>((resolve) => {
		releaseScripts = resolve;
	});
	await page.route('**/*', async (route) => {
		if (route.request().resourceType() === 'script') await scriptsReady;
		await route.continue();
	});
	try {
		await open(page, path);
		await expect(page.locator('[data-composer-ready="false"]')).toBeVisible();
		const prompt = 'Send this native draft before the composer activates';
		const composer = page.getByRole('textbox', { name: 'Message', exact: true });
		await composer.fill(prompt);
		await page
			.getByRole('button', { name: 'Send message', exact: true })
			.click({ noWaitAfter: true });
		releaseScripts();
		await expect(page.locator('[data-composer-ready="true"]')).toBeVisible();
		await expect(composer).toHaveValue('');
		expect(new URL(page.url()).searchParams.get('run')).toBe(run);
		await page.getByRole('button', { name: 'Activate conversation', exact: true }).click();
		await completedAnswer(page, 6);
		await expect(page.locator('[data-answer]')).toHaveAttribute('data-generation', '1');
		await expect(page.locator('[data-current-prompt]')).toHaveText(prompt);
		await expect(page.locator('[data-current-answer]')).toContainText(prompt);
		const starts = (await trace(request, run)).filter(
			(event) => event.channel === 'answer' && event.type === 'start' && event.transport === 'rpc',
		);
		expect(starts).toHaveLength(1);
	} finally {
		releaseScripts();
		await page.unrouteAll({ behavior: 'wait' });
	}
});

for (const scenario of ['fail-before', 'fail-after', 'empty']) {
	test(`${scenario} remains visible and a retry replaces it with a complete response`, async ({
		page,
	}) => {
		const { path } = configuration({ scenario, waves: 6 }, true);
		await open(page, path);
		await expect(page.getByRole('alert').filter({ hasText: 'Response failed' })).toBeVisible();
		await page.getByRole('button', { name: 'Retry response', exact: true }).click();
		await completedAnswer(page, 6);
		await expect(page.getByRole('alert').filter({ hasText: 'Response failed' })).toHaveCount(0);
		await expect(page.locator('[data-current-answer]')).not.toBeEmpty();
	});
}

test('a newer submission stays authoritative after previous producer cancellation', async ({
	page,
	request,
}) => {
	const { run, path } = configuration({ waves: 12, interval: 65, answer: 50 }, true);
	await open(page, path);
	await completedAnswer(page, 12);
	const composer = page.getByRole('textbox', { name: 'Message', exact: true });
	await composer.fill('The first request should be superseded');
	await page.getByRole('button', { name: 'Send message', exact: true }).click();
	await expect(page.locator('[data-current-prompt]')).toHaveText(
		'The first request should be superseded',
	);
	await composer.fill('The newest request must stay visible');
	await page.getByRole('button', { name: 'Send message', exact: true }).click();
	await expect(page.locator('[data-current-prompt]')).toHaveText(
		'The newest request must stay visible',
	);
	await completedAnswer(page, 12);
	await expect(page.locator('[data-current-prompt]')).toHaveText(
		'The newest request must stay visible',
	);
	const events = await trace(request, run);
	const rpcStarts = events.filter(
		(event) => event.channel === 'answer' && event.type === 'start' && event.transport === 'rpc',
	);
	expect(rpcStarts).toHaveLength(2);
	expect(events).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				channel: 'answer',
				type: 'abort',
				generation: rpcStarts[0]!.generation,
			}),
			expect.objectContaining({
				channel: 'answer',
				type: 'complete',
				generation: rpcStarts[1]!.generation,
			}),
		]),
	);
});

test('stopping a response closes its producer and resuming starts fresh work', async ({
	page,
	request,
}) => {
	const { run, path } = configuration({ waves: 12, interval: 65, answer: 40 }, true);
	await open(page, path);
	await completedAnswer(page, 12);
	const prompt = 'Stop this response and then resume it';
	await page.getByRole('textbox', { name: 'Message', exact: true }).fill(prompt);
	await page.getByRole('button', { name: 'Send message', exact: true }).click();
	await expect(page.locator('[data-current-prompt]')).toHaveText(prompt);
	await page.getByRole('button', { name: 'Stop response', exact: true }).click();
	await expect
		.poll(async () =>
			(await trace(request, run)).some(
				(event) =>
					event.channel === 'answer' && event.type === 'abort' && event.transport === 'rpc',
			),
		)
		.toBe(true);
	await page.getByRole('button', { name: 'Resume response', exact: true }).click();
	await completedAnswer(page, 12);
	await expect(page.locator('[data-current-prompt]')).toHaveText(prompt);
	const starts = (await trace(request, run)).filter(
		(event) => event.channel === 'answer' && event.type === 'start' && event.transport === 'rpc',
	);
	expect(starts).toHaveLength(2);
	expect(starts[1]!.generation).toBeGreaterThan(starts[0]!.generation!);
});

test('refresh retains the visible response while reset shows pending content', async ({ page }) => {
	const { path } = configuration({ waves: 6, interval: 25 }, true);
	await open(page, path);
	await completedAnswer(page, 6);
	const originalAnswer = await page.locator('[data-current-answer]').textContent();
	const originalTranscript = await page.locator('[data-answer]').elementHandle();
	if (originalTranscript === null) throw new Error('The completed transcript is missing');
	let nextPost: { held(): void; ready: Promise<void> } | undefined;
	const releases: (() => void)[] = [];
	const holdNextPost = () => {
		let markHeld!: () => void;
		const held = new Promise<void>((resolve) => {
			markHeld = resolve;
		});
		let release!: () => void;
		const ready = new Promise<void>((resolve) => {
			release = resolve;
		});
		releases.push(release);
		nextPost = { held: markHeld, ready };
		return { held, release };
	};
	await page.route('**/*', async (route) => {
		if (nextPost !== undefined && route.request().method() === 'POST') {
			const gate = nextPost;
			nextPost = undefined;
			gate.held();
			await gate.ready;
		}
		await route.continue();
	});
	try {
		const refresh = holdNextPost();
		await page.getByRole('button', { name: 'Refresh response', exact: true }).click();
		await refresh.held;
		await expect(page.locator('[data-answer-state]')).toContainText('refreshing');
		await expect(page.locator('[data-current-answer]')).toHaveText(originalAnswer!);
		expect(
			await page
				.locator('[data-answer]')
				.evaluate((element, original) => element === original, originalTranscript),
		).toBe(true);
		await expect(
			page.getByRole('status').filter({ hasText: 'Waiting for the first answer' }),
		).toHaveCount(0);
		refresh.release();
		await completedAnswer(page, 6);
		await expect(page.locator('[data-answer-state]')).not.toContainText('refreshing');

		const reset = holdNextPost();
		await page.getByRole('button', { name: 'Reset response', exact: true }).click();
		await reset.held;
		await expect(page.locator('[data-answer]')).not.toBeVisible();
		await expect(
			page.getByRole('status').filter({ hasText: 'Waiting for the first answer' }),
		).toBeVisible();
		await expect(page.locator('[data-answer-state]')).toContainText('pending');
		await expect(page.locator('[data-answer-state]')).not.toContainText('refreshing');
		reset.release();
		await completedAnswer(page, 6);
		await expect(page.locator('[data-current-answer]')).toHaveText(originalAnswer!);
	} finally {
		for (const release of releases) release();
		await page.unrouteAll({ behavior: 'wait' });
	}
});

test('exported captures distinguish the first visible revisions of superseded generations', async ({
	page,
}, testInfo) => {
	const { run, path } = configuration(
		{ waves: 3, interval: 1_500, auth: 0, answer: 0, history: 0 },
		true,
	);
	await open(page, path);
	await completedAnswer(page, 3);
	const composer = page.getByRole('textbox', { name: 'Message', exact: true });
	await composer.focus();
	await expect(page.locator('[data-composer-ready="true"]')).toBeVisible();
	await composer.fill('First generation recorded at its first revision');
	await page.getByRole('button', { name: 'Send message', exact: true }).click();
	await expect(composer).toHaveValue('');
	await expect(page.locator('[data-draft-length]')).toHaveText('0');
	await expect(page.locator('[data-answer]')).toHaveAttribute('data-generation', '1');
	await expect(page.locator('[data-answer]')).toHaveAttribute('data-revision', '1');
	await settleBrowserFrames(page);
	const latestPrompt = 'Second generation recorded at the same revision';
	await composer.fill(latestPrompt);
	await page.getByRole('button', { name: 'Send message', exact: true }).click();
	await expect(page.locator('[data-answer]')).toHaveAttribute('data-generation', '2');
	await expect(page.locator('[data-answer]')).toHaveAttribute('data-revision', '1');
	await completedAnswer(page, 3);
	await expect(page.locator('[data-current-prompt]')).toHaveText(latestPrompt);
	await expect(page.locator('[data-current-answer]')).toContainText('Generation 2 complete.');

	const downloadReady = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Export browser trace', exact: true }).click();
	const download = await downloadReady;
	expect(download.suggestedFilename()).toBe(`signal-chat-${run}.json`);
	const output = testInfo.outputPath('capture.json');
	await download.saveAs(output);
	const capture = JSON.parse(await readFile(output, 'utf8')) as {
		schemaVersion: number;
		url: string;
		browser: {
			enabled: boolean;
			truncated: boolean;
			observations: { event: string; region?: string; revision?: number; generation?: number }[];
		};
		navigation: { name: string }[];
		resources: { name: string }[];
		server: { run: string; truncated: boolean; events: TraceEvent[] };
	};
	expect(capture.schemaVersion).toBe(1);
	expect(new URL(capture.url).searchParams.get('run')).toBe(run);
	expect(capture.browser.enabled).toBe(true);
	expect(capture.browser.truncated).toBe(false);
	expect(capture.server.run).toBe(run);
	expect(capture.server.truncated).toBe(false);
	expect(capture.browser.observations).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				event: 'dom-observed',
				region: 'answer',
				revision: 1,
				generation: 1,
			}),
			expect.objectContaining({
				event: 'dom-observed',
				region: 'answer',
				revision: 1,
				generation: 2,
			}),
		]),
	);
	expect(capture.server.events).toEqual(
		expect.arrayContaining([
			expect.objectContaining({ channel: 'answer', type: 'abort', generation: 1 }),
			expect.objectContaining({ channel: 'answer', type: 'complete', generation: 2 }),
		]),
	);
	expect(capture.navigation).toHaveLength(1);
	expect(new URL(capture.navigation[0]!.name).searchParams.get('run')).toBe(run);
	expect(
		capture.resources.some((resource) => new URL(resource.name).pathname.endsWith('.js')),
	).toBe(true);
});

test('a narrow viewport preserves an escaped Unicode prompt and the complete streamed answer', async ({
	page,
}) => {
	await page.setViewportSize({ width: 390, height: 844 });
	const prompt = '東京 · 👩🏽‍💻 · café · é · مرحبًا <script>alert("text")</script> & "quoted"';
	const { path } = configuration(
		{ scenario: 'unicode', q: prompt, waves: 4, interval: 15, turns: 2 },
		true,
	);
	await open(page, path);
	await completedAnswer(page, 4);
	await expect(page.locator('[data-current-prompt]')).toHaveText(prompt);
	await expect(page.locator('[data-current-answer]')).toContainText(prompt);
	await expect(page.locator('[data-current-answer]')).toContainText('Grapheme stress: 👨‍👩‍👧‍👦');
	await expect(page.locator('[data-current-answer]')).toContainText(
		'Escaping checkpoint: <script> is text',
	);
	await expect(page.locator('[data-current-answer]')).toContainText('Generation 0 complete.');
});

test('configured deferred and eager runs download evidence for the selected workload', async ({
	page,
	request,
}, testInfo) => {
	const settings = {
		scenario: 'unicode',
		auth: '70',
		answer: '60',
		history: '180',
		interval: '25',
		waves: '5',
		turns: '2',
		hydrateDelay: '0',
		q: 'Compare 東京 · 👩🏽‍💻 · café & "quoted" <script>text</script>',
	};
	const { path } = configuration({ auth: 0, answer: 0, history: 0, interval: 0, waves: 1 });
	await open(page, path);
	const runs: string[] = [];
	for (const eager of [false, true]) {
		const form = page.getByRole('region', { name: 'Run configuration', exact: true });
		await form.getByLabel(/^Scenario/).selectOption(settings.scenario);
		for (const [label, value] of [
			[/^Session delay/, settings.auth],
			[/^Answer delay/, settings.answer],
			[/^History delay/, settings.history],
			[/^Between yields/, settings.interval],
			[/^Stream snapshots/, settings.waves],
			[/^Total turns/, settings.turns],
			[/^Shell hydration delay/, settings.hydrateDelay],
			[/^Initial prompt/, settings.q],
		] as const) {
			await form.getByLabel(label).fill(value);
		}
		await Promise.all([
			page.waitForEvent('framenavigated', { predicate: (frame) => frame === page.mainFrame() }),
			form.getByRole('button', { name: eager ? 'Run eager' : 'Run deferred', exact: true }).click(),
		]);
		const url = new URL(page.url());
		expect(url.pathname).toBe(eager ? '/eager' : '/');
		for (const [name, value] of Object.entries(settings)) {
			expect(url.searchParams.get(name), `${name} survives the native form submission`).toBe(value);
		}
		await expect(page.locator('[data-lab-shell]')).toHaveAttribute(
			'data-activation',
			eager ? 'eager' : 'interaction',
		);
		const producerLink = page.getByRole('link', { name: /^Producer trace/ });
		const href = await producerLink.getAttribute('href');
		if (href === null) throw new Error('The configured run has no producer trace link');
		const run = new URL(href, page.url()).searchParams.get('run');
		if (run === null) throw new Error('The configured run has no diagnostic ID');
		runs.push(run);
		await expect
			.poll(async () => {
				const events = await trace(request, run);
				return ['answer', 'history', 'tools'].every((channel) =>
					events.some((event) => event.channel === channel && event.type === 'complete'),
				);
			})
			.toBe(true);
		if (!eager) {
			for (const selector of ['[data-answer]', '[data-history]', '[data-tools]']) {
				await expect(page.locator(selector)).toHaveAttribute('data-revision', '1');
			}
			for (const name of ['Activate conversation', 'Activate history', 'Activate tools']) {
				await page.getByRole('button', { name, exact: true }).click();
			}
		}
		await completedAnswer(page, Number(settings.waves));
		await expect(page.locator('[data-history]')).toHaveAttribute('data-revision', settings.waves);
		await expect(page.locator('[data-tools]')).toHaveAttribute('data-revision', settings.waves);
		const conversation = page.getByRole('region', { name: 'Conversation', exact: true });
		await expect(
			conversation.getByText('Explain streaming observation 1.', { exact: true }),
		).toBeVisible();
		await expect(
			conversation.getByText('Explain streaming observation 2.', { exact: true }),
		).toHaveCount(0);
		await expect(page.locator('[data-current-prompt]')).toHaveText(settings.q);
		await expect(page.locator('[data-current-answer]')).toContainText(settings.q);
		await expect(page.locator('[data-current-answer]')).toContainText('Grapheme stress: 👨‍👩‍👧‍👦');
		await expect(page.locator('[data-current-answer]')).toContainText('Generation 0 complete.');
		await settleBrowserFrames(page);
		const downloadReady = page.waitForEvent('download');
		await page.getByRole('button', { name: 'Export browser trace', exact: true }).click();
		const download = await downloadReady;
		expect(download.suggestedFilename()).toBe(`signal-chat-${run}.json`);
		const output = testInfo.outputPath(`${eager ? 'eager' : 'deferred'}-capture.json`);
		await download.saveAs(output);
		const capture = JSON.parse(await readFile(output, 'utf8')) as {
			url: string;
			browser: {
				enabled: boolean;
				truncated: boolean;
				observations: {
					event: string;
					region?: string;
					revision?: number;
					generation?: number;
				}[];
			};
			server: { run: string; scenario: string; truncated: boolean; events: TraceEvent[] };
		};
		expect(capture.url).toBe(page.url());
		expect(capture.browser.enabled).toBe(true);
		expect(capture.browser.truncated).toBe(false);
		expect(capture.server.run).toBe(run);
		expect(capture.server.scenario).toBe(settings.scenario);
		expect(capture.server.truncated).toBe(false);
		expect(capture.browser.observations).toContainEqual(
			expect.objectContaining({
				event: 'dom-observed',
				region: 'answer',
				revision: Number(settings.waves),
				generation: 0,
			}),
		);
		for (const channel of ['answer', 'history', 'tools']) {
			const events = capture.server.events.filter((event) => event.channel === channel);
			expect(
				events.filter((event) => event.type === 'start').map((event) => event.transport),
			).toEqual(['document']);
			expect(
				events.filter((event) => event.type === 'yield').map((event) => event.revision),
			).toEqual([1, 2, 3, 4, 5]);
			expect(
				events
					.filter((event) => event.type !== 'start' && event.type !== 'yield')
					.map((event) => event.type),
			).toEqual(['complete', 'finally']);
		}
	}
	expect(runs[0]).not.toBe(runs[1]);
});
