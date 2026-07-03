import { useState, createPortal, createContext, use, memo } from 'octane';

export const Theme = createContext('light');

function ModalBody(props) @{
	<div class="modal">
		{props.label as string}
	</div>
}

function ThemedBody() @{
	const theme = use(Theme);
	<div class="modal themed">
		{theme as string}
	</div>
}

// 1. A component that RETURNS a createPortal VALUE (not at a host-element child).
export function ReturnPortal(props) {
	return createPortal(ModalBody, props.target, { label: 'return' });
}

// 2. createPortal inside a ternary at a JSX child position (no host wrapper around
//    the portal itself).
export function TernaryPortal(props) @{
	const [open, setOpen] = useState(true);
	<div class="root">
		<button onClick={() => setOpen(!open)}>{'toggle'}</button>
		{open ? createPortal(ModalBody, props.target, { label: 'ternary' }) : null}
	</div>
}

// 3. createPortal at a FRAGMENT root.
export function FragmentPortal(props) @{
	<>
		{createPortal(ModalBody, props.target, { label: 'fragment' })}
	</>
}

// 4. Context flows through a value-position portal.
export function ThemedReturnPortal(props) @{
	<Theme.Provider value="dark">
		<ReturnThemed target={props.target} />
	</Theme.Provider>
}

function ReturnThemed(props) {
	return createPortal(ThemedBody, props.target, undefined);
}

// 5b. createPortal with INLINE component JSX as the body (React-shape:
//     createPortal(<Comp/>, target)) — lowered to an ElementDescriptor body.
function InnerComp(props) @{
	<div class="modal inline">
		{props.label as string}
	</div>
}
export function InlineJsxPortal(props) {
	return createPortal(<InnerComp label="inline" />, props.target);
}

// 6. A component whose RETURN flips between a singleRoot component (markerless
//    componentSlot path), null, and a portal — all at renderBlock's return slot 0.
//    This is the placeholder-toggle / menu-open-close shape that must not corrupt
//    the slot when it switches kind.
function SoloDiv(props) @{
	<div class="solo">
		{props.label as string}
	</div>
}
function Flipper(props) {
	if (props.mode === 'null') {
		return null;
	}
	if (props.mode === 'portal') {
		return createPortal(SoloDiv, props.target, { label: 'portal' });
	}
	return <SoloDiv label="solo" />;
}
export function FlipApp(props) @{
	const [mode, setMode] = useState('solo');
	<div class="root">
		<button class="b-solo" onClick={() => setMode('solo')}>{'solo'}</button>
		<button class="b-null" onClick={() => setMode('null')}>{'null'}</button>
		<button class="b-portal" onClick={() => setMode('portal')}>{'portal'}</button>
		<Flipper mode={mode} target={props.target} />
	</div>
}

// 7. A memo boundary whose RETURN is a createPortal value: on a provider-value
//    change with equal props the memo BAILS, and the lazy context propagation must
//    reach the consumer INSIDE the portal (the content Block lives in the childSlot's
//    embedded PortalSlot, not in state.block).
function PortalIndirectionImpl(props) {
	return createPortal(ThemedBody, props.target, undefined);
}
const PortalIndirection = memo(PortalIndirectionImpl);

export function MemoPortalApp(props) @{
	const [theme, setTheme] = useState('light');
	<div class="root">
		<button class="b-dark" onClick={() => setTheme('dark')}>{'dark'}</button>
		<Theme.Provider value={theme}>
			<PortalIndirection target={props.target} />
		</Theme.Provider>
	</div>
}

// 8. A `{expr}` hole in a template-less body (→ the textSlot fast path) whose value
//    flips between a createPortal descriptor and a plain string: the flip must route
//    through the full childSlot classifier so the portal is torn down.
function ValueHole(props) @{
	<>
		{props.value}
	</>
}

export function TextPortalFlip(props) @{
	const [showPortal, setShowPortal] = useState(true);
	<div class="root">
		<button class="b-flip" onClick={() => setShowPortal(!showPortal)}>{'flip'}</button>
		<ValueHole
			value={showPortal ? createPortal(ModalBody, props.target, { label: 'text-flip' }) : 'plain'}
		/>
	</div>
}

// 5. App that toggles a value-position portal on/off (cleanup test).
export function ToggleApp(props) @{
	const [open, setOpen] = useState(true);
	<div class="root">
		<button onClick={() => setOpen(!open)}>{'toggle'}</button>
		{open ? createPortal(ModalBody, props.target, { label: 'toggle' }) : null}
	</div>
}
