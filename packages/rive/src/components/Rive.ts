import { createElement } from 'octane';
import type { OctaneNode } from 'octane';
import type { Layout } from '@rive-app/canvas';
import useRive from '../hooks/useRive.ts';
import type { CanvasElementProps } from '../types.ts';
import { splitSlot, subSlot } from '../internal.ts';

export interface RiveProps {
	/**
	 * URL of the Rive asset, or path to where the public asset is stored.
	 */
	src: string;
	/**
	 * Artboard to render from the Rive asset.
	 * Defaults to the first artboard created.
	 */
	artboard?: string;
	/**
	 * Specify a starting animation to play.
	 */
	animations?: string | string[];
	/**
	 * Specify a starting state machine to play.
	 */
	stateMachines?: string | string[];
	/**
	 * Specify a starting Layout object to set Fill and Alignment for the drawing surface. See docs at https://rive.app/docs/runtimes/react/layouts for more on layout configuration.
	 */
	layout?: Layout;
	/**
	 * For `@rive-app/react-webgl2`, sets this property to maintain a single WebGL context for multiple canvases. **We recommend to keep the default value** when rendering multiple Rive instances on a page.
	 */
	useOffscreenRenderer?: boolean;
	/**
	 * Specify whether to disable Rive listeners on the canvas, thus preventing any event listeners to be attached to the canvas element
	 */
	shouldDisableRiveListeners?: boolean;
	/**
	 * Specify whether to resize the canvas to its parent container automatically
	 */
	shouldResizeCanvasToContainer?: boolean;
	/**
	 * Enable Rive Events to be handled by the runtime. This means any special Rive Event may have
	 * functionality that can be invoked implicitly when detected.
	 *
	 * For example, if during the render loop an OpenUrlEvent is detected, the
	 * browser may try to open the specified URL in the payload.
	 *
	 * This flag is false by default to prevent any unwanted behaviors from taking place.
	 * This means any special Rive Event will have to be handled manually by subscribing to
	 * EventType.RiveEvent
	 */
	automaticallyHandleEvents?: boolean;
}

const RIVE_PROP_KEYS: Record<string, true> = {
	src: true,
	artboard: true,
	animations: true,
	stateMachines: true,
	layout: true,
	useOffscreenRenderer: true,
	shouldDisableRiveListeners: true,
	shouldResizeCanvasToContainer: true,
	automaticallyHandleEvents: true,
	children: true,
};

function Rive(...rawArgs: unknown[]): OctaneNode {
	const [args, slot] = splitSlot(rawArgs);
	const props = args[0] as RiveProps & CanvasElementProps;
	const src = props.src;
	const artboard = props.artboard;
	const animations = props.animations;
	const stateMachines = props.stateMachines;
	const layout = props.layout;
	const useOffscreenRenderer = props.useOffscreenRenderer ?? true;
	const shouldDisableRiveListeners = props.shouldDisableRiveListeners ?? false;
	const shouldResizeCanvasToContainer = props.shouldResizeCanvasToContainer ?? true;
	const automaticallyHandleEvents = props.automaticallyHandleEvents ?? false;
	const children = props.children;

	const rest: Record<string, unknown> = {};
	for (const key in props) {
		if (!Object.prototype.hasOwnProperty.call(RIVE_PROP_KEYS, key)) {
			rest[key] = props[key];
		}
	}

	const params = {
		src: src,
		artboard: artboard,
		animations: animations,
		layout: layout,
		stateMachines: stateMachines,
		autoplay: true,
		shouldDisableRiveListeners: shouldDisableRiveListeners,
		automaticallyHandleEvents: automaticallyHandleEvents,
	};

	const options = {
		useOffscreenRenderer: useOffscreenRenderer,
		shouldResizeCanvasToContainer: shouldResizeCanvasToContainer,
	};

	const riveState = useRive(params, options, subSlot(slot, 'useRive'));
	return createElement(riveState.RiveComponent, { ...rest, children: children });
}

export default Rive;
