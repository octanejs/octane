import { createContext, memo, useContext, useState } from 'octane';

export const AutoMemoContext = createContext('t0');

let opaqueVersion = 0;

export function bumpAutoMemoOpaqueVersions(): void {
	opaqueVersion++;
}

function ChildImpl(props) @{
	const theme = useContext(AutoMemoContext);
	const [own, setOwn] = useState(0);
	<li data-id={props.id as string}>
		<button class={'own-' + props.id} onClick={() => setOwn((value) => value + 1)}>
			{theme + ':' + props.label + ':' + own}
		</button>
	</li>
}

export const AutoMemoChild = memo(ChildImpl);

export function AutoMemoOpaqueChild() @{
	<span class="opaque">
		{'opaque ' + opaqueVersion}
	</span>
}

export function AutoMemoOpaqueReturned() {
	return <>
		<span class="returned-opaque-a">
			{'returned opaque a ' + opaqueVersion}
		</span>
		<span class="returned-opaque-b">
			{'returned opaque b ' + opaqueVersion}
		</span>
	</>;
}

function CustomChildImpl() @{
	<span class="custom">
		{'custom ' + opaqueVersion}
	</span>
}

export const AutoMemoCustomChild = memo(CustomChildImpl, () => false);
