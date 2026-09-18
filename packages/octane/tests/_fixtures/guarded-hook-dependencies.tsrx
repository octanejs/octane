import { useLayoutEffect, useMemo } from 'octane';

export function GuardedIf({ item, log }) @{
	useLayoutEffect(() => {
		if (item) log(item.name);
	});
	<p>Ready</p>
}

export function GuardedEarlyReturn({ item, log }) @{
	useLayoutEffect(() => {
		if (!item) return;
		log(item.name);
	});
	<p>Ready</p>
}

export function GuardedLogical({ item, log }) @{
	useLayoutEffect(() => {
		item && log(item.name);
	});
	<p>Ready</p>
}

export function GuardedConditional({ item, log }) @{
	useLayoutEffect(() => {
		item ? log(item.name) : undefined;
	});
	<p>Ready</p>
}

export function GuardedSwitch({ item, log }) @{
	useLayoutEffect(() => {
		switch (item?.kind) {
			case 'value':
				log(item.name);
				break;
		}
	});
	<p>Ready</p>
}

export function GuardedLoop({ item, log }) @{
	useLayoutEffect(() => {
		while (item) {
			log(item.name);
			break;
		}
	});
	<p>Ready</p>
}

export function GuardedTry({ item, log }) @{
	useLayoutEffect(() => {
		try {
			log(item.name);
		} catch {
			log('missing');
		}
	});
	<p>Ready</p>
}

export function GuardedGetter({ item, enabled, log }) @{
	useLayoutEffect(() => {
		if (enabled) log(item.name);
	});
	<p>Ready</p>
}

export function GuardedMemo({ item }) @{
	const label = useMemo(() => item ? item.name : 'empty');
	<p>{label as string}</p>
}
