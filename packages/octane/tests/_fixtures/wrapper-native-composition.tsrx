import type { OctaneNode } from 'octane';
import { NativeView } from './wrapper-native-view.tsrx';
import type { NativeViewProps } from './wrapper-native-view.tsrx';

function Child(props: NativeViewProps) @{
	<article>
		<NativeView initial={props.initial} label={props.label} />
	</article>
}

function Wrapper(props: NativeViewProps) @{
	<Child {...props} />
}

export function App(props: NativeViewProps) @{
	<Wrapper initial={props.initial} label={props.label} />
}

function Deep17(props: NativeViewProps) @{
	<Child {...props} />
}
function Deep16(props: NativeViewProps) @{
	<Deep17 {...props} />
}
function Deep15(props: NativeViewProps) @{
	<Deep16 {...props} />
}
function Deep14(props: NativeViewProps) @{
	<Deep15 {...props} />
}
function Deep13(props: NativeViewProps) @{
	<Deep14 {...props} />
}
function Deep12(props: NativeViewProps) @{
	<Deep13 {...props} />
}
function Deep11(props: NativeViewProps) @{
	<Deep12 {...props} />
}
function Deep10(props: NativeViewProps) @{
	<Deep11 {...props} />
}
function Deep9(props: NativeViewProps) @{
	<Deep10 {...props} />
}
function Deep8(props: NativeViewProps) @{
	<Deep9 {...props} />
}
function Deep7(props: NativeViewProps) @{
	<Deep8 {...props} />
}
function Deep6(props: NativeViewProps) @{
	<Deep7 {...props} />
}
function Deep5(props: NativeViewProps) @{
	<Deep6 {...props} />
}
function Deep4(props: NativeViewProps) @{
	<Deep5 {...props} />
}
function Deep3(props: NativeViewProps) @{
	<Deep4 {...props} />
}
function Deep2(props: NativeViewProps) @{
	<Deep3 {...props} />
}
function Deep1(props: NativeViewProps) @{
	<Deep2 {...props} />
}
function Deep0(props: NativeViewProps) @{
	<Deep1 {...props} />
}

export function DeepApp(props: NativeViewProps) @{
	<Deep0 initial={props.initial} label={props.label} />
}

interface OpaqueProps {
	content: OctaneNode;
}

function OpaqueChild(props: OpaqueProps) @{
	<article>{props.content}</article>
}

function OpaqueWrapper(props: OpaqueProps) @{
	<OpaqueChild {...props} />
}

export function OpaqueApp(props: OpaqueProps) @{
	<OpaqueWrapper content={props.content} />
}
