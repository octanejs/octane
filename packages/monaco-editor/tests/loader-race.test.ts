import { flushSync } from 'octane';
import { describe, expect, it, vi } from 'vitest';

import { flushEffects, mount } from '../../octane/tests/_helpers';

const loaderState = vi.hoisted(() => {
	let resolve!: (value: unknown) => void;
	const promise = new Promise((nextResolve) => {
		resolve = nextResolve;
	}) as Promise<unknown> & { cancel: ReturnType<typeof vi.fn> };
	promise.cancel = vi.fn();
	return {
		init: vi.fn(() => promise),
		resolve,
		promise,
	};
});

vi.mock('@monaco-editor/loader', () => ({
	default: {
		init: loaderState.init,
		config: vi.fn(),
		__getMonacoInstance: vi.fn(() => null),
	},
}));

import Editor from '../src/Editor.tsrx';
import { DiffEditor } from '../src/DiffEditor.tsrx';
import { UseMonacoProbe } from './_fixtures/use-monaco.tsrx';

async function settle(): Promise<void> {
	await Promise.resolve();
	await Promise.resolve();
	flushEffects();
	flushSync(() => {});
}

describe('@octanejs/monaco-editor loader lifecycle', () => {
	it('cancels an in-flight load and ignores a completion after unmount', async () => {
		const create = vi.fn();
		const createDiffEditor = vi.fn();
		const onMonaco = vi.fn();
		const editor = mount(Editor as any, {});
		const diffEditor = mount(DiffEditor as any, {});
		const hook = mount(UseMonacoProbe, { onMonaco });
		flushEffects();
		expect(loaderState.init).toHaveBeenCalledTimes(3);

		editor.unmount();
		diffEditor.unmount();
		hook.unmount();
		flushEffects();
		expect(loaderState.promise.cancel).toHaveBeenCalledTimes(3);

		const monaco = {
			Uri: { parse: vi.fn() },
			editor: { create, createDiffEditor },
		};
		loaderState.resolve(monaco);
		await settle();
		expect(create).not.toHaveBeenCalled();
		expect(createDiffEditor).not.toHaveBeenCalled();
		expect(onMonaco).not.toHaveBeenCalledWith(monaco);
	});
});
