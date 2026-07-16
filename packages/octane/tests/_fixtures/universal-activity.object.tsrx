import { Activity } from 'octane';

export function CompiledUniversalActivity({ mode, hostRef }) @{
	<Activity mode={mode}>
		<node ref={hostRef} />
	</Activity>
}
