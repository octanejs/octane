import {
	Children,
	createElement,
	createPortal,
	Fragment,
	isChildrenBlock,
	useLayoutEffect,
	useState,
} from 'octane';
import type { OctaneNode } from 'octane';
import { subSlot } from './internal';

export interface PortalProps {
	disabled?: boolean | undefined;
	container?: { current: HTMLElement | null } | undefined;
	getRootNode?: (() => ShadowRoot | Document | Node) | undefined;
	children?: OctaneNode;
}

const PORTAL_SLOT = Symbol.for('@octanejs/zag/Portal');

export const Portal = (props: PortalProps) => {
	const { children, container, disabled, getRootNode } = props;
	const [mounted, setMounted] = useState(false, subSlot(PORTAL_SLOT, 'mounted'));

	useLayoutEffect(
		() => {
			setMounted(true);
		},
		[],
		subSlot(PORTAL_SLOT, 'mount-effect'),
	);

	if (!mounted || typeof window === 'undefined' || disabled) {
		return createElement(Fragment, null, children);
	}

	const rootNode = getRootNode?.();
	const doc =
		rootNode?.nodeType === Node.DOCUMENT_NODE
			? (rootNode as Document)
			: (rootNode?.ownerDocument ?? document);
	const mountNode = container?.current ?? doc.body;
	if (isChildrenBlock(children)) {
		return createPortal(children, mountNode);
	}
	const portals = Children.map(children, (child) => createPortal(child, mountNode));
	return createElement(Fragment, null, portals);
};
