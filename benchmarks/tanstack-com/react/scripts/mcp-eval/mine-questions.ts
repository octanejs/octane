/**
 * Question Mining Script for MCP Eval Test Cases
 *
 * This script helps systematically gather real user questions from various sources
 * to improve our test coverage.
 *
 * Sources:
 * 1. Stack Overflow - API for tagged questions
 * 2. GitHub Issues/Discussions - GraphQL API
 * 3. Reddit - API for subreddit search
 *
 * Usage:
 *   npx tsx scripts/mcp-eval/mine-questions.ts --source stackoverflow --library query
 *   npx tsx scripts/mcp-eval/mine-questions.ts --source github --library router
 *   npx tsx scripts/mcp-eval/mine-questions.ts --all
 */

const STACK_OVERFLOW_TAGS: Record<string, string[]> = {
	query: ['tanstackreact-query', 'react-query'],
	router: ['tanstack-router'],
	table: ['tanstack-table', 'react-table'],
	form: ['tanstack-form', 'react-hook-form'], // react-hook-form for comparison
	virtual: ['tanstack-virtual', 'react-virtual'],
};

const GITHUB_REPOS: Record<string, string> = {
	query: 'TanStack/query',
	router: 'TanStack/router',
	table: 'TanStack/table',
	form: 'TanStack/form',
	virtual: 'TanStack/virtual',
	start: 'TanStack/start',
	store: 'TanStack/store',
};

interface QuestionCandidate {
	source: 'stackoverflow' | 'github' | 'reddit';
	title: string;
	url: string;
	score: number;
	tags: string[];
	library: string;
	createdAt: string;
}

async function fetchStackOverflowQuestions(
	tags: string[],
	library: string,
): Promise<QuestionCandidate[]> {
	const questions: QuestionCandidate[] = [];

	for (const tag of tags) {
		try {
			// Stack Overflow API - get questions sorted by votes
			const url = `https://api.stackexchange.com/2.3/questions?order=desc&sort=votes&tagged=${tag}&site=stackoverflow&pagesize=50&filter=withbody`;
			const response = await fetch(url);
			const data = await response.json();

			if (data.items) {
				for (const item of data.items) {
					questions.push({
						source: 'stackoverflow',
						title: item.title,
						url: item.link,
						score: item.score,
						tags: item.tags,
						library,
						createdAt: new Date(item.creation_date * 1000).toISOString(),
					});
				}
			}
		} catch (error) {
			console.error(`Error fetching SO questions for ${tag}:`, error);
		}
	}

	return questions;
}

async function fetchGitHubDiscussions(repo: string, library: string): Promise<QuestionCandidate[]> {
	const questions: QuestionCandidate[] = [];

	// GitHub GraphQL API for discussions
	// Note: Requires GITHUB_TOKEN env var
	const token = process.env.GITHUB_TOKEN;
	if (!token) {
		console.warn('GITHUB_TOKEN not set, skipping GitHub discussions');
		return questions;
	}

	const query = `
    query($repo: String!, $owner: String!) {
      repository(name: $repo, owner: $owner) {
        discussions(first: 50, orderBy: {field: CREATED_AT, direction: DESC}, categoryId: null) {
          nodes {
            title
            url
            upvoteCount
            createdAt
            category {
              name
            }
          }
        }
      }
    }
  `;

	const [owner, repoName] = repo.split('/');

	try {
		const response = await fetch('https://api.github.com/graphql', {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${token}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				query,
				variables: { repo: repoName, owner },
			}),
		});

		const data = await response.json();

		if (data.data?.repository?.discussions?.nodes) {
			for (const node of data.data.repository.discussions.nodes) {
				// Filter to Q&A category
				if (
					node.category?.name?.toLowerCase().includes('q&a') ||
					node.category?.name?.toLowerCase().includes('help')
				) {
					questions.push({
						source: 'github',
						title: node.title,
						url: node.url,
						score: node.upvoteCount,
						tags: [node.category?.name || 'discussion'],
						library,
						createdAt: node.createdAt,
					});
				}
			}
		}
	} catch (error) {
		console.error(`Error fetching GitHub discussions for ${repo}:`, error);
	}

	return questions;
}

