import { useLayoutEffect, useState } from 'octane';
import type { WidthTarget } from './measurement.tsrx';

export function EffectResize(props: WidthTarget & { immediate: boolean }) @{
	const [width, setWidth] = useState(140);
	useLayoutEffect(() => {
		if (props.immediate) {
			props.target.current!.style.width = '260px';
		} else {
			setWidth(260);
		}
	}, []);
	<div ref={props.target} data-width={width}></div>
}
