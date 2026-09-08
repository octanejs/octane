import { mkdir, mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { exportTemplates } from '../src/export.js';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = resolve(packageRoot, '../..');
const temporaryDirectories: string[] = [];

async function fixture() {
	const root = await mkdtemp(join(tmpdir(), 'octane-react-email-cli-'));
	temporaryDirectories.push(root);
	const emails = join(root, 'emails');
	await mkdir(join(emails, 'account'), { recursive: true });
	await mkdir(join(emails, 'static', 'images'), { recursive: true });
	await mkdir(join(root, 'node_modules', '@octanejs'), { recursive: true });
	await symlink(join(repositoryRoot, 'packages/octane'), join(root, 'node_modules/octane'), 'dir');
	await symlink(
		join(repositoryRoot, 'packages/email'),
		join(root, 'node_modules/@octanejs/email'),
		'dir',
	);
	await writeFile(join(root, 'package.json'), JSON.stringify({ type: 'module' }));
	return { root, emails, out: join(root, 'out') };
}

afterEach(async () => {
	const { rm } = await import('node:fs/promises');
	await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true })));
});

describe('exportTemplates', () => {
	it('renders nested .tsrx templates and preserves their relative paths', async () => {
		const { emails, out } = await fixture();
		await writeFile(
			join(emails, 'welcome.tsrx'),
			"import { Html, Text } from '@octanejs/email';\nexport default function Welcome() @{ <Html><Text>{'Welcome!'}</Text></Html> }\n",
		);
		await writeFile(
			join(emails, 'account', 'reset.tsrx'),
			"import { Html, Text } from '@octanejs/email';\nexport default function Reset() @{ <Html><Text>{'Reset password'}</Text></Html> }\n",
		);

		const result = await exportTemplates(out, emails);

		expect(result.templates.map((entry) => entry.relativePath)).toEqual([
			'account/reset.html',
			'welcome.html',
		]);
		expect(await readFile(join(out, 'welcome.html'), 'utf8')).toContain('Welcome!');
		expect(await readFile(join(out, 'account', 'reset.html'), 'utf8')).toContain('Reset password');
	});

	it('copies static assets without treating them as templates', async () => {
		const { emails, out } = await fixture();
		await writeFile(
			join(emails, 'notice.tsrx'),
			"import { Html } from '@octanejs/email';\nexport default function Notice() @{ <Html /> }\n",
		);
		await writeFile(join(emails, 'static', 'images', 'logo.svg'), '<svg>logo</svg>');

		const result = await exportTemplates(out, emails);

		expect(result.templates).toHaveLength(1);
		expect(await readFile(join(out, 'static', 'images', 'logo.svg'), 'utf8')).toBe(
			'<svg>logo</svg>',
		);
	});

	it('rejects a template without a default component export', async () => {
		const { emails, out } = await fixture();
		await writeFile(join(emails, 'invalid.tsrx'), "export const subject = 'No component';\n");

		await expect(exportTemplates(out, emails)).rejects.toThrow(
			'invalid.tsrx must default-export an email component',
		);
	});

	it('rejects output directories that contain the email source', async () => {
		const { root, emails } = await fixture();

		await expect(exportTemplates(root, emails)).rejects.toThrow(
			'Output and email source directories cannot contain each other',
		);
		expect(await readFile(join(root, 'package.json'), 'utf8')).toContain('module');
	});

	it('rejects output extensions that can escape the destination', async () => {
		const { emails, out } = await fixture();

		await expect(exportTemplates(out, emails, { extension: '../../escaped' })).rejects.toThrow(
			'Invalid output extension',
		);
	});
});
