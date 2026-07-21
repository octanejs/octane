import { useDynamicPositioning } from '@octanejs/lexical/shared/useDynamicPositioning';

// Custom menuRenderFn body — the test's renderFn returns
// createPortal(CustomMenuBody, anchor, { itemProps, matchingString }).
export function CustomMenuBody(props) @{
	<div class="custom-menu" data-testid="custom-menu">
		{props.itemProps.options.map(
			(option, i) =>
				<button
					key={option.key}
					class={props.itemProps.selectedIndex === i ? 'active' : 'inactive'}
					onClick={() => props.itemProps.selectOptionAndCleanUp(option)}
				>{option.title as string}</button>,
		)}
		<span class="matching-string">{props.matchingString as string}</span>
	</div>
}

// Stub mirroring the upstream useDynamicPositioning regression test — the
// composer context is vi.mocked by the test. The explicit `undefined` keeps the
// compiler-injected trailing slot out of the optional onVisibilityChange
// position (the hook takes a POSITIONAL slot, not splitSlot).
export function DynamicPositioningProbe(props) {
	useDynamicPositioning(props.resolution, props.target, props.onReposition, undefined);
	return null;
}
