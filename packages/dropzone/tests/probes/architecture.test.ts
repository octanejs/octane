import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@octanejs/testing-library';
import {
	BlockChildrenProbe,
	ComponentProbe,
	HookProbe,
	OptionsCallProbe,
	ZeroArgProbe,
} from './dropzone.tsrx';

afterEach(cleanup);

describe('react-dropzone Octane-only compiler contracts', () => {
	it('distinguishes idiomatic block children from upstream render props', () => {
		const block = render(BlockChildrenProbe);
		expect(block.container.querySelector('[data-probe=block-child]')?.textContent).toBe(
			'idiomatic block child',
		);

		const renderProp = render(ComponentProbe, {
			props: { options: {}, dropzoneRef: { current: null } },
		});
		expect(renderProp.container.querySelector('[data-probe=root]')).not.toBeNull();
	});

	it('strips compiler slots from zero-argument and explicit-options hook calls', async () => {
		const zeroCapture = vi.fn();
		const zero = render(ZeroArgProbe, { props: { capture: zeroCapture } });
		await waitFor(() => expect(zeroCapture).toHaveBeenCalled());
		const firstZero = zeroCapture.mock.calls.at(-1)![0];
		expect(firstZero.getRootProps()).toMatchObject({ role: 'presentation' });
		zero.rerender({ props: { capture: zeroCapture } });
		await waitFor(() => expect(zeroCapture.mock.calls.length).toBeGreaterThan(1));
		expect(zeroCapture.mock.calls.at(-1)![0].open).toBe(firstZero.open);

		const optionsCapture = vi.fn();
		const options = render(OptionsCallProbe, { props: { capture: optionsCapture } });
		await waitFor(() => expect(optionsCapture).toHaveBeenCalled());
		const state = optionsCapture.mock.calls.at(-1)![0];
		const input = document.createElement('input');
		state.inputRef.current = input;
		const click = vi.spyOn(input, 'click');
		state.getRootProps().onClick(new MouseEvent('click'));
		expect(click).not.toHaveBeenCalled();
		options.rerender({ props: { capture: optionsCapture } });
		await waitFor(() => expect(optionsCapture.mock.calls.length).toBeGreaterThan(1));
		expect(optionsCapture.mock.calls.at(-1)![0].open).toBe(state.open);
	});
});

describe('react-dropzone U1 architecture gate', () => {
	it('spreads public prop getters, composes refs, opens input, and delivers selected files', async () => {
		const rootRef = { current: null as HTMLElement | null };
		const inputRef = { current: null as HTMLInputElement | null };
		const onDrop = vi.fn();
		const view = render(HookProbe, { props: { options: { onDrop }, rootRef, inputRef } });
		const root = view.container.querySelector('[data-probe=root]')!;
		const input = view.container.querySelector('input')!;
		expect(rootRef.current).toBe(root);
		expect(inputRef.current).toBe(input);
		const click = vi.spyOn(input, 'click');
		fireEvent.click(root);
		expect(click).toHaveBeenCalledOnce();
		const file = new File(['new'], 'new.txt', { type: 'text/plain' });
		Object.defineProperty(input, 'files', { configurable: true, value: [file] });
		fireEvent.change(input);
		await waitFor(() => expect(onDrop).toHaveBeenCalledWith([file], [], expect.any(Event)));
		expect(view.container.querySelector('output')?.textContent).toBe('new.txt|false');
	});

	it('lets the newer extraction operation supersede older work', async () => {
		const resolvers: Array<(files: File[]) => void> = [];
		const onDrop = vi.fn();
		const view = render(HookProbe, {
			props: {
				options: {
					onDrop,
					getFilesFromEvent: () => new Promise<File[]>((resolve) => resolvers.push(resolve)),
				},
				rootRef: null,
				inputRef: null,
			},
		});
		const input = view.container.querySelector('input')!;
		fireEvent.change(input);
		fireEvent.change(input);
		resolvers[1]([new File(['new'], 'new.txt')]);
		await waitFor(() => expect(onDrop).toHaveBeenCalledOnce());
		resolvers[0]([new File(['old'], 'old.txt')]);
		await Promise.resolve();
		expect(onDrop).toHaveBeenCalledOnce();
		expect(view.container.querySelector('output')?.textContent).toBe('new.txt|false');
	});

	it('lets the newer async validator supersede older validation', async () => {
		const resolvers = new Map<string, (value: null) => void>();
		const onDrop = vi.fn();
		const view = render(HookProbe, {
			props: {
				options: {
					onDrop,
					validator: (file: File) => new Promise((resolve) => resolvers.set(file.name, resolve)),
				},
				rootRef: null,
				inputRef: null,
			},
		});
		const input = view.container.querySelector('input')!;
		for (const name of ['old.txt', 'new.txt']) {
			Object.defineProperty(input, 'files', {
				configurable: true,
				value: [new File([name], name)],
			});
			fireEvent.change(input);
			await waitFor(() => expect(resolvers.has(name)).toBe(true));
		}
		resolvers.get('new.txt')!(null);
		await waitFor(() => expect(onDrop).toHaveBeenCalledOnce());
		resolvers.get('old.txt')!(null);
		await Promise.resolve();
		expect(onDrop.mock.calls[0][0][0].name).toBe('new.txt');
	});
});
