import { useState } from 'octane';

export function PreferenceField(props: { onChange: (value: string) => void }) @{
	<button type="button" onClick={() => props.onChange('compact')}>
		Choose compact
	</button>
}

export function App() @{
	const [title, setTitle] = useState('');
	const [savedDraft, setSavedDraft] = useState('Nothing committed yet');
	const [plan, setPlan] = useState('free');
	const [alerts, setAlerts] = useState(false);
	const [layout, setLayout] = useState('comfortable');
	const [alias, setAlias] = useState('');
	const aliasInputProps = {
		type: String('text'),
		value: alias,
		onInput: (event: Event) => setAlias((event.currentTarget as HTMLInputElement).value),
	};

	<main>
		<h1>Native event settings</h1>

		<label>
			Live title
			<input
				value={title}
				onInput={(event) => setTitle((event.currentTarget as HTMLInputElement).value)}
			/>
		</label>
		<output aria-label="Live title value">{title || 'Empty'}</output>

		<label>
			Draft note
			<input
				defaultValue="Initial draft"
				onChange={(event) => setSavedDraft((event.currentTarget as HTMLInputElement).value)}
				suppressNativeChangeWarning
			/>
		</label>
		<output aria-label="Last saved draft">{savedDraft}</output>

		<label>
			Plan
			<select
				value={plan}
				onChange={(event) => setPlan((event.currentTarget as HTMLSelectElement).value)}
			>
				<option value="free">Free</option>
				<option value="pro">Pro</option>
			</select>
		</label>
		<output aria-label="Selected plan">
			{plan === 'free' ? 'Free' : 'Pro'}
		</output>

		<label>
			<input
				type="checkbox"
				checked={alerts}
				onChange={(event) => setAlerts((event.currentTarget as HTMLInputElement).checked)}
			/>
			Email alerts
		</label>
		<output aria-label="Alert status">
			{alerts ? 'enabled' : 'disabled'}
		</output>

		<PreferenceField onChange={setLayout} />
		<output aria-label="Layout">{layout}</output>

		<label>
			Dynamic alias
			<input {...aliasInputProps} />
		</label>
		<output aria-label="Dynamic alias value">{alias || 'Empty'}</output>
	</main>
}
