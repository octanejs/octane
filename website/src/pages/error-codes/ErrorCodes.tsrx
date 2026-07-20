import { useState } from 'octane';
import { Link, Outlet, useParams, useSearch } from '@tanstack/octane-router';
import {
	decodeErrorMessage,
	errorArguments,
	errorCodes,
	findErrorCode,
} from '../../content/error-codes.ts';
import { useTitle } from '../../hooks/use-title.ts';

export function ErrorCodesLayout() @{
	<div class="errors-layout">
		<Outlet />
		<style>
			.errors-layout {
				width: 100%;
				max-width: 62rem;
				margin: 0 auto;
				padding: clamp(2.5rem, 7vw, 5rem) 1.5rem 1rem;
			}
			.errors-layout :global(.errors-eyebrow) {
				margin: 0 0 0.5rem;
				color: var(--accent-text);
				font-size: 0.75rem;
				font-weight: 800;
				letter-spacing: 0.1em;
				text-transform: uppercase;
			}
			.errors-layout :global(.errors-title) {
				margin: 0;
				font-size: clamp(2.5rem, 7vw, 4rem);
				line-height: 1.05;
				letter-spacing: -0.045em;
			}
			.errors-layout :global(.errors-lede) {
				max-width: 43rem;
				margin: 1rem 0 2rem;
				color: #d5d9e0;
				font-size: 1.08rem;
			}
			.errors-layout :global(.errors-search) {
				width: 100%;
				margin-bottom: 1.25rem;
				padding: 0.8rem 1rem;
				border: 1px solid var(--border);
				border-radius: 0.8rem;
				background: var(--panel);
				color: var(--text);
				font: inherit;
			}
			.errors-layout :global(.errors-search:focus) {
				border-color: var(--accent);
				outline: 2px solid rgba(255, 65, 90, 0.22);
				outline-offset: 1px;
			}
			.errors-layout :global(.sr-only) {
				position: absolute;
				width: 1px;
				height: 1px;
				padding: 0;
				margin: -1px;
				overflow: hidden;
				clip: rect(0, 0, 0, 0);
				white-space: nowrap;
				border: 0;
			}
			.errors-layout :global(.error-list) {
				display: grid;
				gap: 0.75rem;
				margin: 0;
				padding: 0;
				list-style: none;
			}
			.errors-layout :global(a.error-card) {
				display: grid;
				grid-template-columns: 4.5rem minmax(0, 1fr);
				gap: 1rem;
				align-items: start;
				padding: 1rem 1.1rem;
				border: 1px solid var(--border);
				border-radius: 0.9rem;
				background: var(--panel);
				color: var(--text);
			}
			.errors-layout :global(a.error-card:hover) {
				border-color: rgba(255, 93, 114, 0.55);
				text-decoration: none;
			}
			.errors-layout :global(.error-card-code) {
				color: var(--accent-text);
				font-weight: 800;
			}
			.errors-layout :global(.error-card-message) {
				min-width: 0;
				color: #d5d9e0;
				overflow-wrap: anywhere;
			}
			.errors-layout :global(.error-card-status) {
				display: inline-block;
				margin-left: 0.55rem;
				padding: 0.1rem 0.4rem;
				border: 1px solid var(--border);
				border-radius: 999px;
				color: var(--text-secondary);
				font-size: 0.7rem;
				font-weight: 700;
				text-transform: uppercase;
			}
			.errors-layout :global(.error-empty) {
				padding: 2rem;
				border: 1px dashed var(--border);
				border-radius: 0.9rem;
				color: var(--text-secondary);
				text-align: center;
			}
			.errors-layout :global(.error-decoder-code) {
				margin: 0 0 0.5rem;
				color: var(--accent-text);
				font-size: 1rem;
				font-weight: 800;
				letter-spacing: 0.06em;
				text-transform: uppercase;
			}
			.errors-layout :global(.error-message) {
				margin: 2rem 0 1rem;
				padding: 1.25rem;
				border: 1px solid var(--border);
				border-radius: 0.9rem;
				background: var(--code-bg);
				color: var(--text);
				font-size: 0.95rem;
				line-height: 1.7;
				white-space: pre-wrap;
				overflow-wrap: anywhere;
			}
			.errors-layout :global(.error-argument-note) {
				margin: 0 0 1.5rem;
				color: var(--text-secondary);
			}
			.errors-layout :global(.error-extra-args) {
				margin: 0 0 1.5rem;
				padding-left: 1.5rem;
				color: #d5d9e0;
			}
			.errors-layout :global(.error-extra-args code) {
				overflow-wrap: anywhere;
			}
			.errors-layout :global(a.errors-back) {
				display: inline-flex;
				margin-top: 1rem;
				font-weight: 650;
			}
			@media (max-width: 560px) {
				.errors-layout :global(a.error-card) {
					grid-template-columns: 1fr;
					gap: 0.35rem;
				}
			}
		</style>
	</div>
}

