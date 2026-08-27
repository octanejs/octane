import { useLayoutEffect, useMemo, useMemo as memo } from 'octane';
import * as Octane from 'octane';

export interface MemoReaderProps {
	read$: () => string;
	label?: string;
	log?: (value: string) => void;
}

export function MemoContracts(props: MemoReaderProps) @{
	const inferred = useMemo(props.read$);
	const fixed = useMemo(props.read$, []);
	const always = useMemo(props.read$, null);
	<section>
		<span class="label">{props.label ?? ''}</span>
		<output class="inferred">{inferred as string}</output>
		<output class="fixed">{fixed as string}</output>
		<output class="always">{always as string}</output>
	</section>
}

export function MemoAlias(props: MemoReaderProps) @{
	const value = memo(() => props.read$());
	<output>{value as string}</output>
}

export function MemoNamespace(props: MemoReaderProps) @{
	const value = Octane.useMemo(() => props.read$());
	<output>{value as string}</output>
}

function useLabel$(read$: () => string) {
	return useMemo(() => read$());
}

export function MemoCustomHook(props: MemoReaderProps) @{
	const value = useLabel$(props.read$);
	<output>{value as string}</output>
}

export function MemoSelected(props: {
	choose$: () => boolean;
	left$: () => string;
	right$: () => string;
	label?: string;
}) @{
	const value = useMemo(() => props.choose$() ? props.left$() : props.right$());
	<section>
		<span>{props.label ?? ''}</span>
		<output>{value as string}</output>
	</section>
}

export function MemoValue(props: MemoReaderProps) @{
	const value = useMemo(() => props.read$());
	useLayoutEffect(() => props.log?.(value), [value, props.log]);
	<output>{value as string}</output>
}

export function MemoPending(props: MemoReaderProps) @{
	@try {
		<MemoValue {...props} />
	} @pending {
		<p class="pending">{'waiting'}</p>
	} @catch (error) {
		<p class="error">{String(error)}</p>
	}
}
