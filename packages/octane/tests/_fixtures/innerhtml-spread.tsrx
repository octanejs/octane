export function HtmlSpread(props) @{
	const attrs = { class: 'wrap', title: 't' };
	<div {...attrs} data-testid="rich" innerHTML={props.html} />
}
