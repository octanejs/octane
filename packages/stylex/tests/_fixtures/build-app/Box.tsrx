import * as stylex from '@octanejs/stylex';
import { props as styleProps } from '@octanejs/stylex';

const styles = stylex.create({
	box: { padding: 16, color: 'tomato' },
	compact: { padding: 8, paddingLeft: null, color: 'navy' },
	width: (width: number | null) => ({ width }),
});

export function Box(props: { compact: boolean; width: number | null }) @{
	'use dom bindings';
	const selected = props.compact ? styles.compact : styles.box;
	<div {...styleProps(selected, styles.width(props.width))}>{'box'}</div>
}
