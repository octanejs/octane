import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { compile } from 'octane/compiler';
import { flushSync, hydrateRoot } from 'octane';
import * as ServerRuntime from 'octane/server';
import { cleanup, fireEvent, render } from '@octanejs/testing-library';
import { App } from '@octane-eval-submission/octane.ssr-signup-card/src/App.tsrx';

afterEach(cleanup);

function submissionSourcePath(): string {
	const root = process.env.OCTANE_EVAL_SUBMISSION_ROOT;
	return root
		? join(root, 'octane.ssr-signup-card/src/App.tsrx')
		: join(
				process.cwd(),
				'packages/octane-evals/datasets/train/user-apps-v1/tasks/octane.ssr-signup-card/reference/src/App.tsrx',
			);
}

function evaluateServerModule(): Record<string, any> {
	const { code } = compile(readFileSync(submissionSourcePath(), 'utf8'), 'App.tsrx', {
		mode: 'server',
	});
	const commonJs = ts.transpileModule(code, {
		compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ESNext },
	}).outputText;
	const module = { exports: {} as Record<string, any> };
	const requireServerRuntime = (specifier: string) => {
		if (specifier === 'octane/server') return ServerRuntime;
		throw new Error(`Unsupported server-eval import: ${specifier}`);
	};
	new Function('require', 'module', 'exports', commonJs)(
		requireServerRuntime,
		module,
		module.exports,
	);
	return module.exports;
}

describe('octane.ssr-signup-card', () => {
	it('uses distinct, stable IDs and handles native input events', () => {
		const first = render(App, { props: { initialName: 'Ada' } });
		const second = render(App, { props: { initialName: 'Ada' } });
		const firstInput = first.container.querySelector<HTMLInputElement>('input')!;
		const secondInput = second.container.querySelector<HTMLInputElement>('input')!;
		const firstLabel = first.container.querySelector<HTMLLabelElement>('label')!;
		const initialId = firstInput.id;

		expect(initialId).not.toBe('');
		expect(secondInput.id).not.toBe(initialId);
		expect(firstLabel.htmlFor).toBe(initialId);
		expect(first.container.querySelector('#greeting')?.textContent).toBe('Welcome, Ada');

		fireEvent.input(firstInput, { target: { value: '  Lin  ' } });
		expect(firstInput.value).toBe('  Lin  ');
		expect(first.container.querySelector('#greeting')?.textContent).toBe('Welcome, Lin');
		expect(firstInput.id).toBe(initialId);

		fireEvent.input(firstInput, { target: { value: '   ' } });
		expect(first.container.querySelector('#greeting')?.textContent).toBe('Welcome, guest');
		fireEvent.click(first.container.querySelector('#submit-count')!);
		fireEvent.click(first.container.querySelector('#submit-count')!);
		expect(first.container.querySelector('#submit-count')?.textContent).toBe('Submitted: 2');
		expect(firstInput.id).toBe(initialId);
	});

	it('server-renders matching IDs and hydrates by adopting the existing DOM', () => {
		const server = evaluateServerModule();
		const output = ServerRuntime.renderToString(
			server.App,
			{ initialName: 'Ada' },
			{ identifierPrefix: 'eval-' },
		);
		const otherPrefixOutput = ServerRuntime.renderToString(
			server.App,
			{ initialName: 'Ada' },
			{ identifierPrefix: 'other-' },
		);
		const container = document.createElement('div');
		container.innerHTML = output.html;
		document.body.appendChild(container);

		const label = container.querySelector<HTMLLabelElement>('label')!;
		const input = container.querySelector<HTMLInputElement>('input')!;
		const greeting = container.querySelector<HTMLHeadingElement>('#greeting')!;
		const button = container.querySelector<HTMLButtonElement>('#submit-count')!;
		const serverId = input.id;
		const otherContainer = document.createElement('div');
		otherContainer.innerHTML = otherPrefixOutput.html;
		const otherServerId = otherContainer.querySelector<HTMLInputElement>('input')!.id;
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

		expect(serverId).not.toBe('');
		expect(otherServerId).not.toBe(serverId);
		expect(label.htmlFor).toBe(serverId);
		expect(input.value).toBe('Ada');
		expect(greeting.textContent).toBe('Welcome, Ada');
		expect(button.textContent).toBe('Submitted: 0');

		const root = hydrateRoot(container, App, { initialName: 'Ada' }, { identifierPrefix: 'eval-' });
		flushSync(() => {});

		expect(container.querySelector('label')).toBe(label);
		expect(container.querySelector('input')).toBe(input);
		expect(container.querySelector('#greeting')).toBe(greeting);
		expect(container.querySelector('#submit-count')).toBe(button);
		expect(input.id).toBe(serverId);
		expect(
			errorSpy.mock.calls
				.flat()
				.map(String)
				.filter((message) => message.includes('hydration mismatch')),
		).toEqual([]);

		fireEvent.input(input, { target: { value: 'Hydrated' } });
		expect(greeting.textContent).toBe('Welcome, Hydrated');
		fireEvent.click(button);
		expect(button.textContent).toBe('Submitted: 1');
		expect(input.id).toBe(serverId);

		root.unmount();
		container.remove();
		errorSpy.mockRestore();
	});
});
