import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

const PACKAGE_TEST_FILE_PATTERN = /(?:^|[.-])(?:test|spec)\.(?:[cm]?[jt]sx?|tsrx)$/i;
const PACKAGE_TEST_SOURCE_PATTERN = /\.(?:[cm]?[jt]sx?|tsrx)$/i;
const TEST_DIRECTORIES = new Set(['__tests__', 'test', 'tests']);
const SKIPPED_DIRECTORIES = new Set(['dist', 'node_modules']);
function isTestDirectorySource(packageRoot, filePath) {
	if (!PACKAGE_TEST_SOURCE_PATTERN.test(filePath)) return false;
	const directories = path.relative(packageRoot, filePath).split(path.sep).slice(0, -1);
	return directories.some((directory) => TEST_DIRECTORIES.has(directory));
}

function isTestFileCandidate(packageRoot, filePath) {
	return isConventionalPackageTestFile(filePath) || isTestDirectorySource(packageRoot, filePath);
}

export function isConventionalPackageTestFile(filePath) {
	return PACKAGE_TEST_FILE_PATTERN.test(path.basename(filePath));
}

function discoverMatchingPackageTests(packageDirectory, { includeTopLevelUpstream }) {
	const packageRoot = path.resolve(packageDirectory);
	if (!existsSync(packageRoot)) return [];
	const files = [];
	const walk = (directory) => {
		for (const entry of readdirSync(directory, { withFileTypes: true })) {
			if (
				entry.isDirectory() &&
				(SKIPPED_DIRECTORIES.has(entry.name) ||
					(!includeTopLevelUpstream && directory === packageRoot && entry.name === 'upstream'))
			) {
				continue;
			}
			const entryPath = path.join(directory, entry.name);
			if (entry.isDirectory()) walk(entryPath);
			else if (entry.isFile() && isTestFileCandidate(packageRoot, entryPath)) {
				files.push(entryPath);
			}
		}
	};
	walk(packageRoot);
	return files.sort();
}

export function discoverPackageTests(packageDirectory) {
	return discoverMatchingPackageTests(packageDirectory, {
		includeTopLevelUpstream: false,
	});
}

export function discoverReportEligiblePackageTests(packageDirectory) {
	return discoverMatchingPackageTests(packageDirectory, {
		includeTopLevelUpstream: true,
	});
}

export function hasObservablePackageTests(packageDirectory) {
	return discoverPackageTests(packageDirectory).length > 0;
}
