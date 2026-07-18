import { createElement, useRef, useState } from 'octane';

import { FocusScope, useFocusManager } from '../../src/focus/FocusScope';
import { FocusRing } from '../../src/focus/FocusRing';
import { useFocusRing } from '../../src/focus/useFocusRing';
import { useHasTabbableChild } from '../../src/focus/useHasTabbableChild';

// FocusScope containment: Tab/Shift+Tab wrap within the scope. jsdom performs no
// native Tab traversal — FocusScope's own document keydown handler moves focus.
export function ContainScope() {
	return (
		<div>
			<button id="outside">outside</button>
			<FocusScope contain>
				<button id="c1">one</button>
				<input id="c2" />
				<button id="c3">three</button>
			</FocusScope>
		</div>
	);
}

// restoreFocus + autoFocus: opening the scope moves focus to its first focusable;
// closing it restores focus to the element focused before it mounted.
export function RestoreScope() {
	const [open, setOpen] = useState(false);
	return (
		<div>
			<button id="trigger" onClick={() => setOpen(!open)}>
				toggle
			</button>
			{open ? (
				<FocusScope restoreFocus autoFocus>
					<button id="dialog-btn">inside</button>
				</FocusScope>
			) : null}
		</div>
	);
}

// autoFocus on mount: the walker skips non-focusable content and lands on the
// first focusable element in the scope.
export function AutoFocusScope() {
	return (
		<FocusScope autoFocus>
			<div>{'not focusable'}</div>
			<button id="af-btn">first focusable</button>
		</FocusScope>
	);
}

// useFocusManager from a child of the scope: arrow keys move focus forward/back
// with wrapping.
function ManagedItem(props: { id: string }) {
	const focusManager = useFocusManager();
	return (
		<button
			id={props.id}
			onKeyDown={(e: KeyboardEvent) => {
				if (e.key === 'ArrowRight') {
					focusManager!.focusNext({ wrap: true });
				} else if (e.key === 'ArrowLeft') {
					focusManager!.focusPrevious({ wrap: true });
				}
			}}
		>
			{props.id}
		</button>
	);
}

export function ManagedScope() {
	return (
		<FocusScope>
			<ManagedItem id="m1" />
			<ManagedItem id="m2" />
			<ManagedItem id="m3" />
		</FocusScope>
	);
}

// The focusable tree walker must skip disabled, hidden (attribute and display:none),
// tabIndex=-1, and input[type=hidden] elements — observed through Tab containment.
export function WalkerScope() {
	return (
		<FocusScope contain>
			<button id="w1">one</button>
			<button disabled>disabled</button>
			<button hidden>hidden-attr</button>
			<button style={{ display: 'none' }}>display-none</button>
			<button tabIndex={-1}>negative</button>
			<input type="hidden" />
			<button id="w2">two</button>
		</FocusScope>
	);
}

// useFocusRing: keyboard-modality focus shows the ring; pointer-modality focus
// does not — surfaced as data-* attributes.
export function FocusRingProbe() {
	const { isFocused, isFocusVisible, focusProps } = useFocusRing();
	return (
		<button
			id="ring-btn"
			{...(focusProps as any)}
			data-focused={String(isFocused)}
			data-focus-visible={String(isFocusVisible)}
		>
			{'ring'}
		</button>
	);
}

// FocusRing re-projects its element child with focus classes. The child is passed
// via createElement — in compiled fixtures, children-position JSX is a render
// function, not a descriptor.
export function FocusRingButton() {
	return createElement(
		FocusRing as any,
		{ focusClass: 'is-focused', focusRingClass: 'focus-ring' },
		createElement('button', { id: 'fr-btn' }, 'go'),
	);
}

// useHasTabbableChild: reports whether the observed container currently has a
// tabbable child, updating as children change.
export function TabbableChildProbe(props: { mode: string; isDisabled?: boolean }) {
	const ref = useRef<HTMLDivElement | null>(null);
	const hasTabbableChild = useHasTabbableChild(ref as any, { isDisabled: props.isDisabled });
	return (
		<div>
			<output data-testid="htc" data-has={String(hasTabbableChild)} />
			<div ref={ref}>
				{props.mode === 'button' ? <button id="tc-btn">child</button> : null}
				{props.mode === 'disabled' ? <button disabled>child</button> : null}
				{props.mode === 'negative' ? <button tabIndex={-1}>child</button> : null}
			</div>
		</div>
	);
}
