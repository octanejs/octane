// P3 structural-mismatch fixtures: branches whose ROOT TAG differs, so a server/client
// branch swap is a true structural divergence the hydration recovery detects + rebuilds.

export function Pick(props) @{
	<div id="pick">
		@switch (props.k) {
			@case 'a': {
				<em class="a">
					{'AAA' as string}
				</em>
			}
			@case 'b': {
				<strong class="b">
					{'BBB' as string}
				</strong>
			}
			@default: {
				<span class="d">
					{'???' as string}
				</span>
			}
		}
	</div>
}
