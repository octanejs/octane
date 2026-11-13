// The agent driver (#2508): drive a running Octane app in a development server
// the way Exact's agent drives its hosts. One page at a time, a fixed set of
// operations, and a clock the agent owns: the page's Octane runtime takes its
// time from `octane/agent`, so between two operations nothing moves, and the
// agent says when time passes (`clock`).

const LOG_LIMIT = 500;
const BOOT_TIMEOUT_MS = 20_000;

async function loadPlaywright() {
	for (const name of ['playwright', 'playwright-core']) {
		try {
			return await import(name);
		} catch (error) {
			if (error?.code !== 'ERR_MODULE_NOT_FOUND') throw error;
		}
	}
	throw new Error(
		'The agent driver needs Playwright. Install it beside @octanejs/mcp-server ' +
			'(`npm install -D playwright`) and its Chromium (`npx playwright install chromium`).',
	);
}

/**
 * Put the agent module first in a served page, so the clock owns the runtime's
 * time before any app module runs. Module scripts run in document order.
 */
export function injectAgent(html) {
	// Vite serves `@id/` under its `base`, and has already rewritten its own
	// client script to carry it, so read the base from there.
	const base = /src="([^"]*)@vite\/client"/.exec(html)?.[1] ?? '/';
	const AGENT_SCRIPT = `<script type="module" src="${base}@id/octane/agent"></script>`;
	const head = /<head(\s[^>]*)?>/i.exec(html);
	if (head)
		return (
			html.slice(0, head.index + head[0].length) +
			AGENT_SCRIPT +
			html.slice(head.index + head[0].length)
		);
	return AGENT_SCRIPT + html;
}

/** A Playwright locator for a target: a test id, an ARIA role and name, text, or a CSS selector. */
function locate(page, target) {
	if (target.testId !== undefined) return page.getByTestId(target.testId);
	if (target.role !== undefined)
		return page.getByRole(
			target.role,
			target.name === undefined ? {} : { name: target.name, exact: true },
		);
	if (target.text !== undefined) return page.getByText(target.text, { exact: true });
	if (target.selector !== undefined) return page.locator(target.selector);
	throw new Error('A target needs one of testId, role (with an optional name), text or selector.');
}

/**
 * Open `url` in Chromium with the agent injected and run the app's start-up
 * work to idle. Resolves to a session whose methods are the driver's operations.
 */
export async function openApp({ url, width = 1280, height = 800, headless = true }) {
	const { chromium } = await loadPlaywright();
	const browser = await chromium.launch({ headless });
	try {
		const page = await browser.newPage({ viewport: { width, height } });
		const logs = [];
		const log = (entry) => {
			logs.push(entry);
			if (logs.length > LOG_LIMIT) logs.shift();
		};
		page.on('console', (message) => log(`${message.type()}: ${message.text()}`));
		page.on('pageerror', (error) => log(`pageerror: ${error.message}`));
		await page.route('**/*', async (route) => {
			const request = route.request();
			if (request.resourceType() !== 'document' || request.frame() !== page.mainFrame()) {
				await route.continue();
				return;
			}
			const response = await route.fetch();
			const type = response.headers()['content-type'] ?? '';
			if (!type.includes('text/html')) {
				await route.fulfill({ response });
				return;
			}
			await route.fulfill({ response, body: injectAgent(await response.text()) });
		});
		await page.goto(url);
		try {
			await page.waitForFunction(() => globalThis.__OCTANE_AGENT__ !== undefined, null, {
				timeout: BOOT_TIMEOUT_MS,
			});
		} catch {
			throw new Error(
				`${url} did not load octane/agent. The agent drives a Vite development server ` +
					'of an app that depends on octane.',
			);
		}
		const now = await page.evaluate(() => globalThis.__OCTANE_AGENT__.settle());
		return createSession(browser, page, logs, now);
	} catch (error) {
		await browser.close();
		throw error;
	}
}

function createSession(browser, page, logs, openedAt) {
	// After an input, run the work it made due, as the browser would in that
	// input's own task, without moving the clock.
	const due = () => page.evaluate(() => globalThis.__OCTANE_AGENT__.due());
	return {
		page,
		openedAt,
		/** The page's accessibility tree, as ARIA YAML. */
		tree: () => page.locator('body').ariaSnapshot(),
		/** Mounted components and their state, or null without the devtools hook. */
		state: () => page.evaluate(() => globalThis.__OCTANE_AGENT__.state()),
		async tap(target) {
			await locate(page, target).click();
			return due();
		},
		async type(target, text, { submit = false } = {}) {
			const field = locate(page, target);
			await field.fill(text);
			if (submit) await field.press('Enter');
			return due();
		},
		/** Move time: `{ advance: ms }`, `{ frame: true }` or `{ settle: true }`. Resolves to the clock's time. */
		clock(op) {
			if (op.advance !== undefined)
				return page.evaluate((ms) => globalThis.__OCTANE_AGENT__.advance(ms), op.advance);
			if (op.frame) return page.evaluate(() => globalThis.__OCTANE_AGENT__.frame());
			if (op.settle) return page.evaluate(() => globalThis.__OCTANE_AGENT__.settle());
			return page.evaluate(() => globalThis.__OCTANE_AGENT__.now());
		},
		screenshot: () => page.screenshot({ type: 'png' }),
		/** Console messages and page errors since the last call. */
		logs: () => logs.splice(0),
		close: () => browser.close(),
	};
}

