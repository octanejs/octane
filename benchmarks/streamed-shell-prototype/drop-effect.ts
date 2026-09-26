import './style.css';
import { __hydrateVoidRoot } from 'octane';
import { clone, componentSlotVoid, type Scope } from 'octane/internal/client';
import { LiveCounter } from './LiveCounter.tsrx';

// Deliberately wrong control: deleting the shell import without retaining its
// independent module effect changes observable client behavior.
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
