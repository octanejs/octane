import type { UniversalComponent } from 'octane/universal/native';
import type { LynxFirstScreenRenderResult } from '../main-renderer.js';

/** Main-thread root contract installed by the generated receiver entry. */
export interface LynxFirstScreenHost {
	/** Null means the background owns the page without adopting a synchronous tree. */
	render<Props>(
		component: UniversalComponent<Props>,
		props: Props,
	): LynxFirstScreenRenderResult | null;
	markSyncReady(): void;
	unmount(): void;
}

let installedHost: LynxFirstScreenHost | null = null;

export function installLynxFirstScreenHost(host: LynxFirstScreenHost): () => void {
	if (installedHost !== null) {
		throw new Error('A Lynx first-screen host is already installed for this entry.');
	}
	installedHost = host;
	let active = true;
	return () => {
		if (!active) return;
		active = false;
		if (installedHost === host) installedHost = null;
	};
}

export function currentLynxFirstScreenHost(): LynxFirstScreenHost | null {
	return installedHost;
}

export function requireLynxFirstScreenHost(): LynxFirstScreenHost {
	if (installedHost === null) {
		throw new Error(
			'Lynx first-screen root rendered before the generated main-thread receiver was installed.',
		);
	}
	return installedHost;
}
