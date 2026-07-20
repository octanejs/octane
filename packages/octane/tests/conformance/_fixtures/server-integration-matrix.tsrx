import {
	createContext,
	lazy,
	memo,
	useCallback,
	useContext,
	useMemo,
	useReducer,
	useRef,
	useState,
} from 'octane';

export function BasicArray() {
	return [
		<div key="first" id="basic-first">text1</div>,
		<span key="second" id="basic-second">text2</span>,
	];
}

export const ArrowArrayRoot = () => [
	<div key="arrow" id="arrow-root">arrow root</div>,
];

export function PrimitiveRoot(props) {
	if (props.mode === 'empty') return null;
	if (props.mode === 'element') return <span id="primitive-root-element">element</span>;
	return props.text;
}

export function BasicBigInt() {
	return BigInt(42);
}

export function AdjacentText(props) @{
	<div id="adjacent-text">
		{props.first as string}
		{props.second as string}
	</div>
}

export function AttributeValues() @{
	<section
		id="attribute-values"
		hidden={true}
		data-foobar={false}
		style={{ marginTop: 2, '--tone': 'blue' }}
	>
		<label htmlFor="attribute-target">label</label>
		<input id="attribute-target" size={2} />
	</section>
}

export function NestedFragment() @{
	<>
		<div id="fragment-first">text1</div>
		<>
			<span id="fragment-second">text2</span>
			<>
				{null}
				<p id="fragment-third" />
				{false}
			</>
		</>
	</>
}

export function ControlledInputMarkup() @{
	<input id="matrix-input" value="foo" defaultValue="bar" readOnly={true} />
}

export function ControlledCheckboxMarkup() @{
	<input
		id="matrix-checkbox"
		type="checkbox"
		checked={true}
		defaultChecked={false}
		readOnly={true}
	/>
}

export function ControlledTextareaMarkup() @{
	<textarea id="matrix-textarea" value="foo" defaultValue="bar" readOnly={true} />
}

function MatrixOption(props) @{
	<option value={props.value}>
		{props.value as string}
	</option>
}

export function ControlledSelectMarkup() {
	return <select id="matrix-select" value="bar" defaultValue="baz" readOnly={true}>
		<MatrixOption value="foo" />
		<MatrixOption value="bar" />
		<MatrixOption value="baz" />
	</select>;
}

export function InitialState() @{
	const [count] = useState(() => 2);
	<span id="initial-state">{'Count: ' + count}</span>
}

const Colour = createContext('none');

function ColourReader() @{
	const colour = useContext(Colour);
	<strong id="context-value">
		{colour as string}
	</strong>
}

export function NestedContext() @{
	<Colour.Provider value="purple">
		<Colour.Provider value="red">
			<ColourReader />
		</Colour.Provider>
	</Colour.Provider>
}

export function HostRef(props) @{
	<div id="matrix-ref" ref={props.refCallback}>ref target</div>
}

function MemoBody(props) @{
	<span id="memo-value">{'Count: ' + props.count}</span>
}

export const MemoComponent = memo(MemoBody);

function MemoArrayBody() {
	return [<div key="memo-array" id="memo-array-root">memo array root</div>];
}

export const MemoArrayRoot = memo(MemoArrayBody);

export const LazyArrayRoot = lazy(
	() => ({
		then(resolve) {
			resolve({ default: MemoArrayBody });
		},
	}),
);

export function ObjectElement() @{
	<object id="matrix-object" type="video/mp4" data="/example.webm" width={600} height={400}>
		<div>preview</div>
	</object>
}

// ReactDOMServerIntegrationHooks-test.js render-phase retry outcomes. Keeping
// these in the public render matrix proves the same component through a clean
// client mount, both server transports, and hydration.
export function RenderPhaseStateMany() @{
	const [count, setCount] = useState(0);
	if (count < 12) {
		setCount((value) => value + 1);
		setCount((value) => value + 1);
		setCount((value) => value + 1);
	}
	<span id="render-phase-state-many">{'Count: ' + count}</span>
}

function reducerA(state, action) {
	return action === 'increment' ? state + 1 : 0;
}

function reducerB(state, action) {
	return action === 'increment' ? state + 10 : 0;
}

export function RenderPhaseCurrentReducer() @{
	const [reducer, setReducer] = useState(() => reducerA);
	const [count, dispatch] = useReducer(reducer, 0);
	if (count < 20) {
		dispatch('increment');
		setReducer(() => (reducer === reducerA ? reducerB : reducerA));
	}
	<span id="render-phase-current-reducer">{'Count: ' + count}</span>
}

export function RenderPhaseCurrentReducerGetter() @{
	const [reducer, setReducer] = useState(() => reducerA);
	const [count, dispatch, getCount] = useReducer(reducer, 0);
	if (count < 20) {
		dispatch('increment');
		setReducer(() => (reducer === reducerA ? reducerB : reducerA));
	}
	<span id="render-phase-current-reducer-getter">
		{'Count: ' + count + '|Getter: ' + getCount()}
	</span>
}