let session = null;

function requireSession() {
	if (session === null)
		throw new Error('No app is open. Call octane_app_open with the dev server URL first.');
	return session;
}

const text = (value) => ({ content: [{ type: 'text', text: value }] });
const atClock = (now) => text(`Clock at ${now} ms.`);

/** Register the driver's operations as MCP tools. */
export function registerAgentTools(server, z) {
	const target = z
		.object({
			testId: z.string().optional(),
			role: z.string().optional().describe('An ARIA role, such as button or textbox.'),
			name: z.string().optional().describe("The element's accessible name, with role."),
			text: z.string().optional(),
			selector: z.string().optional().describe('A CSS selector, when nothing else names it.'),
		})
		.describe('What to act on. Prefer testId, then role and name.');

	server.registerTool(
		'octane_app_open',
		{
			title: 'Open an Octane app',
			description:
				"Open a page of an Octane app's Vite development server in Chromium, with the test clock installed, and run its start-up work to idle. Between two operations nothing moves: the app's timers, frames, transitions and effects wait for octane_app_clock. Closes any app opened before.",
			inputSchema: {
				url: z.string().describe('A development server URL, such as http://localhost:5173/.'),
				width: z.number().int().positive().optional(),
				height: z.number().int().positive().optional(),
			},
		},
		async ({ url, width, height }) => {
			if (session !== null) await session.close();
			session = null;
			session = await openApp({ url, width, height });
			return text(`Opened ${url}; clock at ${session.openedAt} ms.`);
		},
	);
	server.registerTool(
		'octane_app_tree',
		{
			title: "Read the app's accessibility tree",
			description:
				"The open page's accessibility tree as ARIA YAML: roles, names, values and states.",
			inputSchema: {},
		},
		async () => text(await requireSession().tree()),
	);
	server.registerTool(
		'octane_app_state',
		{
			title: "Read the app's component state",
			description:
				"Mounted components with their useState and useReducer values. Needs the dev server's runtime devtools hook: octane({ devtools: true }) or profile: true.",
			inputSchema: {},
		},
		async () => {
			const state = await requireSession().state();
			return text(
				state === null
					? 'This page has no runtime devtools hook. Start the dev server with octane({ devtools: true }).'
					: JSON.stringify(state, null, 2),
			);
		},
	);
	server.registerTool(
		'octane_app_tap',
		{
			title: 'Tap an element',
			description:
				'Click an element, then run the work the click made due without moving the clock.',
			inputSchema: { target },
		},
		async (input) => atClock(await requireSession().tap(input.target)),
	);
	server.registerTool(
		'octane_app_type',
		{
			title: 'Type into a field',
			description:
				"Replace a text field's value, optionally press Enter, then run the work that made due without moving the clock.",
			inputSchema: { target, text: z.string(), submit: z.boolean().optional() },
		},
		async (input) =>
			atClock(await requireSession().type(input.target, input.text, { submit: input.submit })),
	);
	server.registerTool(
		'octane_app_clock',
		{
			title: "Move the app's clock",
			description:
				'Move time for the open app: advance by ms (running each timer, frame and task that falls due, in order), go to the next frame, or settle (run everything the clock holds). With no argument, reads the time.',
			inputSchema: {
				advance: z.number().nonnegative().optional(),
				frame: z.boolean().optional(),
				settle: z.boolean().optional(),
			},
		},
		async (input) => atClock(await requireSession().clock(input)),
	);
	server.registerTool(
		'octane_app_screenshot',
		{ title: 'Screenshot the app', description: 'A PNG of the open page.', inputSchema: {} },
		async () => ({
			content: [
				{
					type: 'image',
					data: Buffer.from(await requireSession().screenshot()).toString('base64'),
					mimeType: 'image/png',
				},
			],
		}),
	);
	server.registerTool(
		'octane_app_logs',
		{
			title: "Read the app's logs",
			description: 'Console messages and page errors since the last call.',
			inputSchema: {},
		},
		async () => {
			const lines = requireSession().logs();
			return text(lines.length === 0 ? '(no new logs)' : lines.join('\n'));
		},
	);
	server.registerTool(
		'octane_app_close',
		{
			title: 'Close the app',
			description: 'Close the open app and its browser.',
			inputSchema: {},
		},
		async () => {
			if (session !== null) await session.close();
			session = null;
			return text('Closed.');
		},
	);
}
