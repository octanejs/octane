import * as React from 'react';
import { flushSync } from 'react-dom';
import { ReactCompatDocument } from 'octane/react';
import { Button, Field, Frame, Icon, Link, Navigation, Stroke } from './Frame.tsrx';

type State = 'open' | 'closed' | 'blocked' | 'hidden' | 'revealed';
const data = Promise.withResolvers<string>();
const blocker = new Promise<never>(() => {});
const output = Promise.withResolvers<HTMLOutputElement | null>();
const refs: string[] = [];
const measurements: [string, number, string][] = [];
const attempted = Promise.withResolvers<void>();
let update: React.Dispatch<React.SetStateAction<State>>;

function ref(node: HTMLElement | null) {
	refs.push(node === document.getElementById('frame') ? 'attached' : 'unexpected');
	return () => {
		refs.push('cleanup');
	};
}

function Editor({ state }: { state: State }) {
	const input = React.useRef<HTMLInputElement>(null);
	React.useLayoutEffect(() => {
		const frame = input.current!.parentElement!;
		measurements.push([frame.id, frame.offsetWidth, getComputedStyle(frame).display]);
	}, []);
	if (state === 'blocked') {
		attempted.resolve();
		React.use(blocker);
	}
	return <input aria-label="Draft" ref={input} />;
}

function Result({ promise }: { promise: Promise<string> }) {
	return <output ref={output.resolve}>{React.use(promise)}</output>;
}

const IsOpen = React.createContext(false);

function Controls({ toggle }: { toggle: () => void }) {
	const open = React.use(IsOpen);
	const button = React.useRef<HTMLButtonElement>(null);
	return (
		<>
			<Button type="button" aria-pressed={open} onClick={toggle} ref={button}>
				Toggle
			</Button>
			<Link href="#frame" aria-current={open}>
				Section
			</Link>
			<Icon className="icon" viewBox="0 0 10 10" width={10} height={10}>
				<Link href="#frame" aria-current={open} aria-label="Section icon">
					<Stroke d="M1 1h8" className={open ? 'active' : undefined} />
				</Link>
			</Icon>
			<Field
				type="checkbox"
				aria-label="Expanded"
				checked={open}
				onChange={() => {
					toggle();
					button.current!.focus();
				}}
			/>
		</>
	);
}

function App({ promise }: { promise: Promise<string> }) {
	const [state, setState] = React.useState<State>('open');
	React.useLayoutEffect(() => {
		update = setState;
	}, []);
	const open = state === 'open';
	const toggle = () => setState(open ? 'closed' : 'open');
	const revealed = state === 'revealed';
	const style = revealed
		? { width: 240, display: 'grid' }
		: { width: 160, display: state === 'hidden' ? 'inline-flex' : 'flex' };
	return (
		<html>
			<body>
				<React.Activity mode={state === 'hidden' ? 'hidden' : 'visible'}>
					<IsOpen value={open}>
						<Navigation
							id="frame"
							ref={ref}
							suppressHydrationWarning
							input={{ state, style }}
							aria-label="Navigation"
							onKeyDown={(event) => {
								if (event.key === 'Escape') toggle();
							}}
						>
							<Editor state={state} />
							<Controls toggle={toggle} />
							<React.Suspense fallback={<p>Loading</p>}>
								<Result promise={promise} />
							</React.Suspense>
						</Navigation>
					</IsOpen>
				</React.Activity>
				<React.Activity mode={revealed ? 'visible' : 'hidden'}>
					<Frame id="preloaded" style={style}>
						<Editor state="open" />
					</Frame>
				</React.Activity>
			</body>
		</html>
	);
}

export const tree = (promise: Promise<string>) => <App promise={promise} />;

export function hydrate() {
	const frame = document.querySelector<HTMLElement>('#frame')!;
	const input = frame.querySelector('input')!;
	const root = ReactCompatDocument.hydrate(document, tree(data.promise));
	return {
		async finish() {
			const streamed = document.querySelector('output');
			data.resolve('Ready');
			return (await output.promise) === streamed;
		},
		set: (state: State) => flushSync(() => update(state)),
		suspend() {
			React.startTransition(() => update('blocked'));
			return attempted.promise;
		},
		dispose: () => root.dispose(),
		measurements,
		refs,
		snapshot: () => ({
			original: frame.isConnected && input.parentElement === frame,
			focused: document.activeElement === input,
			draft: input.value,
			selection: [input.selectionStart, input.selectionEnd],
			className: frame.className,
			open: frame.dataset.open,
			leakedInput: frame.hasAttribute('input'),
			label: frame.getAttribute('aria-label'),
			width: frame.style.width,
			opacity: frame.style.opacity,
		}),
	};
}

declare global {
	interface Window {
		host: ReturnType<typeof hydrate>;
	}
}
