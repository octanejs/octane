import Draggable, { type DraggableProps } from '@octanejs/react-draggable';

export function DraggableHarness(props: DraggableProps & {
	nodeRef: { current: HTMLDivElement | null };
	childMouseDown?: (event: MouseEvent) => void;
}) @{
	<Draggable {...props}>
		<div
			ref={props.nodeRef}
			class="child"
			style={{ color: 'red' }}
			data-kept="yes"
			onMouseDown={props.childMouseDown}
		>
			drag
		</div>
	</Draggable>
}

export function SvgDraggableHarness(props: DraggableProps & {
	nodeRef: { current: SVGSVGElement | null };
}) @{
	<Draggable {...props} nodeRef={props.nodeRef as unknown as { current: HTMLElement | null }}>
		<svg ref={props.nodeRef} data-svg="yes" style={{ fill: 'red' }}>
			<circle cx="2" cy="2" r="2" />
		</svg>
	</Draggable>
}

export function BareDraggableHarness(props: DraggableProps) @{
	<Draggable {...props}>
		<div class="bare">drag</div>
	</Draggable>
}

export function ChildRefDraggableHarness(props: DraggableProps & {
	nodeRef: { current: HTMLDivElement | null };
	childRef: | { current: HTMLDivElement | null }
	| ((value: HTMLDivElement | null) => void | (() => void))
	| ReadonlyArray<
			{ current: HTMLDivElement | null } | ((value: HTMLDivElement | null) => void | (() => void))
	  >;
}) @{
	<Draggable {...props}>
		<div ref={props.childRef} class="child" data-kept="yes">
			drag
		</div>
	</Draggable>
}
