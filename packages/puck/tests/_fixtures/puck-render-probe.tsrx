import { Render, type Config, type Slot } from '@octanejs/puck';

type Props = {
	title: string;
};

type ColumnsProps = {
	content: Slot;
};

const config: Config<{ HeadingBlock: Props; Columns: ColumnsProps }> = {
	components: {
		HeadingBlock: {
			fields: {
				title: { type: 'text' },
			},
			render: function renderHeading(props) {
				return <h1>{props.title as string}</h1>;
			},
		},
		Columns: {
			fields: {
				content: { type: 'slot' },
			},
			render: function renderColumns({ content: Content }) {
				return <section class="columns">
					<Content />
				</section>;
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
					{
						type: 'Columns',
						props: {
							id: 'columns-1',
							content: [
								{ type: 'HeadingBlock', props: { id: 'heading-2', title: 'Inside a slot' } },
							],
						},
					},
				],
				root: { props: {} },
			}}
		/>
	</div>;
}
