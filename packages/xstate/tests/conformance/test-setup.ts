import '@testing-library/jest-dom/vitest';
import { cleanup } from '@octanejs/testing-library';
import {
	getIsOctaneActEnvironment,
	setOctaneActEnvironment,
} from '@octanejs/testing-library/act-environment';
import { afterAll, afterEach, beforeAll } from 'vitest';

// https://testing-library.com/docs/react-testing-library/api#cleanup
afterEach(function cleanupAfterEach() {
	cleanup();
});

let previousIsActEnvironment: boolean | undefined;

beforeAll(function enableActEnvironment() {
	previousIsActEnvironment = getIsOctaneActEnvironment();
	setOctaneActEnvironment(true);
});

afterAll(function restoreActEnvironment() {
	setOctaneActEnvironment(previousIsActEnvironment);
});
