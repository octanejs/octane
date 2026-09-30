import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync } from 'octane';
import { flushEffects, mount } from '../../../octane/tests/_helpers';
import {
	ArrayFieldProbe,
	ChoiceFieldsProbe,
	ExternalFieldProbe,
	PuckEditorContentProbe,
	PuckEditorFrameProbe,
	PuckZoneRefProbe,
	zoneRef,
} from '../_fixtures/puck-adaptation-probe.tsrx';

function settle() {
	flushEffects();
	flushSync(function flush() {});
}

async function settleAsync() {
	for (let i = 0; i < 3; i++) {
		await new Promise((resolve) => setTimeout(resolve, 0));
		settle();
	}
}

// Errors thrown from native listeners and passive effects reach `window`, not
// the caller, so collect them for the assertion.
async function collectErrors(run: () => void | Promise<void>): Promise<unknown[]> {
	const errors: unknown[] = [];
	const onError = (event: ErrorEvent) => {
		errors.push(event.error);
	};
	window.addEventListener('error', onError);
	try {
		await run();
	} finally {
		window.removeEventListener('error', onError);
	}
	return errors;
}

function pressAndRelease(target: Element, pointerTypes: string[]) {
	for (const pointerType of pointerTypes) {
		target.dispatchEvent(
			new PointerEvent('pointerdown', {
				bubbles: true,
				button: 0,
				isPrimary: true,
				pointerType,
			}),
		);
		document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType }));
	}
}

// jsdom never loads an iframe's `srcdoc`, so the editor frame stays an empty
// `about:blank` document. Fill it the way a browser would before AutoFrame
// looks for its mount point.
function emulateSrcdoc() {
	const descriptor = Object.getOwnPropertyDescriptor(
		HTMLIFrameElement.prototype,
		'contentDocument',
	)!;
	Object.defineProperty(HTMLIFrameElement.prototype, 'contentDocument', {
		configurable: true,
		get(this: HTMLIFrameElement) {
			const doc = descriptor.get!.call(this) as Document | null;
			const srcdoc = this.getAttribute('srcdoc');
			if (doc && srcdoc && !doc.getElementById('frame-root')) {
				doc.body.innerHTML = new DOMParser().parseFromString(srcdoc, 'text/html').body.innerHTML;
			}
			return doc;
		},
	});
	return function restore() {
		Object.defineProperty(HTMLIFrameElement.prototype, 'contentDocument', descriptor);
	};
}

describe('@octanejs/puck — Octane adaptation contract', () => {
	let root: ReturnType<typeof mount> | undefined;
	let restoreSrcdoc: (() => void) | undefined;

	afterEach(function cleanup() {
		root?.unmount();
		root = undefined;
		restoreSrcdoc?.();
		restoreSrcdoc = undefined;
		zoneRef.current = null;
	});

	it('forwards a ref passed to DropZone to its element under Render', () => {
		root = mount(PuckZoneRefProbe);
		settle();

		const zone = root.container.querySelector('.inner-zone');
		expect(zone).toBeTruthy();
		expect(zoneRef.current).toBe(zone);
	});

	it('renders stored components in the editor and forwards a DropZone ref there', () => {
		root = mount(PuckEditorContentProbe);
		settle();

		expect(root.container.querySelector('h1')?.textContent).toBe('Hello Puck');
		const zone = root.container.querySelector('.inner-zone');
		expect(zone).toBeTruthy();
		expect(zoneRef.current).toBe(zone);
	});

	it('renders the editor preview inside its iframe', async () => {
		restoreSrcdoc = emulateSrcdoc();
		const errors = await collectErrors(async function mountEditor() {
			root = mount(PuckEditorFrameProbe);
			settle();
			await settleAsync();
		});

		const frame = root!.container.querySelector('iframe')!;
		const frameRoot = frame.contentDocument!.getElementById('frame-root')!;
		expect(errors).toEqual([]);
		expect(frameRoot.querySelector('[data-puck-dropzone="root:default-zone"]')).toBeTruthy();
	});

	it('starts a pointer interaction on an editor component without throwing', async () => {
		root = mount(PuckEditorContentProbe);
		settle();

		const heading = root.container.querySelector('h1')!;
		expect(await collectErrors(() => pressAndRelease(heading, ['mouse', 'touch']))).toEqual([]);
	});

	it('renders the built-in select and radio fields and reports their native change', () => {
		const onChange = vi.fn();
		root = mount(ChoiceFieldsProbe, { onChange });
		settle();

		const select = root.container.querySelector('select')!;
		select.value = JSON.stringify({ value: 'beta' });
		select.dispatchEvent(new Event('change', { bubbles: true }));

		const radio = root.container.querySelectorAll<HTMLInputElement>('input[type="radio"]')[1];
		radio.checked = true;
		radio.dispatchEvent(new Event('change', { bubbles: true }));

		expect(onChange.mock.calls.map((call) => call[0])).toEqual(['beta', 'beta']);
	});

	it('starts a pointer interaction on a sortable array item without throwing', async () => {
		root = mount(ArrayFieldProbe);
		settle();

		const handle = root.container.querySelector('[data-dnd-container] > div > div');
		expect(handle).toBeTruthy();
		expect(await collectErrors(() => pressAndRelease(handle!, ['mouse', 'touch', 'pen']))).toEqual(
			[],
		);
	});

	it('lists fetched rows in an external field', async () => {
		// The editor shell owns the portal root its modals render into.
		const portalRoot = document.createElement('div');
		portalRoot.id = 'puck-portal-root';
		document.body.appendChild(portalRoot);

		try {
			const errors = await collectErrors(async function openExternalField() {
				root = mount(ExternalFieldProbe);
				settle();
				root.container.querySelector('button')!.click();
				await settleAsync();
			});

			expect(errors).toEqual([]);
			expect(portalRoot.textContent).toContain('Alpha');
		} finally {
			root?.unmount();
			root = undefined;
			portalRoot.remove();
		}
	});
});
