import * as React from 'react';
import { renderToString } from 'react-dom/server';
import { OctaneCompat } from 'octane/react/server';
import { Web3HostContext } from './web3-host-context';
import { Web3Island } from './web3-island.tsrx';

export function renderWeb3ReactPage(props: {
	label: string;
	observationId: string;
	rejectFirstConnection?: boolean;
	route: string;
}): string {
	return renderToString(
		React.createElement(
			'main',
			{ 'data-react-shell': props.route },
			React.createElement('h1', { id: 'react-route' }, `React route: ${props.route}`),
			React.createElement(
				Web3HostContext,
				{ value: props.route },
				React.createElement(OctaneCompat, {
					component: Web3Island,
					props: {
						label: props.label,
						observationId: props.observationId,
						rejectFirstConnection: props.rejectFirstConnection,
					},
				} as never),
			),
		),
	);
}
