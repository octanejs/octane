/**
 * MCP Documentation Discoverability Evaluation Runner
 *
 * This script tests how well the TanStack MCP server helps AI assistants
 * find the right documentation to answer questions.
 *
 * Usage:
 *   npx tsx scripts/mcp-eval/run-eval.ts
 *   npx tsx scripts/mcp-eval/run-eval.ts --test router-query-ssr-integration
 *   npx tsx scripts/mcp-eval/run-eval.ts --tag start
 */

import testCases from './test-cases.json';

const MCP_URL = process.env.MCP_URL || 'http://localhost:3001/api/mcp';
const MCP_API_KEY = process.env.MCP_API_KEY;

interface SearchResult {
	title: string;
	url: string;
	library: string;
	breadcrumb: string[];
}

interface McpResponse {
	result?: {
		content: Array<{ type: string; text: string }>;
	};
	error?: {
		code: number;
		message: string;
	};
}

interface TestResult {
	testId: string;
	question: string;
	difficulty: string;
	searchesPerformed: Array<{
		query: string;
		resultsCount: number;
		foundExpectedDoc: boolean;
		topResults: string[];
	}>;
	expectedDocsFound: string[];
	expectedDocsMissed: string[];
	totalSearches: number;
	passed: boolean;
	score: number;
	notes: string[];
}

async function callMcp(method: string, params: object): Promise<McpResponse> {
	const headers: Record<string, string> = {
		'Content-Type': 'application/json',
		Accept: 'application/json, text/event-stream',
	};

	if (MCP_API_KEY) {
		headers['Authorization'] = `Bearer ${MCP_API_KEY}`;
	}

	// First initialize
	await fetch(MCP_URL, {
		method: 'POST',
		headers,
		body: JSON.stringify({
			jsonrpc: '2.0',
			id: 0,
			method: 'initialize',
			params: {
				protocolVersion: '2024-11-05',
				capabilities: {},
				clientInfo: { name: 'mcp-eval', version: '1.0.0' },
			},
		}),
	});

	// Then call the tool
	const response = await fetch(MCP_URL, {
		method: 'POST',
		headers,
		body: JSON.stringify({
			jsonrpc: '2.0',
			id: 1,
			method: 'tools/call',
			params: {
				name: method,
				arguments: params,
			},
		}),
	});

	return response.json();
}

