import * as stylex from '@octane-ts/stylex';

const styles = stylex.create({
	box: { padding: 16, color: 'tomato' },
});

export function Box() @{
	<div {...stylex.props(styles.box)}>{'box'}</div>
}
