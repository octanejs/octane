import { createElement, memo } from 'octane';

function Label(props: Record<string, unknown>) @{
	<output>{(typeof props.label === 'string' ? props.label : 'fallback') as string}</output>
}
const MemoLabel = memo(Label);

export function TemplateHost(props: { childProps: Record<string, unknown> }) @{
	<section>
		<MemoLabel {...props.childProps} />
	</section>
}

export function ValueHost(props: { childProps: Record<string, unknown> }) {
	return createElement(MemoLabel, props.childProps);
}
