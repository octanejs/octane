import { createElement, useImperativeHandle, useState } from 'octane';

interface RowProps {
	ariaAttributes: {
		'aria-posinset': number;
		'aria-setsize': number;
		role: 'listitem';
	};
	index: number;
	label: string;
	style: Record<string, string | number | undefined>;
}

interface BoundaryApi {
	element: HTMLDivElement | null;
}

export const boundaryEvents: { refValues: Array<string | null> } = { refValues: [] };

export function resetBoundaryEvents() {
	boundaryEvents.refValues.length = 0;
}

function captureRef(value: BoundaryApi | null) {
	if (value === null) {
		boundaryEvents.refValues.push(null);
	} else if (value.element !== null) {
		boundaryEvents.refValues.push(value.element.dataset.list ?? null);
	}
}

function DynamicRow({ ariaAttributes, index, label, style }: RowProps) @{
	const [count, setCount] = useState(0);
	<button
		{...ariaAttributes}
		data-row={`${label}-${index}`}
		onClick={() => setCount((value) => value + 1)}
		style={style}
	>{`${label}:${index}:${count}`}</button>
}

function ListBoundary({ label }: { label: string }) @{
	const [element, setElement] = useState<HTMLDivElement | null>(null);
	useImperativeHandle(captureRef, () => ({ element }), [element]);

	const row = createElement(DynamicRow, {
		key: `${label}-0`,
		ariaAttributes: {
			'aria-posinset': 1,
			'aria-setsize': 1,
			role: 'listitem',
		},
		index: 0,
		label,
		style: {
			height: 20,
			position: 'absolute',
			transform: 'translateY(0px)',
			width: '100%',
		},
	});

	<div data-list={label} ref={setElement} role="list">{row}</div>
}

export function BoundaryFixture() @{
	<section>
		<ListBoundary label="left" />
		<ListBoundary label="right" />
	</section>
}
