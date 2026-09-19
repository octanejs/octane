import {
	createContext,
	useContext,
	defineUniversalComponent,
	universalComponent,
	universalFor,
	universalProps,
	universalValue,
	type UniversalComponent,
} from 'octane/universal/native';
import { afterEach, describe, expect, it } from 'vitest';
import { createLynxRoot, type LynxRoot } from '../src/index.js';
import { root as firstScreenRoot } from '../src/first-screen.js';
import * as firstScreenRenderer from '../src/main-renderer.js';
import {
	defineUniversalComponent as defineFirstScreenComponent,
	universalComponent as firstScreenComponent,
	universalFor as firstScreenFor,
	universalPlan as firstScreenPlan,
	universalProps as firstScreenProps,
	universalValue as firstScreenValue,
} from '../src/main-renderer.js';
import {
	LYNX_MAIN_TO_BACKGROUND_EVENT,
	type LynxBackgroundInboundMessage,
} from '../src/core/protocol.js';
import {
	installEnvironment,
	mainContext,
	uninstallEnvironment,
} from './_fixtures/lynx-first-screen-env.js';
import { unwire } from './_fixtures/lynx-wire.js';

let backgroundRoot: LynxRoot | null = null;

afterEach(async () => {
	try {
		await backgroundRoot?.unmount();
	} finally {
		backgroundRoot = null;
		uninstallEnvironment();
	}
});

// A first-screen bundle owns the realm's first background root. This first-boot
// scenario needs its own isolated module graph alongside the other adoption suite.
describe('Lynx first-screen context adoption', () => {
	it('adopts imported context component loops and retains their keyed nodes after capability negotiation', async () => {
		const { dom, main } = installEnvironment();
		const MainContext = firstScreenRenderer.createContext('default');
		const BackgroundContext = createContext('default');
		const MainContextComponent = MainContext as unknown as UniversalComponent<any>;
		const BackgroundContextComponent = BackgroundContext as unknown as UniversalComponent<any>;
		const readPlan = firstScreenPlan('lynx', {
			kind: 'host',
			type: 'view',
			propsSlot: 0,
			children: [{ kind: 'host', type: 'text', children: [{ kind: 'slot', slot: 1 }] }],
		});
		const MainRead = defineFirstScreenComponent('lynx', (props: { id: string }) =>
			firstScreenValue(readPlan, [
				firstScreenProps([['set', 'id', `context-${props.id}`]]),
				firstScreenRenderer.useContext(MainContext),
			]),
		);
		const BackgroundRead = defineUniversalComponent('lynx', (props: { id: string }) =>
			universalValue(readPlan, [
				universalProps([['set', 'id', `context-${props.id}`]]),
				useContext(BackgroundContext),
			]),
		);
		type Props = { ids: string[]; suffix: string };
		const Main = defineFirstScreenComponent('lynx', (props: Props) =>
			firstScreenFor(
				props.ids,
				(id) => id,
				(id) =>
					firstScreenComponent('lynx', MainContextComponent, {
						value: `${id}:${props.suffix}`,
						children: firstScreenComponent('lynx', MainRead, { id }),
					}),
				null,
				false,
				false,
				undefined,
				undefined,
				undefined,
				true,
			),
		);
		const Background = defineUniversalComponent('lynx', (props: Props) =>
			universalFor(
				props.ids,
				(id) => id,
				(id) =>
					universalComponent('lynx', BackgroundContextComponent, {
						value: `${id}:${props.suffix}`,
						children: universalComponent('lynx', BackgroundRead, { id }),
					}),
				null,
				false,
				false,
				undefined,
				undefined,
				undefined,
				true,
			),
		);
		const props = { ids: ['a', 'b'], suffix: 'initial' };
		firstScreenRoot.render(Main, props);
		const firstA = dom.window.document.querySelector('#context-a');
		const firstB = dom.window.document.querySelector('#context-b');
		expect(firstA?.textContent).toBe('a:initial');
		expect(firstB?.textContent).toBe('b:initial');
		const inbound: LynxBackgroundInboundMessage[] = [];
		mainContext().addEventListener(LYNX_MAIN_TO_BACKGROUND_EVENT, (event) => {
			inbound.push(unwire(event.data) as LynxBackgroundInboundMessage);
		});
		main.markFirstScreenSyncReady();
		globalThis.lynxTestingEnv.switchToBackgroundThread();
		backgroundRoot = createLynxRoot();
		await backgroundRoot.render(Background, props);
		expect(
			inbound.find((message) => message.type === 'main-ready' && 'firstTree' in message),
		).toMatchObject({
			firstTree: { root: 1, version: 1 },
			capabilities: { templateProgram: 1, templateRuns: 1 },
		});
		expect(dom.window.document.querySelector('#context-a')).toBe(firstA);
		expect(dom.window.document.querySelector('#context-b')).toBe(firstB);
		expect(main.diagnostics()).toEqual([]);

		await backgroundRoot.render(Background, { ids: ['b', 'a', 'c'], suffix: 'updated' });
		expect(dom.window.document.querySelector('#context-a')).toBe(firstA);
		expect(dom.window.document.querySelector('#context-b')).toBe(firstB);
		expect(firstA?.textContent).toBe('a:updated');
		expect(firstB?.textContent).toBe('b:updated');
		expect(dom.window.document.querySelector('#context-c')?.textContent).toBe('c:updated');
		expect(main.diagnostics()).toEqual([]);

		await backgroundRoot.render(Background, { ids: [], suffix: 'empty' });
		expect(dom.window.document.querySelector('#context-a')).toBeNull();
		expect(dom.window.document.querySelector('#context-b')).toBeNull();
		await backgroundRoot.render(Background, { ids: ['d', 'c'], suffix: 'fresh' });
		expect(dom.window.document.querySelector('#context-d')?.textContent).toBe('d:fresh');
		expect(dom.window.document.querySelector('#context-c')?.textContent).toBe('c:fresh');
		expect(main.diagnostics()).toEqual([]);
	});
});
