import type { OctaneNode } from 'octane';

type Row = {
	readonly id: number;
	readonly label: string;
	readonly before: string;
	readonly after: string;
};
type RowsProps = { readonly rows: readonly Row[]; readonly tick: string };

export function FragmentTextRows({ rows, tick }: RowsProps) @{
	<main>
		<output>{tick}</output>
		<div id="rows">
			@for (const row of rows; key row.id) {
				<>
					<label data-label={row.id}>{row.label as string}</label>
					<input data-input={row.id} />
					<span data-span={row.id}>
						{row.before as string}
						<b>:</b>
						{row.after as string}
					</span>
				</>
			}
		</div>
	</main>
}

export function RootTextPair({ label }: { readonly label: string }) @{
	<>
		<strong id="first">{label as string}</strong>
		<em id="last">{'tail'}</em>
	</>
}

function SvgPair({ label }: { readonly label: string }) @{
	<>
		<circle r="2" />
		<text>{label as string}</text>
	</>
}

export function ForeignSvg({ label }: { readonly label: string }) @{
	<svg id="chart">
		<SvgPair label={label} />
	</svg>
}

function MathPair({ label }: { readonly label: string }) @{
	<>
		<mn>{label as string}</mn>
		<mo>+</mo>
	</>
}

export function ForeignMath({ label }: { readonly label: string }) @{
	<math id="formula">
		<MathPair label={label} />
	</math>
}
function Table({ children }: { readonly children?: OctaneNode }) @{
	<table>{children}</table>
}

export function TableSections({ label }: { readonly label: string }) @{
	<Table>
		<thead>
			<tr>
				<th>Label</th>
				<th>Value</th>
			</tr>
		</thead>
		<tbody>
			<tr>
				<td>{label as string}</td>
				<td>
					<input defaultValue="initial" />
				</td>
			</tr>
		</tbody>
	</Table>
}

// Static markup in the forms a client template string shortens: values that
// need no quotes (one ending in `/`), an empty value, values that keep theirs,
// a void element's `/`, and the close tags that end the template.
export function StaticMarkup() @{
	<nav class="menu">
		<a href="/" title="home page" data-empty="">
			home
		</a>
		<input class="field" type="text" />
		<ul>
			<li>
				<b>deep</b>
			</li>
		</ul>
	</nav>
}

// `a` is also an SVG name, so this root's template is destination-opaque: its
// void <img> keeps `/>`, and the value before it keeps its quotes.
export function OpaqueLink() @{
	<a href="/home">
		<img alt="logo" src="logo.png" />
	</a>
}

// A raw-text host reads its content as text, so markup written inside one
// stays byte for byte, even where it ends the template.
export function RawTextHost() @{
	<div>
		<iframe title="frame">
			<p class="inside">x</p>
		</iframe>
	</div>
}
