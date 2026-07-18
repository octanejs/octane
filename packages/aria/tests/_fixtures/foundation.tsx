import { useState } from 'octane';
import { mergeProps, useId, useObjectRef } from '@octanejs/aria';

// useId renders a react-aria-prefixed, framework-stable id.
export function IdOnElement() {
	const id = useId();
	return <div id={id}>labelled</div>;
}

// A caller-supplied default id wins over the generated one.
export function IdDefault() {
	const id = useId('my-id');
	return <div id={id}>labelled</div>;
}

// mergeProps chains both onClick handlers (in order) and clsx-combines classNames.
export function ChainedHandlers() {
	const [a, setA] = useState(0);
	const [b, setB] = useState(0);
	const props = mergeProps(
		{ onClick: () => setA((c: number) => c + 1), className: 'one' },
		{ onClick: () => setB((c: number) => c + 10), className: 'two' },
	);
	return <button {...(props as any)}>{'clicks:' + a + ':' + b}</button>;
}

// mergeIds (via mergeProps id collision): the two useId consumers must CONVERGE on one id
// after the retroactive update effect runs.
export function MergedIds() {
	const idA = useId();
	const idB = useId();
	const props = mergeProps({ id: idA }, { id: idB });
	return (
		<div>
			<span data-testid="a" id={idA} />
			<span data-testid="b" id={idB} />
			<span data-testid="merged" id={(props as any).id} />
		</div>
	);
}

// useObjectRef forwards the attached node to the original callback ref, and exposes it
// as an object ref.
export function ObjectRefProbe() {
	const [tag, setTag] = useState('');
	const ref = useObjectRef((node: HTMLElement | null) => {
		if (node) setTag(node.tagName.toLowerCase());
	});
	return (
		<output ref={ref as any} data-tag={tag}>
			{tag}
		</output>
	);
}
