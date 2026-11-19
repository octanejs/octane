import { memo, use, useContext, useLayoutEffect } from 'octane';
import { bindRendererRegionOwner } from 'octane/internal/client';
import { UniversalTheme } from './universal-boundary.tsrx';

function ReverseThemeLabelBody() @{
	const theme = useContext(UniversalTheme);
	<span class="reverse-theme">{theme as string}</span>
}

const ReverseThemeLabel = memo(ReverseThemeLabelBody);

export function ReverseOwnerDom(props) @{
	bindRendererRegionOwner(props);
	useLayoutEffect(() => {
		props.log('dom-layout');
		return () => {
			props.log('dom-cleanup');
			if (props.throwCleanup) throw new Error('reverse dom cleanup failed');
		};
	}, [props.version]);
	if (props.error) throw new Error('reverse dom failed');
	if (props.thenable) use(props.thenable);
	<section class="reverse-owner">
		<ReverseThemeLabel />
		<div ref={props.hostRef} />
	</section>
}