export function ErrorCodesIndex() @{
	const [query, setQuery] = useState('');
	const normalizedQuery = query.trim().toLowerCase();
	const visibleCodes =
		normalizedQuery
			? errorCodes.filter(
					(entry) => entry.code.includes(normalizedQuery) ||
						entry.message.toLowerCase().includes(normalizedQuery),
				)
			: errorCodes;
	useTitle('Octane — Error decoder');

	<section class="errors-index">
		<p class="errors-eyebrow">Production diagnostics</p>
		<h1 class="errors-title">Octane error decoder</h1>
		<p class="errors-lede">
			Production builds replace longer framework error messages with compact codes. Choose a code to
			read its full message, or open the link included in the production error to fill in its values
			automatically.
		</p>
		<label for="error-code-search" class="sr-only">Search error codes</label>
		<input
			id="error-code-search"
			class="errors-search"
			type="search"
			placeholder="Search by code or message"
			value={query}
			onInput={(event: Event) => setQuery((event.currentTarget as HTMLInputElement).value)}
		/>
		@if (visibleCodes.length > 0) {
			<ul class="error-list">
				@for (const entry of visibleCodes; key entry.code) {
					<li>
						<Link to="/errors/$code" params={{ code: entry.code }} class="error-card">
							<span class="error-card-code">
								{'#' + entry.code as string}
								@if (entry.status === 'retired') {
									<span class="error-card-status">Retired</span>
								}
							</span>
							<span class="error-card-message">
								{entry.message as string}
							</span>
						</Link>
					</li>
				}
			</ul>
		} @else {
			<p class="error-empty">No Octane error codes match that search.</p>
		}
	</section>
}

export function ErrorCodeDecoder() @{
	const params = useParams({ strict: false }) as { code: string };
	const search = useSearch({ strict: false }) as Record<string, unknown>;
	const entry = findErrorCode(params.code)!;
	const args = errorArguments(search);
	const message = decodeErrorMessage(entry.message, args);
	const missingCount = Math.max(0, entry.argumentCount - args.length);
	const extraArgs = args.slice(entry.argumentCount);
	const extraEntries = extraArgs.map(
		(argument, index) => ({
			argument,
			key: String(index),
		}),
	);
	useTitle('Octane — Error #' + entry.code);

	<article class="error-decoder">
		<p class="error-decoder-code">
			{'Octane error #' + entry.code as string}
			@if (entry.status === 'retired') {
				<span class="error-card-status">Retired</span>
			}
		</p>
		<h1 class="errors-title">Full error message</h1>
		<pre class="error-message">{message}</pre>
		@if (missingCount > 0) {
			<p class="error-argument-note">
				{'This link is missing ' + missingCount +
					(missingCount === 1 ? ' argument.' : ' arguments.') as string}
				{' Unfilled %s placeholders remain visible above.'}
			</p>
		}
		@if (extraEntries.length > 0) {
			<>
				<p class="error-argument-note">The link also included unused arguments:</p>
				<ul class="error-extra-args">
					@for (const extra of extraEntries; key extra.key) {
						<li>
							<code>
								{extra.argument as string}
							</code>
						</li>
					}
				</ul>
			</>
		}
		<p class="errors-lede">
			Use a development build while debugging to see full framework diagnostics at the original
			failure site.
		</p>
		<Link to="/errors" class="errors-back">← Browse all error codes</Link>
	</article>
}
