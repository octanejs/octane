// Memo + lite lowering: the child callsite inside @if compiles to a
// componentSlotLite call wrapped in the compiler memo guard — the cache adds
// no mount boundaries (no comp markers, no Block). Equal props skip the call;
// a changed dep re-runs through the same lite slot.

export function MemoLiteLeaf(props) @{
	<span class="mll-leaf">{props.label as string}</span>
}

export function MemoLiteApp(props) @{
	<section>
		<span class="mll-tick">{props.tick as string}</span>
		@if (props.show) {
			<div class="mll-arm">
				<MemoLiteLeaf label={props.label} />
			</div>
		}
	</section>
}
