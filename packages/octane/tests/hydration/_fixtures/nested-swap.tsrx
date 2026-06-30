// Edge-2 probe: two @if branches that share the SAME root tag + static attrs
// (`<section class="box">`) but differ only in their nested STATIC markup. The root-level
// check matches; the recursive static-structure check is what catches the nested divergence.

export function NestedStatic(props) @{
	<div id="ns">
		@if (props.x) {
			<section class="box">
				<span class="s1">one</span>
			</section>
		} @else {
			<section class="box">
				<p class="p1">two</p>
			</section>
		}
	</div>
}
