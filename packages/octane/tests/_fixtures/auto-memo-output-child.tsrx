import { createContext, memo, useContext, useState } from 'octane';

export const AutoMemoOutputContext = createContext('t0');

let opaqueOutputVersion = 0;

export function bumpAutoMemoOpaqueOutputVersion() {
	opaqueOutputVersion++;
}

function AutoMemoOutputRowImpl(props) @{
	const theme = useContext(AutoMemoOutputContext);
	const [own, setOwn] = useState(0);

	<li class="output-row" data-id={props.id as string}>
		<span class="output-value">
			{theme + ':' + props.label + ':' + own}
		</span>
		<button
			class={'output-own-' + props.id}
			onClick={() => setOwn((value) => value + 1)}
		>{'increment'}</button>
	</li>
}

export const AutoMemoOutputRow = memo(AutoMemoOutputRowImpl);

function AutoMemoNestedDefaultOutputImpl(props) @{
	<li class="output-nested-row">{props.children}</li>
}

export const AutoMemoNestedDefaultOutput = memo(AutoMemoNestedDefaultOutputImpl);

function AutoMemoNestedCustomOutputImpl() @{
	<span class="output-nested-value">
		{'nested ' + opaqueOutputVersion}
	</span>
}

// A custom comparator nested below a default-memo descriptor must make an
// imported helper result ineligible for reuse. Otherwise the outer descriptor
// would hide this deliberately observable comparator on an equal parent update.
export const AutoMemoNestedCustomOutput = memo(AutoMemoNestedCustomOutputImpl, () => false);

function AutoMemoProxyOutputImpl(props) @{
	<li class="output-proxy-value">
		{'proxy ' + props.label}
	</li>
}

export const AutoMemoProxyOutput = memo(AutoMemoProxyOutputImpl);

// Imported calculation output can cross from a cacheable primitive to an
// opaque component descriptor. Keep this component deliberately non-memo so
// the parent compiler must take its conservative output path.
export function AutoMemoUnsafeCalculationOutput() @{
	<span class="output-unsafe-calculation">{'unsafe'}</span>
}

// Deliberately not wrapped in memo(). Imported component bodies are opaque to
// the module compiling the parent list, so the enclosing inferred cache must
// fall back while preserving context propagation.
export function AutoMemoOpaqueOutputRow(props) @{
	const theme = useContext(AutoMemoOutputContext);

	<li class="output-opaque-row">
		<span class="output-opaque-value">
			{theme + ':' + props.label + ':' + opaqueOutputVersion}
		</span>
	</li>
}
