export let autoMemoSwapValue = 'v0';

export function setAutoMemoSwapValue(value: string): void {
	autoMemoSwapValue = value;
}

// A pure export carries a definition-site proof.
export function AutoMemoSwapProven(props: { label: string }) @{
	<i class="swap">{('proven:' + props.label) as string}</i>
}

// No proof can witness a module `let`, so this component stays unproven.
function SwapUnproven(props: { label: string }) @{
	<i class="swap">{('unproven:' + props.label + ':' + autoMemoSwapValue) as string}</i>
}

// A live binding that importers render directly.
export let AutoMemoSwapCurrent = AutoMemoSwapProven;

export function setAutoMemoSwapProven(proven: boolean): void {
	AutoMemoSwapCurrent = proven ? AutoMemoSwapProven : SwapUnproven;
}
