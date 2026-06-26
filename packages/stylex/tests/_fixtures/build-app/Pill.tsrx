import * as stylex from '@octane-ts/stylex';

const styles = stylex.create({
	pill: { borderRadius: 999, backgroundColor: 'navy' },
});

export function Pill() @{
	<span {...stylex.props(styles.pill)}>{'pill'}</span>
}
