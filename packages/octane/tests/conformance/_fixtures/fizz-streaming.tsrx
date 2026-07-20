import { createContext, lazy, Suspense, use, useState, useSyncExternalStore } from 'octane';

export const StreamContext = createContext('default');

export function TextPayload(props) @{
	<div id="payload">
		{props.text as string}
	</div>
}

export function RootError(props) {
	throw props.error;
}

export function PendingBoundary(props) @{
	<section id="pending-boundary">
		@try {
			const value = use(props.promise);
			<strong class="pending-ready">
				{value as string}
			</strong>
		} @pending {
			<i class="pending-fallback">{'loading'}</i>
		} @catch (error) {
			<b class="pending-error">
				{error.message as string}
			</b>
		}
	</section>
}

function ContextLeaf(props) @{
	const context = use(StreamContext);
	const value = use(props.promise);
	<span class="context-value">
		{context + ':' + value as string}
	</span>
}

function ContextOutside() @{
	const context = use(StreamContext);
	<span class="context-after-provider">{context}</span>
}

export function ContextBoundary(props) @{
	<>
		<StreamContext.Provider value={props.context}>
			@try {
				<ContextLeaf promise={props.promise} />
			} @pending {
				<span class="context-fallback">{'loading'}</span>
			}
		</StreamContext.Provider>
		<ContextOutside />
	</>
}

export function ExternalStoreReader(props) @{
	const value = useSyncExternalStore(
		props.subscribe,
		props.getClientSnapshot,
		props.getServerSnapshot,
	);
	<span id="store-value">
		{value as string}
	</span>
}

function LazyLeaf() @{
	<span class="lazy-value">{'lazy ready'}</span>
}

const LazyValue = lazy(async () => ({ default: LazyLeaf }));

export function LazyBoundary() @{
	<div id="lazy-boundary">
		@try {
			<LazyValue />
		} @pending {
			<span class="lazy-fallback">{'loading'}</span>
		}
	</div>
}

export function PromiseNode(props) @{
	<div id="promise-node">{props.promise}</div>
}

export function BoundaryBeforePromiseNode(props) @{
	<div id="mixed-root-suspension">
		@try {
			const value = use(props.boundaryPromise);
			<strong id="mixed-boundary-value">
				{value as string}
			</strong>
		} @pending {
			<i id="mixed-boundary-fallback">{'loading'}</i>
		}
		<span id="mixed-root-value">{props.rootPromise}</span>
	</div>
}

export function BoundaryRemovedBeforeRootRetry(props) @{
	<div id="conditional-root-retry">
		@if (props.readBoundaryVisibility()) {
			@try {
				const value = use(props.boundaryPromise);
				<strong class="conditional-boundary-value">
					{value as string}
				</strong>
			} @pending {
				<i class="conditional-boundary-fallback">{'stale fallback'}</i>
			}
		}
		<span id="conditional-root-value">{props.rootPromise}</span>
	</div>
}

export function ContextNode() @{
	<StreamContext.Provider value="provided">
		<div id="context-node">{StreamContext}</div>
	</StreamContext.Provider>
}

export function RecursiveUsableNode(props) @{
	<StreamContext.Provider value="recursive provided">
		<div id="recursive-usable-node">{props.promise}</div>
	</StreamContext.Provider>
}

export function TableBoundary(props) @{
	<table id="stream-table">
		@try {
			const value = use(props.promise);
			<tbody class="table-ready">
				<tr>
					<td>
						{value as string}
					</td>
				</tr>
			</tbody>
		} @pending {
			<tbody class="table-fallback">
				<tr>
					<td>{'loading'}</td>
				</tr>
			</tbody>
		}
	</table>
}

function SvgDirectiveBoundary(props) @{
	@try {
		const id = use(props.promise);
		<path id={id} />
	} @pending {
		<text>{'loading'}</text>
	}
}

function SvgDirectiveWrapper(props) @{
	<SvgDirectiveBoundary promise={props.promise} />
}

export function SvgBoundary(props) @{
	<svg id="stream-svg">
		<g>
			<SvgDirectiveWrapper promise={props.promise} />
		</g>
	</svg>
}

function JsxSvgContent(props) @{
	const id = use(props.promise);
	<path id={id} />
}

function JsxSvgSuspenseWrapper(props) @{
	<Suspense fallback={<g id="jsx-svg-fallback" />}>
		<JsxSvgContent promise={props.promise} />
	</Suspense>
}

export function JsxSvgSuspense(props) @{
	<svg id="jsx-svg-suspense">
		<JsxSvgSuspenseWrapper promise={props.promise} />
	</svg>
}

function JsxHtmlContent(props) @{
	const id = use(props.promise);
	<div id={id}>{'html content'}</div>
}

