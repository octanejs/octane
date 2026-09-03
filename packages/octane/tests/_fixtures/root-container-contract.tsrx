import { createElement, useState } from 'octane';

export function DocumentView(props: { label: string }) @{
	const [count, setCount] = useState(0);
	<html lang="en">
		<head />
		<body>
			<button onClick={() => setCount(count + 1)}>{`${props.label}:${count}`}</button>
		</body>
	</html>
}

export function DocumentWithMetadata(props: { label: string }) @{
	<html lang="en">
		<head>
			<title>{props.label as string}</title>
			<meta name="description" content={props.label} />
		</head>
		<body>
			<p>{props.label as string}</p>
		</body>
	</html>
}

export function NestedChildren(props: { label: string }) {
	return createElement(
		'section',
		null,
		createElement(
			'div',
			null,
			createElement('span', null, props.label),
			createElement('b', null, 'kept'),
		),
	);
}

export function SuppressedNestedChildren(props: { label: string }) @{
	<section suppressHydrationWarning>
		<span>{props.label as string}</span>
	</section>
}

export function Label(props: { label: string }) @{
	<span>{props.label as string}</span>
}

export function SuppressedLabel(props: { label: string }) @{
	<span suppressHydrationWarning>{props.label as string}</span>
}
