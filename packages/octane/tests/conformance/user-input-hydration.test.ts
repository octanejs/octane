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
// Octane has no controlled components — `value`/`checked`/`selected` are plain native
// attributes (static values live in the template; dynamic ones are written with
// `setAttribute`, which touches the ATTRIBUTE, not the dirty `.value`/`.checked` property).
// So React's controlled/uncontrolled split collapses: each element type is ported once as a
// native field. React's `testUserInteractionBeforeClientRender` is mirrored below.

const FIX = join(
	process.cwd(),
	'packages/octane/tests/conformance/_fixtures/user-input-hydration.tsrx',
);
const FILE = 'user-input-hydration.tsrx';

function serverModule(): Record<string, any> {
	let { code } = compile(readFileSync(FIX, 'utf8'), FILE, { mode: 'server' });
	code = code.replace(
		/import\s*\{([^}]*)\}\s*from\s*['"]octane\/server['"];?/g,
		'const {$1} = __rt;',
	);
	code = code.replace(/export const (\w+) =/g, 'const $1 = __exports.$1 =');
	code = code.replace(/export function (\w+)/g, '__exports.$1 = function $1');
	return new Function('__rt', '__exports', code + '\nreturn __exports;')(ServerRT, {});
}
function devClientModule(): Record<string, any> {
	let { code } = compile(readFileSync(FIX, 'utf8'), FILE, { mode: 'client', dev: true });
	code = code.replace(/import\s*\{([^}]*)\}\s*from\s*['"]octane['"];?/g, 'const {$1} = __rt;');
	code = code.replace(/export const (\w+) =/g, 'const $1 = __exports.$1 =');
	code = code.replace(/export function (\w+)/g, '__exports.$1 = function $1');
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
	const { body } = await ServerRT.render(server[name], props);
	container.innerHTML = body;
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

	it('a dynamic-value text input (binding runs at mount) (Per :300)', () =>
		preserveUserInput('DynamicTextInput', 'value', 'Hello', 'Goodbye', { v: 'Hello' }));

	it('uncontrolled range input (Per :310)', () =>
		preserveUserInput('RangeInput', 'value', '0.5', '1'));

	it('uncontrolled checkbox (Per :333)', () =>
		preserveUserInput('Checkbox', 'checked', true, false));

	it('uncontrolled textarea (Per :355)', () =>
		preserveUserInput('TextArea', 'value', 'Hello', 'Goodbye'));

	it('uncontrolled select (Per :367)', () =>
		preserveUserInput('Select', 'value', 'Hello', 'Goodbye'));
});
