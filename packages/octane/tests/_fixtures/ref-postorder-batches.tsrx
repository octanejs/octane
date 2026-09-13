type Props = { log: (entry: string) => void; label: string };

function Leaf({ log, label }: Props) @{
	<span
		ref={(el) => {
			if (el) log(label);
		}}
	>{label}</span>
}

function FirstBranch({ log, label }: Props) @{
	<section
		ref={(el) => {
			if (el) log('first parent');
		}}
	>
		<Leaf log={log} label={'first ' + label} />
		<Leaf log={log} label={'second ' + label} />
	</section>
}

function SecondBranch({ log, label }: Props) @{
	<aside
		ref={(el) => {
			if (el) log('second parent');
		}}
	>
		<Leaf log={log} label={'deep ' + label} />
	</aside>
}

export function RefPostorderBatch({ log, label }: Props) @{
	<main>
		<FirstBranch log={log} label={label} />
		<SecondBranch log={log} label={label} />
	</main>
}
