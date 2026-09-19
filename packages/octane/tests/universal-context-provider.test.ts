import { expect, it } from 'vitest';
import {
	createObjectContainer,
	createObjectDriver,
	createUniversalRoot,
	flushUniversalSync,
	type UniversalComponent,
} from '../src/universal.js';
import {
	ImportedContextProvider,
	LocalContextProvider,
	SpreadContextProvider,
	type ContextProviderProps,
} from './_fixtures/universal-context-provider.object.tsrx';

it.each([
	['local context', LocalContextProvider, false],
	['local context with spread props', SpreadContextProvider, false],
	['imported DOM context', ImportedContextProvider, false],
	['imported native context', ImportedContextProvider, true],
] as const)(
	'compiled %s retains children by key and provides live values',
	(_label, Component, native) => {
		const container = createObjectContainer();
		const root = createUniversalRoot(container, createObjectDriver());
		// The fixture transform supplies renderer metadata and universal output.
		const compiledComponent = Component as unknown as UniversalComponent<ContextProviderProps>;
		try {
			root.render(compiledComponent, { contextKey: 'first', value: 'light', initial: 1, native });
			const status = container.children[0];
			expect(status.props).toMatchObject({ value: 'light', count: 1 });
			flushUniversalSync(() => (status.props.increment as () => void)());
			expect(status.props.count).toBe(2);

			root.render(compiledComponent, { contextKey: 'first', value: 'dark', initial: 10, native });
			expect(container.children[0]).toBe(status);
			expect(status.props).toMatchObject({ value: 'dark', count: 2 });

			root.render(compiledComponent, { contextKey: 'second', value: 'fresh', initial: 10, native });
			expect(container.children[0]).not.toBe(status);
			expect(container.children[0].props).toMatchObject({ value: 'fresh', count: 10 });
		} finally {
			root.unmount();
		}
	},
);
