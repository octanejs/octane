import { createHash } from 'node:crypto';
import { verify } from 'sigstore';

const PREDICATE_TYPE = 'https://slsa.dev/provenance/v1';

// This checks the signed statement's meaning. Trust is established separately by
// verifyNpmProvenance, which verifies the bundle against Sigstore's trust roots.
export function inspectNpmProvenance(statement, { name, version, repository, artifact }) {
	const repositoryUrl = `https://github.com/${repository.owner}/${repository.repo}`;
	const subjectName = `pkg:npm/${name.replace('@', '%40')}@${version}`;
	const digest = createHash('sha512').update(artifact).digest('hex');
	if (
		statement._type !== 'https://in-toto.io/Statement/v1' ||
		statement.predicateType !== PREDICATE_TYPE ||
		statement.subject?.length !== 1 ||
		statement.subject[0].name !== subjectName ||
		statement.subject[0].digest?.sha512 !== digest
	)
		throw new Error('npm provenance does not identify the exact package and artifact');
	const definition = statement.predicate?.buildDefinition;
	const workflow = definition?.externalParameters?.workflow;
	if (
		definition?.buildType !==
			'https://slsa-framework.github.io/github-actions-buildtypes/workflow/v1' ||
		workflow?.repository !== repositoryUrl ||
		!/^refs\/(heads|tags)\/[^\s@]+$/.test(workflow?.ref ?? '') ||
		!/^\.github\/workflows\/[\w.-]+\.ya?ml$/.test(workflow?.path ?? '')
	)
		throw new Error('npm provenance workflow does not match the published repository');
	const sources =
		definition.resolvedDependencies?.filter(
			(dependency) => dependency.uri === `git+${repositoryUrl}@${workflow.ref}`,
		) ?? [];
	if (sources.length !== 1 || !/^[0-9a-f]{40}$/.test(sources[0].digest?.gitCommit ?? '')) {
		throw new Error('npm provenance does not identify one immutable source commit');
	}
	return {
		commit: sources[0].digest.gitCommit,
		certificateIdentityURI: `${repositoryUrl}/${workflow.path}@${workflow.ref}`,
		certificateIssuer: 'https://token.actions.githubusercontent.com',
		artifactSha512: digest,
	};
}

export async function verifyNpmProvenance(attestations, identity) {
	const candidates =
		attestations.attestations?.filter((item) => item.predicateType === PREDICATE_TYPE) ?? [];
	if (candidates.length !== 1) throw new Error('Expected one npm SLSA provenance attestation');
	const { bundle } = candidates[0];
	if (bundle?.dsseEnvelope?.payloadType !== 'application/vnd.in-toto+json') {
		throw new Error('npm provenance has an unsupported signed payload type');
	}
	const payload = Buffer.from(bundle.dsseEnvelope.payload, 'base64');
	const proof = inspectNpmProvenance(JSON.parse(payload.toString('utf8')), identity);
	await verify(bundle, {
		certificateIdentityURI: proof.certificateIdentityURI,
		certificateIssuer: proof.certificateIssuer,
	});
	return {
		...proof,
		verified: true,
		statementSha256: createHash('sha256').update(payload).digest('hex'),
	};
}
