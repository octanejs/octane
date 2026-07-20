# MCP Documentation Discoverability Evaluation

This tool tests how well AI assistants can find the right TanStack documentation using the MCP server.

## Why This Exists

When an AI uses the TanStack MCP to answer questions, it needs to:

1. Search for relevant docs
2. Find the RIGHT docs (not just related ones)
3. Do so efficiently (fewer searches = better)

This evaluation suite helps us "train" our docs to be more discoverable by:

- Identifying search queries that fail to surface important docs
- Finding gaps in doc titles, descriptions, and content
- Measuring improvement over time

## Running the Tests

```bash
# Run all tests (requires dev server running on port 3001)
pnpm dev  # in another terminal
npx tsx scripts/mcp-eval/run-eval.ts

# Run a specific test
npx tsx scripts/mcp-eval/run-eval.ts --test router-query-ssr-integration

# Run tests by tag
npx tsx scripts/mcp-eval/run-eval.ts --tag start
npx tsx scripts/mcp-eval/run-eval.ts --tag query

# Use a different MCP endpoint
MCP_URL=https://tanstack.com/api/mcp npx tsx scripts/mcp-eval/run-eval.ts

# Authenticate with an API key (required for production)
MCP_API_KEY=your-api-key MCP_URL=http://localhost:3000/api/mcp npx tsx scripts/mcp-eval/run-eval.ts
```

## Test Case Structure

Each test case in `test-cases.json` includes:

```json
{
  "id": "unique-id",
  "question": "The question an AI might receive",
  "difficulty": "easy | medium | hard",
  "tags": ["library", "topic"],
  "expectedDocs": [
    {
      "library": "router",
      "path": "framework/react/guide/data-loading",
      "required": true,
      "reason": "Why this doc should be found"
    }
  ],
  "idealSearchQueries": ["queries that SHOULD find the doc"],
  "badSearchQueries": ["queries that surprisingly DON'T work"],
  "correctAnswerMustInclude": ["key terms the answer needs"],
  "notes": "Any additional context"
}
```

## Scoring

Each test is scored 0-100:

- **50%** - Finding required docs
- **30%** - Search efficiency (fewer searches = better)
- **20%** - Doc appearing in top 3 results

A test passes if:

- All required docs are found
- Score >= 70

## Adding New Tests

1. Think of a question users/AIs commonly ask
2. Search for it yourself using the MCP tools
3. Document which docs SHOULD be found
4. Add the test case to `test-cases.json`
5. Run the eval to see if it passes
6. If it fails, either:
   - Fix the test (wrong expectations)
   - Fix the docs (improve discoverability)

## Improving Doc Discoverability

When a test fails, consider:

1. **Doc titles** - Does the title include key search terms?
2. **Doc descriptions** - Is there frontmatter that Algolia indexes?
3. **Cross-references** - Do related docs link to each other?
4. **Canonical terms** - Are you using the terms users search for?

Example: The "useQuery" search returns API reference, not the guide.
Solution: Either rename the guide or add "useQuery" prominently to it.

## CI Integration

```bash
# Exit code is 0 if all tests pass, 1 otherwise
npx tsx scripts/mcp-eval/run-eval.ts || echo "Some tests failed"
```