export function RenderPhaseMemoCallbackRef(props) @{
	const [text, setText] = useState('hello');
	const [count, setCount] = useState(0);
	const hostRef = useRef();
	const firstRef = useRef(hostRef);
	if (firstRef.current !== hostRef) {
		throw new Error('useRef changed during a render-phase retry');
	}
	const capitalized = useMemo(() => {
		props.onCompute(text);
		return text.toUpperCase();
	}, [text]);
	const capitalize = useCallback(() => text.toUpperCase(), [text]);
	const callbackWitness = useRef({ text, callback: capitalize });
	if (callbackWitness.current.text === text && callbackWitness.current.callback !== capitalize) {
		throw new Error('useCallback changed while its inputs were equal');
	}
	if (callbackWitness.current.text !== text && callbackWitness.current.callback === capitalize) {
		throw new Error('useCallback did not change with its input');
	}
	callbackWitness.current = { text, callback: capitalize };
	if (count < 3) setCount(count + 1);
	if (text === 'hello' && count === 2) setText('hello, world.');
	<span id="render-phase-memo-callback-ref" ref={hostRef}>{capitalized + '/' + capitalize()}</span>
}

// ReactDOMServerIntegrationNewContext-test.js public function-component
// adaptations. Context.Consumer/class wrappers are deliberately unnecessary:
// useContext observes the same provider scope while staying on Octane's modern
// function-component surface.
const DefaultContext = createContext('none');

function DefaultContextReader(props) @{
	const value = useContext(props.context);
	<span id={props.id}>
		{value as string}
	</span>
}

function DefaultContextGrandchild() @{
	<DefaultContextReader id="grandchild-context" context={DefaultContext} />
}

function DefaultContextChild() @{
	<DefaultContextGrandchild />
}

export function DefaultContextValue() @{
	<DefaultContextReader id="default-context" context={DefaultContext} />
}

export function GrandchildContextValue() @{
	<DefaultContext.Provider value="purple">
		<DefaultContextChild />
	</DefaultContext.Provider>
}

const ThemeContext = createContext('dark');
const LanguageContext = createContext('french');
export const contextProviderIdentity =
	ThemeContext.Provider === ThemeContext && LanguageContext.Provider === LanguageContext;

function MultipleContextReader() @{
	const theme = useContext(ThemeContext);
	const language = useContext(LanguageContext);
	<div id="multiple-contexts">
		<span id="multiple-theme">
			{theme as string}
		</span>
		<span id="multiple-language">
			{language as string}
		</span>
	</div>
}

export function MultipleContexts() @{
	<ThemeContext.Provider value="light">
		<LanguageContext.Provider value="english">
			<MultipleContextReader />
		</LanguageContext.Provider>
	</ThemeContext.Provider>
}

function ThemeValue(props) @{
	const theme = useContext(ThemeContext);
	<div id={props.id}>
		{theme as string}
	</div>
}

function LanguageValue(props) @{
	const language = useContext(LanguageContext);
	<div id={props.id}>
		{language as string}
	</div>
}

export function NestedContextUnwinding() @{
	<div id="nested-context-unwinding">
		<ThemeContext.Provider value="light">
			<LanguageContext.Provider value="english">
				<ThemeContext.Provider value="dark">
					<ThemeValue id="theme1" />
				</ThemeContext.Provider>
				<ThemeValue id="theme2" />
				<LanguageContext.Provider value="sanskrit">
					<ThemeContext.Provider value="blue">
						<ThemeContext.Provider value="red">
							<LanguageContext.Provider value="chinese">
								<LanguageContext.Provider value="hungarian" />
								<LanguageValue id="language1" />
							</LanguageContext.Provider>
						</ThemeContext.Provider>
						<ThemeValue id="theme3" />
						<LanguageValue id="language2" />
					</ThemeContext.Provider>
				</LanguageContext.Provider>
			</LanguageContext.Provider>
		</ThemeContext.Provider>
		<LanguageValue id="language3" />
	</div>
}

export function ContextProviderShorthand() @{
	<ThemeContext value="light">
		<LanguageContext value="english">
			<ThemeContext value="dark">
				<ThemeValue id="context-provider-shorthand" />
			</ThemeContext>
		</LanguageContext>
	</ThemeContext>
}

const CompositeContext = createContext({ foo: 0, bar: 0, baz: 0 });

function CompositeFooAndBar() @{
	const { foo } = useContext(CompositeContext);
	const { bar } = useContext(CompositeContext);
	<span id="same-context-foo-bar">{'Foo: ' + foo + ', Bar: ' + bar}</span>
}

function CompositeBaz() @{
	const { baz } = useContext(CompositeContext);
	<span id="same-context-baz">{'Baz: ' + baz}</span>
}

export function SameContextMultipleReads() @{
	<CompositeContext.Provider value={{ foo: 1, bar: 3, baz: 5 }}>
		<div id="same-context-multiple-reads">
			<CompositeFooAndBar />
			<CompositeBaz />
		</div>
	</CompositeContext.Provider>
}

const ErrorContext = createContext('default');

function ContextCrash() {
	throw new Error('Boo!');
}

export function ContextRenderThatThrows() @{
	<ErrorContext.Provider value="Casper">
		<DefaultContextReader id="unused-context-before-crash" context={ErrorContext} />
		<ContextCrash />
	</ErrorContext.Provider>
}

