import { createElement } from 'octane';

// A component used at a `<Foo/>` site need not return JSX — it can return a
// primitive (coerced to text) or take an early return. "Component-ness" is the
// use-site, not the declaration; the renderable return-path coerces.
function Foo(props) {
	if (props.foo) return 123;
	return props.title;
}

export function App(props) @{
	<div>
		<Foo foo={props.foo} title={props.title} />
	</div>
}

// One ordinary return-based component covering every generic output shape the
// client runtime must continue reconciling when compiled-void applications
// tree-shake that machinery away.
export function Mixed(props) {
	if (props.mode === 'text') return props.label;
	if (props.mode === 'number') return 42;
	if (props.mode === 'null') return null;
	if (props.mode === 'array') {
		return [
			createElement('i', { key: 'a', class: 'array-a' }, 'A'),
			createElement('i', { key: 'b', class: 'array-b' }, 'B'),
		];
	}
	return <button class="host">
		{props.label as string}
	</button>;
}

export function NestedMixed(props) @{
	<section>
		<Mixed mode={props.mode} label={props.label} />
	</section>
}
