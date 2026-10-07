import { AutoField, DropZone, Puck, Render, type Config, type Data } from '@octanejs/puck';

type Components = {
	Zone: Record<string, never>;
	HeadingBlock: { title: string };
};

export const zoneRef: { current: HTMLDivElement | null } = { current: null };

const config: Config<Components> = {
	components: {
		Zone: {
			render: function renderZone() {
				return <DropZone zone="inner" className="inner-zone" ref={zoneRef} />;
			},
		},
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

const data: Data = {
	content: [
		{ type: 'Zone', props: { id: 'zone-1' } },
		{ type: 'HeadingBlock', props: { id: 'heading-1', title: 'Hello Puck' } },
	],
	root: { props: {} },
};

export function PuckZoneRefProbe() {
	return <Render config={config} data={data} />;
}

export function PuckEditorContentProbe() {
	return <Puck config={config} data={data} iframe={{ enabled: false }} />;
}

export function PuckEditorFrameProbe() {
	return <Puck config={config} data={{ content: [], root: { props: {} } }} />;
}

const options = [
	{ label: 'Alpha', value: 'alpha' },
	{ label: 'Beta', value: 'beta' },
];

export function ChoiceFieldsProbe({ onChange }: { onChange: (value: string) => void }) {
	return (
		<div>
			<AutoField field={{ type: 'select', options }} value="alpha" onChange={onChange} />
			<AutoField field={{ type: 'radio', options }} value="alpha" onChange={onChange} />
		</div>
	);
}

export function ArrayFieldProbe() {
	return (
		<AutoField
			field={{ type: 'array', arrayFields: { title: { type: 'text' } } }}
			value={[{ title: 'First' }, { title: 'Second' }]}
			onChange={function onChange() {}}
		/>
	);
}

export function ExternalFieldProbe() {
	return (
		<AutoField
			field={{
				type: 'external',
				fetchList: async function fetchList() {
					return [{ title: 'Alpha', meta: { id: 1 } }];
				},
			}}
			value={null}
			onChange={function onChange() {}}
		/>
	);
}
