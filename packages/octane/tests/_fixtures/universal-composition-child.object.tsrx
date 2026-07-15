import { useContext, useEffect, useInsertionEffect, useLayoutEffect, useState } from 'octane';

function ItemLeaf(props) @{
	useInsertionEffect(() => {
		props.log(`leaf-insertion:${props.id}`);
		return () => props.log(`leaf-insertion-cleanup:${props.id}`);
	}, [props.id, props.log]);
	useLayoutEffect(() => {
		props.log(`leaf-layout:${props.id}`);
		return () => props.log(`leaf-layout-cleanup:${props.id}`);
	}, [props.id, props.log]);
	useEffect(() => {
		props.log(`leaf-passive:${props.id}`);
		return () => props.log(`leaf-passive-cleanup:${props.id}`);
	}, [props.id, props.log]);
	<item
		{...props.hostFirst}
		key={props.id}
		label={props.label}
		{...props.hostLast}
		id={props.id}
		theme={props.theme}
		count={props.count}
		ref={props.ref}
		onPress={props.onPress}
	>{props.children}</item>
}

export function ImportedItem(props) @{
	const theme = useContext(props.themeContext);
	const [count, setCount] = useState(props.initial);
	useInsertionEffect(() => {
		props.log(`item-insertion:${props.id}`);
		return () => props.log(`item-insertion-cleanup:${props.id}`);
	}, [props.id, props.log]);
	useLayoutEffect(() => {
		props.log(`item-layout:${props.id}`);
		return () => props.log(`item-layout-cleanup:${props.id}`);
	}, [props.id, props.log]);
	useEffect(() => {
		props.log(`item-passive:${props.id}`);
		return () => props.log(`item-passive-cleanup:${props.id}`);
	}, [props.id, props.log]);
	<ItemLeaf
		{...props}
		theme={theme}
		count={count}
		onPress={props.listen
			? (event) => {
					props.log(`press:${props.handler}:${props.id}:${event.delta}`);
					setCount((value) => value + event.delta);
				}
			: undefined}
	/>
}
