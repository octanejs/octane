type Row = {
	readonly id: number;
	readonly label: string;
	readonly prefix: string;
	readonly suffix: string;
};
type Props = { readonly rows: readonly Row[]; readonly tick: string };

// The keyed body has three roots: the label exercises the only-child text
// binding, and the final span has text holes on either side of a static node.
export function FragmentRows({ rows, tick }: Props) @{
	<section id="fragment-list">
		<output>{tick}</output>
		<div id="rows">
			@for (const row of rows; key row.id) {
				<>
					<label data-label={row.id}>{row.label as string}</label>
					<input data-input={row.id} />
					<span data-span={row.id}>
						{row.prefix as string}
						<b>:</b>
						{row.suffix as string}
					</span>
				</>
			}
		</div>
	</section>
}

// A single-root control catches changes in ordinary template mounting.
export function FlatRows({ rows, tick }: Props) @{
	<section id="flat-list">
		<output>{tick}</output>
		<div id="rows">
			@for (const row of rows; key row.id) {
				<p data-row={row.id}>{row.label as string}</p>
			}
		</div>
	</section>
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

// Native custom elements observe their live siblings synchronously when each
// root connects. A fragment insert must retain that authored connection order.
export function CustomRoots() @{
	<>
		<octane-probe data-name="a">A</octane-probe>
		<octane-probe data-name="b">B</octane-probe>
	</>
}

// A custom-element host's first connection observes the completed text child.
export function CustomTextRoot({ label }: { readonly label: string }) @{
	<octane-probe data-name="text">{label as string}</octane-probe>
}

export function RootTextPair({ label }: { readonly label: string }) @{
	<>
		<strong id="first">{label as string}</strong>
		<em id="last">tail</em>
	</>
}
