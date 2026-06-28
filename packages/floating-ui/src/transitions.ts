// Ported from @floating-ui/react useTransitionStatus / useTransitionStyles (+ the
// internal useDelayUnmount) — placement-aware CSS-transition state/styles for a
// floating element. ReactDOM.flushSync → octane flushSync.
import { flushSync, useEffect, useMemo, useState } from 'octane';

import { splitSlot, subSlot } from './internal';
import {
	camelCaseToKebabCase,
	execWithArgsOrReturn,
	useLatestRef,
	useModernLayoutEffect,
} from './utils';

function useDelayUnmount(open: boolean, durationMs: number, slot: symbol | undefined): boolean {
	const [isMounted, setIsMounted] = useState(open, subSlot(slot, 'mounted'));
	if (open && !isMounted) {
		setIsMounted(true);
	}
	useEffect(
		() => {
			if (!open && isMounted) {
				const timeout = setTimeout(() => setIsMounted(false), durationMs);
				return () => clearTimeout(timeout);
			}
		},
		[open, isMounted, durationMs],
		subSlot(slot, 'eff'),
	);
	return isMounted;
}

export function useTransitionStatus(...args: any[]): any {
	const [user, slot] = splitSlot(args);
	const context = user[0];
	const props = (user[1] as any) ?? {};

	const open = context.open;
	const floating = context.elements.floating;
	const duration = props.duration ?? 250;

	const isNumberDuration = typeof duration === 'number';
	const closeDuration = (isNumberDuration ? duration : duration.close) || 0;
	const [status, setStatus] = useState('unmounted', subSlot(slot, 'status'));
	const isMounted = useDelayUnmount(open, closeDuration, subSlot(slot, 'unmount'));
	if (!isMounted && status === 'close') {
		setStatus('unmounted');
	}

	useModernLayoutEffect(
		() => {
			if (!floating) return;
			if (open) {
				setStatus('initial');
				const frame = requestAnimationFrame(() => {
					// Ensure it opens before paint — with `FloatingDelayGroup`, this avoids
					// a flicker when moving between floating elements.
					flushSync(() => {
						setStatus('open');
					});
				});
				return () => {
					cancelAnimationFrame(frame);
				};
			}
			setStatus('close');
		},
		[open, floating],
		subSlot(slot, 'eff'),
	);

	return { isMounted, status };
}

export function useTransitionStyles(...args: any[]): any {
	const [user, slot] = splitSlot(args);
	const context = user[0];
	const props = (user[1] as any) ?? {};

	const unstableInitial = props.initial ?? { opacity: 0 };
	const unstableOpen = props.open;
	const unstableClose = props.close;
	const unstableCommon = props.common;
	const duration = props.duration ?? 250;

	const placement = context.placement;
	const side = placement.split('-')[0];
	const fnArgs = useMemo(() => ({ side, placement }), [side, placement], subSlot(slot, 'args'));
	const isNumberDuration = typeof duration === 'number';
	const openDuration = (isNumberDuration ? duration : duration.open) || 0;
	const closeDuration = (isNumberDuration ? duration : duration.close) || 0;

	const [styles, setStyles] = useState(
		() => ({
			...execWithArgsOrReturn(unstableCommon, fnArgs),
			...execWithArgsOrReturn(unstableInitial, fnArgs),
		}),
		subSlot(slot, 'styles'),
	);
	const { isMounted, status } = useTransitionStatus(context, { duration }, subSlot(slot, 'status'));
	const initialRef = useLatestRef(unstableInitial, subSlot(slot, 'initialRef'));
	const openRef = useLatestRef(unstableOpen, subSlot(slot, 'openRef'));
	const closeRef = useLatestRef(unstableClose, subSlot(slot, 'closeRef'));
	const commonRef = useLatestRef(unstableCommon, subSlot(slot, 'commonRef'));

	useModernLayoutEffect(
		() => {
			const initialStyles = execWithArgsOrReturn(initialRef.current, fnArgs);
			const closeStyles = execWithArgsOrReturn(closeRef.current, fnArgs);
			const commonStyles = execWithArgsOrReturn(commonRef.current, fnArgs);
			const openStyles =
				execWithArgsOrReturn(openRef.current, fnArgs) ||
				Object.keys(initialStyles).reduce((acc: any, key) => {
					acc[key] = '';
					return acc;
				}, {});
			if (status === 'initial') {
				setStyles((s: any) => ({
					transitionProperty: s.transitionProperty,
					...commonStyles,
					...initialStyles,
				}));
			}
			if (status === 'open') {
				setStyles({
					transitionProperty: Object.keys(openStyles).map(camelCaseToKebabCase).join(','),
					transitionDuration: openDuration + 'ms',
					...commonStyles,
					...openStyles,
				});
			}
			if (status === 'close') {
				const s = closeStyles || initialStyles;
				setStyles({
					transitionProperty: Object.keys(s).map(camelCaseToKebabCase).join(','),
					transitionDuration: closeDuration + 'ms',
					...commonStyles,
					...s,
				});
			}
		},
		[closeDuration, closeRef, initialRef, openRef, commonRef, openDuration, status, fnArgs],
		subSlot(slot, 'eff'),
	);

	return { isMounted, styles };
}
