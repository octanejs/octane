interface ThreeSsrFixtureProof {
	moduleEvaluations?: number;
}

const fixture = globalThis as typeof globalThis & {
	__octaneThreeSsrProof?: ThreeSsrFixtureProof;
};
const proof = (fixture.__octaneThreeSsrProof ??= {});
proof.moduleEvaluations = (proof.moduleEvaluations ?? 0) + 1;
