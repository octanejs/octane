import { First as Wrapped } from './lazy-output.tsrx';

function Cached({ log }) @{
	<Wrapped log={log} />
}

export function ImportedShell({ log, read }) @{
	<section>
		<Cached log={log} />
		<p>{read() as string}</p>
	</section>
}
