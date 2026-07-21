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
	<script type="application/json" data-kind="static-json">{"nested":{"enabled":true},"chars":"<&\"'","boundary":"</ScRiPt><ScRiPt data-pwn=\"static\">bad</ScRiPt>"}</script>
}

export function ConditionalStaticJsonScript(props: { show: boolean }) @{
	// prettier-ignore
	<section>{props.show && <script type="application/json" data-kind="conditional-static-json">{"nested":{"enabled":true},"chars":"<&\"'","boundary":"</ScRiPt><ScRiPt data-pwn=\"static\">bad</ScRiPt>"}</script>}</section>
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
