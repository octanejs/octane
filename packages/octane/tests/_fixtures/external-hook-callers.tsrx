import { useExternalCounter, useLabelled } from './external-hook.ts';
import { useCrossModuleCounters } from './external-hook-composed.ts';

// `.tsrx` components consuming a custom hook that lives in a plain `.ts` module.
export function TsrxSingle() @{
	const c = useExternalCounter(0);
	<button class="s" onClick={c.inc}>
		{c.n + '/' + (c.touched ? 'y' : 'n') as string}
	</button>
}

export function TsrxReuse() @{
	const a = useExternalCounter(0);
	const b = useExternalCounter(100);
	<div>
		<button class="a" onClick={a.inc}>
			{a.n as string}
		</button>
		<button class="b" onClick={b.inc}>
			{b.n as string}
		</button>
	</div>
}

export function TsrxNested() @{
	const c = useLabelled(5, 'x');
	<button class="n" onClick={c.inc}>
		{c.text as string}
	</button>
}

export function TsrxCrossModule() @{
	const pair = useCrossModuleCounters();
	<div>
		<button class="left" onClick={pair.left.inc}>
			{pair.left.n as string}
		</button>
		<button class="right" onClick={() => pair.setRight(pair.right + 1)}>
			{pair.right as string}
		</button>
	</div>
}
