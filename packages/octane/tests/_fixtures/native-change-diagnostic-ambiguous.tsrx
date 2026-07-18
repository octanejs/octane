// Production-size sentinel for every path that needs the development runtime
// fallback. The benchmark compiles this exact source with dev:false; diagnostic
// metadata/checks must disappear while the hosts and native events still ship.
import { createElement } from 'octane';

export function AmbiguousNativeChangeHosts(props) @{
	<section>
		<input id="dynamic-spread" type={props.type} {...props.fieldProps} />
		{createElement('input', {
			id: 'direct-host',
			type: props.directType,
			...props.directProps,
		})}
	</section>
}
