/** @jsxImportSource octane */
'use strong';
import { trustHTML } from 'octane';

export function TrustedMarkup(props: { html: string | null }) {
	return (
		<section dangerouslySetInnerHTML={props.html === null ? undefined : trustHTML(props.html)} />
	);
}

function Reader(props: { read: () => string }) {
	return <span>{props.read()}</span>;
}

export function TrustedPending(props: { html: string | null; read: () => string }) {
	return (
		<main>
			<TrustedMarkup html={props.html} />
			<Reader read={props.read} />
		</main>
	);
}