async function fetchGitHubIssues(repo: string, library: string): Promise<QuestionCandidate[]> {
	const questions: QuestionCandidate[] = [];

	const token = process.env.GITHUB_TOKEN;
	const headers: Record<string, string> = {
		Accept: 'application/vnd.github.v3+json',
	};
	if (token) {
		headers.Authorization = `Bearer ${token}`;
	}

	try {
		// Get issues labeled as questions or with "how" in title
		const url = `https://api.github.com/repos/${repo}/issues?state=all&per_page=100&sort=comments&direction=desc`;
		const response = await fetch(url, { headers });
		const issues = await response.json();

		if (Array.isArray(issues)) {
			for (const issue of issues) {
				// Filter to question-like issues
				const isQuestion =
					issue.title.toLowerCase().includes('how') ||
					issue.title.toLowerCase().includes('?') ||
					issue.labels?.some(
						(l: { name: string }) =>
							l.name.toLowerCase().includes('question') || l.name.toLowerCase().includes('help'),
					);

				if (isQuestion && !issue.pull_request) {
					questions.push({
						source: 'github',
						title: issue.title,
						url: issue.html_url,
						score: issue.comments + (issue.reactions?.['+1'] || 0),
						tags: issue.labels?.map((l: { name: string }) => l.name) || [],
						library,
						createdAt: issue.created_at,
					});
				}
			}
		}
	} catch (error) {
		console.error(`Error fetching GitHub issues for ${repo}:`, error);
	}

	return questions;
}

function categorizeQuestion(title: string): string[] {
	const categories: string[] = [];
	const lower = title.toLowerCase();

	// Topic detection
	if (lower.includes('mutation') || lower.includes('mutate')) categories.push('mutations');
	if (lower.includes('cache') || lower.includes('invalidat')) categories.push('cache');
	if (lower.includes('infinite') || lower.includes('pagination')) categories.push('pagination');
	if (lower.includes('ssr') || lower.includes('server')) categories.push('ssr');
	if (lower.includes('typescript') || lower.includes('type')) categories.push('typescript');
	if (lower.includes('test')) categories.push('testing');
	if (lower.includes('error') || lower.includes('retry')) categories.push('error-handling');
	if (lower.includes('prefetch') || lower.includes('preload')) categories.push('prefetching');
	if (lower.includes('suspense')) categories.push('suspense');
	if (lower.includes('devtools')) categories.push('devtools');
	if (lower.includes('optimistic')) categories.push('optimistic');
	if (lower.includes('dependent') || lower.includes('serial')) categories.push('dependent');
	if (lower.includes('parallel')) categories.push('parallel');
	if (lower.includes('refetch') || lower.includes('stale')) categories.push('refetching');
	if (lower.includes('auth')) categories.push('auth');
	if (lower.includes('loading') || lower.includes('pending')) categories.push('loading-states');
	if (lower.includes('route') || lower.includes('navigation')) categories.push('routing');
	if (lower.includes('param')) categories.push('params');
	if (lower.includes('search')) categories.push('search-params');
	if (lower.includes('loader')) categories.push('loaders');
	if (lower.includes('sort')) categories.push('sorting');
	if (lower.includes('filter')) categories.push('filtering');
	if (lower.includes('select')) categories.push('selection');
	if (lower.includes('virtual')) categories.push('virtualization');
	if (lower.includes('form') || lower.includes('submit')) categories.push('forms');
	if (lower.includes('valid')) categories.push('validation');

	return categories.length > 0 ? categories : ['general'];
}

