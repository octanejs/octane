import { use, useCallback, useMemo, useRef, useState } from 'octane';

// Fixtures for the inline hook-memo tier. Under the `octane` project these
// compile to the runtime useMemo/useCallback path; under `octane-prod` the
// same sources compile to inline `_k$` cell regions — the tests assert the
// SAME observable behavior in both, which is the tier's whole contract.

export function ComputeCount({ log }: { log: (entry: string) => void }) @{
	const [tick, setTick] = useState(0);
	const [dep, setDep] = useState(0);
	const value = useMemo(() => {
		log('compute:' + dep);
		return dep * 2;
	}, [dep]);
	<div>
		<button id="tick" onClick={() => setTick(tick + 1)}>t</button>
		<button id="dep" onClick={() => setDep(dep + 1)}>d</button>
		{'v=' + value + ' t=' + tick}
	</div>
}

export function NanDep({ log }: { log: (entry: string) => void }) @{
	const [tick, setTick] = useState(0);
	const value = useMemo(() => {
		log('compute');
		return 1;
	}, [NaN]);
	<div>
		<button id="tick" onClick={() => setTick(tick + 1)}>t</button>
		{'v=' + value + ' t=' + tick}
	</div>
}

export function EarlyReturnMemo({ log }: { log: (entry: string) => void }) @{
	const [count, setCount] = useState(0);
	const total = useMemo(() => {
		if (count === 0) return 'empty';
		let sum = 0;
		for (let i = 1; i <= count; i++) sum += i;
		return 'sum:' + sum;
	}, [count]);
	log('total:' + total);
	<div>
		<button id="inc" onClick={() => setCount(count + 1)}>+</button>
		{'total=' + total}
	</div>
}

export function NullDepsIdentity({ log }: { log: (entry: string) => void }) @{
	const [tick, setTick] = useState(0);
	const box = useMemo(() => ({ tick }), null);
	const last = useRef<{ tick: number } | null>(null);
	log(last.current === box ? 'same' : 'fresh:' + box.tick);
	last.current = box;
	<div>
		<button id="tick" onClick={() => setTick(tick + 1)}>t</button>
		{'t=' + tick}
	</div>
}

export function ConditionalMemo({ log }: { log: (entry: string) => void }) @{
	const [on, setOn] = useState(false);
	const [d, setD] = useState(1);
	if (on) {
		const v = useMemo(() => {
			log('compute:' + d);
			return d;
		}, [d]);
		log('render:' + v);
	}
	<div>
		<button id="on" onClick={() => setOn(!on)}>o</button>
		<button id="d" onClick={() => setD(d + 1)}>d</button>
		{'on=' + on + ' d=' + d}
	</div>
}

export function CallbackIdentity({ log }: { log: (entry: string) => void }) @{
	const [tick, setTick] = useState(0);
	const [d, setD] = useState(0);
	const cb = useCallback(() => log('cb:' + d), [d]);
	const last = useRef<(() => void) | null>(null);
	log(last.current === cb ? 'same' : 'new');
	last.current = cb;
	<div>
		<button id="tick" onClick={() => setTick(tick + 1)}>t</button>
		<button id="d" onClick={() => setD(d + 1)}>d</button>
		<button id="fire" onClick={cb}>f</button>
		{'t=' + tick + ' d=' + d}
	</div>
}

function SuspendingReader({
	log,
	promise,
}: {
	log: (entry: string) => void;
	promise: Promise<string>;
}) @{
	const [d] = useState(5);
	const v = useMemo(() => {
		log('compute');
		return d + 1;
	}, [d]);
	const data = use(promise);
	<p>{'v=' + v + ' data=' + data}</p>
}

export function MemoAcrossSuspend({
	log,
	promise,
}: {
	log: (entry: string) => void;
	promise: Promise<string>;
}) @{
	@try {
		<SuspendingReader log={log} promise={promise} />
	} @pending {
		<p>loading</p>
	}
}
