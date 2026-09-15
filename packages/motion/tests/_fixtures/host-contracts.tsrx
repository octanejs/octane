import { motion, useTransform } from '@octanejs/motion';
import { useLayoutEffect } from 'octane';

export function HostContractBox(props) @{
	useLayoutEffect(() => props.onLayout?.(), []);
	<motion.div id="box" ref={props.ref} style={props.style} onClick={props.onClick}>
		<span>{String(props.text ?? 'child')}</span>
	</motion.div>
}

export function SvgContractBox(props) @{
	<motion.svg id="svg" viewBox="0 0 20 20" ref={props.ref}>
		<motion.rect x={1} y={2} width={10} height={10} />
	</motion.svg>
}

export function LogicalStyleBox(props) @{
	const value = useTransform(props.value, (current: number) => current * 2);
	<motion.div
		id="box"
		style={{ paddingBlock: value, marginInline: value, inset: value, insetInlineStart: value }}
	/>
}
