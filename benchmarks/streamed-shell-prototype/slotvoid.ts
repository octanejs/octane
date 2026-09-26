import './style.css';
import { hydrateRoot } from 'octane';
import { clone, componentSlotVoid, type Scope } from 'octane/internal/client';
import { LiveCounter } from './LiveCounter.tsrx';
import './shell-side-effect.ts';

// Isolate the compiler-only void child-slot specialization.
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
		false,
		false,
		false,
		childSite,
	);
}

hydrateRoot(document.getElementById('root')!, ShellSurrogate, { name: 'Ada' });
document.documentElement.dataset.shellReady = 'true';
