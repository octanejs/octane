import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@octanejs/testing-library';
import { AcquisitionProbe } from '../probes/dropzone.tsrx';

const file = (name: string, type = 'text/plain', size = 1) => {
	const value = new File(['x'], name, { type });
	Object.defineProperty(value, 'size', { value: size });
	return value;
};
const transfer = (files: File[]) => ({
	dataTransfer: {
		files,
		items: files.map((f) => ({ kind: 'file', type: f.type, getAsFile: () => f })),
		types: ['Files'],
	},
});
const clipboard = (files: File[]) => ({
	clipboardData: {
		files,
		items: files.map((f) => ({ kind: 'file', type: f.type, getAsFile: () => f })),
		types: ['Files'],
	},
});
const state = (view: ReturnType<typeof render>) =>
	JSON.parse(view.container.querySelector('output')!.textContent!);
const deferred = <T>() => {
	let resolve!: (value: T) => void;
	let reject!: (reason: unknown) => void;
	const promise = new Promise<T>((yes, no) => {
		resolve = yes;
		reject = no;
	});
	return { promise, resolve, reject };
};

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

describe('react-dropzone U4 acquisition and validation', () => {
	it('reports accepted, rejected, and validator-unknown drag verdicts', async () => {
		for (const [value, options, verdict] of [
			[
				file('photo.png', 'image/png'),
				{ accept: { 'image/*': ['.png'] } },
				[true, true, false, false],
			],
			[file('notes.txt'), { accept: { 'image/*': ['.png'] } }, [true, false, true, false]],
			[file('photo.png', 'image/png'), { validator: () => null }, [true, false, false, true]],
		] as const) {
			const view = render(AcquisitionProbe, { props: { options } });
			fireEvent.dragEnter(view.container.querySelector('[data-probe=root]')!, transfer([value]));
			await waitFor(() => expect(state(view).drag).toEqual(verdict));
			view.unmount();
		}
	});

	it('keeps nested drag active until every entered target leaves', async () => {
		const view = render(AcquisitionProbe, { props: { options: {} } });
		const root = view.container.querySelector('[data-probe=root]')!;
		const input = view.container.querySelector('input')!;
		fireEvent.dragEnter(root, transfer([file('one.txt')]));
		fireEvent.dragEnter(input, transfer([file('one.txt')]));
		await waitFor(() => expect(state(view).drag[0]).toBe(true));
		fireEvent.dragLeave(input, transfer([file('one.txt')]));
		expect(state(view).drag[0]).toBe(true);
		fireEvent.dragLeave(root, transfer([file('one.txt')]));
		expect(state(view).drag).toEqual([false, false, false, false]);
	});

	it('tracks global drags and protects document drops outside the root', async () => {
		const view = render(AcquisitionProbe, { props: { options: {} } });
		const outside = document.body.appendChild(document.createElement('aside'));
		fireEvent.dragEnter(outside, transfer([file('one.txt')]));
		expect(state(view).global).toBe(true);
		const stray = new Event('drop', { bubbles: true, cancelable: true });
		Object.assign(stray, transfer([file('one.txt')]));
		outside.dispatchEvent(stray);
		expect(stray.defaultPrevented).toBe(true);
		await waitFor(() => expect(state(view).global).toBe(false));
		outside.remove();
	});

	it('honors noDrag and noPaste controls', async () => {
		const onDrop = vi.fn();
		const view = render(AcquisitionProbe, {
			props: { options: { noDrag: true, noPaste: true, onDrop } },
		});
		const root = view.container.querySelector('[data-probe=root]')!;
		fireEvent.drop(root, transfer([file('drop.txt')]));
		fireEvent.paste(root, clipboard([file('paste.txt')]));
		await Promise.resolve();
		expect(onDrop).not.toHaveBeenCalled();
	});

	it('processes pasted files but leaves text paste untouched', async () => {
		const onDrop = vi.fn();
		const view = render(AcquisitionProbe, { props: { options: { onDrop } } });
		const root = view.container.querySelector('[data-probe=root]')!;
		const textPaste = new Event('paste', { bubbles: true, cancelable: true });
		Object.defineProperty(textPaste, 'clipboardData', {
			value: { files: [], items: [], types: ['text/plain'] },
		});
		root.dispatchEvent(textPaste);
		expect(textPaste.defaultPrevented).toBe(false);
		fireEvent.paste(root, clipboard([file('paste.png', 'image/png')]));
		await waitFor(() => expect(onDrop).toHaveBeenCalledOnce());
		expect(onDrop.mock.calls[0][0][0].name).toBe('paste.png');
	});

	it('applies size, type, limit, localization, and custom validator errors', async () => {
		const onDrop = vi.fn();
		const view = render(AcquisitionProbe, {
			props: {
				options: {
					accept: { 'text/plain': ['.txt'] },
					minSize: 2,
					maxSize: 5,
					maxFiles: 1,
					multiple: true,
					validator: (f: File) =>
						f.name === 'custom.txt' ? { code: 'custom', message: 'original' } : null,
					getErrorMessage: (error: any, f: File) => `${f.name}:${error.code}`,
					onDrop,
				},
			},
		});
		const files = [
			file('good.txt', 'text/plain', 3),
			file('extra.txt', 'text/plain', 3),
			file('tiny.txt', 'text/plain', 1),
			file('huge.txt', 'text/plain', 8),
			file('bad.png', 'image/png', 3),
			file('custom.txt', 'text/plain', 3),
		];
		fireEvent.drop(view.container.querySelector('[data-probe=root]')!, transfer(files));
		await waitFor(() => expect(onDrop).toHaveBeenCalledOnce());
		expect(state(view).accepted).toEqual(['good.txt']);
		expect(state(view).rejected.map((entry: any) => entry.codes[0])).toEqual([
			'file-too-small',
			'file-too-large',
			'file-invalid-type',
			'custom',
			'too-many-files',
		]);
		expect(
			state(view).rejected.every((entry: any) => entry.messages[0].startsWith(entry.name)),
		).toBe(true);
	});

	it('exposes processing and routes rejected async validation to onError', async () => {
		const pending = deferred<null>();
		const onDrop = vi.fn();
		const onError = vi.fn();
		const view = render(AcquisitionProbe, {
			props: { options: { validator: () => pending.promise, onDrop, onError } },
		});
		fireEvent.drop(view.container.querySelector('[data-probe=root]')!, transfer([file('one.txt')]));
		await waitFor(() => expect(state(view).processing).toBe(true));
		pending.reject(new Error('validator unavailable'));
		await waitFor(() => expect(onError).toHaveBeenCalledOnce());
		expect(onDrop).not.toHaveBeenCalled();
		expect(state(view).processing).toBe(false);
	});

	it('supersedes pending extraction across drop and paste sources', async () => {
		const first = deferred<File[]>();
		const onDrop = vi.fn();
		let call = 0;
		const view = render(AcquisitionProbe, {
			props: {
				options: {
					getFilesFromEvent: () => (call++ === 0 ? first.promise : [file('latest.txt')]),
					onDrop,
				},
			},
		});
		const root = view.container.querySelector('[data-probe=root]')!;
		fireEvent.drop(root, transfer([file('stale.txt')]));
		fireEvent.paste(root, clipboard([file('latest.txt')]));
		await waitFor(() => expect(onDrop).toHaveBeenCalledOnce());
		first.resolve([file('stale.txt')]);
		await Promise.resolve();
		expect(onDrop).toHaveBeenCalledOnce();
		expect(state(view).accepted).toEqual(['latest.txt']);
	});

	it('aborts pending work on unmount so late results are inert', async () => {
		const pending = deferred<File[]>();
		const onDrop = vi.fn();
		const view = render(AcquisitionProbe, {
			props: { options: { getFilesFromEvent: () => pending.promise, onDrop } },
		});
		fireEvent.drop(
			view.container.querySelector('[data-probe=root]')!,
			transfer([file('late.txt')]),
		);
		await waitFor(() => expect(state(view).processing).toBe(true));
		view.unmount();
		pending.resolve([file('late.txt')]);
		await Promise.resolve();
		expect(onDrop).not.toHaveBeenCalled();
	});
});

