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

	it('destroys on unmount', function destroysOnUnmount() {
		const ref: { current: FilePondHandle | null } = { current: null };
		const { unmount } = render(createElement(FilePond, { ref, name: 'files' }));
		const pond = ref.current?.pond ?? null;

		unmount();

		if (supported() && pond) {
			expect(ref.current).toBeNull();
			expect(pond.element.isConnected).toBe(false);
		} else {
			expect(ref.current).toBeNull();
		}
	});
});
