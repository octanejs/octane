export function LazyCodeProof(props: { version: number }) @{
	<aside
		class="lazy-code-proof"
		data-lazy-code-version={String(props.version)}
	>{'Dashboard module ready'}</aside>
}
