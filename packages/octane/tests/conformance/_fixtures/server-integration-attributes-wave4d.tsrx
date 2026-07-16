export function StringAttributes() @{
	const noop = () => {};
	const token = Symbol('attribute');
	<section id="string-attributes">
		<div id="width-number" width={30} />
		<div id="width-string" width="30" />
		<img id="empty-src" src="" />
		<a id="empty-anchor-href" href="" />
		<base id="empty-base-href" href="" />
		<map>
			<area id="empty-area-href" alt="" href="" />
		</map>
		<a id="href-true" href={true} />
		<a id="href-false" href={false} />
		<div id="width-null" width={null} />
		<div id="width-function" width={noop} />
		<div id="width-symbol" width={token} />
	</section>
}

export function BooleanAttributes() @{
	const noop = () => {};
	const token = Symbol('attribute');
	<section id="boolean-attributes">
		<div id="hidden-true" hidden={true} />
		<div id="hidden-false" hidden={false} />
		<div id="hidden-self" hidden="hidden" />
		<div id="hidden-empty" hidden="" />
		<div id="hidden-string" hidden="foo" />
		<div id="hidden-array" hidden={['foo', 'bar']} />
		<div id="hidden-object" hidden={{ foo: 'bar' }} />
		<div id="hidden-ten" hidden={10} />
		<div id="hidden-zero" hidden={0} />
		<div id="hidden-null" hidden={null} />
		<div id="hidden-function" hidden={noop} />
		<div id="hidden-symbol" hidden={token} />
		<iframe id="credentialless-true" credentialless={true} />
		<iframe id="credentialless-false" credentialless={false} />
	</section>
}

export function DownloadAttributes() @{
	const noop = () => {};
	const token = Symbol('attribute');
	<section id="download-attributes">
		<a id="download-true" download={true} />
		<a id="download-false" download={false} />
		<a id="download-string" download="myfile" />
		<a id="download-string-false" download="false" />
		<a id="download-string-true" download="true" />
		<a id="download-zero" download={0} />
		<div id="download-null" download={null} />
		<div id="download-undefined" download={undefined} />
		<div id="download-function" download={noop} />
		<div id="download-symbol" download={token} />
	</section>
}

export function ClassAndForAttributes() @{
	<section id="class-for-attributes">
		<div id="class-string" className="myClassName" />
		<div id="class-empty" className="" />
		<div id="class-true" className={true} />
		<div id="class-zero" className={0} />
		<div id="class-false" className={false} />
		<div id="class-null" className={null} />
		<div id="class-lowercase" classname="test" />
		<div id="class-alias" class="test" />
		<div id="class-odd-alias" cLASs="test" />
		<div id="for-string" htmlFor="myFor" />
		<div id="for-lowercase" htmlfor="myFor" />
		<div id="for-empty" htmlFor="" />
		<div id="for-true" htmlFor={true} />
		<div id="for-false" htmlFor={false} />
		<div id="for-null" htmlFor={null} />
	</section>
}

export function NumericAndReservedAttributes() @{
	const noop = () => {};
	const token = Symbol('attribute');
	<section id="numeric-reserved-attributes">
		<input id="size-positive" size={2} />
		<ol id="start-zero" start={0} />
		<input id="size-zero" size={0} />
		<input id="size-string-zero" size="0" />
		<ol id="start-function" start={noop} />
		<ol id="start-symbol" start={token} />
		<input id="size-function" size={noop} />
		<input id="size-symbol" size={token} />
		<div id="reserved-ref" ref={noop} />
		<div id="reserved-children">foo</div>
		<div id="reserved-key" key="foo" />
		<div id="reserved-html" dangerouslySetInnerHTML={{ __html: '<b>safe</b>' }} />
		<div id="reserved-content-editable" suppressContentEditableWarning={true} />
		<span id="reserved-hydration" suppressHydrationWarning={true} />
	</section>
}

export function StyleAttributes() @{
	<section id="style-attributes">
		<div id="style-simple" style={{ color: 'red', width: '30px' }} />
		<div id="style-px" style={{ left: 0, margin: 16, opacity: 0.5, padding: '4px' }} />
		<div id="style-custom" style={{ '--foo': 5 }} />
		<div id="style-custom-cased" style={{ '--someColor': '#000000' }} />
		<div id="style-undefined" style={{ color: undefined, width: '30px' }} />
		<div id="style-null" style={{ color: null, width: '30px' }} />
		<div id="style-empty" style={{ color: null, width: null }} />
		<div id="style-unitless" style={{ lineClamp: 10 }} />
	</section>
}

export function AriaUnknownAndSvgAttributes() @{
	const unknownEvent = 'alert("hack")';
	<section id="aria-unknown-svg-attributes">
		<div id="aria-string" aria-label="hello" />
		<div id="aria-false" aria-label={false} />
		<div id="aria-null" aria-label={null} />
		<div id="aria-bare" aria="hello" />
		<form id="accept-charset-lowercase" acceptcharset="utf-8" />
		<div id="unknown-string" foo="bar" />
		<div id="unknown-data" data-foo="bar" />
		<div id="reserved-uppercase" CHILDREN="5" />
		<object id="object-data" data="hello" />
		<div id="data-null" data-foo={null} />
		<div id="data-cased" data-fooBar="true" />
		<div id="data-true" data-foobar={true} />
		<div id="data-false" data-foobar={false} />
		<div id="data-cased-null" data-fooBar={null} />
		<nonstandard id="nonstandard-foo" foo="bar" />
		<div id="custom-cased" fooBar="test" />
		<div id="known-event" onClick={() => {}} />
		<div id="unknown-event" onunknownevent={unknownEvent} />
		<div id="on-attribute" on="tap:do-something" />
		<svg id="svg-attributes">
			<text id="svg-textlength" textlength="10" />
			<text id="svg-bad-alias" strokedasharray="10 10" />
			<text id="svg-authored-alias" stroke-dasharray="10 10" />
			<font-face id="svg-dashed-tag" accentHeight={10} />
		</svg>
	</section>
}

export function CustomElementAttributes() @{
	<section id="custom-element-attributes">
		<div id="is-class" is="custom-element" class="test" />
		<div id="is-class-name" is="custom-element" className="test" />
		<custom-element id="custom-class-name" className="test" />
		<div id="is-html-for" is="custom-element" htmlFor="test" />
		<custom-element id="custom-html-for" htmlFor="test" />
		<div id="is-for" is="custom-element" for="test" />
		<custom-element id="custom-foo" foo="bar" />
		<custom-element id="custom-on" onunknown="bar" />
		<custom-element id="custom-true" foo={true} />
		<custom-element id="custom-false" foo={false} />
		<div id="inert-true" inert={true} />
		<div id="inert-empty" inert="" />
		<div id="inert-false" inert={false} />
		<custom-element id="custom-null" foo={null} />
		<div id="is-foo" is="custom-element" foo="bar" />
		<div id="is-foo-null" is="custom-element" foo={null} />
	</section>
}
