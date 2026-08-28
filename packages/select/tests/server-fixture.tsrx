import { injectStyle } from 'octane';

import { createStyleCache } from './style-adapter.mjs';
import { resolveOctaneStyle } from './octane-style.mjs';

export type ServerStyleFixtureProps = {
	className?: string;
	color?: string;
};

export function ServerStyleFixture(props: ServerStyleFixtureProps = {}) @{
	const cache = createStyleCache({ key: 'rs' });
	const resolved = resolveOctaneStyle(
		cache,
		{
			boxSizing: 'border-box',
			color: props.color ?? 'hotpink',
			'&:hover': { color: 'rebeccapurple' },
		},
		props.className,
		{},
		injectStyle,
	);
	<div id="react-select-u1" className={resolved.className}>candidate</div>
}
