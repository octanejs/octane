import { Render, type Config } from '@octanejs/puck';

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

export function PuckRenderProbe() {
	return <div id="root">
		<Render
			config={config}
			data={{
				content: [
					{ type: 'HeadingBlock', props: { title: 'Hello Puck' } },
				],
				root: { props: {} },
			}}
		/>
	</div>;
}
