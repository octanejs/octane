import './style.css';
import { __hydrateVoidRoot } from 'octane';
import { clone, componentSlotVoid, type Scope } from 'octane/internal/client';
import { LiveCounter } from './LiveCounter.tsrx';
import './shell-side-effect.ts';

// A stand-in for compiler output after proving a void root and child. It is
// still limited to this exact existing SSR shape and its original site identity.
const childSite = 'c:eb9fef35';
function ShellSurrogate(_props: { name: string }, scope: Scope) {
	const shell = clone(scope.block.parentNode.firstChild!) as Element;
	const slot = shell.querySelector('[data-live-slot]')!;
	componentSlotVoid(
		scope,
		1,
		slot,
		LiveCounter,
		{},
		slot.firstChild,
		undefined,
		2,
		false,
		false,
		childSite,
	);
}

__hydrateVoidRoot(document.getElementById('root')!, ShellSurrogate, { name: 'Ada' });
document.documentElement.dataset.shellReady = 'true';
