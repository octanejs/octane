import { Hydrate } from 'octane';

export function Valid() @{
	<main>
		<p>valid</p>
		<table>
			<tbody>
				<tr>
					<td>cell</td>
				</tr>
			</tbody>
		</table>
	</main>
}

export function Direct() @{
	<p>
		<div>direct</div>
	</p>
}

export function InvalidRootDescendant() @{
	<span>
		<p>root descendant</p>
	</span>
}

export function HydrateWrapper(props) @{
	<p>
		<Hydrate when={props.when} split={false}>
			<span>deferred</span>
		</Hydrate>
	</p>
}

function InnerButton() @{
	<button>inner</button>
}

function ButtonWrapper() @{
	<section>
		<InnerButton />
	</section>
}

export function CrossComponent() @{
	<button>
		<ButtonWrapper />
	</button>
}

function DivRoot() @{
	<div>component root</div>
}

export function ParagraphComponentRoot() @{
	<p>
		<DivRoot />
	</p>
}

export function SelectComponentRoot() @{
	<select>
		<DivRoot />
	</select>
}

export function OptionComponentRoot() @{
	<select>
		<option value="explicit">
			<DivRoot />
		</option>
	</select>
}

export function InvalidTable() @{
	<table>
		<tr>
			<td>cell</td>
		</tr>
	</table>
}

// Per validateDOMNesting-test.js:73 — HTML parser scope boundaries reset
// ancestor relationships even when the authored nodes remain nested.
export function ValidAnchorScope() @{
	<div>
		<a>
			<object>
				<a>nested anchor</a>
			</object>
		</a>
	</div>
}

export function ValidParagraphScope() @{
	<div>
		<p>
			<button>
				<p>nested paragraph</p>
			</button>
		</p>
	</div>
}

export function ValidListItemScope() @{
	<ul>
		<li>
			<section>
				<li>independent list item</li>
			</section>
		</li>
	</ul>
}

function ScopedListItems(props: { active: string }) @{
	const active = props.active;
	const isActive = (value: string) => value === active;

	<nav>
		<div>
			<ul>
				@for (const item of ['scoped']; key item) {
					<li
						data-active={item === active ? 'true' : undefined}
						onClick={() => isActive(item)}
					>{item as string}</li>
				}
			</ul>
		</div>
	</nav>
}

export function ValidCrossComponentListScope(props: { active?: string } = {}) @{
	<ul>
		@for (const item of ['outer']; key item) {
			<li>
				@if (item === 'outer') {
					<ScopedListItems active={props.active ?? item} />
				}
			</li>
		}
	</ul>
}

function MultipleScopedListItems(props: { active: string }) @{
	const active = props.active;
	const isActive = (value: string) => value === active;

	<nav>
		<div>
			<ul>
				@for (const item of ['first']; key item) {
					<li
						data-active={item === active ? 'true' : undefined}
						onClick={() => isActive(item)}
					>{item as string}</li>
				}
			</ul>
			<ol>
				@for (const item of ['second']; key item) {
					<li
						data-active={item === active ? 'true' : undefined}
						onClick={() => isActive(item)}
					>{item as string}</li>
				}
			</ol>
		</div>
	</nav>
}

export function ValidMultipleCrossComponentListScopes(props: { active?: string } = {}) @{
	<ul>
		@for (const item of ['outer']; key item) {
			<li>
				@if (item === 'outer') {
					<MultipleScopedListItems active={props.active ?? item} />
				}
			</li>
		}
	</ul>
}

function TransparentListItem() @{
	<li>nested list item</li>
}

export function InvalidCrossComponentNestedListItem() @{
	<ul>
		<li>
			<div>
				<TransparentListItem />
			</div>
		</li>
	</ul>
}

// Per validateDOMNesting-test.js:88 — a plain div does not reset the
// autoclosing list-item scope, so the browser repairs this authored shape.
export function InvalidNestedListItem() @{
	<ul>
		<li>
			<div>
				<li>nested list item</li>
			</div>
		</li>
	</ul>
}

export function InvalidNestedAnchor() @{
	<a>
		<span>
			<a>nested anchor</a>
		</span>
	</a>
}

export function InvalidNestedForm() @{
	<form>
		<div>
			<form>nested form</form>
		</div>
	</form>
}

export function InvalidTableText(props) @{
	<table>
		{props.text as string}
		<tbody>
			<tr>
				<td>cell</td>
			</tr>
		</tbody>
	</table>
}

export function InvalidTableRowText(props) @{
	<table>
		<tbody>
			<tr>
				{props.text as string}
				<td>cell</td>
			</tr>
		</tbody>
	</table>
}

export function InvalidStaticTableWhitespace() @{
	<table>
		{' '}
		<tbody>
			<tr>
				<td>cell</td>
			</tr>
		</tbody>
	</table>
}

export function InvalidStaticTableRowText() @{
	<table>
		<tbody>
			<tr>
				{'text'}
				<td>cell</td>
			</tr>
		</tbody>
	</table>
}

export function InvalidSelectChild() @{
	<select>
		<div>invalid option</div>
	</select>
}

export function InvalidOptionChild() @{
	<select>
		<option value="invalid">
			<div>invalid option child</div>
		</option>
	</select>
}

export function ValidSelectChildren() @{
	<select>
		<optgroup label="group">
			<option>option</option>
		</optgroup>
	</select>
}

export function CustomElementBoundary() @{
	<x-shell>
		<tr>
			<td>custom</td>
		</tr>
	</x-shell>
}

export function SvgNestedLinks() @{
	<svg>
		<a>
			<a>svg</a>
		</a>
	</svg>
}

export function ForeignObjectHtml() @{
	<svg>
		<foreignObject>
			<p>
				<div>html</div>
			</p>
		</foreignObject>
	</svg>
}

export function MathMlNestedLinks() @{
	<math>
		<a>
			<a>mathml</a>
		</a>
	</math>
}

export function MathMlAnnotationHtml() @{
	<math>
		<annotation-xml encoding="text/html">
			<p>
				<div>html</div>
			</p>
		</annotation-xml>
	</math>
}

export function MathMlAnnotationXml() @{
	<math>
		<annotation-xml encoding="application/mathml+xml">
			<a>
				<a>mathml</a>
			</a>
		</annotation-xml>
	</math>
}

export function Repeat(props) @{
	<section>
		@for (const item of props.items; key item) {
			<p>
				<div>{item as string}</div>
			</p>
		}
	</section>
}

export function NestedRenderIsolation(props) @{
	<button data-nested={props.renderNested()}>
		<section>
			<button>outer</button>
		</section>
	</button>
}
