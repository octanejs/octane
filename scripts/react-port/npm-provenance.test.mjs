import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { inspectNpmProvenance, verifyNpmProvenance } from './npm-provenance.mjs';

function fixture() {
	const identity = {
		name: '@example/widget',
		version: '1.2.3',
		repository: { owner: 'example', repo: 'widget' },
		artifact: Buffer.from('published tarball'),
	};
	const statement = {
		_type: 'https://in-toto.io/Statement/v1',
		predicateType: 'https://slsa.dev/provenance/v1',
		subject: [
			{
				name: 'pkg:npm/%40example/widget@1.2.3',
				digest: { sha512: createHash('sha512').update(identity.artifact).digest('hex') },
			},
		],
		predicate: {
			buildDefinition: {
				buildType: 'https://slsa-framework.github.io/github-actions-buildtypes/workflow/v1',
				externalParameters: {
					workflow: {
						repository: 'https://github.com/example/widget',
						ref: 'refs/heads/main',
						path: '.github/workflows/publish.yml',
					},
				},
				resolvedDependencies: [
					{
						uri: 'git+https://github.com/example/widget@refs/heads/main',
						digest: { gitCommit: 'a'.repeat(40) },
					},
				],
			},
		},
	};
	return { identity, statement };
}

test('provenance identifies the package, artifact, publishing identity, and source', () => {
	const { identity, statement } = fixture();
	const result = inspectNpmProvenance(statement, identity);
	assert.equal(result.commit, 'a'.repeat(40));
	assert.equal(
		result.certificateIdentityURI,
		'https://github.com/example/widget/.github/workflows/publish.yml@refs/heads/main',
	);
	assert.equal(result.certificateIssuer, 'https://token.actions.githubusercontent.com');
	assert.equal(result.verified, undefined, 'statement inspection alone must not establish trust');
});

for (const [label, mutate] of [
	[
		'different artifact',
		(_statement, identity) => {
			identity.artifact = Buffer.from('substitute');
		},
	],
	[
		'different package',
		(statement) => {
			statement.subject[0].name = 'pkg:npm/widget@1.2.3';
		},
	],
	[
		'different version',
		(statement) => {
			statement.subject[0].name = 'pkg:npm/%40example/widget@1.2.4';
		},
	],
	[
		'additional subject',
		(statement) => {
			statement.subject.push(statement.subject[0]);
		},
	],
	[
		'different repository',
		(statement) => {
			statement.predicate.buildDefinition.externalParameters.workflow.repository =
				'https://github.com/attacker/widget';
		},
	],
	[
		'mismatched source ref',
		(statement) => {
			statement.predicate.buildDefinition.resolvedDependencies[0].uri += '-other';
		},
	],
	[
		'ambiguous source',
		(statement) => {
			statement.predicate.buildDefinition.resolvedDependencies.push(
				statement.predicate.buildDefinition.resolvedDependencies[0],
			);
		},
	],
	[
		'mutable source',
		(statement) => {
			statement.predicate.buildDefinition.resolvedDependencies[0].digest.gitCommit = 'main';
		},
	],
	[
		'path traversal',
		(statement) => {
			statement.predicate.buildDefinition.externalParameters.workflow.path =
				'.github/workflows/../publish.yml';
		},
	],
]) {
	test(`rejects provenance with ${label}`, () => {
		const { identity, statement } = fixture();
		mutate(statement, identity);
		assert.throws(() => inspectNpmProvenance(statement, identity));
	});
}

test('a matching statement without cryptographic evidence cannot establish provenance', async () => {
	const { identity, statement } = fixture();
	await assert.rejects(
		verifyNpmProvenance(
			{
				attestations: [
					{
						predicateType: statement.predicateType,
						bundle: {
							dsseEnvelope: {
								payloadType: 'application/vnd.in-toto+json',
								payload: Buffer.from(JSON.stringify(statement)).toString('base64'),
								signatures: [],
							},
						},
					},
				],
			},
			identity,
		),
	);
});
