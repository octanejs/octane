// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/utils/filterDOMProps.ts).
// Plain function (no hooks, no slot threading). The prop-name tables port verbatim: the
// `on*` names in `globalEvents` are octane's NATIVE delegated event props, which use the
// same casing as upstream's React names for these events.
import type { AriaLabelingProps, DOMProps, LinkDOMProps } from '@react-types/shared';

// octane adaptation: upstream's `GlobalDOMAttributes` from '@react-types/shared' is typed
// over React synthetic-event handlers; octane props carry native handlers, so it becomes a
// structural bag.
type GlobalDOMAttributes = Record<string, any>;

const DOMPropNames = new Set(['id']);

const labelablePropNames = new Set([
	'aria-label',
	'aria-labelledby',
	'aria-describedby',
	'aria-details',
]);

// See LinkDOMProps in dom.d.ts.
const linkPropNames = new Set([
	'href',
	'hrefLang',
	'target',
	'rel',
	'download',
	'ping',
	'referrerPolicy',
]);

const globalAttrs = new Set(['dir', 'lang', 'hidden', 'inert', 'translate']);

const globalEvents = new Set([
	'onClick',
	'onAuxClick',
	'onContextMenu',
	'onDoubleClick',
	'onMouseDown',
	'onMouseEnter',
	'onMouseLeave',
	'onMouseMove',
	'onMouseOut',
	'onMouseOver',
	'onMouseUp',
	'onTouchCancel',
	'onTouchEnd',
	'onTouchMove',
	'onTouchStart',
	'onPointerDown',
	'onPointerMove',
	'onPointerUp',
	'onPointerCancel',
	'onPointerEnter',
	'onPointerLeave',
	'onPointerOver',
	'onPointerOut',
	'onGotPointerCapture',
	'onLostPointerCapture',
	'onScroll',
	'onWheel',
	'onAnimationStart',
	'onAnimationEnd',
	'onAnimationIteration',
	'onTransitionCancel',
	'onTransitionEnd',
	'onTransitionRun',
	'onTransitionStart',
]);

interface Options {
	/**
	 * If labelling associated aria properties should be included in the filter.
	 */
	labelable?: boolean;
	/** Whether the element is a link and should include DOM props for <a> elements. */
	isLink?: boolean;
	/** Whether to include global DOM attributes. */
	global?: boolean;
	/** Whether to include DOM events. */
	events?: boolean;
	/**
	 * A Set of other property names that should be included in the filter.
	 */
	propNames?: Set<string>;
}

const propRe = /^(data-.*)$/;

/**
 * Filters out all props that aren't valid DOM props or defined via override prop obj.
 *
 * @param props - The component props to be filtered.
 * @param opts - Props to override.
 */
export function filterDOMProps(
	props: DOMProps & AriaLabelingProps & LinkDOMProps & GlobalDOMAttributes,
	opts: Options = {},
): DOMProps & AriaLabelingProps & GlobalDOMAttributes {
	let { labelable, isLink, global, events = global, propNames } = opts;
	let filteredProps: Record<string, any> = {};

	for (const prop in props) {
		if (
			Object.prototype.hasOwnProperty.call(props, prop) &&
			(DOMPropNames.has(prop) ||
				(labelable && labelablePropNames.has(prop)) ||
				(isLink && linkPropNames.has(prop)) ||
				(global && globalAttrs.has(prop)) ||
				(events &&
					(globalEvents.has(prop) ||
						(prop.endsWith('Capture') && globalEvents.has(prop.slice(0, -7))))) ||
				propNames?.has(prop) ||
				propRe.test(prop))
		) {
			filteredProps[prop] = (props as Record<string, any>)[prop];
		}
	}

	return filteredProps;
}
