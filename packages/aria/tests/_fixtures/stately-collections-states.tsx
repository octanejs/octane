import { useState } from 'octane';
// Phase-2 collection/state hooks are not on the public entry yet (export wiring is
// owned by the coordinating session), so fixtures import from source paths.
import { Item } from '../../src/stately/collections/Item';
import { useListState } from '../../src/stately/list/useListState';
import { useSingleSelectListState } from '../../src/stately/list/useSingleSelectListState';
import { useTreeState } from '../../src/stately/tree/useTreeState';
import { useTabListState } from '../../src/stately/tabs/useTabListState';
import { useMenuTriggerState } from '../../src/stately/menu/useMenuTriggerState';
import { useSubmenuTriggerState } from '../../src/stately/menu/useSubmenuTriggerState';
import { useSelectState } from '../../src/stately/select/useSelectState';
import { useComboBoxState } from '../../src/stately/combobox/useComboBoxState';
import { useNumberFieldState } from '../../src/stately/numberfield/useNumberFieldState';
import { useSliderState } from '../../src/stately/slider/useSliderState';

// --- useListState (dynamic items + render function, multiple selection) ---

export function ListHarness() {
	const [items, setItems] = useState([
		{ id: 'a', name: 'Alpha' },
		{ id: 'b', name: 'Beta' },
		{ id: 'c', name: 'Gamma' },
	]);
	const state = useListState({
		items: items as any,
		children: ((item: { id: string; name: string }) => (
			<Item key={item.id}>{item.name}</Item>
		)) as any,
		selectionMode: 'multiple',
		defaultSelectedKeys: ['a'],
	});
	return (
		<div>
			<button data-testid="toggle-b" onClick={() => state.selectionManager.select('b')}>
				{'toggle b'}
			</button>
			<button
				data-testid="drop-a"
				onClick={() => setItems((prev) => prev.filter((i) => i.id !== 'a'))}
			>
				{'drop a'}
			</button>
			<output data-testid="nodes">
				{'n:' + [...state.collection].map((n: any) => n.key + '=' + n.textValue).join(',')}
			</output>
			<output data-testid="selected">
				{'s:' + [...state.selectionManager.selectedKeys].sort().join(',')}
			</output>
			<output data-testid="first">{'f:' + state.collection.getFirstKey()}</output>
		</div>
	);
}

// --- useSingleSelectListState ---

export function SingleSelectHarness() {
	const [log, setLog] = useState('none');
	const [count, setCount] = useState(0);
	const state = useSingleSelectListState({
		children: [
			<Item key="one">One</Item>,
			<Item key="two">Two</Item>,
			<Item key="three">Three</Item>,
		] as any,
		defaultSelectedKey: 'one',
		onSelectionChange: (key: any) => {
			setLog(String(key));
			setCount((c) => c + 1);
		},
	});
	return (
		<div>
			<button data-testid="set-two" onClick={() => state.setSelectedKey('two')}>
				{'set two'}
			</button>
			<button data-testid="select-two" onClick={() => state.selectionManager.select('two')}>
				{'select two'}
			</button>
			<output data-testid="selected">{'k:' + state.selectedKey}</output>
			<output data-testid="item">
				{'i:' + (state.selectedItem ? state.selectedItem.textValue : 'null')}
			</output>
			<output data-testid="log">{'log:' + log + ':' + count}</output>
		</div>
	);
}

// --- useTreeState ---

export function TreeHarness() {
	const [log, setLog] = useState('none');
	const rootChildren = [<Item key="c1">Child 1</Item>, <Item key="c2">Child 2</Item>];
	const state = useTreeState({
		children: [
			<Item key="root" title="Root">
				{rootChildren as any}
			</Item>,
			<Item key="solo">Solo</Item>,
		] as any,
		onExpandedChange: (keys: Set<any>) => setLog([...keys].join(',') || 'empty'),
	});
	return (
		<div>
			<button data-testid="toggle-root" onClick={() => state.toggleKey('root')}>
				{'toggle root'}
			</button>
			<button data-testid="collapse-all" onClick={() => state.setExpandedKeys(new Set())}>
				{'collapse'}
			</button>
			<output data-testid="expanded">
				{'e:' + ([...state.expandedKeys].join(',') || 'empty')}
			</output>
			<output data-testid="size">{'size:' + state.collection.size}</output>
			<output data-testid="c1">{'c1:' + (state.collection.getItem('c1') ? 'yes' : 'no')}</output>
			<output data-testid="log">{'log:' + log}</output>
		</div>
	);
}

