const ATTRS = { title: 't', 'data-spread': 'yes' };
export function HtmlSpread(props: { html: string }) {
	return <div {...ATTRS} data-testid="rich" dangerouslySetInnerHTML={{ __html: props.html }} />;
}
