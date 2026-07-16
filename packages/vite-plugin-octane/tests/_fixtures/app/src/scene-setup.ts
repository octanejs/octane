const state = globalThis as typeof globalThis & {
	__fixtureAuthoredSceneSetup?: number;
};

state.__fixtureAuthoredSceneSetup = (state.__fixtureAuthoredSceneSetup ?? 0) + 1;