function JsxHtmlSuspenseWrapper(props) @{
	<Suspense fallback={<div id="jsx-html-fallback">loading</div>}>
		<JsxHtmlContent promise={props.promise} />
	</Suspense>
}

export function JsxForeignObjectSuspense(props) @{
	<svg id="jsx-foreign-object-suspense">
		<foreignObject>
			<JsxHtmlSuspenseWrapper promise={props.promise} />
		</foreignObject>
	</svg>
}

function DynamicSvgAsync(props) @{
	const id = use(props.promise);
	<path id={id} />
}

function DynamicSvgLeaf(props) @{
	<Suspense fallback={<text>loading</text>}>
		<DynamicSvgAsync promise={props.promise} />
	</Suspense>
}

export function DynamicSvgHostBoundaries(props) @{
	const Tag = props.tag;
	<svg id="dynamic-svg-host">
		<Tag>
			{() => <>
				<DynamicSvgLeaf promise={props.a} />
				<DynamicSvgLeaf promise={props.b} />
			</>}
		</Tag>
	</svg>
}

export function HtmlSvgBoundary(props) @{
	<div id="html-svg-boundary">
		@try {
			const id = use(props.promise);
			<svg id={id}>
				<circle id="html-svg-circle" />
			</svg>
		} @pending {
			<span>{'loading'}</span>
		}
	</div>
}

export function EsotericBoundary(props) @{
	<div id="esoteric-boundary">
		<select>
			@try {
				const option = use(props.option);
				<option>
					{option as string}
				</option>
			} @pending {
				<option>{'loading'}</option>
			}
		</select>
		<table>
			<colgroup>
				@try {
					const className = use(props.column);
					<col class={className} />
				} @pending {
					<col class="loading" />
				}
			</colgroup>
		</table>
		<math>
			@try {
				const id = use(props.math);
				<mi id={id}>{'x'}</mi>
			} @pending {
				<mi>{'loading'}</mi>
			}
		</math>
	</div>
}

export function AdjacentTextBoundary(props) @{
	<div id="adjacent-text">
		{'start:'}
		@try {
			const first = use(props.first);
			if (props.onFirstRendered) props.onFirstRendered();
			<>
				{first as string}
			</>
		} @pending {
			<>
				{'one…'}
			</>
		}
		{'|middle|'}
		@try {
			const second = use(props.second);
			<>
				{second as string}
			</>
		} @pending {
			<>
				{'two…'}
			</>
		}
		{':end'}
	</div>
}

export function TextAfterElementBoundary(props) @{
	<div id="text-after-element">
		<b>{'hello'}</b>
		@try {
			const value = use(props.promise);
			<>
				{value as string}
			</>
		} @pending {
			<>
				{'loading'}
			</>
		}
	</div>
}

export function ElementAfterTextBoundary(props) @{
	<div id="element-after-text">
		{'hello'}
		@try {
			const value = use(props.promise);
			<b>
				{value as string}
			</b>
		} @pending {
			<i>{'loading'}</i>
		}
	</div>
}

export function TitleValue(props) @{
	<>
		<title>{props.value}</title>
		<main id="title-body">{'body'}</main>
	</>
}

export function InlineScript(props) @{
	<script dangerouslySetInnerHTML={{ __html: props.source }} />
}

export function RawTemplateBoundary(props) @{
	@try {
		const source = use(props.promise);
		<div id="raw-template-content" dangerouslySetInnerHTML={{ __html: source }} />
	} @pending {
		<span id="raw-template-loading">loading</span>
	}
}

function Recursive(props) {
	if (props.depth === 0) return <span id="deep-leaf">{'done'}</span>;
	return <Recursive depth={props.depth - 1} />;
}

export function DeepTree(props) @{
	<div id="deep-tree">
		<Recursive depth={props.depth} />
	</div>
}

function GetterReader(props) @{
	<span id="getter-value">
		{props.model.label as string}
	</span>
}

export function DescendantGetterUpdate() @{
	const [count, setCount] = useState(0);
	const model = {
		get label() {
			if (count === 0) setCount(1);
			return 'child';
		},
	};
	<div id="getter-update">
		<span id="getter-parent-count">{'Count: ' + count}</span>
		<GetterReader model={model} />
	</div>
}

function GetterHookReader(props) @{
	<span id="getter-hook-value">{'Value: ' + props.model.value}</span>
}

export function GetterHookReplay() @{
	const model = {
		get value() {
			const [value, setValue] = useState(0);
			if (value === 0) setValue(1);
			return value;
		},
	};
	<GetterHookReader model={model} />
}

function defaultParameterState() {
	const [value, setValue] = useState(0);
	if (value === 0) setValue(1);
	return value;
}

function DefaultParameterReader({ value = defaultParameterState() }) @{
	<span id="default-parameter-value">{'Value: ' + value}</span>
}

export function DefaultParameterReplay() @{
	<DefaultParameterReader />
}
