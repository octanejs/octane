import { ViewTransition, useLayoutEffect, useState, type ViewTransitionInstance } from 'octane';

export interface AppProps {
	mode: 'single' | 'siblings' | 'nested' | 'mixed';
	generation: number;
	left: string;
	right: string;
	inner: string;
	page: string;
	rootName?: string;
	boundaryName?: string;
	classFollowsText?: boolean;
	scopeValue?: string;
	elementScope?: boolean;
	outerScope?: boolean;
	scopeRefs: Record<string, { current: ViewTransitionInstance | null }>;
	onLayout: (generation: number) => void;
	onOutsideClick: () => void;
	onTransition: (id: string, instance: ViewTransitionInstance, types: string[]) => () => void;
	onPanelControl: (id: string, update: ((text: string) => void) | null) => void;
}

interface PanelProps {
	id: string;
	text: string;
	inner?: string;
	rootName?: string;
	boundaryName?: string;
	classFollowsText?: boolean;
	scopeValue?: string;
	elementScope?: boolean;
	scopeRefs: AppProps['scopeRefs'];
	onTransition: AppProps['onTransition'];
	onPanelControl: AppProps['onPanelControl'];
}

function Panel(props: PanelProps) @{
	<ViewTransition
		scope={props.elementScope === false ? undefined : 'element'}
		name={props.boundaryName}
		ref={props.scopeRefs[props.id]}
		update="scope-update"
		onUpdate={(instance, types) => props.onTransition(props.id + '-root', instance, types)}
	>
		<PanelHost {...props} />
	</ViewTransition>
}

function PanelHost(props: PanelProps) @{
	const [localText, setLocalText] = useState<string | null>(null);
	const text = localText ?? props.text;
	useLayoutEffect(() => {
		props.onPanelControl(props.id, setLocalText);
		return () => props.onPanelControl(props.id, null);
	}, []);
	<section
		id={props.id}
		class={props.classFollowsText ? text : undefined}
		title={text}
		style={{ viewTransitionName: props.rootName, viewTransitionScope: props.scopeValue }}
	>
		<h2>{text as string}</h2>
		<ViewTransition
			name="shared"
			update="child-update"
			onUpdate={(instance, types) => props.onTransition(props.id, instance, types)}
		>
			<p data-content={props.id}>{text as string}</p>
		</ViewTransition>
		@if (props.inner !== undefined) {
			<Panel
				id="inner"
				text={props.inner}
				onTransition={props.onTransition}
				onPanelControl={props.onPanelControl}
				scopeRefs={props.scopeRefs}
			/>
		}
	</section>
}

export function App(props: AppProps) @{
	useLayoutEffect(() => props.onLayout(props.generation), [props.generation]);
	<main>
		<button id="outside" onClick={props.onOutsideClick}>Outside action</button>
		@if (props.mode === 'mixed') {
			<ViewTransition
				name="shared"
				update="child-update"
				onUpdate={(instance, types) => props.onTransition('page', instance, types)}
			>
				<aside data-content="page">{props.page as string}</aside>
			</ViewTransition>
		}
		<ViewTransition scope={props.outerScope ? 'element' : undefined}>
			<Panel
				id="left"
				text={props.left}
				inner={props.mode === 'nested' || props.mode === 'mixed' ? props.inner : undefined}
				rootName={props.rootName}
				boundaryName={props.boundaryName}
				classFollowsText={props.classFollowsText}
				scopeValue={props.scopeValue}
				elementScope={props.elementScope}
				scopeRefs={props.scopeRefs}
				onTransition={props.onTransition}
				onPanelControl={props.onPanelControl}
			/>
		</ViewTransition>
		@if (props.mode === 'siblings' || props.mode === 'mixed') {
			<Panel
				id="right"
				text={props.right}
				onTransition={props.onTransition}
				onPanelControl={props.onPanelControl}
				scopeRefs={props.scopeRefs}
			/>
		}
	</main>
}
