import { createRoot, ErrorBoundary, useState } from 'octane';

// Nothing here can suspend or hold a commit, so the bundle ships no render
// rollback: each render either commits or goes with its root's teardown.
let failing = '';

function Row(props: { id: string }) @{
	if (props.id === failing) throw new Error(`row ${props.id} failed`);
	<li>{props.id}</li>
}

function Rows(props: { initial: string[] }) @{
	const [ids, setIds] = useState(props.initial);
	<div>
		<button id="minimal-rows-clear" onClick={() => setIds([])}>
			{'clear'}
		</button>
		<button id="minimal-rows-fail" onClick={() => setIds(['a', 'c'])}>
			{'fail'}
		</button>
		<ul>
			@for (const id of ids; key id) {
				<Row id={id} />
			}
		</ul>
	</div>
}

function Guarded() @{
	const [label, setLabel] = useState('before');
	<div>
		<button id="minimal-guarded-fail" onClick={() => setLabel('after')}>
			{'fail'}
		</button>
		<span id="minimal-guarded-sibling">{label as string}</span>
		<ErrorBoundary
			fallback={(error) => <p id="minimal-guarded-caught">{(error as Error).message}</p>}
		>
			<Row id={label === 'after' ? 'caught' : 'kept'} />
		</ErrorBoundary>
	</div>
}

// No entry here can suspend, so a thrown wakeable is a render error.
function Waits() @{
	throw new Promise(() => {});
}

function WaitsGuarded() @{
	<ErrorBoundary
		fallback={(error) => (
			<p id="minimal-waits-caught">{error instanceof Promise ? 'wakeable' : 'error'}</p>
		)}
	>
		<Waits />
	</ErrorBoundary>
}

function Good() @{
	<p id="minimal-good">{'good'}</p>
}

function Broken() @{
	<Row id="mount" />
}

function click(container: HTMLElement, id: string) {
	(container.querySelector(`#${id}`) as HTMLButtonElement).click();
}

export async function run(container: HTMLElement) {
	const uncaught: string[] = [];
	const onUncaughtError = (error: unknown) => {
		uncaught.push((error as Error).message);
	};

	// A committed keyed list clears in an update.
	const rowsHost = container.appendChild(document.createElement('section'));
	const rows = createRoot(rowsHost, { onUncaughtError });
	rows.render(Rows, { initial: ['a', 'b', 'c'] });
	const mountedRows = rowsHost.querySelectorAll('li').length;
	click(rowsHost, 'minimal-rows-clear');
	await Promise.resolve();
	const clearedRows = rowsHost.querySelectorAll('li').length;
	rows.unmount();

	// An uncaught update error unmounts its whole root (React 19).
	const crashHost = container.appendChild(document.createElement('section'));
	const crash = createRoot(crashHost, { onUncaughtError });
	crash.render(Rows, { initial: ['a', 'b'] });
	failing = 'c';
	click(crashHost, 'minimal-rows-fail');
	await Promise.resolve();
	const crashedEmpty = crashHost.childNodes.length === 0;
	crash.unmount();

	// A boundary catches its content's update error; the rest of the render commits.
	const guardedHost = container.appendChild(document.createElement('section'));
	const guarded = createRoot(guardedHost, { onUncaughtError });
	guarded.render(Guarded);
	failing = 'caught';
	click(guardedHost, 'minimal-guarded-fail');
	await Promise.resolve();
	const caught = guardedHost.querySelector('#minimal-guarded-caught')?.textContent ?? null;
	const sibling = guardedHost.querySelector('#minimal-guarded-sibling')?.textContent ?? null;
	guarded.unmount();

	// A replacement that fails to mount takes the screen it replaced with it,
	// and the root still mounts a later render.
	const replacedHost = container.appendChild(document.createElement('section'));
	const replaced = createRoot(replacedHost, { onUncaughtError });
	replaced.render(Good);
	failing = 'mount';
	replaced.render(Broken);
	const replacedEmpty = replacedHost.childNodes.length === 0;
	failing = '';
	replaced.render(Good);
	const recovered = replacedHost.querySelector('#minimal-good')?.textContent ?? null;
	replaced.unmount();

	const waitsHost = container.appendChild(document.createElement('section'));
	const waits = createRoot(waitsHost, { onUncaughtError });
	waits.render(WaitsGuarded);
	const wakeable = waitsHost.querySelector('#minimal-waits-caught')?.textContent ?? null;
	waits.unmount();

	for (const host of [rowsHost, crashHost, guardedHost, replacedHost, waitsHost]) host.remove();
	return {
		mountedRows,
		clearedRows,
		crashedEmpty,
		caught,
		sibling,
		replacedEmpty,
		recovered,
		wakeable,
		uncaught,
		cleaned: container.childNodes.length === 0,
	};
}
