import { Children, cloneElement, createElement } from 'octane';

function MappedPromise(props) {
	return Children.map([props.value], (child) => cloneElement(child, { children: 'hi' }));
}

export function PromiseChildrenHost(props) @{
	<>
		@try {
			<MappedPromise value={props.value} />
		} @pending {
			<span class="children-pending">{'Loading...'}</span>
		} @catch (error) {
			<span class="children-error">{String(error.message) as string}</span>
		}
	</>
}

function MappedLazy(props) {
	const child = createElement(props.component, { key: 'hi' });
	return Children.map([child], (value) => cloneElement(value, { children: 'hi' }));
}

export function LazyChildrenHost(props) @{
	<>
		@try {
			<MappedLazy component={props.component} />
		} @pending {
			<span class="children-pending">{'Loading...'}</span>
		} @catch (error) {
			<span class="children-error">{String(error.message) as string}</span>
		}
	</>
}

export function LazyChild(props) @{
	<div class="lazy-child">{String(props.children) as string}</div>
}
