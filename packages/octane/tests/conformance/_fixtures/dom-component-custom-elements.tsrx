// Fixtures for dom-component-custom-elements.test.ts — web-component attribute
// routing per React 19 semantics (no filtering, no aliasing, slot projection,
// reserved-prop skipping).

// Named slot projection on a web component's light DOM.
export function SlotProjection() @{
	<my-component>
		<my-second-component slot="first" />
		<button slot="second">Hello</button>
	</my-component>
}

// Arbitrary props delivered through a spread — drives reserved-prop skipping,
// dangerouslySetInnerHTML, custom-attribute add/remove/rename, and on*-string
// attributes on a custom element.
export function CustomSpread(props) @{
	<my-component {...props.sp} />
}

// Static React-filtered attributes are NOT filtered on custom elements.
export function CustomUnfiltered() @{
	<some-custom-element id="cu" action="" formAction="" href="" src="" />
}

// Direct dynamic attribute on a custom element (boolean true→'' / false→removed).
export function CustomBoolAttr(props) @{
	<some-custom-element id="cb" foo={props.foo} />
}

// `is` on a built-in: attributes pass through; `class` is octane's native spelling.
export function IsCustomDiv(props) @{
	<div id="icd" is="custom-div" class={props.cls} />
}
