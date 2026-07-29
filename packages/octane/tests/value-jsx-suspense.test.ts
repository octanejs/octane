import { describe, expect, it } from 'vitest';
import { lazy } from '../src/index.js';
import { act, mount } from './_helpers';
import {
	BoundaryChildren,
	ConditionalSuspenseEditor,
	ConditionalSynchronousEditor,
	DirectSuspense,
	MapSuspense,
	SourceEditor,
} from './_fixtures/value-jsx-suspense.tsx';

// Regression: <Suspense>/<ErrorBoundary> render their children as the try BODY
// (renderBlock calls it as a function). The .tsrx `{props.children}` lowering
// passes a render fn, but a React-style .tsx parent lowers element children to a
// createElement DESCRIPTOR (esp. in value position like `.map`), which is not
// callable — previously threw "block.body is not a function". See childrenAsBody.
it('keyed .map of <Suspense>-wrapped components renders (HN StoriesPage pattern)', () => {
	const r = mount(MapSuspense as any);
	expect(r.findAll('.inner').length).toBe(3);
	r.unmount();
});
it('a single .tsx <Suspense> with element children renders them', () => {
	const r = mount(DirectSuspense as any);
	expect(r.find('.inner').textContent).toBe('x');
	r.unmount();
});
it('a .tsx <ErrorBoundary> with element children renders them', () => {
	const r = mount(BoundaryChildren as any);
	expect(r.find('.inner').textContent).toBe('y');
	r.unmount();
});

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((complete) => {
		resolve = complete;
	});

	return { promise, resolve };
}

describe('TSX editor branch ownership', () => {
	it('switches a ref-owning editor into pending null-fallback Suspense', async () => {
		const hostRef: { current: HTMLDivElement | null } = { current: null };
		const sourceModule = deferred<{ default: any }>();
		const sourceEditor = lazy(() => sourceModule.promise);
		const result = mount(ConditionalSuspenseEditor as any, {
			source: false,
			hostRef,
			sourceEditor,
		});
		const richEditor = result.find('[data-editor="rich"]');

		expect(hostRef.current).toBe(richEditor);

		result.update(ConditionalSuspenseEditor as any, {
			source: true,
			hostRef,
			sourceEditor,
		});

		expect(hostRef.current).toBeNull();
		expect(result.findAll('[data-editor]')).toHaveLength(0);

		await act(() => {
			sourceModule.resolve({ default: SourceEditor });
		});

		expect(result.find('[data-editor="source"]').textContent).toBe('source editor');
		expect(hostRef.current).toBeNull();
		result.unmount();
	});

	it('keeps editor refs and DOM valid across repeated lazy branch switches', async () => {
		const hostRef: { current: HTMLDivElement | null } = { current: null };
		const sourceModule = deferred<{ default: any }>();
		const sourceEditor = lazy(() => sourceModule.promise);
		const props = { hostRef, sourceEditor };
		const result = mount(ConditionalSuspenseEditor as any, { ...props, source: false });

		result.update(ConditionalSuspenseEditor as any, { ...props, source: true });
		await act(() => {
			sourceModule.resolve({ default: SourceEditor });
		});
		expect(result.find('[data-editor="source"]').textContent).toBe('source editor');

		result.update(ConditionalSuspenseEditor as any, { ...props, source: false });
		expect(hostRef.current).toBe(result.find('[data-editor="rich"]'));
		expect(hostRef.current?.isConnected).toBe(true);

		result.update(ConditionalSuspenseEditor as any, { ...props, source: true });
		expect(result.find('[data-editor="source"]').textContent).toBe('source editor');
		expect(hostRef.current).toBeNull();
		result.unmount();
	});

	it('switches a synchronous single-ref editor in both directions', () => {
		const hostRef: { current: HTMLDivElement | null } = { current: null };
		const result = mount(ConditionalSynchronousEditor as any, { source: false, hostRef });

		expect(hostRef.current).toBe(result.find('[data-editor="rich"]'));

		result.update(ConditionalSynchronousEditor as any, { source: true, hostRef });
		expect(result.find('[data-editor="source"]').textContent).toBe('source editor');
		expect(hostRef.current).toBeNull();

		result.update(ConditionalSynchronousEditor as any, { source: false, hostRef });
		expect(hostRef.current).toBe(result.find('[data-editor="rich"]'));
		expect(hostRef.current?.isConnected).toBe(true);
		result.unmount();
	});
});
