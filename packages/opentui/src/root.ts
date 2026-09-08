import { CliRenderEvents, engine, type CliRenderer } from '@opentui/core';
import {
	createUniversalRoot,
	defineUniversalComponent,
	universalComponent,
	universalContext,
	universalPlan,
	universalTry,
	universalValue,
	type UniversalComponent,
	type UniversalRoot,
} from 'octane/universal';
import { AppContext } from './context.js';
import { OPENTUI_RENDERER_ID } from './config.js';
import {
	createOpenTUIContainer,
	createOpenTUIDriver,
	type OpenTUIHostEnvironment,
} from './driver.js';

export interface Root {
	render(component: UniversalComponent<void | undefined>): void;
	render<P>(component: UniversalComponent<P>, props: P): void;
	unmount(): void;
}

interface RootProviderProps {
	readonly renderer: CliRenderer;
	readonly component: UniversalComponent<any>;
	readonly componentProps: any;
}

const ERROR_PLAN = universalPlan(OPENTUI_RENDERER_ID, {
	kind: 'host',
	type: 'box',
	props: { style: { flexDirection: 'column', padding: 2 } },
	children: [
		{
			kind: 'host',
			type: 'text',
			props: { fg: 'red' },
			children: [{ kind: 'text', slot: 0 }],
		},
	],
});

function errorText(error: unknown): string {
	if (error instanceof Error) return error.stack || error.message;
	return String(error);
}

const RootProvider = defineUniversalComponent<RootProviderProps>(
	OPENTUI_RENDERER_ID,
	(props) =>
		universalContext(
			AppContext,
			{ keyHandler: props.renderer.keyInput, renderer: props.renderer },
			() =>
				universalTry(
					() => universalComponent(OPENTUI_RENDERER_ID, props.component, props.componentProps),
					null,
					(error) => universalValue(ERROR_PLAN, [errorText(error)]),
				),
		),
	{ module: '@octanejs/opentui' },
);

const roots = new WeakMap<CliRenderer, Root>();

export function createRoot(renderer: CliRenderer): Root {
	const existing = roots.get(renderer);
	if (existing !== undefined) {
		console.warn('@octanejs/opentui: createRoot should only be called once for a renderer.');
		return existing;
	}

	let hostRoot: UniversalRoot | null = null;
	let unmounted = false;
	const environment: OpenTUIHostEnvironment = {
		eventScope(priority, run) {
			if (hostRoot === null) {
				throw new Error('@octanejs/opentui: A host callback ran before the root was created.');
			}
			return hostRoot.eventScope(priority, run);
		},
	};
	const container = createOpenTUIContainer(renderer, environment);
	hostRoot = createUniversalRoot(container, createOpenTUIDriver());

	const cleanup = (): void => {
		if (unmounted) return;
		unmounted = true;
		try {
			hostRoot?.unmount();
		} finally {
			hostRoot = null;
			renderer.off(CliRenderEvents.DESTROY, cleanup);
			roots.delete(renderer);
		}
	};

	const root: Root = {
		render<P>(component: UniversalComponent<P>, props?: P): void {
			if (unmounted || hostRoot === null) {
				throw new Error('@octanejs/opentui: Cannot render into an unmounted root.');
			}
			engine.attach(renderer);
			hostRoot.render(RootProvider, {
				renderer,
				component,
				componentProps: props,
			});
		},
		unmount: cleanup,
	};

	renderer.once(CliRenderEvents.DESTROY, cleanup);
	roots.set(renderer, root);
	return root;
}
