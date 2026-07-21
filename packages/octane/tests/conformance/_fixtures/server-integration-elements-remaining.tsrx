import { memo } from 'octane';

// Focused fixtures for the remaining modern function-component cases in
// ReactDOMServerIntegration{Basic,Elements,Fragment,Object,SpecialTypes}-test.js.

export function BlankDiv() @{
	<div id="blank-div" />
}

export function SelfClosingTag() @{
	<br id="self-closing-tag" />
}

export function SelfClosingChild() @{
	<div id="self-closing-parent">
		<br id="self-closing-child" />
	</div>
}

export function StringRoot() {
	return 'Hello';
}

export function NumberRoot() {
	return 42;
}

export function ArrayOne() {
	return [<div key="one" id="array-one">text1</div>];
}

export function NestedArray() {
	return [
		[<div key="one" id="nested-array-first">text1</div>],
		<span key="two" id="nested-array-second">text2</span>,
		[[[null, <p key="three" id="nested-array-third" />], false]],
	];
}

export function LegacyIterable() {
	const items = [
		<div key="one" data-iterable-item="one" />,
		<div key="two" data-iterable-item="two" />,
		<div key="three" data-iterable-item="three" />,
	];
	return {
		'@@iterator'() {
			let index = 0;
			return {
				next() {
					if (index < items.length) return { value: items[index++], done: false };
					return { value: undefined, done: true };
				},
			};
		},
	};
}

export function EmptyishValues() {
	return [
		<span key="zero" id="emptyish-zero">{0}</span>,
		<div key="empty-string" id="emptyish-string">{''}</div>,
		[],
		false,
		true,
		[[[false]], undefined],
	];
}

export function DivText() @{
	<div id="div-text">Text</div>
}

export function FlankingWhitespace() @{
	<div id="flanking-whitespace">{'  Text '}</div>
}

export function EmptyText() @{
	<div id="empty-text">{''}</div>
}

export function MultipleEmptyText() @{
	<div id="multiple-empty-text">
		{''}
		{''}
		{''}
	</div>
}

export function MultipleWhitespace() @{
	<div id="multiple-whitespace">
		{' '}
		{' '}
		{' '}
	</div>
}

export function TextSibling() @{
	<div id="text-sibling">
		{'Text'}
		<span>More Text</span>
	</div>
}

export function NonStandardText() @{
	<nonstandard id="non-standard-text">Text</nonstandard>
}

export function CustomElementText() @{
	<custom-element id="custom-element-text">Text</custom-element>
}

export function LeadingBlank() @{
	<div id="leading-blank">
		{''}
		{'foo'}
	</div>
}

export function TrailingBlank() @{
	<div id="trailing-blank">
		{'foo'}
		{''}
	</div>
}

function MiddleText() {
	return 'b';
}

export function ComponentBetweenText() @{
	<div id="component-between-text">
		{'a'}
		<MiddleText />
		{'c'}
	</div>
}

function EmptyNestedComponent() {
	return null;
}

function NestedTextComponent() {
	return [<EmptyNestedComponent key="empty" />, ['c']];
}

function NestedArrayComponent() {
	return [null, [<NestedTextComponent key="text" />], false];
}

export function SiblingHostAndTextTree() @{
	<div id="sibling-host-text-tree">
		{[['a'], 'b']}
		<div>
			<NestedArrayComponent key="nested" />
			{'d'}
		</div>
		{'e'}
	</div>
}

export function NumberChild() @{
	<div id="number-child">{3}</div>
}

export function ZeroChild() @{
	<div id="zero-child">{0}</div>
}

export function NumberAndText() @{
	<div id="number-and-text">
		{'foo'}
		{40}
	</div>
}

export function NullishSingle(props) @{
	<div id="nullish-single">{props.value}</div>
}

function NullChild() {
	return null;
}

export function NullComponentChild() @{
	<div id="null-component-child">
		<NullChild />
	</div>
}

export function NullishBeforeText(props) @{
	<div id="nullish-before-text">
		{props.value}
		{'foo'}
	</div>
}

export function MixedNullish() @{
	<div id="mixed-nullish">
		{false}
		{null}
		{'foo'}
		{null}
		{false}
	</div>
}

export function OnlyNullish() @{
	<div id="only-nullish">
		{false}
		{null}
		{null}
		{false}
	</div>
}

export function SvgRoot() @{
	<svg id="svg-root" />
}

export function SvgViewBox() @{
	<svg id="svg-view-box" viewBox="0 0 0 0" />
}

