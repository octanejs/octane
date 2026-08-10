import { animated, Spring, Trail, Transition } from '@octanejs/react-spring';
import { createElement } from 'octane';

export function SpringComponentFixture() @{
	<Spring
		from={{ opacity: 0 }}
		to={{ opacity: 1 }}
		immediate={true}
		children={(styles: any) =>
			<animated.div id="spring-component" style={styles}>{'ready'}</animated.div>}
	/>
}

export function TrailComponentFixture(props) @{
	const renderItem = (item: any) => (styles: any) => createElement(
		animated.div,
		{ 'data-item-id': item.id, style: styles },
		item.label,
	);
	<Trail
		items={props.items}
		from={{ opacity: 1 }}
		to={{ opacity: 1 }}
		immediate={true}
		children={renderItem}
	/>
}

export function TransitionComponentFixture(props) @{
	const renderItem = (item: any) => (styles: any) => createElement(
		animated.div,
		{ 'data-transition-id': item.id, style: styles },
		item.label,
	);
	<Transition
		items={props.items}
		keys={(item: any) => item.id}
		from={{ opacity: 1 }}
		enter={{ opacity: 1 }}
		leave={{ opacity: 1 }}
		immediate={true}
		expires={false}
		children={renderItem}
	/>
}
