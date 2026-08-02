const PROVENANCE_JOB = 'React parity provenance';

function fingerprintKey(entry) {
	return `${entry.manifest}\0${entry.lane}\0${entry.inputSha256}`;
}

export function entriesFromReceipt(receiptPath, receipt) {
	if (
		receipt?.schemaVersion !== 1 ||
		receipt.fingerprintVersion !== 1 ||
		typeof receipt.manifest !== 'string' ||
		!receipt.lanes ||
		typeof receipt.lanes !== 'object' ||
		Array.isArray(receipt.lanes)
	) {
		throw new Error(`${receiptPath} has an invalid receipt schema`);
	}
	return Object.entries(receipt.lanes).map(([lane, value]) => {
		if (!/^sha256:[a-f0-9]{64}$/.test(value?.inputSha256 ?? ''))
			throw new Error(`${receiptPath} has an invalid receipt hash for ${lane}`);
		return {
			manifest: receipt.manifest,
			receipt: receiptPath,
			lane,
			inputSha256: value.inputSha256,
		};
	});
}

export function buildExecutionMatrix(currentPlan, trustedEntries = []) {
	if (
		currentPlan?.schemaVersion !== 1 ||
		!Array.isArray(currentPlan.entries) ||
		!Array.isArray(currentPlan.always)
	)
		throw new Error('current React parity receipt plan is invalid');
	const trusted = new Set(trustedEntries.map(fingerprintKey));
	const grouped = new Map();
	for (const entry of currentPlan.always) {
		let group = grouped.get(entry.manifest);
		if (!group) {
			group = {
				package: entry.manifest.split('/').slice(0, 2).join('/'),
				manifest: entry.manifest,
				lanes: [],
			};
			grouped.set(entry.manifest, group);
		}
		if (!group.lanes.includes(entry.lane)) group.lanes.push(entry.lane);
	}
	for (const entry of currentPlan.entries) {
		if (trusted.has(fingerprintKey(entry))) continue;
		let group = grouped.get(entry.manifest);
		if (!group) {
			group = {
				package: entry.manifest.split('/').slice(0, 2).join('/'),
				manifest: entry.manifest,
				lanes: [],
			};
			grouped.set(entry.manifest, group);
		}
		if (!group.lanes.includes(entry.lane)) group.lanes.push(entry.lane);
	}
	const include = [...grouped.values()]
		.map((entry) => ({ ...entry, lanes: entry.lanes.sort() }))
		.sort((left, right) => left.manifest.localeCompare(right.manifest, 'en'));
	return {
		hasWork: include.length > 0,
		matrix: {
			include: include.length > 0 ? include : [{ package: 'none', manifest: 'none', lanes: [] }],
		},
		inherited: currentPlan.entries.filter((entry) => trusted.has(fingerprintKey(entry))).length,
	};
}

async function successfulProvenance(github, context, run) {
	if (
		run.conclusion !== 'success' ||
		run.head_repository?.full_name !== `${context.repo.owner}/${context.repo.repo}`
	) {
		return false;
	}
	const jobs = await github.paginate(github.rest.actions.listJobsForWorkflowRun, {
		...context.repo,
		run_id: run.id,
		per_page: 100,
	});
	return jobs.some((job) => job.name === PROVENANCE_JOB && job.conclusion === 'success');
}

async function runsForSha(github, context, sha) {
	const { data } = await github.rest.actions.listWorkflowRuns({
		...context.repo,
		workflow_id: 'ci.yml',
		status: 'completed',
		head_sha: sha,
		per_page: 10,
	});
	return data.workflow_runs;
}

async function receiptAt(github, context, path, ref) {
	try {
		const { data } = await github.rest.repos.getContent({ ...context.repo, path, ref });
		if (Array.isArray(data) || data.encoding !== 'base64') return null;
		return JSON.parse(Buffer.from(data.content, 'base64').toString('utf8'));
	} catch (error) {
		if (error.status === 404) return null;
		throw error;
	}
}

async function trustedRuns(github, context) {
	const repository = context.payload.repository;
	const defaultBranch = repository?.default_branch ?? 'main';
	const candidates = new Map();
	const { data: defaultRuns } = await github.rest.actions.listWorkflowRuns({
		...context.repo,
		workflow_id: 'ci.yml',
		branch: defaultBranch,
		event: 'push',
		status: 'completed',
		per_page: 20,
	});
	for (const run of defaultRuns.workflow_runs) {
		if (run.head_branch === defaultBranch && run.event === 'push') candidates.set(run.id, run);
	}

	const candidateShas = new Set();
	if (context.eventName === 'pull_request') {
		const pull = context.payload.pull_request;
		const commits = await github.paginate(github.rest.pulls.listCommits, {
			...context.repo,
			pull_number: pull.number,
			per_page: 100,
		});
		for (const commit of commits.slice(-20)) {
			if (commit.sha !== pull.head.sha) candidateShas.add(commit.sha);
		}
	} else if (context.eventName === 'push') {
		const pulls = await github.paginate(github.rest.repos.listPullRequestsAssociatedWithCommit, {
			...context.repo,
			commit_sha: context.sha,
			per_page: 100,
		});
		for (const pull of pulls) {
			if (
				pull.merged_at &&
				pull.base.ref === defaultBranch &&
				pull.base.repo?.full_name === `${context.repo.owner}/${context.repo.repo}`
			) {
				candidateShas.add(pull.head.sha);
			}
		}
	}
	for (const sha of candidateShas) {
		for (const run of await runsForSha(github, context, sha)) candidates.set(run.id, run);
	}
	return [...candidates.values()].sort(
		(left, right) => new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime(),
	);
}

export async function planReactParityCi({ github, context, currentPlan }) {
	const trusted = [];
	const needed = new Set(currentPlan.entries.map(fingerprintKey));
	for (const run of await trustedRuns(github, context)) {
		if (!(await successfulProvenance(github, context, run))) continue;
		for (const receiptPath of new Set(currentPlan.entries.map((entry) => entry.receipt))) {
			const receipt = await receiptAt(github, context, receiptPath, run.head_sha);
			if (!receipt) continue;
			for (const entry of entriesFromReceipt(receiptPath, receipt)) {
				if (needed.has(fingerprintKey(entry))) trusted.push(entry);
			}
		}
		const plan = buildExecutionMatrix(currentPlan, trusted);
		if (!plan.hasWork) return plan;
	}
	return buildExecutionMatrix(currentPlan, trusted);
}
