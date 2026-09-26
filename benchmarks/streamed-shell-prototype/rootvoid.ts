import './style.css';
import { __hydrateVoidRoot } from 'octane';
import { clone, componentSlot, type Scope } from 'octane/internal/client';
import { LiveCounter } from './LiveCounter.tsrx';
import './shell-side-effect.ts';

// Isolate the root specialization the compiler proves for the baseline.
const childSite = 'c:eb9fef35';
function ShellSurrogate(_props: { name: string }, scope: Scope) {
	const shell = clone(scope.block.parentNode.firstChild!) as Element;
	const slot = shell.querySelector('[data-live-slot]')!;
	componentSlot(
		scope,
		1,
		slot,
		LiveCounter,
		{},
		slot.firstChild,
		undefined,
		false,
		false,
		false,
		childSite,
	);
}

__hydrateVoidRoot(document.getElementById('root')!, ShellSurrogate, { name: 'Ada' });
document.documentElement.dataset.shellReady = 'true';
