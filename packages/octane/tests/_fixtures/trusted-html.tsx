/** @jsxImportSource octane */
'use strong';
import { trustHTML } from 'octane';

export function TrustedMarkup(props: { html: string | null }) {
	return (
		<section dangerouslySetInnerHTML={props.html === null ? undefined : trustHTML(props.html)} />
	);
}