export function ContextAfterThrow() @{
	<DefaultContextReader id="context-after-throw" context={ErrorContext} />
}

// ReactDOMServerIntegration{Input,Checkbox,Textarea,Select}-test.js markup
// outcomes. Text-entry handlers use native onInput; select/checkbox onChange is
// already the platform's native commit event in Octane.
export function InputWithNativeHandler() @{
	<input id="matrix-input-handler" value="foo" onInput={() => {}} />
}

export function BigIntInputWithNativeHandler() @{
	<input id="matrix-input-bigint" value={BigInt(5)} onInput={() => {}} />
}

export function InputWithoutHandler() @{
	<input id="matrix-input-no-handler" value="foo" />
}

export function DefaultInputMarkup() @{
	<input id="matrix-input-default" defaultValue="foo" />
}

export function ReverseControlledInputMarkup() @{
	<input id="matrix-input-reverse" defaultValue="bar" value="foo" readOnly={true} />
}

export function CheckboxWithNativeHandler() @{
	<input id="matrix-checkbox-handler" type="checkbox" checked={true} onChange={() => {}} />
}

export function CheckboxWithoutHandler() @{
	<input id="matrix-checkbox-no-handler" type="checkbox" checked={true} />
}

export function DefaultCheckboxMarkup() @{
	<input id="matrix-checkbox-default" type="checkbox" defaultChecked={true} />
}

export function ReverseControlledCheckboxMarkup() @{
	<input
		id="matrix-checkbox-reverse"
		type="checkbox"
		defaultChecked={false}
		checked={true}
		readOnly={true}
	/>
}

export function TextareaWithNativeHandler() @{
	<textarea id="matrix-textarea-handler" value="foo" onInput={() => {}} />
}

export function BigIntTextareaWithNativeHandler() @{
	<textarea id="matrix-textarea-bigint" value={BigInt(5)} onInput={() => {}} />
}

export function UndefinedTextareaMarkup() @{
	<textarea id="matrix-textarea-undefined" value={undefined} />
}

export function TextareaWithoutHandler() @{
	<textarea id="matrix-textarea-no-handler" value="foo" />
}

export function DefaultTextareaMarkup() @{
	<textarea id="matrix-textarea-default" defaultValue="foo" />
}

export function ReverseControlledTextareaMarkup() @{
	<textarea id="matrix-textarea-reverse" defaultValue="bar" value="foo" readOnly={true} />
}

function FormOptions() @{
	<>
		<option id="form-option-foo" value="foo">Foo</option>
		<option id="form-option-bar" value="bar">Bar</option>
		<option id="form-option-baz" value="baz">Baz</option>
	</>
}

export function SelectWithNativeHandler() @{
	<select id="matrix-select-handler" value="bar" onChange={() => {}}>
		<FormOptions />
	</select>
}

export function MultipleSelectWithNativeHandler() @{
	<select
		id="matrix-select-multiple-handler"
		value={['bar', 'baz']}
		multiple={true}
		onChange={() => {}}
	>
		<FormOptions />
	</select>
}

export function MultipleSelectReadOnly() @{
	<select id="matrix-select-multiple-readonly" value={['bar', 'baz']} multiple={true} readOnly>
		<FormOptions />
	</select>
}

export function SelectWithoutHandler() @{
	<select id="matrix-select-no-handler" value="bar">
		<FormOptions />
	</select>
}

export function DefaultSelectMarkup() @{
	<select id="matrix-select-default" defaultValue="bar">
		<FormOptions />
	</select>
}

export function ReverseControlledSelectMarkup() @{
	<select id="matrix-select-reverse" defaultValue="baz" value="bar" readOnly>
		<FormOptions />
	</select>
}

export function SelectDangerousOptions() @{
	<select id="matrix-select-danger" defaultValue="baz" value="bar" readOnly>
		<option
			id="danger-option-foo"
			value="foo"
			dangerouslySetInnerHTML={{ __html: 'Foo' }}
		>{undefined}</option>
		<option
			id="danger-option-bar"
			value="bar"
			dangerouslySetInnerHTML={{ __html: 'Bar' }}
		>{null}</option>
		<option id="danger-option-baz" dangerouslySetInnerHTML={{ __html: 'Baz' }} />
	</select>
}

export function SelectFlattenedOption() @{
	<select id="matrix-select-flattened" value="bar" readOnly>
		<option value="bar">
			{'A '}
			{'B'}
			{' '}
			{BigInt(5)}
		</option>
	</select>
}

export function SelectFlattenedOptionWithoutValue() @{
	<select id="matrix-select-flattened-no-value" value="A B" readOnly>
		<option>A {'B'}</option>
	</select>
}

export function SelectBooleanValue() @{
	<select id="matrix-select-boolean" value={true} readOnly>
		<option value="first">First</option>
		<option value="true">True</option>
	</select>
}

export function SelectMissingValue() @{
	<select id="matrix-select-missing" readOnly>
		<option value="first">First</option>
		<option value="undefined">Undefined</option>
	</select>
}
