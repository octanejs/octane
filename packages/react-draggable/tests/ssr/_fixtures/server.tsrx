import Draggable, { DraggableCore } from '@octanejs/react-draggable';

const htmlRef = { current: null as HTMLDivElement | null };
const svgRef = { current: null as SVGSVGElement | null };
const coreRef = { current: null as HTMLButtonElement | null };

export function ServerFixture() @{
	<main id="draggable-server">
		<Draggable nodeRef={htmlRef} defaultPosition={{ x: 3, y: 4 }}>
			<div ref={htmlRef} id="html-drag" class="authored">html</div>
		</Draggable>
		<Draggable
			nodeRef={svgRef as unknown as { current: HTMLElement | null }}
			defaultPosition={{ x: 5, y: 6 }}
		>
			<svg ref={svgRef} id="svg-drag">
				<circle cx="2" cy="2" r="2" />
			</svg>
		</Draggable>
		<DraggableCore nodeRef={coreRef}>
			<button ref={coreRef} id="core-drag">core</button>
		</DraggableCore>
	</main>
}
