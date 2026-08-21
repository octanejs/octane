import { createElement } from 'octane';

function String(value: string) {
	return createElement('strong', { class: 'module-string' }, value);
}

export function ModuleString(props: { value: string }) @{
	<div id="module-string">{String(props.value)}</div>
}
