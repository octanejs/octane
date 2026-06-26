const ATTRS = { title: 't', 'data-spread': 'yes' };
export function HtmlSpread(props) @{
	<div {...ATTRS} data-testid="rich" innerHTML={props.html} />
}
