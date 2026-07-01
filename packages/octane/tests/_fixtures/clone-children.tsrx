// React-compatible cloneElement / Children / isValidElement.
//
// Children passed at the CHILDREN position compile to a render function in octane, so
// these helpers operate on element DESCRIPTORS — what you get from prop-position JSX
// (`el={<button/>}`), `createElement`, array literals, and `.map()` returns. That's the
// form a Radix-style `Slot`/`asChild` (and the differential React side) work with.
import { cloneElement, Children, isValidElement, createElement } from 'octane';

// cloneElement: config props win (shallow merge); the child's own props/children survive.
export function CloneSlot(props) {
	return cloneElement(props.el, { id: 'slotted', 'data-x': '1' });
}

// Children.only + isValidElement, then clone the single element child.
export function OnlyChild(props) {
	const c = Children.only(props.el);
	return isValidElement(c)
		? cloneElement(c, { 'data-only': 'yes' })
		: createElement('em', {}, 'no');
}

// Children.count + Children.map over a descriptor array (flattening + index).
export function MapKids(props) {
	return createElement(
		'ul',
		{ 'data-count': String(Children.count(props.kids)) },
		...(Children.map(props.kids, (k, i) => cloneElement(k, { 'data-i': String(i) })) ?? []),
	);
}

export function CloneDemo() @{
	<div id="wrap">
		<CloneSlot el={<button type="button">{'go'}</button>} />
	</div>
}

export function OnlyDemo() @{
	<div id="wrap">
		<OnlyChild el={<span>{'hi'}</span>} />
	</div>
}

export function MapDemo() @{
	<div id="wrap">
		<MapKids kids={[<li>{'a'}</li>, <li>{'b'}</li>, <li>{'c'}</li>]} />
	</div>
}
