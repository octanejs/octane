import { describe, expect, it } from 'vitest';
import { flushSync } from 'octane';
import { flushEffects, mount } from '../../octane/tests/_helpers';
import createAsyncHighlighter from '../src/async-syntax-highlighter.js';

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((resolvePromise, rejectPromise) => {
		resolve = resolvePromise;
		reject = rejectPromise;
	});
	return { promise, resolve, reject };
}

async function settle() {
	for (let index = 0; index < 6; index++) await Promise.resolve();
	flushEffects();
	flushSync(() => {});
}

function generator() {
	const languages = new Set<string>();
	return {
		languages,
		listLanguages: () => [...languages],
		registerLanguage: (name: string) => languages.add(name),
		highlight: (code: string, language: string) => {
			if (!languages.has(language)) throw new Error(`missing ${language}`);
			return [
				{
					type: 'element',
					tagName: 'span',
					properties: { className: [`language-${language}`] },
					children: [{ type: 'text', value: code }],
				},
			];
		},
	};
}

describe('async lifecycle parity', () => {
	// @parity-case conformance:async-registration-queue
	it('queues registration before the AST generator settles', async () => {
		const ast = generator();
		const astLoader = deferred<typeof ast>();
		const Highlighter = createAsyncHighlighter({
			loader: () => astLoader.promise,
			isLanguageRegistered: (instance: typeof ast, language: string) =>
				instance.languages.has(language),
			registerLanguage: (instance: typeof ast, name: string) => instance.registerLanguage(name),
			languageLoaders: {},
		});

		Highlighter.registerLanguage('queued', {});
		expect(Highlighter.isRegistered('queued')).toBe(true);

		const preload = Highlighter.preload();
		astLoader.resolve(ast);
		await preload;

		expect(ast.languages).toEqual(new Set(['queued']));
		expect(Highlighter.isRegistered('queued')).toBe(true);
	});

	// @parity-case conformance:async-stale-language
	it('ignores an older language completion after switching languages', async () => {
		const ast = generator();
		const astLoader = deferred<typeof ast>();
		const languageA = deferred<void>();
		const languageB = deferred<void>();
		const Highlighter = createAsyncHighlighter({
			loader: () => astLoader.promise,
			isLanguageRegistered: (instance: typeof ast, language: string) =>
				instance.languages.has(language),
			registerLanguage: (instance: typeof ast, name: string) => instance.registerLanguage(name),
			languageLoaders: {
				a: async (register: (name: string, language: unknown) => void) => {
					await languageA.promise;
					register('a', {});
				},
				b: async (register: (name: string, language: unknown) => void) => {
					await languageB.promise;
					register('b', {});
				},
			},
		});

		const result = mount(Highlighter, { language: 'a', children: 'current' });
		flushEffects();
		result.update(Highlighter, { language: 'b', children: 'current' });
		flushEffects();

		astLoader.resolve(ast);
		languageB.resolve();
		await settle();
		expect(result.html()).toContain('language-b');
		expect(result.find('code').textContent).toBe('current');

		languageA.resolve();
		await settle();
		expect(ast.languages).toEqual(new Set(['b', 'a']));
		expect(result.html()).toContain('language-b');
		expect(result.find('code').textContent).toBe('current');
		expect(result.container.querySelector('.language-a')).toBeNull();
		result.unmount();
	});

	// @parity-case conformance:async-rejection-fallback
	it('keeps deterministic plain output when a language loader rejects', async () => {
		const ast = generator();
		const Highlighter = createAsyncHighlighter({
			loader: async () => ast,
			isLanguageRegistered: (instance: typeof ast, language: string) =>
				instance.languages.has(language),
			registerLanguage: (instance: typeof ast, name: string) => instance.registerLanguage(name),
			languageLoaders: {
				broken: async () => {
					throw new Error('expected loader failure');
				},
			},
		});

		const result = mount(Highlighter, { language: 'broken', children: 'plain text' });
		flushEffects();
		await settle();

		expect(result.find('code').textContent).toBe('plain text');
		expect(result.find('code').querySelector('[class]')).toBeNull();
		result.unmount();
	});

	// @parity-case conformance:async-ast-retry
	it('retries a rejected AST loader without an unhandled rejection', async () => {
		const ast = generator();
		const firstLoad = deferred<typeof ast>();
		const secondLoad = deferred<typeof ast>();
		let attempts = 0;
		const Highlighter = createAsyncHighlighter({
			loader: () => (++attempts === 1 ? firstLoad.promise : secondLoad.promise),
			isLanguageRegistered: (instance: typeof ast, language: string) =>
				instance.languages.has(language),
			registerLanguage: (instance: typeof ast, name: string) => instance.registerLanguage(name),
			languageLoaders: {},
		});
		const unhandled: unknown[] = [];
		const onUnhandled = (error: unknown) => unhandled.push(error);
		process.on('unhandledRejection', onUnhandled);

		try {
			const result = mount(Highlighter, { language: 'text', children: 'plain text' });
			flushEffects();
			firstLoad.reject(new Error('expected AST failure'));
			await settle();
			await new Promise<void>((resolve) => setImmediate(resolve));

			expect(result.find('code').textContent).toBe('plain text');
			expect(unhandled).toEqual([]);
			expect(Highlighter.astGeneratorPromise).toBeNull();

			result.update(Highlighter, { language: 'text', children: 'retry' });
			flushEffects();
			secondLoad.resolve(ast);
			await settle();
			expect(attempts).toBe(2);
			expect(Highlighter.astGenerator).toBe(ast);
			result.unmount();
		} finally {
			process.off('unhandledRejection', onUnhandled);
		}
	});

	// @parity-case conformance:async-language-retry
	it('retries a rejected language after a same-language update', async () => {
		const ast = generator();
		let attempts = 0;
		const Highlighter = createAsyncHighlighter({
			loader: async () => ast,
			isLanguageRegistered: (instance: typeof ast, language: string) =>
				instance.languages.has(language),
			registerLanguage: (instance: typeof ast, name: string) => instance.registerLanguage(name),
			languageLoaders: {
				retry: async (register: (name: string, language: unknown) => void) => {
					attempts++;
					if (attempts === 1) throw new Error('expected language failure');
					register('retry', {});
				},
			},
		});

		const result = mount(Highlighter, { language: 'retry', children: 'first' });
		flushEffects();
		await settle();
		expect(result.find('code').textContent).toBe('first');

		result.update(Highlighter, { language: 'retry', children: 'second' });
		flushEffects();
		await settle();
		expect(attempts).toBe(2);
		expect(result.html()).toContain('language-retry');
		expect(result.find('code').textContent).toBe('second');
		result.unmount();
	});
});
