'use strong';

import { unbound } from 'octane/behavior';
import { createReactCompatHost } from 'octane/react';
import type { ComponentProps } from 'react';

function Host(props: ComponentProps<'div'> & { 'data-open'?: boolean }) @{
	'use dom bindings';
	<div class={props.className} data-open={props['data-open']} style={props.style}>
		{unbound(props.children)}
	</div>
}

export const Frame = createReactCompatHost(Host);