export function SvgNamespacedAttribute() @{
	<svg id="svg-namespaced-root">
		<image id="svg-namespaced-image" xlinkHref="https://example.test/image.png" />
	</svg>
}

export function SvgBadAlias() @{
	<svg id="svg-bad-alias-root">
		<image id="svg-bad-alias-image" xlinkhref="https://example.test/image.png" />
	</svg>
}

export function SvgTabIndex() @{
	<svg id="svg-tab-index" tabIndex="1" />
}

export function SvgBadTabIndex() @{
	<svg id="svg-bad-tab-index" tabindex="1" />
}

export function SvgMixedCaseName() @{
	<svg id="svg-mixed-case-root">
		<filter>
			<feMorphology id="svg-mixed-case-node" />
		</filter>
	</svg>
}

export function MathRoot() @{
	<math id="math-root" />
}

export function ImageElement() @{
	<img id="image-element" />
}

export function ButtonElement() @{
	<button id="button-element" />
}

export function DangerousSpan(props) @{
	<div id="dangerous-span-parent">
		<span id="dangerous-span" dangerouslySetInnerHTML={{ __html: props.html }} />
	</div>
}

export function DangerousDiv(props) @{
	<div id="dangerous-div" dangerouslySetInnerHTML={{ __html: props.html }} />
}

export function NoscriptChildren() @{
	<noscript id="noscript-children">
		<div>Enable JavaScript to run this app.</div>
	</noscript>
}

export function PreformattedText(props) @{
	<pre id="preformatted-text">{props.text as string}</pre>
}

export function NormalNewlineText(props) @{
	<div id="normal-newline-text">{props.text as string}</div>
}

export function StatelessComponent() @{
	<div id="stateless-component">foo</div>
}

function Box(props) @{
	<div class="box">{props.children}</div>
}

export function SingleChildHierarchy() @{
	<Box>
		<Box>
			<Box>
				<Box />
			</Box>
		</Box>
	</Box>
}

export function MultiChildHierarchy() @{
	<Box>
		<Box>
			<Box />
			<Box />
		</Box>
		<Box>
			<Box />
			<Box />
		</Box>
	</Box>
}

export function ParentWithChild() @{
	<div id="parent-with-child">
		<div id="only-child" />
	</div>
}

export function ParentWithChildren() @{
	<div id="parent-with-children">
		<div id="first-child" />
		<div id="second-child" />
	</div>
}

export function WhitespaceSeparatedChildren(props) @{
	<div id="whitespace-separated-children">
		<div id="whitespace-first-child" />
		{props.between as string}
		<div id="whitespace-second-child" />
	</div>
}

export function WhitespaceSurroundedChild(props) @{
	<div id="whitespace-surrounded-child">
		{props.before as string}
		<div id="surrounded-child" />
		{props.after as string}
	</div>
}

export function CompositeMultipleChildren() @{
	<Box>
		{['a', 'b', [undefined], [[false, 'c']]]}
	</Box>
}

export function EscapedSingleText() @{
	<div id="escaped-single-text">{'<span>Text&quot;</span>'}</div>
}

export function EscapedMultipleText() @{
	<div id="escaped-multiple-text">
		{'<span>Text1&quot;</span>'}
		{'<span>Text2&quot;</span>'}
	</div>
}

export function SpecialText(props) @{
	<div id="special-text">{props.text as string}</div>
}

export function SpecialTextPair(props) @{
	<div id="special-text-pair">
		{props.first as string}
		{props.second as string}
	</div>
}

export function SpecialAttribute(props) @{
	<a id="special-attribute" title={props.title} />
}

export function NullRoot() {
	return null;
}

export function UndefinedRoot() {
	return undefined;
}

function ReturnsObject() {
	return { x: 123 };
}

export function FunctionReturningObject() @{
	<ReturnsObject />
}

export function TopLevelObject() {
	return { x: 123 };
}

export function InvalidComponentType(props) {
	const Component = props.value;
	return <Component />;
}

export function FragmentOne() @{
	<>
		<div id="fragment-one">text1</div>
	</>
}

export function EmptyFragment() @{
	<div id="empty-fragment-parent"><></></div>
}

export function ObjectWithChildren() @{
	<object id="object-with-children" type="video/mp4" data="/example.webm" width={600} height={400}>
		<div>preview</div>
	</object>
}

export function ObjectWithEmptyData() @{
	<object id="object-with-empty-data" data="" />
}

function MemoBody(props) @{
	props.log('body');
	<span id="memo-with-comparator">{'Count: ' + props.count}</span>
}

export const MemoWithComparator = memo(MemoBody, (previous, next) => {
	next.log('compare');
	return previous.count === next.count;
});
