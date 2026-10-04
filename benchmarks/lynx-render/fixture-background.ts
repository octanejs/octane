// Background-thread graph of the lynx-render fixture, measured for bytes only.
import { createLynxRoot } from '@octanejs/lynx';
import { BenchApp, type BenchRow } from './src/App.lynx.tsrx';

export function start(rows: readonly BenchRow[]): Promise<void> {
	return createLynxRoot().render(BenchApp, { rows });
}
