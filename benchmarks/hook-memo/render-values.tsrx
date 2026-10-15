/** @jsxImportSource octane */
import type { OctaneNode } from 'octane';

type Props = { label: string; tick: number };

function Slot(props: { content: OctaneNode }) @{
	<section data-kind={typeof props.content}>{props.content}</section>
}

function InlineContent(props: Props) @{
	<Slot
		content={@{
			<div>
				<input defaultValue="draft" />
				<span>{props.label as string}</span>
			</div>
		}}
	/>
}

function WrappedContent(props: Props) @{
	<Slot
		content={() => @{
			<div>
				<input defaultValue="draft" />
				<span>{props.label as string}</span>
			</div>
		}}
	/>
}

export function InlineRenderValue(props: Props) @{
	<main>
		<output>{String(props.tick)}</output>
		<InlineContent {...props} />
	</main>
}

export function WrappedRenderValue(props: Props) @{
	<main>
		<output>{String(props.tick)}</output>
		<WrappedContent {...props} />
	</main>
}

export function KeyedChild(props: { label: string }) @{
	<div>
		<input defaultValue="draft" />
		<span>{props.label as string}</span>
	</div>
}
