import { OverlayArrow, OverlayArrowContext } from '../../src/components/OverlayArrow';
import {
	SelectionIndicator,
	SelectionIndicatorContext,
} from '../../src/components/SelectionIndicator';
import {
	SharedElement,
	SharedElementTransition,
} from '../../src/components/SharedElementTransition';
import { Provider } from '../../src/components/utils';

// NOTE: tsrx preserves authored JSX text verbatim (no React-style whitespace
// collapsing), so text children are passed via the children prop to stay exact.

// ---------------------------------------------------------------------------
// OverlayArrow: placement comes from OverlayArrowContext (default 'bottom');
// it drives data-placement, the positioning style, and the render-prop values.
// ---------------------------------------------------------------------------

export function ArrowDefault() {
	return <OverlayArrow data-testid="arrow" children="▲" />;
}

export function ArrowFromContext(props: { placement: any }) {
	return (
		<Provider values={[[OverlayArrowContext, { placement: props.placement }]] as any}>
			<OverlayArrow
				data-testid="arrow"
				className={(v: any) => 'arrow-' + String(v.placement)}
				id="arrow-id"
				aria-label="arrow"
				children="▲"
			/>
		</Provider>
	);
}

// A style function returning undefined values: OverlayArrow strips them so the
// spread-merge cannot clobber its own positioning styles.
export function ArrowStyleFunction() {
	return (
		<OverlayArrow
			data-testid="arrow"
			style={() => ({ position: undefined, background: 'rgb(255, 0, 0)' })}
			children="▲"
		/>
	);
}

// ---------------------------------------------------------------------------
// SelectionIndicator: renders a SharedElement named "SelectionIndicator" whose
// visibility follows isSelected (context default: not selected → hidden).
// ---------------------------------------------------------------------------

export function IndicatorStates() {
	return (
		<SharedElementTransition>
			<SelectionIndicator data-testid="sel-on" isSelected children="on" />
			<SelectionIndicator data-testid="sel-off" children="off" />
		</SharedElementTransition>
	);
}

export function IndicatorFromContext() {
	return (
		<SharedElementTransition>
			<Provider
				values={[[SelectionIndicatorContext, { isSelected: true, 'data-from-ctx': 'yes' }]] as any}
			>
				<SelectionIndicator data-testid="sel-ctx" children="ctx" />
			</Provider>
		</SharedElementTransition>
	);
}

// ---------------------------------------------------------------------------
// SharedElementTransition / SharedElement lifecycle.
// ---------------------------------------------------------------------------

// SharedElement requires a SharedElementTransition scope.
export function SharedNoScope() {
	return <SharedElement name="orphan" children="x" />;
}

// Enter/exit lifecycle for a single element toggled via isVisible.
export function SharedToggle(props: { visible: boolean }) {
	return (
		<SharedElementTransition>
			<div data-testid="host">
				<SharedElement
					name="item"
					data-testid="shared"
					isVisible={props.visible}
					className={(v: any) =>
						'se' + (v.isEntering ? ' is-entering' : '') + (v.isExiting ? ' is-exiting' : '')
					}
					children="one"
				/>
			</div>
		</SharedElementTransition>
	);
}

// Two same-name SharedElements in different parents: toggling which one is
// visible hands the element off (the old instance unmounts, the new one shows
// immediately without re-entering).
export function SharedHandoff(props: { active: string }) {
	return (
		<SharedElementTransition>
			<div data-testid="pa">
				<SharedElement name="pill" data-testid="a" isVisible={props.active === 'a'} children="A" />
			</div>
			<div data-testid="pb">
				<SharedElement name="pill" data-testid="b" isVisible={props.active === 'b'} children="B" />
			</div>
		</SharedElementTransition>
	);
}
