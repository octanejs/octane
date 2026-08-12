import { describe, expect, it, vi } from 'vitest';
import { flushSync, hydrateRoot } from 'octane';
import { renderDropzoneHydrationFixture } from './hydration-server';
import { HookProbe } from './dropzone.tsrx';

describe('react-dropzone U1 hydration gate', () => {
	it('adopts root/input nodes and remains interactive without diagnostics', async () => {
		const onDrop = vi.fn();
		const props = { options: { onDrop }, rootRef: null, inputRef: null };
		const { html } = await renderDropzoneHydrationFixture(props);
		const container = document.createElement('div');
		container.innerHTML = html;
		const rootNode = container.querySelector('[data-probe=root]');
		const inputNode = container.querySelector('input')!;
		inputNode.value = '';
		inputNode.focus();
		const activeBefore = document.activeElement;
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const root = hydrateRoot(container, HookProbe, props);
		flushSync(() => {});
		expect(container.querySelector('[data-probe=root]')).toBe(rootNode);
		expect(container.querySelector('input')).toBe(inputNode);
		expect(document.activeElement).toBe(activeBefore);
		expect(inputNode.value).toBe('');
		const file = new File(['hydrated'], 'hydrated.txt');
		Object.defineProperty(inputNode, 'files', { configurable: true, value: [file] });
		inputNode.dispatchEvent(new Event('change', { bubbles: true }));
		await vi.waitFor(() => expect(onDrop).toHaveBeenCalledOnce());
		expect(error).not.toHaveBeenCalled();
		root.unmount();
		error.mockRestore();
	});
});
