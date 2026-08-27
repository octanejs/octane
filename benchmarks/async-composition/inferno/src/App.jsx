import { Component } from 'inferno';
import { boardInputValue, boardRowsFor, boardRowText, loadResource } from '../../shared/data.js';

const INDEPENDENT = [
	'project',
	'viewer',
	'badge',
	'activity',
	'activity-summary',
	'insights',
	'insights-chart',
];

// Inferno has no Suspense resource primitive. The native class fixture starts
// independent promises together, waits for the project before requesting its
// dependent owner, then publishes the completed dashboard in one setState.
export class App extends Component {
	constructor(props) {
		super(props);
		this.state = { version: -1, values: null };
		this.nextVersion = 0;
		window.__bump = () => this.load(this.nextVersion++);
	}

	componentDidMount() {
		window.__bump();
	}

	async load(version) {
		const pending = Object.fromEntries(
			INDEPENDENT.map((resource) => [resource, loadResource(resource, version)]),
		);
		const project = await pending.project;
		pending.owner = loadResource('owner', version, project.ownerId);
		const entries = await Promise.all(
			Object.entries(pending).map(async ([resource, promise]) => [resource, await promise]),
		);
		this.setState({ version, values: Object.fromEntries(entries) });
	}

	render() {
		const { version, values } = this.state;
		if (values === null) return <p data-fallback="dashboard">Loading dashboard…</p>;
		return <Dashboard version={version} values={values} />;
	}
}

function Dashboard({ version, values }) {
	return (
		<main data-dashboard-version={version}>
			<header data-panel="project">
				<h1 data-resource="project">{values.project.label}</h1>
				<p data-resource="viewer">{values.viewer.label}</p>
				<div className="project-meta">
					<strong data-resource="badge">{values.badge.label}</strong>
					<span data-resource="owner">{values.owner.label}</span>
				</div>
			</header>
			<section data-panel="activity">
				<h2 data-resource="activity">{values.activity.label}</h2>
				<p data-resource="activity-summary">{values['activity-summary'].label}</p>
			</section>
			<section data-panel="insights">
				<h2 data-resource="insights">{values.insights.label}</h2>
				<figure data-resource="insights-chart">{values['insights-chart'].label}</figure>
			</section>
			<section className="board">
				{boardRowsFor(version).map((id) => (
					<p key={id} data-resource={'row-' + id}>
						{boardRowText(id, version)}
					</p>
				))}
				<input data-resource="board-input" value={boardInputValue(version)} onInput={() => {}} />
			</section>
		</main>
	);
}