// --- useTabListState ---

export function TabsHarness() {
	const state = useTabListState({
		children: [
			<Item key="t1">Tab 1</Item>,
			<Item key="t2">Tab 2</Item>,
			<Item key="t3">Tab 3</Item>,
		] as any,
		disabledKeys: ['t1'],
	});
	return (
		<div>
			<button data-testid="set-t3" onClick={() => state.setSelectedKey('t3')}>
				{'t3'}
			</button>
			<button data-testid="select-disabled" onClick={() => state.selectionManager.select('t1')}>
				{'t1'}
			</button>
			<output data-testid="selected">{'k:' + state.selectedKey}</output>
			<output data-testid="disabled">{'d:' + [...state.disabledKeys].join(',')}</output>
			<output data-testid="isdisabled">{'dis:' + state.isDisabled}</output>
		</div>
	);
}

// --- useMenuTriggerState ---

export function MenuTriggerHarness() {
	const [log, setLog] = useState('none');
	const state = useMenuTriggerState({ onOpenChange: (o: boolean) => setLog(String(o)) });
	return (
		<div>
			<button data-testid="open-first" onClick={() => state.open('first')}>
				{'open'}
			</button>
			<button data-testid="toggle-last" onClick={() => state.toggle('last')}>
				{'toggle'}
			</button>
			<button data-testid="close" onClick={() => state.close()}>
				{'close'}
			</button>
			<button data-testid="open-sub" onClick={() => state.openSubmenu('sub1', 0)}>
				{'sub'}
			</button>
			<button data-testid="open-sub-deep" onClick={() => state.openSubmenu('deep', 5)}>
				{'deep'}
			</button>
			<output data-testid="open">{'open:' + state.isOpen}</output>
			<output data-testid="strategy">{'fs:' + state.focusStrategy}</output>
			<output data-testid="stack">
				{'stack:' + (state.expandedKeysStack.join(',') || 'empty')}
			</output>
			<output data-testid="log">{'log:' + log}</output>
		</div>
	);
}

// --- useSubmenuTriggerState ---

export function SubmenuHarness() {
	const root = useMenuTriggerState({ defaultOpen: true });
	const sub = useSubmenuTriggerState({ triggerKey: 'sub1' }, root);
	return (
		<div>
			<button data-testid="sub-toggle" onClick={() => sub.toggle('first')}>
				{'toggle'}
			</button>
			<button data-testid="sub-close-all" onClick={() => sub.closeAll()}>
				{'closeAll'}
			</button>
			<output data-testid="sub-state">{'sub:' + sub.isOpen + ':' + sub.submenuLevel}</output>
			<output data-testid="sub-strategy">{'fs:' + sub.focusStrategy}</output>
			<output data-testid="root-open">{'root:' + root.isOpen}</output>
		</div>
	);
}

// --- useSelectState ---

export function SelectHarness() {
	const [log, setLog] = useState('none');
	const state = useSelectState({
		items: [
			{ id: 'red', label: 'Red' },
			{ id: 'green', label: 'Green' },
			{ id: 'blue', label: 'Blue' },
		] as any,
		children: ((item: { id: string; label: string }) => (
			<Item key={item.id}>{item.label}</Item>
		)) as any,
		defaultSelectedKey: 'red',
		onSelectionChange: (k: any) => setLog(String(k)),
	});
	return (
		<div>
			<button data-testid="open" onClick={() => state.open()}>
				{'open'}
			</button>
			<button data-testid="select-green" onClick={() => state.selectionManager.select('green')}>
				{'green'}
			</button>
			<button data-testid="set-blue" onClick={() => state.setSelectedKey('blue')}>
				{'blue'}
			</button>
			<output data-testid="open-state">{'open:' + state.isOpen}</output>
			<output data-testid="value">{'v:' + state.value}</output>
			<output data-testid="selected-item">
				{'i:' + (state.selectedItem ? state.selectedItem.textValue : 'null')}
			</output>
			<output data-testid="log">{'log:' + log}</output>
		</div>
	);
}

export function SelectEmptyHarness() {
	const state = useSelectState({
		items: [] as any,
		children: ((item: { id: string; label: string }) => (
			<Item key={item.id}>{item.label}</Item>
		)) as any,
	});
	return (
		<div>
			<button data-testid="open" onClick={() => state.open()}>
				{'open'}
			</button>
			<output data-testid="open-state">{'open:' + state.isOpen}</output>
		</div>
	);
}

// --- useComboBoxState ---