describe('react-dropzone U4 file-system acquisition', () => {
	it('passes grouped picker options and commits selected handles', async () => {
		Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
		const selected = file('selected.pdf', 'application/pdf');
		const picker = vi.fn().mockResolvedValue([{ getFile: () => Promise.resolve(selected) }]);
		Object.assign(window, { showOpenFilePicker: picker });
		const onDrop = vi.fn();
		const options = {
			useFsAccessApi: true,
			multiple: false,
			accept: [{ description: 'PDF', accept: { 'application/pdf': ['.pdf'] } }],
			onDrop,
		};
		const view = render(AcquisitionProbe, { props: { options } });
		fireEvent.click(view.container.querySelector('[data-probe=root]')!);
		await waitFor(() => expect(onDrop).toHaveBeenCalledOnce());
		expect(picker).toHaveBeenCalledWith({
			multiple: false,
			types: [{ description: 'PDF', accept: { 'application/pdf': ['.pdf'] } }],
		});
		expect(state(view).accepted).toEqual(['selected.pdf']);
	});

	it('distinguishes picker cancellation, fallback, unexpected errors, and missing input', async () => {
		Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
		for (const [error, includeInput, expected] of [
			[new DOMException('cancel', 'AbortError'), true, 'cancel'],
			[new DOMException('blocked', 'NotAllowedError'), true, 'fallback'],
			[new Error('unexpected'), true, 'error'],
			[new DOMException('blocked', 'SecurityError'), false, 'error'],
		] as const) {
			const onCancel = vi.fn();
			const onError = vi.fn();
			Object.assign(window, { showOpenFilePicker: vi.fn().mockRejectedValue(error) });
			const view = render(AcquisitionProbe, {
				props: {
					includeInput,
					options: { useFsAccessApi: true, onFileDialogCancel: onCancel, onError },
				},
			});
			const input = view.container.querySelector<HTMLInputElement>('input');
			const click = input && vi.spyOn(input, 'click');
			fireEvent.click(view.container.querySelector('[data-probe=root]')!);
			if (expected === 'cancel') await waitFor(() => expect(onCancel).toHaveBeenCalledOnce());
			if (expected === 'fallback') await waitFor(() => expect(click).toHaveBeenCalledOnce());
			if (expected === 'error') await waitFor(() => expect(onError).toHaveBeenCalledOnce());
			view.unmount();
		}
	});
});
