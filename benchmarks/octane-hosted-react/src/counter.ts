import * as React from 'react';

export interface Observation {
	layout: Map<number, string>;
	refs: Map<number, HTMLButtonElement>;
	passive: Set<number>;
	setups: number;
	cleanups: number;
	refSetups: number;
	refCleanups: number;
	changed(): void;
}

export interface CounterProps {
	index: number;
	label: string;
	observation: Observation;
}

/** The exact same real React component is used by both measured render paths. */
export function Counter({ index, label, observation }: CounterProps) {
	const [value, setValue] = React.useState(0);
	const ref = React.useCallback(
		(node: HTMLButtonElement | null) => {
			if (node === null) return;
			observation.refs.set(index, node);
			observation.refSetups++;
			observation.changed();
			return () => {
				observation.refs.delete(index);
				observation.refCleanups++;
				observation.changed();
			};
		},
		[index, observation],
	);
	React.useLayoutEffect(() => {
		observation.layout.set(index, `${label}:${value}`);
		observation.changed();
	}, [index, label, value, observation]);
	React.useEffect(() => {
		observation.passive.add(index);
		observation.setups++;
		observation.changed();
		return () => {
			observation.passive.delete(index);
			observation.cleanups++;
			observation.changed();
		};
	}, [index, observation]);
	return React.createElement(
		'button',
		{
			'data-counter': index,
			onClick: () => setValue((previous) => previous + 1),
			ref,
		},
		`${label}:${value}`,
	);
}
