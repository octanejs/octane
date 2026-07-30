import { useContext } from 'octane';
import { LayoutGroup, LayoutGroupContext, motion } from '@octanejs/motion';

export function GroupedHero(props) @{
	<LayoutGroup id={props.groupId}>
		<motion.div
			id="grouped-hero"
			layoutId="hero"
			transition={{ duration: 0.2 }}
		>{'hero'}</motion.div>
	</LayoutGroup>
}

export function GroupedHeroSwitch(props) @{
	<LayoutGroup id="pipeline">
		@if (props.active === 'before') {
			<motion.div
				id="grouped-hero-before"
				layoutId="hero"
				transition={{ duration: 0.2 }}
			>{'before'}</motion.div>
		} @else {
			<motion.div
				id="grouped-hero-after"
				layoutId="hero"
				transition={{ duration: 0.2 }}
			>{'after'}</motion.div>
		}
	</LayoutGroup>
}

export function GroupedNamedHero(props) @{
	<LayoutGroup id={props.groupId}>
		<motion.div
			id="grouped-named-hero"
			layoutId={props.layoutId}
			transition={{ duration: 0.2 }}
		>{'hero'}</motion.div>
	</LayoutGroup>
}

function GroupIdLabel() @{
	const group = useContext(LayoutGroupContext);
	<span id="layout-group-id">{group.id as string}</span>
}

export function NestedGroupId() @{
	<LayoutGroup id="a-b">
		<LayoutGroup id="c">
			<GroupIdLabel />
		</LayoutGroup>
	</LayoutGroup>
}