export function ComboBoxHarness() {
	const state = useComboBoxState({
		defaultItems: [
			{ id: 'apple', label: 'Apple' },
			{ id: 'apricot', label: 'Apricot' },
			{ id: 'banana', label: 'Banana' },
		] as any,
		children: ((item: { id: string; label: string }) => (
			<Item key={item.id}>{item.label}</Item>
		)) as any,
		defaultFilter: (text: string, input: string) =>
			text.toLowerCase().startsWith(input.toLowerCase()),
	});
	return (
		<div>
			<button data-testid="focus" onClick={() => state.setFocused(true)}>
				{'focus'}
			</button>
			<button data-testid="type-ap" onClick={() => state.setInputValue('Ap')}>
				{'ap'}
			</button>
			<button
				data-testid="commit-focused"
				onClick={() => {
					state.selectionManager.setFocusedKey('apricot');
					state.commit();
				}}
			>
				{'commit'}
			</button>
			<output data-testid="open-state">{'open:' + state.isOpen}</output>
			<output data-testid="input">{'in:' + state.inputValue}</output>
			<output data-testid="items">
				{'items:' + [...state.collection].map((n: any) => n.key).join(',')}
			</output>
			<output data-testid="selected">{'k:' + state.selectedKey}</output>
		</div>
	);
}

// --- useNumberFieldState ---

export function NumberFieldHarness() {
	const [log, setLog] = useState('none');
	const state = useNumberFieldState({
		locale: 'en-US',
		defaultValue: 5,
		minValue: 0,
		maxValue: 10,
		onChange: (v: number) => setLog(String(v)),
		validate: (v: number) => (v > 8 ? 'Too big' : null),
	});
	return (
		<div>
			<button data-testid="inc" onClick={() => state.increment()}>
				{'+'}
			</button>
			<button data-testid="dec" onClick={() => state.decrement()}>
				{'-'}
			</button>
			<button data-testid="inc-max" onClick={() => state.incrementToMax()}>
				{'max'}
			</button>
			<button data-testid="dec-min" onClick={() => state.decrementToMin()}>
				{'min'}
			</button>
			<button data-testid="type-40" onClick={() => state.setInputValue('40')}>
				{'40'}
			</button>
			<button data-testid="commit" onClick={() => state.commit()}>
				{'commit'}
			</button>
			<output data-testid="input">{'in:' + state.inputValue}</output>
			<output data-testid="number">{'n:' + state.numberValue}</output>
			<output data-testid="can">{'can:' + state.canIncrement + ',' + state.canDecrement}</output>
			<output data-testid="invalid">
				{'inv:' +
					state.displayValidation.isInvalid +
					':' +
					state.displayValidation.validationErrors.join('|')}
			</output>
			<output data-testid="partial">
				{'p:' + state.validate('12') + ',' + state.validate('abc') + ',' + state.validate('-')}
			</output>
			<output data-testid="log">{'log:' + log}</output>
		</div>
	);
}

// --- useSliderState ---

export function SliderHarness() {
	const [log, setLog] = useState('none');
	const [endLog, setEndLog] = useState('none');
	const state = useSliderState({
		defaultValue: 20,
		minValue: 0,
		maxValue: 100,
		step: 10,
		numberFormatter: new Intl.NumberFormat('en-US'),
		onChange: (v: number) => setLog(String(v)),
		onChangeEnd: (v: number) => setEndLog(String(v)),
	});
	return (
		<div>
			<button data-testid="set-37" onClick={() => state.setThumbPercent(0, 0.37)}>
				{'37%'}
			</button>
			<button data-testid="inc" onClick={() => state.incrementThumb(0)}>
				{'+'}
			</button>
			<button data-testid="dec" onClick={() => state.decrementThumb(0)}>
				{'-'}
			</button>
			<button data-testid="set-33" onClick={() => state.setThumbValue(0, 33)}>
				{'33'}
			</button>
			<button data-testid="drag-start" onClick={() => state.setThumbDragging(0, true)}>
				{'drag'}
			</button>
			<button data-testid="drag-end" onClick={() => state.setThumbDragging(0, false)}>
				{'drop'}
			</button>
			<output data-testid="values">{'v:' + state.values.join(',')}</output>
			<output data-testid="percent">{'p:' + state.getThumbPercent(0)}</output>
			<output data-testid="label">{'l:' + state.getThumbValueLabel(0)}</output>
			<output data-testid="dragging">{'drag:' + state.isThumbDragging(0)}</output>
			<output data-testid="log">{'log:' + log}</output>
			<output data-testid="end">{'end:' + endLog}</output>
		</div>
	);
}
