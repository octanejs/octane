import { createElement } from 'octane';

export function StaticSafeLink() @{
	<a id="safe" href="http://javascript:0/thisisfine">Click me</a>
}

export function StaticUnsafeLinks() @{
	<div>
		<a id="static-first" href="javascript:notfine">p0wned</a>
		<a id="static-last" href="javascript:notfineagain">p0wned again</a>
	</div>
}

export function DynamicLink(props) @{
	<a id="link" href={props.url}>Click me</a>
}

export function DynamicLinks(props) @{
	<div>
		<a id="first" href={props.first}>p0wned</a>
		<a id="last" href={props.last}>p0wned again</a>
	</div>
}

export function VariousTags(props) @{
	<div>
		<a id="var-a" href={props.url}>a</a>
		<object id="var-object" data={props.url}></object>
		<embed id="var-embed" src={props.url} />
	</div>
}

export function SpreadSinks(props) @{
	<div>
		<a id="spread-a" {...props.anchor}></a>
		<a id="spread-upper-a" {...props.upperAnchor}></a>
		<object id="spread-object" {...props.object}></object>
	</div>
}

export function DeoptSinks(props) {
	return createElement(
		'div',
		null,
		createElement('a', { id: 'deopt-a', href: props.url }),
		createElement('object', { id: 'deopt-object', data: props.url }),
		createElement('OBJECT', { id: 'deopt-upper-object', data: props.url }),
	);
}

export function DataPassThrough(props) @{
	<div>
		<div id="data-div" data={props.value}></div>
		<a id="data-a" data={props.url}>a</a>
		<untrusted-link id="custom-url" href={props.url}></untrusted-link>
	</div>
}

export function AreaLink(props) @{
	<map>
		<area id="area" href={props.url} />
	</map>
}

export function FormAction(props) @{
	<form id="form" action={props.url}>p0wned</form>
}

export function InputFormAction(props) @{
	<input id="input" type="submit" formAction={props.url} />
}

export function ButtonFormAction(props) @{
	<button id="button" formAction={props.url}>p0wned</button>
}

export function StaticFormActions() @{
	<div>
		<form id="static-form" action="javascript:notfine">p0wned</form>
		<input id="static-input" type="submit" formAction="javascript:notfine" />
		<button id="static-button" formAction="javascript:notfine">p0wned</button>
	</div>
}

export function IframeSource(props) @{
	<iframe id="iframe" src={props.url}></iframe>
}

// A frame cannot be parsed from a static body template. Returning a public
// createElement descriptor exercises the supported de-opt host path instead.
export function FrameSource(props) {
	return createElement('frame', { id: 'frame', src: props.url });
}

export function SvgHref(props) @{
	<svg>
		<a id="svg-href" href={props.url}></a>
	</svg>
}

export function SvgXlinkHref(props) @{
	<svg>
		<a id="svg-xlink" xlinkHref={props.url}></a>
	</svg>
}

export function ReservedHyphenatedSinks(props) @{
	<div>
		<math>
			<annotation-xml id="reserved-annotation-xml" href={props.url}></annotation-xml>
		</math>
		<svg>
			<color-profile id="reserved-color-profile" href={props.url}></color-profile>
			<font-face id="reserved-font-face" href={props.url}></font-face>
			<font-face-src id="reserved-font-face-src" href={props.url}></font-face-src>
			<font-face-uri id="reserved-font-face-uri" href={props.url}></font-face-uri>
			<font-face-format id="reserved-font-face-format" href={props.url}></font-face-format>
			<font-face-name id="reserved-font-face-name" href={props.url}></font-face-name>
			<missing-glyph id="reserved-missing-glyph" href={props.url}></missing-glyph>
		</svg>
	</div>
}

export function ReservedHyphenatedXlinkSink(props) @{
	<svg>
		<font-face-uri id="reserved-font-face-uri-xlink" xlinkHref={props.url}></font-face-uri>
	</svg>
}

export function HeadLink(props) @{
	<>
		<link rel="preload" href={props.url} />
		<main id="head-body">head</main>
	</>
}
