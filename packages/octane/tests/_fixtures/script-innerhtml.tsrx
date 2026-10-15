import { createElement, use } from 'octane';

export interface ScriptSourceProps {
	source: string;
}

export interface ScriptValueProps {
	value: unknown;
}

export interface ScriptDangerProps {
	danger: { __html: string } | null;
}

export interface ScriptSpreadProps {
	spread: { dangerouslySetInnerHTML?: { __html: string } | null };
}

export interface ConditionalSpreadScriptProps extends ScriptSpreadProps {
	show: boolean;
}

export interface RawStyleProps {
	source: string;
	tag: string;
}

export function ExecutableScript(props: ScriptSourceProps) @{
	<script data-kind="executable" dangerouslySetInnerHTML={{ __html: props.source }} />
}

export function JsonScript(props: ScriptValueProps) @{
	<script
		type="application/json"
		data-kind="application-json"
		dangerouslySetInnerHTML={{ __html: JSON.stringify(props.value) }}
	/>
}

export function SpeculationRules(props: ScriptValueProps) @{
	<script
		type="speculationrules"
		data-kind="speculationrules"
		dangerouslySetInnerHTML={{ __html: JSON.stringify(props.value) }}
	/>
}

export function ConditionalSpreadScript(props: ConditionalSpreadScriptProps) @{
	<section>
		{props.show && (
			<script type="application/json" data-kind="conditional-spread" {...props.spread} />
		)}
	</section>
}

export function StaticScript() @{
	<script type="text/plain" data-kind="static">
		function compare(left, right) {
			if (left < right) {
				return { result: { less: true }, chars: '&"\'' };
			}
		}
	</script>
}

export function StaticJsonScript() @{
	// prettier-ignore
	<script type="application/json" data-kind="static-json">{"nested":{"enabled":true},"chars":"<&\"'","boundary":"<\/ScRiPt><ScRiPt data-pwn=\"static\">bad<\/ScRiPt>"}</script>
}

export function ConditionalStaticJsonScript(props: { show: boolean }) @{
	// prettier-ignore
	<section>{props.show && <script type="application/json" data-kind="conditional-static-json">{"nested":{"enabled":true},"chars":"<&\"'","boundary":"<\/ScRiPt><ScRiPt data-pwn=\"static\">bad<\/ScRiPt>"}</script>}</section>
}

export function AuthoredExpressionScript(props: ScriptValueProps) @{
	// prettier-ignore
	<script type="speculationrules" data-kind="authored-expression">
		{JSON.stringify(props.value) as string}
	</script>
}

export function WhitespaceDirectScript(props: ScriptDangerProps) @{
	// prettier-ignore
	<script data-kind="whitespace-direct" dangerouslySetInnerHTML={props.danger}> </script>
}

export function WhitespaceSpreadScript(props: ScriptSpreadProps) @{
	// prettier-ignore
	<script data-kind="whitespace-spread" {...props.spread}> </script>
}

export function ConditionalWhitespaceScript(props: { show: boolean }) @{
	// prettier-ignore
	<section>{props.show && <script data-kind="conditional-whitespace">

	</script>}</section>
}

export function RawStyle(props: RawStyleProps) @{
	const Tag = props.tag;
	<>
		<Tag id="raw-style-sheet" dangerouslySetInnerHTML={{ __html: props.source }} />
		<div id="raw-style-target">{'styled target'}</div>
	</>
}

export interface MountedScript {
	id: string;
	source?: string;
	src?: string;
	defer?: boolean;
}

export function MountedScripts(props: { scripts: MountedScript[]; revision: number }) @{
	<section data-revision={props.revision}>
		<input aria-label="Script draft" defaultValue="server" />
		@for (const script of props.scripts; key script.id) {
			<script
				__executeOnMount
				data-script={script.id}
				nonce="script-nonce"
				src={script.src}
				defer={script.defer}
				dangerouslySetInnerHTML={{ __html: script.source ?? '' }}
			/>
		}
	</section>
}

export function StaticExecutingScript() @{
	<script __executeOnMount>
		(window.scriptExecutions ??= []).push('static');
	</script>
}

export function StaticInertScript() @{
	<script>
		(window.scriptExecutions ??= []).push('static');
	</script>
}

export function NestedExecutingScripts() @{
	<>
		<aside>
			<script __executeOnMount nonce="nested-nonce">
				(window.scriptExecutions ??= []).push('nested');
			</script>
		</aside>
		<script __executeOnMount>
			(window.scriptExecutions ??= []).push('fragment');
		</script>
	</>
}

function ScriptPendingChild(props: { pending: Promise<void> }) @{
	use(props.pending);
	<span>ready</span>
}

export function PendingExecutingScript(props: { pending: Promise<void> }) @{
	@try {
		<section>
			<script __executeOnMount>
				(window.scriptExecutions ??= []).push('pending');
			</script>
			<ScriptPendingChild pending={props.pending} />
		</section>
	} @pending {
		<p>script waiting</p>
	}
}

export function OwnedAsyncScripts() @{
	<section data-owned-scripts>
		<script __executeOnMount={true as const} async src="/execution.js" nonce="owned-nonce" />
		<script
			__executeOnMount={true satisfies boolean}
			async
			src="/execution.js"
			nonce="owned-nonce"
		/>
	</section>
}

export function PendingDescriptorScript(props: { pending: Promise<void> }) @{
	@try {
		<section>
			{createElement('script', {
				dangerouslySetInnerHTML: {
					__html: "(window.scriptExecutions ??= []).push('descriptor-pending');",
				},
			})}
			<ScriptPendingChild pending={props.pending} />
		</section>
	} @pending {
		<p>script waiting</p>
	}
}

export function OrdinaryAsyncScripts() @{
	<section>
		<script __executeOnMount={false as const} async src="/ordinary-resource.js" />
		<script __executeOnMount={false satisfies boolean} async src="/ordinary-resource.js" />
	</section>
}

export function ForeignExecutingScript() @{
	<svg>
		<StaticExecutingScript />
	</svg>
}
