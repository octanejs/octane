import { Puck, type Config } from '@octanejs/puck';

type Props = {
	title: string;
};

const config: Config<{ HeadingBlock: Props }> = {
	components: {
		HeadingBlock: {
			fields: {
				title: { type: 'text' },
			},
			render: function renderHeading(props) {
				return <h1>{props.title as string}</h1>;
			},
		},
	},
};

export function PuckEditorProbe() {
	return <div id="root">
		<Puck config={config} data={{ content: [], root: { props: {} } }} />
	</div>;
}
