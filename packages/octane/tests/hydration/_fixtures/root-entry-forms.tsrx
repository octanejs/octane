import { Suspense, type OctaneNode } from 'octane';

// Root components that return each kind of value, rendered and hydrated through
// every entry form: the component with its props, or an element of it.

interface AppProps {
	label: string;
	children?: OctaneNode;
}

function Leaf(props: { label: string }) @{
	<p>{props.label}</p>
}

export function HostApp(props: AppProps) {
	return <p>{props.label}</p>;
}

export function TemplateApp(props: AppProps) @{
	<p>{props.label}</p>
}

export function ComponentApp(props: AppProps) {
	return <Leaf label={props.label} />;
}

export function FragmentApp(props: AppProps) {
	return (
		<>
			<p>{props.label}</p>
			<p>{'b'}</p>
		</>
	);
}

export function TextApp(props: AppProps) {
	return props.label;
}

export function NullApp(_props: AppProps) {
	return null;
}

export function SuspenseApp(props: AppProps) {
	return (
		<Suspense fallback={null}>
			<Leaf label={props.label} />
		</Suspense>
	);
}

export function ChildrenApp(props: AppProps) @{
	<main>
		<p>{props.label}</p>
		{props.children}
	</main>
}
