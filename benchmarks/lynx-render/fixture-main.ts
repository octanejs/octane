// Main-thread graph of the lynx-render fixture, measured for bytes only. It is
// the Rspeedy main entry's receiver plus the app's first-screen render.
import { root } from '@octanejs/lynx';
import { installLynxMainThread } from '@octanejs/lynx/main-thread';
import { BenchApp, type BenchRow } from './src/App.lynx.tsrx';

export function start(rows: readonly BenchRow[]): void {
	installLynxMainThread({ firstScreen: true, firstScreenSync: 'manual' });
	root.render(BenchApp, { rows });
}
