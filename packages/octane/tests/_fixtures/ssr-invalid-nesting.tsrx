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

export function InvalidTable() @{
	<table>
		<tr>
			<td>cell</td>
		</tr>
	</table>
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
