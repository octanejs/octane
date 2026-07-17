import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compile } from 'octane/compiler';
import * as ClientRT from '../../src/index.js';
import { hydrateRoot, flushSync } from '../../src/index.js';
import * as ServerRT from 'octane/server';

// Conformance port of facebook/react's `ReactDOMServerIntegrationUserInteraction-test.js`
// — "hydration must not blow away user input". When a user interacts with a server-rendered
// form field BEFORE the client hydrates (setting its `.value`/`.checked` PROPERTY), hydration
// must adopt the SAME node and must NOT reset the property back to the server value.
//
// Since 2026-07-08 octane has REAL controlled components (React semantics on native
// events). The hydration policy is React parity: a controlled binding ADOPTS + ARMS
// during hydration with ZERO writes and no warnings — so pre-hydration input survives
// adoption — and the rendered value is then reasserted at the element's first real
// commit or first discrete edit event. Uncontrolled fields (defaultValue/defaultChecked
// or native content) keep the user's input indefinitely, exactly like React.
// React's `testUserInteractionBeforeClientRender` is mirrored below.

const FIX = join(
	process.cwd(),
	'packages/octane/tests/conformance/_fixtures/user-input-hydration.tsrx',
);
const FILE = 'user-input-hydration.tsrx';

function serverModule(): Record<string, any> {
	let { code } = compile(readFileSync(FIX, 'utf8'), FILE, { mode: 'server' });
	code = code.replace(
		/import\s*\{([^}]*)\}\s*from\s*['"]octane\/server['"];?/g,
		(_m: string, names: string) => `const {${names.replace(/ as /g, ': ')}} = __rt;`,
	);
	code = code.replace(/export const (\w+) =/g, 'const $1 = __exports.$1 =');
	code = code.replace(/export function (\w+)/g, '__exports.$1 = $1; function $1');
	return new Function('__rt', '__exports', code + '\nreturn __exports;')(ServerRT, {});
}
function devClientModule(): Record<string, any> {
	let { code } = compile(readFileSync(FIX, 'utf8'), FILE, { mode: 'client', dev: true });
	code = code.replace(
		/import\s*\{([^}]*)\}\s*from\s*['"]octane['"];?/g,
		(_m: string, names: string) => `const {${names.replace(/ as /g, ': ')}} = __rt;`,
	);
	code = code.replace(/export const (\w+) =/g, 'const $1 = __exports.$1 =');
	code = code.replace(/export function (\w+)/g, '__exports.$1 = $1; function $1');
	return new Function('__rt', '__exports', code + '\nreturn __exports;')(ClientRT, {});
}

const server = serverModule();
const client = devClientModule();

let container: HTMLElement;
let errSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
	container = document.createElement('div');
	document.body.appendChild(container);
	errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
	container.remove();
	errSpy.mockRestore();
});

const warns = () =>
	errSpy.mock.calls.map((c) => String(c[0])).filter((m) => m.includes('hydration mismatch'));

// Mirror of React's testUserInteractionBeforeClientRender: server-render `name`, read the
// field's initial property, simulate a user changing it BEFORE hydration, hydrate, then assert
// the SAME node was adopted and the user's value survived.
async function preserveUserInput(
	name: string,
	valueKey: 'value' | 'checked',
	initial: unknown,
	changed: unknown,
	props: any = {},
) {
	const { html } = await ServerRT.renderToString(server[name], props);
	container.innerHTML = html;
	const field = container.querySelector('#fi') as any;
	expect(field[valueKey]).toBe(initial); // server value reflected into the property

	field[valueKey] = changed; // simulate the user interacting before the client reconnects

	hydrateRoot(container, client[name], props);
	flushSync(() => {});

	const after = container.querySelector('#fi') as any;
	expect(after).toBe(field); // adopted the SAME node (not rebuilt)
	expect(after[valueKey]).toBe(changed); // user's value was NOT blown away
	expect(warns()).toEqual([]); // and no spurious mismatch warning
}

