import {
	Manager,
	Popper,
	Reference,
	usePopper,
	type ManagerProps,
	type Modifier,
	type PopperChildrenProps,
	type RefHandler,
	type ReferenceChildrenProps,
	type ReferenceProps,
	type StrictModifier,
} from '@octanejs/popper';

const refHandler: RefHandler = function refHandler(node) {
	return node?.focus();
};
const managerProps: ManagerProps = { children: 'content' };
const referenceChildren: ReferenceChildrenProps = { ref: refHandler };
const referenceProps: ReferenceProps = { children: () => referenceChildren.ref };
const custom: Modifier<'custom', { enabled: boolean }> = {
	name: 'custom',
	enabled: true,
	options: { enabled: true },
};
const offset: StrictModifier<'offset'> = { name: 'offset', options: { offset: [0, 8] } };
void refHandler;
void managerProps;
void referenceProps;

Manager({ children: 'content' });
Reference({ children: ({ ref }) => ref });
Popper({
	placement: 'top-start',
	strategy: 'fixed',
	modifiers: [offset, custom],
	children: (props: PopperChildrenProps) => {
		props.style.left = 4;
		return props.placement;
	},
});
usePopper(document.createElement('button'), document.createElement('div'), {
	placement: 'bottom',
	modifiers: [offset, custom],
});

// @ts-expect-error placement must be a Popper placement
Popper({ placement: 'middle', children: (props) => props.placement });
// @ts-expect-error strict offset modifiers use Popper's offset options
const badOffset: StrictModifier<'offset'> = { name: 'offset', options: { offset: 'wrong' } };
void badOffset;
