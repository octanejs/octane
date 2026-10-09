import { use } from 'octane';

import Editor, { type EditorProps } from '../../../src/index';

function TabDetails(props: { tab: string; gate: Promise<void> | null }) @{
	if (props.gate) use(props.gate);
	<span data-tab>{props.tab as string}</span>
}

export function PendingTab(props: {
	tab: string;
	gate: Promise<void> | null;
	onMount: EditorProps['onMount'];
	onChange: EditorProps['onChange'];
	onValidate: EditorProps['onValidate'];
}) @{
	<section>
		@try {
			<>
				<Editor
					className="pending-tab-editor"
					path={'file:///' + props.tab + '.ts'}
					defaultValue={props.tab}
					onMount={props.onMount}
					onChange={props.onChange}
					onValidate={props.onValidate}
				/>
				<TabDetails tab={props.tab} gate={props.gate} />
			</>
		} @pending {
			<span data-pending>Loading</span>
		}
	</section>
}