describe('conformance: hydration must not blow away user input (ReactDOMServerIntegrationUserInteraction)', () => {
	it('uncontrolled text input (Per :297)', () =>
		preserveUserInput('TextInput', 'value', 'Hello', 'Goodbye'));

	it('dynamic defaultValue adopts input and later updates only its default', async () => {
		const props = { v: 'Hello' };
		const { html } = await ServerRT.renderToString(server.DynamicDefaultTextInput, props);
		container.innerHTML = html;
		const field = container.querySelector('#fi') as HTMLInputElement;
		field.value = 'Goodbye';

		const root = hydrateRoot(container, client.DynamicDefaultTextInput, props);
		flushSync(() => {});
		expect(container.querySelector('#fi')).toBe(field);
		expect(field.value).toBe('Goodbye');
		expect(warns()).toEqual([]);

		root.render(client.DynamicDefaultTextInput, { v: 'Changed' });
		flushSync(() => {});
		expect(field.value).toBe('Goodbye');
		expect(field.defaultValue).toBe('Changed');
		expect(field.getAttribute('value')).toBe('Changed');
		root.unmount();
	});

	it('CONTROLLED text input adopts without writes (Per :300)', () =>
		preserveUserInput('DynamicTextInput', 'value', 'Hello', 'Goodbye', {
			v: 'Hello',
			onInput: () => {},
		}));

	it('uncontrolled range input (Per :310)', () =>
		preserveUserInput('RangeInput', 'value', '0.5', '1'));

	it('uncontrolled checkbox (Per :333)', () =>
		preserveUserInput('Checkbox', 'checked', true, false));

	it('CONTROLLED checkbox adopts without writes', () =>
		preserveUserInput('ControlledCheckbox', 'checked', true, false, {
			c: true,
			onClick: () => {},
		}));

	it('uncontrolled textarea (Per :355)', () =>
		preserveUserInput('TextArea', 'value', 'Hello', 'Goodbye'));

	it('uncontrolled select (Per :367)', () =>
		preserveUserInput('Select', 'value', 'Hello', 'Goodbye'));
});

describe('conformance: controlled fields reassert AFTER adoption (React parity)', () => {
	it('a controlled checkbox restores after its first post-hydration input event', async () => {
		const props = { c: true, onClick: () => {} };
		const { html } = await ServerRT.renderToString(server.ControlledCheckbox, props);
		container.innerHTML = html;
		const field = container.querySelector('#fi') as HTMLInputElement;
		field.checked = false;

		const root = hydrateRoot(container, client.ControlledCheckbox, props);
		flushSync(() => {});
		expect(field.checked).toBe(false);
		field.dispatchEvent(new Event('input', { bubbles: true }));
		expect(field.checked).toBe(true);
		root.unmount();
	});

	// The adopted pre-hydration value survives only until the element's first
	// real commit — a post-hydration re-render reasserts the rendered value.
	it('the first post-hydration commit reasserts the rendered value', async () => {
		const props = { v: 'Hello', onInput: () => {} };
		const { html } = await ServerRT.renderToString(server.DynamicTextInput, props);
		container.innerHTML = html;
		const field = container.querySelector('#fi') as HTMLInputElement;
		field.value = 'Goodbye'; // pre-hydration typing
		const root = hydrateRoot(container, client.DynamicTextInput, props);
		flushSync(() => {});
		expect(field.value).toBe('Goodbye'); // adoption preserved it
		root.render(client.DynamicTextInput, props); // first real commit
		flushSync(() => {});
		expect(field.value).toBe('Hello'); // reasserted
		root.unmount();
	});

	// …or its first discrete edit event (the restore pass).
	it('the first discrete edit event restores the rendered value', async () => {
		const props = { v: 'Hello', onInput: () => {} };
		const { html } = await ServerRT.renderToString(server.DynamicTextInput, props);
		container.innerHTML = html;
		const field = container.querySelector('#fi') as HTMLInputElement;
		field.value = 'Goodbye';
		const root = hydrateRoot(container, client.DynamicTextInput, props);
		flushSync(() => {});
		field.dispatchEvent(new Event('input', { bubbles: true }));
		expect(field.value).toBe('Hello');
		root.unmount();
	});
});
