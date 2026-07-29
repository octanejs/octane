import { describe, expect, it } from 'vitest';
import { mount, nextPaint } from '../../octane/tests/_helpers';
import type { UseErrorBoundaryApi } from '@octanejs/react-error-boundary';
import { AsyncApp, HookApp, RetainedApiApp } from './_fixtures/app.tsrx';

describe('useErrorBoundary', () => {
	it('forwards an event error and recovers through the nearest boundary', async () => {
		const root = mount(HookApp);
		root.click('#show-boundary');
		await nextPaint();
		expect(root.find('#hook-fallback').textContent).toBe('event failure');
		root.click('#hook-fallback');
		await nextPaint();
		expect(root.find('#show-boundary').textContent?.trim()).toBe('show');
		root.unmount();
	});

	it('forwards async failures only when showBoundary is called', async () => {
		const localRoot = mount(AsyncApp);
		localRoot.click('#keep-async-local');
		await Promise.resolve();
		await nextPaint();
		expect(localRoot.find('#local-status').textContent).toBe('handled locally');
		expect(localRoot.container.querySelector('#async-fallback')).toBeNull();
		localRoot.click('#forward-async');
		await Promise.resolve();
		await nextPaint();
		expect(localRoot.find('#async-fallback').textContent).toBe('async failure');
		localRoot.unmount();
	});

	it('lets a retained healthy-child API reset the boundary after showBoundary', async () => {
		const apiRef: { current: UseErrorBoundaryApi | null } = { current: null };
		const root = mount(RetainedApiApp, { apiRef });
		const retained = apiRef.current!;
		root.click('#retained-show');
		await nextPaint();
		expect(root.find('#retained-fallback').textContent).toBe('retained failure');
		expect(retained.error).toBeNull();
		retained.resetBoundary();
		await nextPaint();
		expect(root.find('#retained-show')).toBeTruthy();
		root.unmount();
	});
});
