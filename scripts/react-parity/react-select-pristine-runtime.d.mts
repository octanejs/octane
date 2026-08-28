export interface PristineTestIdentity {
	file: string;
	fullName: string;
	status: string;
}

export interface PristineJestAssertion {
	fullName: string;
	status: string;
}

export interface PristineJestSuite {
	name: string;
	assertionResults: PristineJestAssertion[];
}

export interface PristineJestResult {
	testResults: PristineJestSuite[];
}

export function pristineTestIdentities(
	result: PristineJestResult,
	repoRoot?: string,
): PristineTestIdentity[];
