/** @jsxImportSource @octanejs/three/intrinsics */
import { addAfterEffect, addEffect } from '@octanejs/three';
import { useEffect, useLayoutEffect, useState } from '@octanejs/three/renderer';
import StatsImpl from 'stats.js';

export type StatsProps = {
	showPanel?: number;
	className?: string;
	parent?: { current: HTMLElement | null };
};

export function Stats({ showPanel = 0, className, parent }: StatsProps) @{
	const [stats, setStats] = useState<StatsImpl | null>(null);
	useLayoutEffect(() => {
		setStats(new StatsImpl());
	}, []);
	useEffect(() => {
		if (stats) {
			const node = (parent && parent.current) || document.body;
			stats.showPanel(showPanel);
			node?.appendChild(stats.dom);
			const classNames = (className ?? '').split(' ').filter((value) => value);
			if (classNames.length) stats.dom.classList.add(...classNames);
			const begin = addEffect(() => stats.begin());
			const end = addAfterEffect(() => stats.end());
			return () => {
				if (classNames.length) stats.dom.classList.remove(...classNames);
				node?.removeChild(stats.dom);
				begin();
				end();
			};
		}
	}, [parent, stats, className, showPanel]);
	null;
}
