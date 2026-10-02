// A template reader whose use() runs in a text hole, inside a @try body. The
// template clones its root before the hole reads the seed, so when the
// server's read rejected, that clone meets the server's @catch arm. Hydration
// must still adopt the server's catch arm, exactly as it does for a reader
// whose use() runs in setup, before the template.
import { ErrorBoundary, use } from 'octane';

function Reader(props: { value: Promise<string> }) @{
	<i>{use(props.value) as string}</i>
}

// Its root has the catch arm's tag, so the clone adopts the server's <em>.
function SameRoot(props: { value: Promise<string> }) @{
	<em>
		<b>{use(props.value) as string}</b>
	</em>
}

// The control: use() runs in setup, before the template clones.
function SetupReader(props: { value: Promise<string> }) @{
	const value = use(props.value);
	<i>{value as string}</i>
}

export interface PageProps {
	label: string;
	value: Promise<string>;
}

export function CatchArm(props: PageProps) @{
	<div>
		@try {
			<Reader value={props.value} />
		} @pending {
			<p>{'pending'}</p>
		} @catch (error: unknown) {
			<em title={props.label}>{props.label as string}</em>
		}
	</div>
}

export function CatchOnly(props: PageProps) @{
	<div>
		@try {
			<Reader value={props.value} />
		} @catch (error: unknown) {
			<em title={props.label}>{props.label as string}</em>
		}
	</div>
}

export function SameRootArm(props: PageProps) @{
	<div>
		@try {
			<SameRoot value={props.value} />
		} @pending {
			<p>{'pending'}</p>
		} @catch (error: unknown) {
			<em title={props.label}>{props.label as string}</em>
		}
	</div>
}

export function Boundary(props: PageProps) @{
	<div>
		<ErrorBoundary
			fallback={(error: unknown) => <em title={props.label}>{props.label as string}</em>}
		>
			<Reader value={props.value} />
		</ErrorBoundary>
	</div>
}

export function SetupCatchArm(props: PageProps) @{
	<div>
		@try {
			<SetupReader value={props.value} />
		} @pending {
			<p>{'pending'}</p>
		} @catch (error: unknown) {
			<em title={props.label}>{props.label as string}</em>
		}
	</div>
}
