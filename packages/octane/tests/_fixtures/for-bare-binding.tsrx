import { Hydrate, useState, type HydrateProps } from 'octane';

// A bare-left `@for` header binds each row's own item, as a `let` header does:
// the row binding shadows any outer name it spells, and it never assigns that
// outer name.

export type Row = { id: string; label?: string };

const label = 'module label';

export function Labels(props: { labels: string[]; onPick: (value: string) => void }) @{
	const label = 'outer label';
	<section>
		<ul>
			@for (label of props.labels; index i; key label) {
				<li data-label={label}>
					<button onClick={() => props.onPick(`${label}@${i}`)}>{`${label}@${i}`}</button>
				</li>
			} @empty {
				<li class="empty">{label}</li>
			}
		</ul>
		<p class="after">{label}</p>
	</section>
}

export function Rows(props: { rows: Row[]; onPick: (value: string) => void }) @{
	<ul>
		@for ({ id, label: text = 'untitled' } of props.rows; key id) {
			const [count, setCount] = useState(0);
			<li data-id={id}>
				<button
					onClick={() => {
						setCount(count + 1);
						props.onPick(`${id}:${text}`);
					}}
				>{`${text} ${count}`}</button>
			</li>
		}
	</ul>
}

export function Scores(props: { scores: [string, ...number[]][] }) @{
	<ul>
		@for ([name, ...points] of props.scores; key name) {
			<li data-name={name}>{points.join(',') as string}</li>
		}
	</ul>
}

export type SplitProps = {
	when: HydrateProps['when'];
	rows: Row[];
	labels: string[];
	onPick: (value: string) => void;
	onHydrated?: () => void;
};

// The split child declares the row binding itself, so the parent must not pass
// it in: the parent has no such name.
export function SplitAroundRows(props: SplitProps) @{
	<Hydrate when={props.when} onHydrated={props.onHydrated}>
		<ul>
			@for ({ id } of props.rows; key id) {
				<li>
					<button onClick={() => props.onPick(`row:${id}`)}>{id}</button>
				</li>
			}
		</ul>
	</Hydrate>
}

// Each split child reads the row binding, which shadows the module's `label`,
// so the child must receive the row's value rather than the module's.
export function SplitInsideRows(props: SplitProps) @{
	<ul>
		@for (label of props.labels; key label) {
			<li>
				<Hydrate when={props.when} onHydrated={props.onHydrated}>
					<button onClick={() => props.onPick(`label:${label}`)}>{label}</button>
				</Hydrate>
			</li>
		}
	</ul>
}
