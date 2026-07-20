import { execFileSync } from 'node:child_process';
import { docsWebhookSources } from '../src/utils/docs-webhook-sources';

type GitHubHook = {
	active: boolean;
	config?: {
		url?: string;
	};
	events?: Array<string>;
	id: number;
};

type DocsWebhookSource = {
	refs: Array<string>;
	repo: string;
};

const dryRun = process.argv.includes('--dry-run');
const siteUrl = (process.env.SITE_URL || 'https://tanstack.com').replace(/\/+$/g, '');
const webhookUrl = `${siteUrl}/api/github/webhook`;
const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET;

if (!dryRun && !webhookSecret) {
	throw new Error('GITHUB_WEBHOOK_SECRET is required to create or update repository webhooks.');
}

if (!dryRun && webhookSecret) {
	if (webhookSecret.length < 16 || /\s/.test(webhookSecret)) {
		throw new Error(
			'GITHUB_WEBHOOK_SECRET must be a raw secret value, not a secret manager placeholder.',
		);
	}
}

function runGh(args: Array<string>) {
	return execFileSync('gh', args, {
		cwd: process.cwd(),
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe'],
	}).trim();
}

function listHooks(repo: string) {
	const output = runGh(['api', `repos/${repo}/hooks`]);

	return JSON.parse(output) as Array<GitHubHook>;
}

function createWebhook(repo: string) {
	if (dryRun) {
		console.log(`[dry-run] create webhook for ${repo} -> ${webhookUrl}`);
		return;
	}

	runGh([
		'api',
		`repos/${repo}/hooks`,
		'--method',
		'POST',
		'-F',
		'name=web',
		'-F',
		'active=true',
		'-F',
		'events[]=push',
		'-F',
		`config[url]=${webhookUrl}`,
		'-F',
		'config[content_type]=json',
		'-F',
		`config[secret]=${webhookSecret}`,
		'-F',
		'config[insecure_ssl]=0',
	]);

	console.log(`created webhook for ${repo}`);
}

function updateWebhook(repo: string, hookId: number) {
	if (dryRun) {
		console.log(`[dry-run] update webhook ${hookId} for ${repo} -> ${webhookUrl}`);
		return;
	}

	runGh([
		'api',
		`repos/${repo}/hooks/${hookId}`,
		'--method',
		'PATCH',
		'-F',
		'active=true',
		'-F',
		'events[]=push',
		'-F',
		`config[url]=${webhookUrl}`,
		'-F',
		'config[content_type]=json',
		'-F',
		`config[secret]=${webhookSecret}`,
		'-F',
		'config[insecure_ssl]=0',
	]);

	console.log(`updated webhook ${hookId} for ${repo}`);
}

const webhookSources = docsWebhookSources as Array<DocsWebhookSource>;

console.log(`docs webhook target: ${webhookUrl}`);
console.log('watched repos/refs:');

for (const source of webhookSources) {
	console.log(`- ${source.repo} (${source.refs.join(', ')})`);
}

for (const source of webhookSources) {
	const hooks = listHooks(source.repo);
	const existingHook = hooks.find((hook) => hook.config?.url === webhookUrl);

	if (!existingHook) {
		createWebhook(source.repo);
		continue;
	}

	updateWebhook(source.repo, existingHook.id);
}
