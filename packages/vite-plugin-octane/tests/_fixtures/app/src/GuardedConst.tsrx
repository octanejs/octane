export const fixtureKind = 'guarded', GuardedConst = (props: { visible: boolean }) => @{
	if (!props.visible) return null;
	<output
		class="vite-guarded-const"
		data-fixture-kind={fixtureAfter}
	>{'vite-guarded-const-proof'}</output>
}, fixtureAfter = fixtureKind;
