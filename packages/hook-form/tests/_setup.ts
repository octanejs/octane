// Vitest setupFile for the hook-form project.
//
// 1. jest-dom matchers (toBeVisible, toBeInTheDocument, …) — mirrors
//    react-hook-form's own jest setup (scripts/jest/setup.ts).
// 2. auto-cleanup + act()-environment arming — upstream runs jest with
//    injected globals, where @testing-library/react's default entry registers
//    these itself; this repo runs vitest with `globals: false`, so the ported
//    suite gets the same behavior from here instead.
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeAll, afterAll } from 'vitest';
import { cleanup } from '@octanejs/testing-library';
import {
	getIsOctaneActEnvironment,
	setOctaneActEnvironment,
} from '@octanejs/testing-library/act-environment';

afterEach(() => {
	cleanup();
});

let previousIsActEnvironment: boolean | undefined;
beforeAll(() => {
	previousIsActEnvironment = getIsOctaneActEnvironment();
	setOctaneActEnvironment(true);
});
afterAll(() => {
	setOctaneActEnvironment(previousIsActEnvironment);
});
