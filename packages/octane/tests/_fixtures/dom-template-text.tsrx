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
