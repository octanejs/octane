import { createElement, useState } from 'octane';

import { useFocus } from '../../src/interactions/useFocus';
import { useFocusWithin } from '../../src/interactions/useFocusWithin';
import { useFocusVisible } from '../../src/interactions/useFocusVisible';
import { Focusable } from '../../src/interactions/useFocusable';
import { useHover } from '../../src/interactions/useHover';
import { useKeyboard } from '../../src/interactions/useKeyboard';

// useFocus: immediate-target focus/blur callbacks, surfaced as data-* attributes.
export function FocusProbe() {
	const [last, setLast] = useState('none');
	const [focused, setFocused] = useState(false);
	const { focusProps } = useFocus({
		onFocus: (e: FocusEvent) => setLast('focus:' + (e.target as HTMLElement).id),
		onBlur: (e: FocusEvent) => setLast('blur:' + (e.target as HTMLElement).id),
		onFocusChange: setFocused,
	});
	return (
		<button
			id="focus-target"
			{...(focusProps as any)}
			data-last={last}
			data-focused={String(focused)}
		>
			{'focusable'}
		</button>
	);
}

// useFocusWithin: focusing a descendant sets focus-within; moving focus outside clears it.
export function FocusWithinProbe() {
	const [within, setWithin] = useState(false);
	const { focusWithinProps } = useFocusWithin({ onFocusWithinChange: setWithin });
	return (
		<div>
			<div {...(focusWithinProps as any)} data-testid="within" data-within={String(within)}>
				<input id="inner-input" />
			</div>
			<button id="outside-btn">{'outside'}</button>
		</div>
	);
}

// useKeyboard: the wrapped event surface + stop-propagation-by-default. The parent div's
// plain onKeyDown must not fire unless the child handler calls continuePropagation().
export function KeyboardProbe(props: { continuePropagation?: boolean }) {
	const [parentCount, setParentCount] = useState(0);
	const [info, setInfo] = useState('none');
	const { keyboardProps } = useKeyboard({
		onKeyDown: (e) => {
			if (props.continuePropagation) {
				e.continuePropagation();
			}
			const wrapped = typeof e.continuePropagation === 'function' ? 'wrapped' : 'plain';
			const self = e.currentTarget === e.target ? 'self' : 'other';
			setInfo(e.key + ':' + wrapped + ':' + self);
		},
	});
	return (
		<div
			data-testid="kb-parent"
			data-parent={String(parentCount)}
			onKeyDown={() => setParentCount((c: number) => c + 1)}
		>
			<button id="kb-btn" {...(keyboardProps as any)} data-info={info}>
				{'kb'}
			</button>
		</div>
	);
}

// useHover: pointer enter/leave toggles isHovered (octane delegates enter/leave
// capture-phase and invokes target-only, so non-bubbling native events reach the handler).
export function HoverProbe() {
	const [changed, setChanged] = useState(false);
	const [last, setLast] = useState('none');
	const { hoverProps, isHovered } = useHover({
		onHoverStart: (e) => setLast('start:' + e.pointerType),
		onHoverEnd: (e) => setLast('end:' + e.pointerType),
		onHoverChange: setChanged,
	});
	return (
		<div
			id="hover-target"
			{...(hoverProps as any)}
			data-hovered={String(isHovered)}
			data-change={String(changed)}
			data-last={last}
		>
			{'hover me'}
		</div>
	);
}

// useFocusVisible: global modality — keyboard interaction shows the focus ring,
// pointer interaction hides it.
export function FocusVisibleProbe() {
	const { isFocusVisible } = useFocusVisible();
	return <output data-testid="fv" data-focus-visible={String(isFocusVisible)} />;
}

// Focusable: merges focusableProps (tabIndex, focus/keyboard handlers) onto its single
// element child. The child is passed via createElement — in compiled fixtures,
// children-position JSX is a render function, not a descriptor.
export function FocusableSpan() {
	const [focused, setFocused] = useState(false);
	return createElement(
		Focusable as any,
		{ onFocus: () => setFocused(true) },
		createElement(
			'span',
			{ id: 'focusable-span', role: 'button', 'data-focused': String(focused) },
			'act',
		),
	);
}
