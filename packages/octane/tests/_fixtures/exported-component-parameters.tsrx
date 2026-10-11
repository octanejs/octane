import { memo, useEffect, useState } from 'octane';

export function useGetterState() {
	return useState(0);
}

function Child({ text }: { text: string }) @{
	<div>{text}</div>
}

export function App({ entryParameterState }: { entryParameterState?: number; marker?: string }) @{
	<Child text="123" />
}

interface ParentProps {
	report: (event: 'connect' | 'disconnect') => void;
	marker: () => string;
}

function ParentBody(props: ParentProps) @{
	useEffect(() => {
		props.report('connect');
		return () => props.report('disconnect');
	}, null);
	<section>
		<App marker={props.marker()} />
	</section>
}

const Parent = memo(ParentBody);

export function Host(props: ParentProps) @{
	<Parent report={props.report} marker={props.marker} />
}
