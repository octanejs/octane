import { createContext, memo, use, useContext, useLayoutEffect, useState } from 'octane';
import { Canvas } from '/packages/octane/tests/_fixtures/universal-renderer-boundaries.tsrx';

const LocalTone = createContext('default');

function useLocalState(initial) {
	return useState(initial);
}

function LocalShadow() @{
	<wrong-shadow />
}

function DomShadow(props) @{
	<span data-shadow={props.label}>dom shadow</span>
}

function LocalItem(props) @{
	const tone = useContext(LocalTone);
	const [count, setCount] = useLocalState(0);
	useLayoutEffect(() => {
		props.log(`item-layout:${props.id}:${count}`);
		return () => props.log(`item-cleanup:${props.id}:${count}`);
	}, [props.log, props.id, count]);
	<mesh-item
		itemId={props.id}
		tone={tone}
		count={count}
		onSelect={(event) => setCount((value) => value + event.delta)}
	/>
}

const LocalCaption = memo(function LocalCaption(props) {
	return <scene-caption>{props.children}</scene-caption>;
});

function LocalScene({ items, caption, log, LocalShadow }) @{
	<scene-local caption={caption}>
		@for (const item of items; key item.id) {
			<LocalItem id={item.id} log={log} />
		}
		<LocalCaption>
			caption:
			{caption as string}
		</LocalCaption>
		<LocalShadow label={caption} />
	</scene-local>
}

export function LocalSpecializationApp(props) @{
	<LocalTone.Provider value={props.tone}>
		<>
			<aside class="dom-specialization">
				<LocalScene items={[]} caption="dom" log={props.log} LocalShadow={DomShadow} />
			</aside>
			<Canvas root={props.root}>
				<LocalScene
					items={props.items}
					caption={props.caption}
					log={props.log}
					LocalShadow={props.shadow}
				/>
				<entry-hooks
					state={useLocalState(props.initial)[0]}
					tone={useContext(LocalTone)}
					first={use(props.first)}
					second={use(props.second)}
				/>
			</Canvas>
		</>
	</LocalTone.Provider>
}
