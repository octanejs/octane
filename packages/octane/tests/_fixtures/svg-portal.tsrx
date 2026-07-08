import { useState, useLayoutEffect, createPortal } from 'octane';

// A portal whose target is an SVG <g> captured by ref — the recharts
// ZIndexLayer pattern (children render "later" into an earlier <g>).
export function SvgPortalApp() @{
	const [target, setTarget] = useState(null);
	useLayoutEffect(() => {}, []);
	<svg width={100} height={100}>
		<g class="target" ref={setTarget}></g>
		@if (target) {
			<>
				{createPortal(
					<>
						<rect x={1} y={2} width={10} height={10} fill="#8884d8" />
						<g class="nested">
							<circle cx={5} cy={5} r={3} />
						</g>
					</>,
					target,
				)}
			</>
		}
	</svg>
}
