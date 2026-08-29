import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@octanejs/testing-library';
import { createElement } from 'octane';
import { FileStatus, registerPlugin, supported } from 'filepond';
import {
	FilePond,
	FileStatus as BoundFileStatus,
	registerPlugin as boundRegisterPlugin,
} from '../src/index.ts';
import type { FilePondHandle } from '../src/index.ts';

afterEach(cleanup);

if (typeof window.matchMedia !== 'function') {
	window.matchMedia = function matchMedia(query: string) {
		return {
			matches: false,
			media: query,
			onchange: null,
			addListener: function addListener() {},
			removeListener: function removeListener() {},
			addEventListener: function addEventListener() {},
			removeEventListener: function removeEventListener() {},
			dispatchEvent: function dispatchEvent() {
				return false;
			},
		} as MediaQueryList;
	};
}

describe('FilePond', function filePondSuite() {
	it('renders wrapper+file input', function wrapperAndInput() {
		const { container } = render(createElement(FilePond, { name: 'files' }));
		const wrapper = container.querySelector('.filepond--wrapper');
		expect(wrapper).toBeTruthy();
		expect(
			container.querySelector('input[type="file"]') || container.querySelector('.filepond--root'),
		).toBeTruthy();
	});

	it('registerPlugin/FileStatus re-exports', function reexports() {
		expect(boundRegisterPlugin).toBe(registerPlugin);
		expect(BoundFileStatus).toBe(FileStatus);
		expect(typeof boundRegisterPlugin).toBe('function');
		expect(BoundFileStatus).toBeTruthy();
	});

	it('creates pond when supported', function createsWhenSupported() {
		const ref: { current: FilePondHandle | null } = { current: null };
		const { container } = render(createElement(FilePond, { ref, name: 'files' }));

		expect(container.querySelector('.filepond--wrapper')).toBeTruthy();

		if (supported()) {
			expect(ref.current).toBeTruthy();
			expect(ref.current!.pond).toBeTruthy();
			expect(typeof ref.current!.pond!.addFile).toBe('function');
		} else {
			expect(ref.current?.pond ?? null).toBeNull();
			expect(container.querySelector('input[type="file"]')).toBeTruthy();
		}
	});

	it('applies non-file options after an internal file update', async function updatesOptionsAfterFiles() {
		const ref: { current: FilePondHandle | null } = { current: null };
		const files: [] = [];
		const view = render(
			createElement(FilePond, {
				ref,
				files,
				allowMultiple: false,
				instantUpload: false,
				onupdatefiles: function onupdatefiles() {},
			}),
		);

		expect(supported()).toBe(true);
		const pond = ref.current!.pond!;
		await pond.addFile(new File(['hello'], 'hello.txt', { type: 'text/plain' }));

		view.rerender(
			createElement(FilePond, {
				ref,
				files,
				allowMultiple: true,
				instantUpload: false,
				onupdatefiles: function onupdatefiles() {},
			}),
		);

		expect(pond.allowMultiple).toBe(true);
		expect(pond.getFiles()).toHaveLength(1);
	});

	it('retains internal files across unrelated rerenders', async function retainsInternalFiles() {
		const ref: { current: FilePondHandle | null } = { current: null };
		const files: [] = [];
		const view = render(
			createElement(FilePond, {
				ref,
				files,
				allowMultiple: false,
				instantUpload: false,
				onupdatefiles: function onupdatefiles() {},
			}),
		);

		expect(supported()).toBe(true);
		const pond = ref.current!.pond!;
		await pond.addFile(new File(['hello'], 'hello.txt', { type: 'text/plain' }));

		view.rerender(
			createElement(FilePond, {
				ref,
				files,
				allowMultiple: true,
				instantUpload: false,
				onupdatefiles: function onupdatefiles() {},
			}),
		);
		view.rerender(
			createElement(FilePond, {
				ref,
				files,
				allowMultiple: false,
				instantUpload: false,
				onupdatefiles: function onupdatefiles() {},
			}),
		);

		expect(pond.getFiles()).toHaveLength(1);
	});

	it('destroys on unmount', function destroysOnUnmount() {
		const ref: { current: FilePondHandle | null } = { current: null };
		const { unmount } = render(createElement(FilePond, { ref, name: 'files' }));
		const pond = ref.current?.pond ?? null;

		unmount();

		if (supported() && pond) {
			expect(ref.current).toBeNull();
			expect(pond.element == null || pond.element.isConnected === false).toBe(true);
		} else {
			expect(ref.current).toBeNull();
		}
	});
});
