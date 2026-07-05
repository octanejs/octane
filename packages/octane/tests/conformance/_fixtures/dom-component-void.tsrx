// Void-element fixtures, ISOLATED in their own module: React THROWS for children /
// dangerouslySetInnerHTML on void elements; octane's template compiler currently
// emits the markup and lets the HTML parser sort it out. Kept separate from the
// other fixtures so a future compile-time error here can't take unrelated tests
// down with it (tests import this module dynamically).

// children on a void element — React: throws. Octane: the template parser hoists
// the text out of the <input>.
export function VoidChildren() @{
	<input id="vc">{'children'}</input>
}

// dangerouslySetInnerHTML on a void element — React: throws. Octane: htmlOnlyChild
// assigns input.innerHTML (invisible content).
export function VoidDanger(props) @{
	<input id="vd" dangerouslySetInnerHTML={{ __html: props.h }} />
}
