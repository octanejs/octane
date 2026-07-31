import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { OctaneCompat } from 'octane/react';
import { Web3HostContext } from '../../react-hosted/_fixtures/web3-host-context';
import { Web3Island } from '../../react-hosted/_fixtures/web3-island.tsrx';
import { readWeb3IslandObservation } from '../../react-hosted/_fixtures/web3-island-state';

const observationId = 'web3-browser';

function Host(props: { route: string; showIsland: boolean }) {
	return (
		<main id="react-shell" data-route={props.route}>
			<h1>React route: {props.route}</h1>
			<Web3HostContext value={props.route}>
				{props.showIsland ? (
					<OctaneCompat
						component={Web3Island}
						props={{
							label: 'Browser wallet controls',
							observationId,
						}}
					/>
				) : (
					<p id="react-fallback">React owns this route</p>
				)}
			</Web3HostContext>
		</main>
	);
}

const root = createRoot(document.getElementById('root')!);
root.render(<Host route="portfolio" showIsland />);

let originalShell: Element | null = null;
window.__web3ReactHost = {
	captureShell() {
		originalShell = document.querySelector('#react-shell');
	},
	navigate(route: string) {
		root.render(<Host route={route} showIsland />);
	},
	removeIsland(route: string) {
		root.render(<Host route={route} showIsland={false} />);
	},
	shellSurvived() {
		return document.querySelector('#react-shell') === originalShell;
	},
	observation() {
		return readWeb3IslandObservation(observationId);
	},
};

declare global {
	interface Window {
		__web3ReactHost: {
			captureShell(): void;
			navigate(route: string): void;
			removeIsland(route: string): void;
			shellSurvived(): boolean;
			observation(): { activeWatchers: number; cleanups: number };
		};
	}
}
