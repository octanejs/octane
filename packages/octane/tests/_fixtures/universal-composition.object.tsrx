import {
	createContext,
	use,
	useEffect,
	useInsertionEffect,
	useLayoutEffect,
	useState,
} from 'octane';
import { ImportedItem as AliasedItem } from './universal-composition-child.object.tsrx';

export const CompositionTheme = createContext('default');

function LocalStatus(props) {
	if (props.mode === 'null') return null;
	if (props.mode === 'primitive') return props.tail;
	if (props.mode === 'array') {
		return [
			<badge key="badge" value={props.value} />,
			props.tail,
			null,
		];
	}
	if (props.mode === 'fragment') {
		return <>
			<badge value={props.value} />
			<fragment-marker value={props.tail} />
		</>;
	}
	return <badge value={props.value} />;
}

function MaybeResult(props) {
	if (props.fail) throw new Error(`failed:${props.value}`);
	if (props.resource) return <result value={use(props.resource)} />;
	return <result value={props.value} />;
}

export function CompositionScene(props) @{
	useInsertionEffect(() => {
		props.log('scene-insertion');
		return () => props.log('scene-insertion-cleanup');
	}, [props.log]);
	useLayoutEffect(() => {
		props.log('scene-layout');
		return () => props.log('scene-layout-cleanup');
	}, [props.log]);
	useEffect(() => {
		props.log('scene-passive');
		return () => props.log('scene-passive-cleanup');
	}, [props.log]);
	function InlineMarker(markerProps) {
		return markerProps.show ? <inline-marker value={markerProps.value} /> : null;
	}
	<scene {...props.sceneFirst} tone="explicit" {...props.sceneLast}>
		<CompositionTheme.Provider value={props.theme}>
			<LocalStatus mode={props.statusMode} value={props.statusValue} tail={props.tail} />
			<InlineMarker show={props.showInline} value={props.statusValue} />
			@if (props.showIf) {
				<if-branch value="then" />
			} @else {
				<if-branch value="else" />
			}
			@switch (props.variant) {
				@case 'a': {
					<switch-branch value="a" />
				}
				@case 'b': {
					<switch-branch value="b" />
				}
				@default: {
					<switch-branch value="default" />
				}
			}
			@for (const item of props.items; key item.id) {
				<AliasedItem
					{...item.componentFirst}
					key={item.id}
					id={item.id}
					label={'explicit:' + item.id}
					{...item.componentLast}
					themeContext={CompositionTheme}
					hostFirst={item.hostFirst}
					hostLast={item.hostLast}
					ref={props.refFor(item.id)}
					handler={props.handler}
					listen={item.listen}
					log={props.log}
				>
					<payload owner={item.id} />
				</AliasedItem>
			} @empty {
				<empty-list value="empty" />
			}

			@try {
				<MaybeResult fail={props.failResult} resource={props.resource} value={props.resultValue} />
			} @pending {
				<pending-result value="pending" />
			} @catch (error, reset) {
				<caught-result value={error.message} onReset={reset} />
			}
		</CompositionTheme.Provider>
	</scene>
}

function AtomicChild(props) @{
	const [count, setCount] = useState(props.initial);
	useLayoutEffect(() => {
		props.log(`atomic-layout:${props.value}`);
		return () => props.log(`atomic-cleanup:${props.value}`);
	}, [props.log, props.value]);
	if (props.bumpDraft) setCount((value) => value + 10);
	if (props.mode === 'error') throw new Error('atomic render failed');
	const resolved =
		props.mode === 'suspend' ? use(props.resource) : props.value;
	<atomic-node
		value={resolved}
		count={count}
		ref={props.hostRef}
		onPress={props.listen
			? (event) => {
					props.log(`atomic-press:${props.handler}:${event.delta}`);
					setCount((value) => value + event.delta);
				}
			: undefined}
	/>
}

export function AtomicScene(props) @{
	<atomic-root>
		<AtomicChild {...props} />
	</atomic-root>
}
