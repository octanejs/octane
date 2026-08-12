import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@octanejs/testing-library';
import { ComponentProbe, RefKeyProbe, StateProbe } from '../probes/dropzone.tsrx';

afterEach(() => {
	cleanup();
	vi.useRealTimers();
});

describe('react-dropzone U3 adapted root contract', () => {
	it('renders default root/input props and preserves arbitrary overrides', () => {
		const view = render(StateProbe, {
			props: { options: {}, rootRef: null, inputRef: null },
		});
		const root = view.container.querySelector<HTMLElement>('[data-probe=root]')!;
		const input = view.container.querySelector<HTMLInputElement>('input')!;
		expect(root.getAttribute('role')).toBe('presentation');
		expect(root.tabIndex).toBe(0);
		expect(input.type).toBe('file');
		expect(input.multiple).toBe(true);
		expect(input.getAttribute('aria-label')).toBe('file upload');
		expect(input.tabIndex).toBe(-1);
		view.rerender(StateProbe, {
			props: { options: {}, rootRef: null, inputRef: null },
		});
		expect(view.container.querySelector('[data-probe=root]')).toBe(root);
	});

	it('composes user handlers before library handlers and honors propagation cancellation', () => {
		const userClick = vi.fn((event: MouseEvent) => event.stopPropagation());
		const view = render(StateProbe, {
			props: { options: {}, rootProps: { onClick: userClick }, rootRef: null, inputRef: null },
		});
		const root = view.container.querySelector<HTMLElement>('[data-probe=root]')!;
		const input = view.container.querySelector<HTMLInputElement>('input')!;
		const open = vi.spyOn(input, 'click');
		fireEvent.click(root);
		expect(userClick).toHaveBeenCalledOnce();
		expect(open).not.toHaveBeenCalled();
	});

	it('opens from Enter and Space only when the root owns the keyboard event', () => {
		const view = render(StateProbe, {
			props: { options: {}, rootRef: null, inputRef: null },
		});
		const root = view.container.querySelector<HTMLElement>('[data-probe=root]')!;
		const input = view.container.querySelector<HTMLInputElement>('input')!;
		const open = vi.spyOn(input, 'click');
		fireEvent.keyDown(root, { key: 'Enter' });
		fireEvent.keyDown(root, { key: ' ' });
		expect(open).toHaveBeenCalledTimes(2);
		fireEvent.keyDown(input, { key: 'Enter' });
		expect(open).toHaveBeenCalledTimes(2);
	});

	it('tracks focus and blur while disabled state masks focus', () => {
		const view = render(StateProbe, {
			props: { options: {}, rootRef: null, inputRef: null },
		});
		const root = view.container.querySelector<HTMLElement>('[data-probe=root]')!;
		fireEvent.focus(root);
		expect(view.container.querySelector('output')?.textContent?.startsWith('true')).toBe(true);
		fireEvent.blur(root);
		expect(view.container.querySelector('output')?.textContent?.startsWith('false')).toBe(true);
		view.rerender({ props: { options: { disabled: true }, rootRef: null, inputRef: null } });
		expect(root.getAttribute('aria-disabled')).toBe('true');
		expect(root.hasAttribute('tabindex')).toBe(false);
	});

	it('disables click and keyboard independently', () => {
		const view = render(StateProbe, {
			props: { options: { noClick: true }, rootRef: null, inputRef: null },
		});
		const root = view.container.querySelector<HTMLElement>('[data-probe=root]')!;
		const input = view.container.querySelector<HTMLInputElement>('input')!;
		const open = vi.spyOn(input, 'click');
		fireEvent.click(root);
		expect(open).not.toHaveBeenCalled();
		fireEvent.keyDown(root, { key: 'Enter' });
		expect(open).toHaveBeenCalledOnce();
		view.rerender({ props: { options: { noKeyboard: true }, rootRef: null, inputRef: null } });
		fireEvent.keyDown(root, { key: 'Enter' });
		expect(open).toHaveBeenCalledOnce();
	});

	it('exposes imperative open and resets the input value before every chooser', () => {
		const dropzoneRef = { current: null as { open(): void } | null };
		const view = render(ComponentProbe, { props: { options: {}, dropzoneRef } });
		const input = view.container.querySelector<HTMLInputElement>('input')!;
		const click = vi.spyOn(input, 'click');
		Object.defineProperty(input, 'value', { configurable: true, writable: true, value: 'stale' });
		dropzoneRef.current!.open();
		expect(input.value).toBe('');
		expect(click).toHaveBeenCalledOnce();
	});

	it('merges custom refKey refs and replaces imperative refs cleanly', async () => {
		const userRef = { current: null as HTMLElement | null };
		const capture = vi.fn();
		const custom = render(RefKeyProbe, { props: { userRef, capture } });
		const node = custom.container.querySelector<HTMLElement>('[data-probe=ref-key]')!;
		await waitFor(() => expect(capture).toHaveBeenCalled());
		expect(userRef.current).toBe(node);
		expect(capture.mock.calls[0][0]).toEqual(expect.arrayContaining([userRef]));
		custom.unmount();
		expect(userRef.current).toBeNull();

		const first = { current: null as { open(): void } | null };
		const second = { current: null as { open(): void } | null };
		const component = render(ComponentProbe, { props: { options: {}, dropzoneRef: first } });
		expect(first.current?.open).toBeTypeOf('function');
		component.rerender({ props: { options: {}, dropzoneRef: second } });
		expect(first.current).toBeNull();
		expect(second.current?.open).toBeTypeOf('function');
	});

	it('opens and closes dialog state around native selection callbacks', async () => {
		const onFileDialogOpen = vi.fn();
		const onDrop = vi.fn();
		const view = render(StateProbe, {
			props: { options: { onFileDialogOpen, onDrop }, rootRef: null, inputRef: null },
		});
		const root = view.container.querySelector<HTMLElement>('[data-probe=root]')!;
		const input = view.container.querySelector<HTMLInputElement>('input')!;
		fireEvent.click(root);
		expect(onFileDialogOpen).toHaveBeenCalledOnce();
		expect(view.container.querySelector('output')?.textContent?.split('|')[1]).toBe('true');
		const file = new File(['same'], 'same.txt');
		Object.defineProperty(input, 'files', { configurable: true, value: [file] });
		fireEvent.change(input);
		await waitFor(() => expect(onDrop).toHaveBeenCalledOnce());
		expect(view.container.querySelector('output')?.textContent?.split('|')[1]).toBe('false');
	});

	it('detects native chooser cancellation on window focus', async () => {
		vi.useFakeTimers();
		const onFileDialogCancel = vi.fn();
		const view = render(StateProbe, {
			props: { options: { onFileDialogCancel }, rootRef: null, inputRef: null },
		});
		fireEvent.click(view.container.querySelector('[data-probe=root]')!);
		window.dispatchEvent(new Event('focus'));
		await vi.advanceTimersByTimeAsync(300);
		expect(onFileDialogCancel).toHaveBeenCalledOnce();
		expect(view.container.querySelector('output')?.textContent?.split('|')[1]).toBe('false');
	});

	it('autofocuses on mount and removes document/window listeners on unmount', () => {
		const addDocument = vi.spyOn(document, 'addEventListener');
		const removeDocument = vi.spyOn(document, 'removeEventListener');
		const addWindow = vi.spyOn(window, 'addEventListener');
		const removeWindow = vi.spyOn(window, 'removeEventListener');
		const view = render(StateProbe, {
			props: { options: { autoFocus: true }, rootRef: null, inputRef: null },
		});
		const root = view.container.querySelector<HTMLElement>('[data-probe=root]')!;
		expect(document.activeElement).toBe(root);
		view.unmount();
		expect(addDocument.mock.calls.some(([name]) => name === 'dragenter')).toBe(true);
		expect(removeDocument.mock.calls.some(([name]) => name === 'dragenter')).toBe(true);
		expect(addWindow.mock.calls.some(([name]) => name === 'focus')).toBe(true);
		expect(removeWindow.mock.calls.some(([name]) => name === 'focus')).toBe(true);
	});
});
