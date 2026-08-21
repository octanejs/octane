import {
	createUniversalRoot,
	flushUniversalAct,
	type UniversalComponent,
} from 'octane/universal/native';
import Yoga from 'yoga-layout';
import { createNode } from './dom.js';
import { createInkContainer, createInkDriver } from './host-driver.js';
import type { InkComponent } from './component.js';
import renderer from './renderer.js';

export type RenderToStringOptions = {
	/** Width of the virtual terminal in columns. @default 80 */
	columns?: number;
};

/** Render an Octane Ink component to a string without opening a terminal session. */
const renderToString = <P>(
	component: InkComponent<P>,
	props: P,
	options?: RenderToStringOptions,
): string => {
	const columns = options?.columns ?? 80;
	const rootNode = createNode('ink-root');
	let capturedStaticOutput = '';
	rootNode.onComputeLayout = () => {
		rootNode.yogaNode!.setWidth(columns);
		rootNode.yogaNode!.calculateLayout(undefined, undefined, Yoga.DIRECTION_LTR);
	};
	rootNode.onImmediateRender = () => {
		const { staticOutput } = renderer(rootNode, false);
		if (staticOutput && staticOutput !== '\n') capturedStaticOutput += staticOutput;
	};

	const root = createUniversalRoot(createInkContainer(rootNode), createInkDriver());
	let output = '';
	try {
		flushUniversalAct(() => root.render(component as unknown as UniversalComponent<P>, props));
		output = renderer(rootNode, false).output;
		flushUniversalAct(() => root.unmount());
	} finally {
		try {
			rootNode.yogaNode?.freeRecursive();
		} catch {}
	}

	const staticOutput = capturedStaticOutput.endsWith('\n')
		? capturedStaticOutput.slice(0, -1)
		: capturedStaticOutput;
	return staticOutput && output ? `${staticOutput}\n${output}` : staticOutput || output;
};

export default renderToString;
