'use strong';
import { trustHTML } from 'octane';

export function TrustedMarkup(props: { html: string | null }) @{
	<section dangerouslySetInnerHTML={props.html === null ? undefined : trustHTML(props.html)} />
}

function Reader(props: { read: () => string }) @{
	<span>{props.read() as string}</span>
}

export function TrustedPending(props: { html: string | null; read: () => string }) @{
	<main>
		<TrustedMarkup html={props.html} />
		<Reader read={props.read} />
	</main>
}
