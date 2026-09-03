/** @jsxImportSource octane */
import { createElement, memo } from 'octane';
import type {
	ComponentProps,
	ComponentPropsWithoutRef,
	ComponentRef,
	CustomComponentPropsWithRef,
	CSSProperties,
	Dispatch,
	FC,
	HTMLAttributes,
	InputHTMLAttributes,
	JSX,
	MouseEventHandler,
	PropsWithChildren,
	ReactElement,
	ReactNode,
	Ref,
	SetStateAction,
} from 'octane';

const View: FC<PropsWithChildren<{ label: string }>> = (props) =>
	createElement('div', { children: props.label });
const element: ReactElement = createElement(View, { label: 'example' });
const node: ReactNode = element;
const props: ComponentProps<typeof View> = { label: 'example', children: node };
const customProps: CustomComponentPropsWithRef<typeof View> = props;
// @ts-expect-error Required component props remain required.
const missingProps: ComponentProps<typeof View> = {};

const style: CSSProperties = { scale: 1.5, cssFloat: 'left' };
const attributes: HTMLAttributes<HTMLDivElement> = {
	className: ['a', { b: true }],
	style,
	onClick(event) {
		event.currentTarget.dataset.clicked = 'true';
		// @ts-expect-error Octane exposes native events, not synthetic wrappers.
		event.nativeEvent;
	},
};
const input: InputHTMLAttributes<HTMLInputElement> = {
	onInput(event) {
		event.currentTarget.value = event.data ?? '';
	},
};
const ref: Ref<HTMLInputElement> = [{ current: null }, (value) => value?.focus()];
const inputProps: ComponentProps<'input'> = { ...input, ref };
const unreferenced: ComponentPropsWithoutRef<'input'> = { defaultValue: 'initial' };
// @ts-expect-error The without-ref utility removes refs from intrinsic props.
unreferenced.ref = ref;
const inputNode: ComponentRef<'input'> = document.createElement('input');
// @ts-expect-error Input refs do not resolve to unrelated host elements.
const wrongNode: ComponentRef<'input'> = document.createElement('div');

const onClick: MouseEventHandler<HTMLButtonElement> = (event) => {
	event.currentTarget.disabled = true;
	event.preventDefault();
};
const button: JSX.Element = <button onClick={onClick}>Press</button>;
const dispatch: Dispatch<SetStateAction<number>> = (update) => {
	const result: number = typeof update === 'function' ? update(1) : update;
	return result;
};
dispatch((value) => value + 1);
// @ts-expect-error State dispatch preserves the state type.
dispatch('wrong');

function GenericView<T>(props: { value: T; onValue: (value: T) => void }) {
	return createElement('button', { onClick: () => props.onValue(props.value) });
}
const MemoGeneric = memo(GenericView);
const genericComponent: typeof GenericView = MemoGeneric;
const genericInner: typeof GenericView = MemoGeneric.type;
const genericElement = <MemoGeneric value={42} onValue={(value) => value.toFixed()} />;
// @ts-expect-error Generic props retain the relationship between value and callback.
const badGenericElement = <MemoGeneric value={42} onValue={(value: string) => value.trim()} />;
memo(View, (previous, next) => {
	// @ts-expect-error Comparator props retain the component's declared properties.
	previous.missing;
	return previous.label === next.label;
});
const MemoExplicit = memo<{ label: string }>(
	View,
	(previous, next) => previous.label === next.label,
);
const explicitElement = <MemoExplicit label="preserved" />;
// @ts-expect-error Explicit prop type arguments keep required props.
const badExplicitElement = <MemoExplicit />;
