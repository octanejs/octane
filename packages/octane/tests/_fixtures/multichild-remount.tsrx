import { useEffect } from 'octane';

// Remount-vs-reuse triad fixtures — ports facebook/react ReactMultiChild-test.js
// reconciliation cases. Each leaf carries a `data-k` so the identity harness can
// decide preserved-vs-remounted by DOM-node identity, and a useEffect that logs
// `mount:<id>` / `cleanup:<id>` so lifecycle (componentDidMount /
// componentWillUnmount equivalents) is observable through `props.log`.

// A leaf whose intrinsic element TYPE is prop-driven. Same type + same key
// across renders => update in place (no remount). Changing the type at the same
// position => remount.  We model React's class `<MockComponent>` (renders a
// <span>) being swapped for a plain `<span />` of a different host type by
// flipping `props.tag` between 'span' and 'div'. Both branches share key/data-k
// "leaf" but differ in element type, so a flip is a TYPE change at one position.
export function TypedLeaf(props) @{
	const id = props.tag;
	useEffect(() => {
		props.log?.('mount:' + id);
		return () => props.log?.('cleanup:' + id);
	}, []);
	@if (props.tag === 'span') {
		<span data-k="leaf" data-tag="span">
			{'leaf' as string}
		</span>
	} @else {
		<div data-k="leaf" data-tag="div">
			{'leaf' as string}
		</div>
	}
}

// A keyed child component. The host renders <Child key={props.k} .../> so the
// component-slot key is prop-driven. Same key => reuse (update in place, mount
// effect runs once). New key => unmount-old + mount-new (cleanup then mount).
export function KeyedChild(props) @{
	useEffect(() => {
		props.log?.('mount:' + props.k);
		return () => props.log?.('cleanup:' + props.k);
	}, []);
	<span data-k={props.k as string} data-key={props.k as string}>
		{'child' as string}
	</span>
}

export function KeyHost(props) @{
	<div>
		<KeyedChild key={props.k} k={props.k} log={props.log} />
	</div>
}

// Same key + same element type, prop-driven content. Re-rendering with new props
// must update in place: the DOM node and the mount effect are preserved.
export function StableLeaf(props) @{
	useEffect(() => {
		props.log?.('mount');
		return () => props.log?.('cleanup');
	}, []);
	<div>
		<span data-k="leaf" id="leaf">
			{props.text as string}
		</span>
	</div>
}

// Implicit-key type change at one position with a trailing static sibling —
// ReactIncrementalSideEffects-test.js:185. `<ClassComponent>` (renders span
// prop="Class") vs `<FunctionComponent>` (renders span prop="Function") vs text
// vs nothing, each at the same conditional slot, followed by a constant "Trail"
// node. No explicit keys: position-implicit reconciliation. A type change at the
// slot remounts; the trailing sibling is preserved across all of it.
export function ClassLike(props) @{
	useEffect(() => {
		props.log?.('mount:Class');
		return () => props.log?.('cleanup:Class');
	}, []);
	<span data-k="slot" data-prop="Class">
		{'Class' as string}
	</span>
}

export function FunctionLike(props) @{
	useEffect(() => {
		props.log?.('mount:Function');
		return () => props.log?.('cleanup:Function');
	}, []);
	<span data-k="slot" data-prop="Function">
		{'Function' as string}
	</span>
}

// Drives the implicit-key variant: the conditional slot picks ClassLike /
// FunctionLike / text / nothing, the trailing <b data-k="trail"> is constant.
export function ImplicitTypeChange(props) @{
	<div>
		@if (props.useClass) {
			<ClassLike log={props.log} />
		} @else {
			@if (props.useFunction) {
				<FunctionLike log={props.log} />
			} @else {
				@if (props.useText) {
					<span data-k="slot" data-prop="Text">
						{'Text' as string}
					</span>
				}
			}
		}
		<b data-k="trail" id="trail">
			{'Trail' as string}
		</b>
	</div>
}

// Explicit-key type change — ReactIncrementalSideEffects-test.js:247. Same key
// "a" on both branches, but the element TYPE differs (ClassLike vs FunctionLike),
// so the slot still remounts. Trailing <b data-k="trail"> preserved.
export function ExplicitTypeChange(props) @{
	<div>
		@if (props.useClass) {
			<ClassLike key="a" log={props.log} />
		} @else {
			@if (props.useFunction) {
				<FunctionLike key="a" log={props.log} />
			}
		}
		<b data-k="trail" id="trail">
			{'Trail' as string}
		</b>
	</div>
}
