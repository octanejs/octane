/**
 * Test script for NPM download chunk caching
 * Tests that chunks are properly cached and retrieved
 */

import {
	getCachedNpmDownloadChunk,
	setCachedNpmDownloadChunk,
} from '../src/utils/npm-download-cache.server';

async function testCache() {
	console.log('\n' + '='.repeat(80));
	console.log('🧪 Testing NPM Download Chunk Cache');
	console.log('='.repeat(80) + '\n');

	const testPackage = '@tanstack/react-query';
	const testDateFrom = '2024-01-01';
	const testDateTo = '2024-06-30';

	// Test 1: Cache miss
	console.log('Test 1: Cache miss (should return null)');
	const miss = await getCachedNpmDownloadChunk(testPackage, testDateFrom, testDateTo);
	console.log(`  Result: ${miss === null ? '✅ NULL (as expected)' : '❌ Got data (unexpected)'}`);

	// Test 2: Write to cache
	console.log('\nTest 2: Write to cache');
	await setCachedNpmDownloadChunk({
		packageName: testPackage,
		dateFrom: testDateFrom,
		dateTo: testDateTo,
		binSize: 'daily',
		totalDownloads: 100000,
		dailyData: [
			{ day: '2024-01-01', downloads: 1000 },
			{ day: '2024-01-02', downloads: 1100 },
		],
		isImmutable: false, // Will be calculated
	});
	console.log('  ✅ Write completed');

	// Test 3: Cache hit
	console.log('\nTest 3: Cache hit (should return data)');
	const hit = await getCachedNpmDownloadChunk(testPackage, testDateFrom, testDateTo);
	if (hit) {
		console.log(`  ✅ Got cached data:`);
		console.log(`     Package: ${hit.packageName}`);
		console.log(`     Range: ${hit.dateFrom} to ${hit.dateTo}`);
		console.log(`     Total downloads: ${hit.totalDownloads.toLocaleString()}`);
		console.log(`     Daily data points: ${hit.dailyData.length}`);
		console.log(`     Is immutable: ${hit.isImmutable}`);
	} else {
		console.log('  ❌ Cache miss (unexpected)');
	}

	// Test 4: Historical chunk (should be immutable)
	console.log('\nTest 4: Historical chunk (should be marked immutable)');
	const historicalDateFrom = '2023-01-01';
	const historicalDateTo = '2023-06-30';
	await setCachedNpmDownloadChunk({
		packageName: testPackage,
		dateFrom: historicalDateFrom,
		dateTo: historicalDateTo,
		binSize: 'daily',
		totalDownloads: 50000,
		dailyData: [
			{ day: '2023-01-01', downloads: 500 },
			{ day: '2023-01-02', downloads: 550 },
		],
		isImmutable: false, // Will be calculated based on dateTo
	});

	const historical = await getCachedNpmDownloadChunk(
		testPackage,
		historicalDateFrom,
		historicalDateTo,
	);
	if (historical) {
		console.log(
			`  Is immutable: ${historical.isImmutable ? '✅ YES (as expected)' : '❌ NO (unexpected)'}`,
		);
	} else {
		console.log('  ❌ Failed to retrieve historical chunk');
	}

	console.log('\n' + '='.repeat(80));
	console.log('✅ Cache tests completed');
	console.log('='.repeat(80) + '\n');

	process.exit(0);
}

testCache().catch((error) => {
	console.error('❌ Test failed:', error);
	process.exit(1);
});
