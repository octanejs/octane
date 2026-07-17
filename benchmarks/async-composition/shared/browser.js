import { beginOperation, DELAY, expectedSignature, getOperationTrace } from './data.js';

const TIMEOUT = 10_000;

function readSignature(target) {
	return [...target.querySelectorAll('[data-resource]')]
		.map((element) => `${element.getAttribute('data-resource')}=${element.textContent}`)
		.join('|');
}

function waitForSignature(target, version, startedAt, validateState) {
	const expected = expectedSignature(version);
	return new Promise((resolve, reject) => {
		let timeout;
		let reachedExpected = false;
		let finished = false;
		const observer = new MutationObserver(check);
		const cleanup = () => {
			observer.disconnect();
			clearTimeout(timeout);
		};
		const fail = (message) => {
			if (finished) return;
			finished = true;
			cleanup();
			reject(new Error(message));
		};
		async function confirmStable(readyMs) {
			await new Promise((resume) => setTimeout(resume, DELAY));
			await new Promise((resume) => requestAnimationFrame(() => requestAnimationFrame(resume)));
			if (finished) return;
			const signature = readSignature(target);
			const validationError = validateState?.(signature, expected);
			if (validationError) {
				fail(validationError);
				return;
			}
			if (signature !== expected || target.querySelector('[data-fallback]') !== null) {
				fail(`Dashboard did not remain stable after first reaching v${version}.`);
				return;
			}
			finished = true;
			cleanup();
			resolve(readyMs);
		}
		function check() {
			if (finished) return;
			const signature = readSignature(target);
			const validationError = validateState?.(signature, expected);
			if (validationError) {
				fail(validationError);
				return;
			}
			if (reachedExpected) {
				if (signature !== expected || target.querySelector('[data-fallback]') !== null) {
					fail(`Dashboard became unstable after first reaching v${version}.`);
				}
				return;
			}
			if (signature !== expected) return;
			reachedExpected = true;
			void confirmStable(performance.now() - startedAt);
		}
		observer.observe(target, { childList: true, characterData: true, subtree: true });
		timeout = setTimeout(() => {
			fail(
				`Timed out waiting for stable v${version}. Signature: ${readSignature(target)}. HTML: ${target.innerHTML}`,
			);
		}, TIMEOUT);
		check();
	});
}

export function installBrowserBenchmark(target, mount) {
	let version = 0;

	window.__init = async () => {
		beginOperation(version);
		const startedAt = performance.now();
		mount();
		const readyMs = await waitForSignature(target, version, startedAt);
		return {
			readyMs,
			signature: readSignature(target),
			trace: getOperationTrace(),
		};
	};

	window.__update = async () => {
		const previousSignature = readSignature(target);
		const intermediateSignatures = [];
		version += 1;
		beginOperation(version);
		const startedAt = performance.now();
		const completion = waitForSignature(target, version, startedAt, (signature, expected) => {
			if (target.querySelector('[data-fallback]') !== null) {
				return `Transition exposed the initial fallback while waiting for v${version}.`;
			}
			if (signature !== previousSignature && signature !== expected) {
				if (intermediateSignatures.at(-1) !== signature) intermediateSignatures.push(signature);
			}
			return null;
		});
		window.__bump();
		const retainedOldResourceValues = readSignature(target) === previousSignature;
		const fallbackVisibleAfterTrigger = target.querySelector('[data-fallback]') !== null;
		const readyMs = await completion;
		return {
			readyMs,
			signature: readSignature(target),
			retainedOldResourceValues,
			fallbackVisibleAfterTrigger,
			intermediateSignatures,
			trace: getOperationTrace(),
		};
	};
}
