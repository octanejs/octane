import {
	ViewTransition,
	createPortal,
	use,
	useEffect,
	useLayoutEffect,
	useState,
	type ViewTransitionInstance,
} from 'octane';

interface Props {
	controls: Record<string, (value: string) => void>;
	events: string[];
	onEffect?: (id: string, value: string) => void;
	promise?: Promise<string>;
	scopeEvents?: string[];
	invalidScope?: boolean;
}

function Content(props: Props & { id: string }) @{
	const [value, setValue] = useState('initial');
	useLayoutEffect(() => {
		props.controls[props.id] = setValue;
	}, []);
	useEffect(() => {
		props.events.push(props.id + ':' + value);
		props.onEffect?.(props.id, value);
		return () => {
			props.events.push('cleanup:' + props.id + ':' + value);
		};
	}, [value]);
	<span data-value={props.id}>{value as string}</span>
}

export function ScopedEffectsApp(props: Props) @{
	<div>
		<ViewTransition scope="element" name="left-scope">
			<section data-scope="left">
				<ViewTransition name="item">
					<Content {...props} id="left" />
				</ViewTransition>
			</section>
		</ViewTransition>
		<ViewTransition
			scope="element"
			name="right-scope"
			onEnter={() => {
				props.scopeEvents?.push('enter:right');
			}}
			onUpdate={() => {
				props.scopeEvents?.push('update:right');
			}}
		>
			<section data-scope="right">
				@if (props.promise !== undefined) {
					@try {
						<ViewTransition name="item">
							<AsyncContent {...props} promise={props.promise} />
						</ViewTransition>
					} @pending {
						<span data-value="right">{'waiting'}</span>
					}
				} @else {
					<ViewTransition
						name="item"
						onParentEnter={() => {
							props.scopeEvents?.push('parent-enter:right-item');
						}}
					>
						<Content {...props} id="right" />
					</ViewTransition>
				}
			</section>
		</ViewTransition>
		<Content {...props} id="outside" />
		@if (props.invalidScope) {
			<ViewTransition scope="element">
				<>
					<Content {...props} id="invalid" />
					<span>Second host</span>
				</>
			</ViewTransition>
		}
	</div>
}

function AsyncContent(props: Props & { promise: Promise<string> }) @{
	const value = use(props.promise) as string;
	useEffect(() => {
		props.events.push('right:' + value);
	}, [value]);
	<span data-value="right">{value as string}</span>
}

export function ClippedScopeApp(props: Props) @{
	<ViewTransition
		scope="element"
		name="clip"
		onUpdate={() => {
			props.scopeEvents?.push('clipped');
		}}
	>
		<section data-scope="left" style={{ overflow: 'hidden' }}>
			<ViewTransition name="child">
				<Content {...props} id="child" />
			</ViewTransition>
		</section>
	</ViewTransition>
}

export function ScopeShapeApp(props: {
	value: string;
	shape: 'one' | 'multiple' | 'replacement';
}) @{
	<ViewTransition scope="element">
		@if (props.shape === 'multiple') {
			<>
				<section>{props.value as string}</section>
				<aside>{'second host'}</aside>
			</>
		} @else if (props.shape === 'replacement') {
			<article>{props.value as string}</article>
		} @else {
			<section>{props.value as string}</section>
		}
	</ViewTransition>
}

export function ScopedPortalApp(props: { value: string; portal: Element; clicks: string[] }) @{
	<ViewTransition scope="element">
		<section data-scope="portal-parent">
			{'local content'}
			{createPortal(
				<ViewTransition name="portal-content">
					<button onClick={() => props.clicks.push(props.value)}>{props.value as string}</button>
				</ViewTransition>,
				props.portal,
			)}
		</section>
	</ViewTransition>
}

export function ScopedImageApp(props: { value: string; inside: boolean }) @{
	<>
		<ViewTransition scope="element">
			<section data-scope="left">
				<span>{props.value as string}</span>
				@if (props.inside) {
					<img src={props.value + '.png'} />
				}
			</section>
		</ViewTransition>
		@if (!props.inside) {
			<img src={props.value + '.png'} />
		}
	</>
}

export function ScopedPortalMoveApp(props: {
	value: string;
	portal?: Element;
	hosts: Record<string, Element>;
	onRef: (instance: ViewTransitionInstance | null) => void;
	onExit: (instance: ViewTransitionInstance) => void;
	onEnter: (instance: ViewTransitionInstance) => void;
}) @{
	const target = props.portal ?? null;
	<>
		<ViewTransition scope="element">
			<section
				ref={(host) => {
					if (host !== null) props.hosts.left = host;
				}}
				data-scope="left"
			/>
		</ViewTransition>
		<ViewTransition scope="element">
			<section
				ref={(host) => {
					if (host !== null) props.hosts.right = host;
				}}
				data-scope="right"
			/>
		</ViewTransition>
		@if (target !== null) {
			<>
				{createPortal(
					<ViewTransition
						name="moving"
						ref={props.onRef}
						onExit={props.onExit}
						onEnter={props.onEnter}
					>
						<span>{props.value as string}</span>
					</ViewTransition>,
					target,
				)}
			</>
		}
	</>
}

export function ForeignScopedPortalApp(props: {
	portal: Element | null;
	value: string;
	onRender?: () => void;
}) {
	props.onRender?.();
	if (props.portal === null) return null;
	return createPortal(
		<ViewTransition name="foreign-moving">
			<span>{props.value as string}</span>
		</ViewTransition>,
		props.portal,
	);
}
