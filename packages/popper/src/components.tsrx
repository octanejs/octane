import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from 'octane';
import type { OctaneNode } from 'octane';
import { usePopper } from './usePopper';
import type { ManagerProps, PopperChildrenProps, PopperProps, ReferenceProps } from './types';
import { setRef } from './utils';

const ManagerReferenceNodeContext = createContext<Element | null>(null);
/** Private upstream Manager export; kept for Reference identity tests. */
export const ManagerReferenceNodeSetterContext = createContext<
	((node: Element | null) => void) | undefined
>(undefined);

export function Manager({ children }: ManagerProps): OctaneNode {
	const [referenceNode, setReferenceNode] = useState<Element | null>(null);
	const hasUnmounted = useRef(false);
	useEffect(
		() => () => {
			hasUnmounted.current = true;
		},
		[],
	);
	const handleSetReferenceNode = useCallback((node: Element | null) => {
		if (!hasUnmounted.current) setReferenceNode(node);
	}, []);
	return <ManagerReferenceNodeContext.Provider value={referenceNode}>
		<ManagerReferenceNodeSetterContext.Provider
			value={handleSetReferenceNode}
		>{children}</ManagerReferenceNodeSetterContext.Provider>
	</ManagerReferenceNodeContext.Provider>;
}

export function Reference({ children, innerRef }: ReferenceProps): OctaneNode {
	const setReferenceNode = useContext(ManagerReferenceNodeSetterContext);
	const ref = useCallback((node: HTMLElement | null) => {
		setRef(innerRef, node);
		setReferenceNode?.(node);
	}, [innerRef, setReferenceNode]);
	useEffect(() => () => setRef(innerRef, null), []);
	useEffect(() => {
		if (process.env.NODE_ENV !== 'production' && !setReferenceNode) {
			// OCTANE DIVERGENCE[popper-dev-warning-console][runtime:baa5fd0dba1358db]
			console.error('Warning: `Reference` should not be used outside of a `Manager` component.');
		}
	}, [setReferenceNode]);
	return children({ ref });
}

const NOOP = () => undefined;
const NOOP_PROMISE = () => Promise.resolve(null);
const EMPTY_MODIFIERS: ReadonlyArray<never> = [];

export function Popper<Modifiers = string>({
	placement = 'bottom',
	strategy = 'absolute',
	modifiers = EMPTY_MODIFIERS,
	referenceElement,
	onFirstUpdate,
	innerRef,
	children,
}: PopperProps<Modifiers>): OctaneNode {
	const referenceNode = useContext(ManagerReferenceNodeContext);
	const [popperElement, setPopperElement] = useState<HTMLElement | null>(null);
	const [arrowElement, setArrowElement] = useState<HTMLElement | null>(null);

	useEffect(() => {
		setRef(innerRef, popperElement);
	}, [innerRef, popperElement]);

	const options = useMemo(
		() => ({
			placement,
			strategy,
			onFirstUpdate,
			modifiers: [
				...modifiers,
				{
					name: 'arrow' as const,
					enabled: arrowElement != null,
					options: { element: arrowElement },
				},
			],
		}),
		[placement, strategy, onFirstUpdate, modifiers, arrowElement],
	);

	const { state, styles, forceUpdate, update } = usePopper(
		referenceElement || referenceNode,
		popperElement,
		options as any,
	);

	const childrenProps = useMemo<PopperChildrenProps>(() => {
		const result = {
			ref: setPopperElement,
			style: styles.popper,
			placement: state?.placement ?? placement,
			hasPopperEscaped: state?.modifiersData.hide?.hasPopperEscaped ?? null,
			isReferenceHidden: state?.modifiersData.hide?.isReferenceHidden ?? null,
			arrowProps: { style: styles.arrow, ref: setArrowElement },
			forceUpdate: forceUpdate ?? NOOP,
			update: update ?? NOOP_PROMISE,
		};
		return result as unknown as PopperChildrenProps;
	}, [placement, state, styles, update, forceUpdate]);

	return children(childrenProps);
}
