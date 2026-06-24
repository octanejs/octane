import { useState, createPortal } from 'octane-ts';

// Nested portals: app-root > portal into targetA (div.p1) > portal into targetB
// (button.deep). A click on the deepest button must bubble through BOTH logical
// parents in order — button -> div.p1 (the host of the inner portal) -> app-root
// (the host of the outer portal) — even though, in the real DOM, the button
// lives in targetB and div.p1 lives in targetA, neither of which is a DOM
// ancestor of app-root. Functional setState updaters accumulate so every handler
// on the logical path is observable in one click.
export function NestedPortals(props) @{
	const [trail, setTrail] = useState('');

	<div class="app-root" onClick={() => setTrail((t) => t + 'root,')}>
		<span class="trail">{trail as string}</span>
		{createPortal(
			() => @{
				<div
					class="p1"
					onClick={(e) => {
						if (props.stopAtMid) e.stopPropagation();
						setTrail((t) => t + 'mid,');
					}}
				>
					{createPortal(
						() => @{
							<button class="deep" onClick={() => setTrail((t) => t + 'btn,')}>
								{'deep'}
							</button>
						},
						props.targetB,
					)}
				</div>
			},
			props.targetA,
		)}
	</div>
}
