export function HtmlSpread(props: { html: string }) {
	const attrs = { class: 'wrap', title: 't' };
	return <div {...attrs} data-testid="rich" innerHTML={props.html} />;
}
