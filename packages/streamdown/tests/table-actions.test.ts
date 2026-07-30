import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync } from 'octane';
import { Streamdown } from '@octanejs/streamdown';
import { mount } from '../../octane/tests/_helpers';

const TABLE_MARKDOWN = ['| Name | Value |', '| --- | --- |', '| answer | 42 |'].join('\n');

function click(root: ParentNode, selector: string): void {
	const button = root.querySelector<HTMLButtonElement>(selector);
	if (!button) {
		throw new Error(`no button matching ${selector}`);
	}
	flushSync(() => button.click());
}

function mountFullscreenTable() {
	const mounted = mount(Streamdown, {
		children: TABLE_MARKDOWN,
		controls: {
			table: { copy: true, download: true, fullscreen: true },
		},
		mode: 'static' as const,
	});
	mounted.click('button[title="View fullscreen"]');

	const fullscreen = document.querySelector<HTMLElement>('[data-streamdown="table-fullscreen"]');
	if (!fullscreen) {
		mounted.unmount();
		throw new Error('fullscreen table did not open');
	}

	return { fullscreen, mounted };
}

function installClipboard(write: (items: ClipboardItems) => Promise<void>): () => void {
	const descriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
	Object.defineProperty(navigator, 'clipboard', {
		configurable: true,
		value: { write },
	});
	return () => {
		if (descriptor) {
			Object.defineProperty(navigator, 'clipboard', descriptor);
		} else {
			delete (navigator as Navigator & { clipboard?: Clipboard }).clipboard;
		}
	};
}

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe('@octanejs/streamdown fullscreen table actions', () => {
	it('copies the table from the fullscreen dialog', async () => {
		const clipboardPayloads: Array<Record<string, Blob>> = [];
		class ClipboardItemMock {
			constructor(payload: Record<string, Blob>) {
				clipboardPayloads.push(payload);
			}
		}
		vi.stubGlobal('ClipboardItem', ClipboardItemMock);
		const write = vi.fn(async () => {});
		const restoreClipboard = installClipboard(write);
		const { fullscreen, mounted } = mountFullscreenTable();

		try {
			click(fullscreen, 'button[title="Copy table"]');
			click(fullscreen, 'button[title="Copy table as CSV"]');

			await vi.waitFor(() => expect(write).toHaveBeenCalledOnce());
			expect(clipboardPayloads).toHaveLength(1);
			expect(clipboardPayloads[0]?.['text/plain']).toBeInstanceOf(Blob);
			expect(clipboardPayloads[0]?.['text/html']).toBeInstanceOf(Blob);
		} finally {
			mounted.unmount();
			restoreClipboard();
		}
	});

	it('downloads the table from the fullscreen dialog', () => {
		const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:table');
		const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
		const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
		const { fullscreen, mounted } = mountFullscreenTable();

		try {
			click(fullscreen, 'button[title="Download table"]');
			click(fullscreen, 'button[title="Download table as CSV"]');

			expect(createObjectURL).toHaveBeenCalledOnce();
			expect(createObjectURL.mock.calls[0]?.[0]).toBeInstanceOf(Blob);
			expect(anchorClick).toHaveBeenCalledOnce();
			expect(revokeObjectURL).toHaveBeenCalledWith('blob:table');
		} finally {
			mounted.unmount();
		}
	});
});
