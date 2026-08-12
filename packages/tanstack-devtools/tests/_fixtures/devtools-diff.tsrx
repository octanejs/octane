import { TanStackDevtools } from '@octanejs/tanstack-devtools';

export function DevtoolsParity() {
	return <TanStackDevtools
		plugins={[{
			id: 'parity-plugin',
			name: <strong>Plugin title</strong>,
			render: (_element, props) => <output>{'theme:' + props.theme}</output>,
		}]}
		config={{ customTrigger: <button>Open tools</button> }}
	/>;
}
