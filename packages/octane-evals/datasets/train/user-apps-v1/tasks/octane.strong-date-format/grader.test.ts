import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@octanejs/testing-library';
import {
	expectStrongCompile,
	serverHTML,
	STRONG_COMPILE_TEST,
	submissionSource,
} from '../../strong-repair';

const TASK = 'octane.strong-date-format';
const originalTimeZone = process.env.TZ;

afterEach(() => {
	cleanup();
	if (originalTimeZone === undefined) delete process.env.TZ;
	else process.env.TZ = originalTimeZone;
});

function inTimeZone<T>(timeZone: string, run: () => T): T {
	process.env.TZ = timeZone;
	return run();
}

function dates(root: ParentNode): string[] {
	return [...root.querySelectorAll('time')].map((time) => time.textContent!);
}

describe(TASK, () => {
	it(STRONG_COMPILE_TEST, () => {
		expectStrongCompile(submissionSource(TASK));
	});

	it('server-renders the same dates in every server time zone', () => {
		const source = submissionSource(TASK);
		const east = inTimeZone('Pacific/Kiritimati', () => serverHTML(source));
		const west = inTimeZone('Pacific/Pago_Pago', () => serverHTML(source));
		expect(west).toBe(east);
		const container = document.createElement('div');
		container.innerHTML = east;
		expect(dates(container)).toHaveLength(2);
		for (const text of dates(container)) expect(text).toContain('2026');
	});

	it('renders the same dates as the server whatever the browser time zone', async () => {
		const { App } = await import('@octane-eval-submission/octane.strong-date-format/src/App.tsrx');
		const server = document.createElement('div');
		server.innerHTML = inTimeZone('UTC', () => serverHTML(submissionSource(TASK)));
		const east = inTimeZone('Pacific/Kiritimati', () => dates(render(App).container));
		cleanup();
		const west = inTimeZone('Pacific/Pago_Pago', () => dates(render(App).container));
		expect(east).toEqual(dates(server));
		expect(west).toEqual(dates(server));
	});
});