async function searchDocs(
	query: string,
	library?: string,
): Promise<{ results: SearchResult[]; totalHits: number }> {
	const response = await callMcp('search_docs', {
		query,
		library,
		limit: 10,
	});

	if (response.error) {
		throw new Error(response.error.message);
	}

	const text = response.result?.content[0]?.text || '{}';
	return JSON.parse(text);
}
function extractPathFromUrl(url: string): string {
	// Extract path from URL like https://tanstack.com/router/latest/docs/integrations/query
	// Also handle anchors like #some-section
	const match = url.match(/\/docs\/([^#]+)/);
	return match ? match[1] : '';
}

async function runTestCase(testCase: (typeof testCases.testCases)[0]): Promise<TestResult> {
	const result: TestResult = {
		testId: testCase.id,
		question: testCase.question,
		difficulty: testCase.difficulty,
		searchesPerformed: [],
		expectedDocsFound: [],
		expectedDocsMissed: [],
		totalSearches: 0,
		passed: false,
		score: 0,
		notes: [],
	};

	const expectedPaths = new Set(testCase.expectedDocs.map((d) => `${d.library}:${d.path}`));
	const foundPaths = new Set<string>();

	// Try ideal search queries first
	for (const query of testCase.idealSearchQueries || []) {
		result.totalSearches++;

		try {
			const searchResult = await searchDocs(query);
			const topResults = searchResult.results.slice(0, 5).map((r) => r.url);

			let foundExpected = false;
			for (const r of searchResult.results) {
				const path = extractPathFromUrl(r.url);
				const key = `${r.library}:${path}`;

				if (expectedPaths.has(key)) {
					foundPaths.add(key);
					foundExpected = true;
				}
			}

			result.searchesPerformed.push({
				query,
				resultsCount: searchResult.totalHits,
				foundExpectedDoc: foundExpected,
				topResults,
			});

			// If we found all expected docs, stop searching
			if (foundPaths.size === expectedPaths.size) {
				break;
			}
		} catch (error) {
			result.notes.push(`Search failed for "${query}": ${error}`);
		}
	}

	// Record which docs were found vs missed
	for (const doc of testCase.expectedDocs) {
		const key = `${doc.library}:${doc.path}`;
		if (foundPaths.has(key)) {
			result.expectedDocsFound.push(key);
		} else {
			result.expectedDocsMissed.push(key);
		}
	}

	// Calculate score
	const requiredDocs = testCase.expectedDocs.filter((d) => d.required);
	const requiredFound = requiredDocs.filter((d) => foundPaths.has(`${d.library}:${d.path}`));

	// Score breakdown:
	// - 50% for finding required docs
	// - 30% for finding them in fewer searches
	// - 20% for finding them in top results

	const requiredScore = requiredDocs.length > 0 ? requiredFound.length / requiredDocs.length : 1;

	const searchEfficiency = Math.max(
		0,
		1 - (result.totalSearches - 1) / (testCase.idealSearchQueries?.length || 3),
	);

	// Check if expected doc appeared in top 3 results
	const topResultScore = result.searchesPerformed.some((s) => {
		return testCase.expectedDocs.some((doc) =>
			s.topResults.slice(0, 3).some((url) => url.includes(doc.path.replace(/\//g, '/'))),
		);
	})
		? 1
		: 0;

	result.score = Math.round(
		(requiredScore * 0.5 + searchEfficiency * 0.3 + topResultScore * 0.2) * 100,
	);

	result.passed = requiredFound.length === requiredDocs.length && result.score >= 70;

	return result;
}

async function main() {
	const args = process.argv.slice(2);
	let testFilter: string | undefined;
	let tagFilter: string | undefined;

	for (let i = 0; i < args.length; i++) {
		if (args[i] === '--test' && args[i + 1]) {
			testFilter = args[i + 1];
		}
		if (args[i] === '--tag' && args[i + 1]) {
			tagFilter = args[i + 1];
		}
	}

	let cases = testCases.testCases;

	if (testFilter) {
		cases = cases.filter((c) => c.id === testFilter);
	}

	if (tagFilter) {
		cases = cases.filter((c) => c.tags.includes(tagFilter));
	}

	console.log(`\n🧪 Running ${cases.length} MCP evaluation test(s)...\n`);
	console.log('='.repeat(60));

	const results: TestResult[] = [];

	for (const testCase of cases) {
		console.log(`\n📋 Test: ${testCase.id}`);
		console.log(`   Question: ${testCase.question.slice(0, 60)}...`);

		try {
			const result = await runTestCase(testCase);
			results.push(result);

			const status = result.passed ? '✅ PASS' : '❌ FAIL';
			console.log(`   ${status} (Score: ${result.score}/100)`);
			console.log(`   Searches: ${result.totalSearches}`);

			if (result.expectedDocsMissed.length > 0) {
				console.log(`   ⚠️  Missed: ${result.expectedDocsMissed.join(', ')}`);
			}

			if (result.notes.length > 0) {
				result.notes.forEach((n) => console.log(`   📝 ${n}`));
			}
		} catch (error) {
			console.log(`   ❌ ERROR: ${error}`);
		}
	}

	console.log('\n' + '='.repeat(60));
	console.log('\n📊 Summary\n');

	const passed = results.filter((r) => r.passed).length;
	const total = results.length;
	const avgScore = Math.round(results.reduce((sum, r) => sum + r.score, 0) / total);

	console.log(`   Passed: ${passed}/${total}`);
	console.log(`   Average Score: ${avgScore}/100`);

	// Group by difficulty
	const byDifficulty = {
		easy: results.filter((r) => r.difficulty === 'easy'),
		medium: results.filter((r) => r.difficulty === 'medium'),
		hard: results.filter((r) => r.difficulty === 'hard'),
	};

	for (const [diff, tests] of Object.entries(byDifficulty)) {
		if (tests.length > 0) {
			const p = tests.filter((t) => t.passed).length;
			const avg = Math.round(tests.reduce((s, t) => s + t.score, 0) / tests.length);
			console.log(`   ${diff}: ${p}/${tests.length} passed (avg: ${avg})`);
		}
	}

	// Output detailed results as JSON
	const outputPath = './scripts/mcp-eval/results.json';
	const fs = await import('fs');
	fs.writeFileSync(
		outputPath,
		JSON.stringify(
			{
				timestamp: new Date().toISOString(),
				summary: { passed, total, avgScore },
				results,
			},
			null,
			2,
		),
	);
	console.log(`\n   Detailed results: ${outputPath}`);

	// Exit with error if any tests failed
	process.exit(passed === total ? 0 : 1);
}

main().catch(console.error);