function convertToTestCase(q: QuestionCandidate): object {
	const categories = categorizeQuestion(q.title);

	return {
		id: `mined-${q.library}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
		question: q.title.replace(/&#39;/g, "'").replace(/&quot;/g, '"'),
		difficulty: 'medium',
		tags: [q.library, ...categories],
		source: {
			type: q.source,
			url: q.url,
			score: q.score,
		},
		expectedDocs: [
			{
				library: q.library,
				path: 'TODO: Fill in the correct doc path',
				required: true,
				reason: 'TODO: Explain why this doc answers the question',
			},
		],
		idealSearchQueries: ['TODO: Add ideal search queries'],
		correctAnswerMustInclude: ['TODO: Add key terms'],
		notes: `Mined from ${q.source} on ${new Date().toISOString()}. Original score: ${q.score}`,
	};
}

async function main() {
	const args = process.argv.slice(2);
	let source = 'all' as string;
	let library: string | null = null;

	for (let i = 0; i < args.length; i++) {
		if (args[i] === '--source' && args[i + 1]) {
			source = args[i + 1];
		}
		if (args[i] === '--library' && args[i + 1]) {
			library = args[i + 1];
		}
	}

	console.log(`\n🔍 Mining questions from ${source}...`);
	if (library) console.log(`   Filtering to library: ${library}`);
	console.log('');

	const allQuestions: QuestionCandidate[] = [];

	const libraries = library ? [library] : Object.keys(GITHUB_REPOS);

	for (const lib of libraries) {
		console.log(`\n📚 Processing ${lib}...`);

		if (source === 'stackoverflow' || source === 'all') {
			const tags = STACK_OVERFLOW_TAGS[lib];
			if (tags) {
				console.log(`   Stack Overflow tags: ${tags.join(', ')}`);
				const soQuestions = await fetchStackOverflowQuestions(tags, lib);
				console.log(`   Found ${soQuestions.length} SO questions`);
				allQuestions.push(...soQuestions);
			}
		}

		if (source === 'github' || source === 'all') {
			const repo = GITHUB_REPOS[lib];
			if (repo) {
				console.log(`   GitHub repo: ${repo}`);
				const ghDiscussions = await fetchGitHubDiscussions(repo, lib);
				const ghIssues = await fetchGitHubIssues(repo, lib);
				console.log(`   Found ${ghDiscussions.length} discussions, ${ghIssues.length} issues`);
				allQuestions.push(...ghDiscussions, ...ghIssues);
			}
		}

		// Rate limiting
		await new Promise((r) => setTimeout(r, 1000));
	}

	// Sort by score and dedupe
	const sortedQuestions = allQuestions
		.sort((a, b) => b.score - a.score)
		.filter(
			(q, i, arr) => arr.findIndex((x) => x.title.toLowerCase() === q.title.toLowerCase()) === i,
		);

	console.log(`\n\n📊 Results Summary`);
	console.log(`   Total unique questions: ${sortedQuestions.length}`);

	// Group by library
	const byLibrary: Record<string, number> = {};
	for (const q of sortedQuestions) {
		byLibrary[q.library] = (byLibrary[q.library] || 0) + 1;
	}
	console.log(`   By library:`);
	for (const [lib, count] of Object.entries(byLibrary)) {
		console.log(`     ${lib}: ${count}`);
	}

	// Group by category
	const byCategory: Record<string, number> = {};
	for (const q of sortedQuestions) {
		for (const cat of categorizeQuestion(q.title)) {
			byCategory[cat] = (byCategory[cat] || 0) + 1;
		}
	}
	console.log(`   By category:`);
	const sortedCategories = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);
	for (const [cat, count] of sortedCategories.slice(0, 15)) {
		console.log(`     ${cat}: ${count}`);
	}

	// Output top questions as potential test cases
	console.log(`\n\n🎯 Top 20 Questions (by score):`);
	console.log('='.repeat(80));

	const testCaseCandidates = sortedQuestions.slice(0, 20).map(convertToTestCase);

	for (const q of sortedQuestions.slice(0, 20)) {
		console.log(`\n[${q.library}] ${q.title}`);
		console.log(`   Score: ${q.score} | Source: ${q.source}`);
		console.log(`   Categories: ${categorizeQuestion(q.title).join(', ')}`);
		console.log(`   URL: ${q.url}`);
	}

	// Save candidates to file
	const outputPath = './scripts/mcp-eval/mined-questions.json';
	const fs = await import('fs');
	fs.writeFileSync(
		outputPath,
		JSON.stringify(
			{
				minedAt: new Date().toISOString(),
				totalQuestions: sortedQuestions.length,
				topCandidates: testCaseCandidates,
				allQuestions: sortedQuestions,
			},
			null,
			2,
		),
	);
	console.log(`\n\n💾 Saved ${sortedQuestions.length} questions to ${outputPath}`);
	console.log(`   Review the file and add promising questions to test-cases.json`);
}

main().catch(console.error);
