import { describe, expect, it, vi } from 'vitest';
import { compile } from 'octane/compiler';
import * as ServerRuntime from 'octane/server';
import { prerender } from 'octane/static';

function evalServer(source: string, filename: string): Record<string, any> {
	let code = compile(source, filename, { mode: 'server' }).code;
	code = code.replace(
		/import\s*\{([^}]*)\}\s*from\s*['"]octane(?:\/server)?['"];?/g,
		(_match, names: string) => `const {${names.replace(/ as /g, ': ')}} = __rt;`,
	);
	code = code.replace(/export const (\w+) =/g, 'const $1 = __exports.$1 =');
	code = code.replace(/export function (\w+)/g, '__exports.$1 = function $1');
	return new Function('__rt', '__exports', code + '\nreturn __exports;')(ServerRuntime, {});
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason: unknown) => void;
	const promise = new Promise<T>((done, fail) => {
		resolve = done;
		reject = fail;
	});
	return { promise, resolve, reject };
}

function collector() {
	const chunks: string[] = [];
	let finish!: () => void;
	const ended = new Promise<void>((resolve) => {
		finish = resolve;
	});
	return {
		chunks,
		ended,
		destination: {
			write: (chunk: string) => chunks.push(chunk),
			end: () => finish(),
		},
	};
}

function boundaryIds(html: string): string[] {
	return [...html.matchAll(/data-oct-b="([^"]+)"/g)].map((match) => match[1]);
}

function activateChunks(chunks: string[]): HTMLElement {
	const container = document.createElement('div');
	document.body.appendChild(container);
	container.innerHTML = chunks.join('');
	for (const script of Array.from(container.querySelectorAll('script'))) {
		if (script.getAttribute('type') === 'application/json') continue;
		// eslint-disable-next-line no-eval
		(0, eval)(script.textContent || '');
		script.remove();
	}
	return container;
}

const mod = evalServer(
	`
    import { use, useId, useState } from 'octane';

    export function DiscardedBoundary(props) @{
      const [settled, setSettled] = useState(false);
      if (!settled) setSettled(true);
      <main id="discarded-boundary-probe">
        @if (!settled) {
          @try {
            const value = use(props.promise);
            <span class="discarded-content">{value as string}</span>
          } @pending {
            <span class="discarded-fallback">{'discarded'}</span>
          }
        } @else {
          <span class="settled-content">{'settled'}</span>
        }
      </main>
    }

    function AsyncId(props) @{
      <section>
        @try {
          const value = use(props.promise);
          const id = useId();
          props.observe(props.label, id);
          <span class={props.label} data-boundary-id={id}>{value as string}</span>
        } @pending {
          <i>{'waiting'}</i>
        }
      </section>
    }
    function ShellId(props) @{
      const id = useId();
      props.observe('shell', id);
      <footer data-shell-id={id}>{'shell'}</footer>
    }
    export function StaggeredIds(props) @{
      <main>
        <AsyncId label="alpha" promise={props.alpha} observe={props.observe} />
        <AsyncId label="beta" promise={props.beta} observe={props.observe} />
        <ShellId observe={props.observe} />
      </main>
    }

		export function PendingInsideFallback(props) @{
			@try {
				const value = use(props.outer);
				<main class="outer-ready">{value as string}</main>
			} @pending {
				@try {
					const value = use(props.inner);
					<span class="fallback-inner-ready">{value as string}</span>
				} @pending {
					<i class="fallback-inner-pending">{'inner pending'}</i>
				}
			}
		}

		function OuterValue(props) @{
			const value = use(props.promise);
			<main>{value as string}</main>
		}
		export function PendingBeforeOuterCatch(props) @{
			@try {
				<>
					@try {
						const value = use(props.inner);
						<span class="content-inner-ready">{value as string}</span>
					} @pending {
						<i class="content-inner-pending">{'inner pending'}</i>
					}
					<OuterValue promise={props.outer} />
				</>
			} @pending {
				<i class="outer-pending">{'outer pending'}</i>
			} @catch (error) {
				<strong class="outer-catch">{error.message as string}</strong>
			}
		}

		function SharedValue(props) @{
			const value = use(props.promise);
			<span data-label={props.label}>{props.label + ':' + value as string}</span>
		}
		function SharedBoundary(props) @{
			@try {
				const value = use(props.promise);
				<span data-label={props.label}>{props.label + ':' + value as string}</span>
			} @pending {
				<i data-waiting={props.label}>{props.label + ':waiting' as string}</i>
			}
		}
		export function SharedAcrossOuterArms(props) @{
			@try {
				const outer = use(props.outer);
				<section class="outer-content">
					<b>{outer as string}</b>
					<SharedBoundary label="content" promise={props.content} />
				</section>
			} @pending {
				<section class="outer-pending">
					<SharedBoundary label="fallback" promise={props.fallback} />
				</section>
			}
		}

		export function RenderPhaseIf(props) @{
			const [flipped, setFlipped] = useState(false);
			if (!flipped) setFlipped(true);
			<main>
				@if (!flipped) {
					<SharedValue label="a" promise={props.a} />
				} @else {
					<SharedValue label="b" promise={props.b} />
				}
			</main>
		}

		export function RenderPhaseSwitch(props) @{
			const [flipped, setFlipped] = useState(false);
			if (!flipped) setFlipped(true);
			<main>
				@switch (flipped) {
					@case false: {
						<SharedValue label="a" promise={props.a} />
					}
					@default: {
						<SharedValue label="b" promise={props.b} />
					}
				}
			</main>
		}

		export function RenderPhaseForEmpty(props) @{
			const [items, setItems] = useState([]);
			if (items.length === 0) setItems([{ id: 'b', promise: props.b }]);
			<main>
				@for (const item of items; key item.id) {
					<SharedValue label={item.id} promise={item.promise} />
				} @empty {
					<SharedValue label="a" promise={props.a} />
				}
			</main>
		}

		export function SingleKeySwitch(props) @{
			const [flipped, setFlipped] = useState(false);
			if (!flipped) setFlipped(true);
			const child = flipped
				? <SharedValue key="b" label="b" promise={props.b} />
				: <SharedValue key="a" label="a" promise={props.a} />;
			<main>{child}</main>
		}

		function WrapperA(props) @{
			<SharedValue label="a" promise={props.promise} />
		}
		function WrapperB(props) @{
			<SharedValue label="b" promise={props.promise} />
		}
		export function DynamicTypeSwitch(props) @{
			const [flipped, setFlipped] = useState(false);
			if (!flipped) setFlipped(true);
			const child = flipped
				? <WrapperB promise={props.b} />
				: <WrapperA promise={props.a} />;
			<main>{child}</main>
		}

		export function HostTypeSwitch(props) @{
			const [flipped, setFlipped] = useState(false);
			if (!flipped) setFlipped(true);
			const child = flipped
				? <section><SharedValue label="b" promise={props.b} /></section>
				: <div><SharedValue label="a" promise={props.a} /></div>;
			<main>{child}</main>
		}

		export function KeyedArraySwitch(props) @{
			const [flipped, setFlipped] = useState(false);
			if (!flipped) setFlipped(true);
			const rows = flipped
				? [
					<SharedValue key="b" label="b" promise={props.b} />,
					<SharedValue key="a" label="a" promise={props.a} />,
				]
				: [
					<SharedValue key="a" label="a" promise={props.a} />,
					<SharedValue key="b" label="b" promise={props.b} />,
				];
			<main>{rows}</main>
		}

		export function LateOuterCatch(props) @{
			@try {
				@try {
					const value = use(props.inner);
					<span class="late-ready">{value as string}</span>
				} @pending {
					<i class="late-pending">{'waiting'}</i>
				}
			} @catch (error) {
				<strong class="late-catch">{error.message as string}</strong>
			}
		}
  `,
	'ssr-stream-state-regressions.tsrx',
);

describe('SSR stream state regressions', () => {
	it('does not retain a boundary registered by a discarded render-phase pass', async () => {
		const data = deferred<string>();
		const output = collector();
		ServerRuntime.renderToPipeableStream(mod.DiscardedBoundary, {
			promise: data.promise,
		}).pipe(output.destination);

		const shell = output.chunks.join('');
		expect(shell).toContain('class="settled-content"');
		expect(shell).not.toContain('discarded-fallback');
		expect(boundaryIds(shell)).toEqual([]);
		expect(shell).not.toContain('$OCTRC=');

		data.resolve('too late');
		await output.ended;
		expect(output.chunks.join('')).toBe(shell);
	});

	it('keeps staggered sibling boundary IDs unique and stable beside a later shell ID', async () => {
		const alpha = deferred<string>();
		const beta = deferred<string>();
		const output = collector();
		const seen = new Map<string, string[]>();
		const observe = (label: string, id: string) => {
			const values = seen.get(label) ?? [];
			values.push(id);
			seen.set(label, values);
		};
		ServerRuntime.renderToPipeableStream(
			mod.StaggeredIds,
			{ alpha: alpha.promise, beta: beta.promise, observe },
			{ identifierPrefix: 'page-' },
		).pipe(output.destination);

		const shell = output.chunks[0];
		const [alphaBoundary, betaBoundary] = boundaryIds(shell);
		expect(alphaBoundary).toBeTruthy();
		expect(betaBoundary).toBeTruthy();
		expect(alphaBoundary).not.toBe(betaBoundary);
		expect(shell).toContain('data-shell-id=":page-in-0:"');

		beta.resolve('beta-ready');
		await vi.waitFor(() => {
			expect(output.chunks.some((chunk) => chunk.includes('beta-ready'))).toBe(true);
		});
		const betaChunk = output.chunks.find((chunk) => chunk.includes('beta-ready'))!;
		expect(betaChunk).toContain('data-oct-s="' + betaBoundary + '"');
		expect(betaChunk).toContain('data-boundary-id=":page-b' + betaBoundary + '-in-0:"');

		alpha.resolve('alpha-ready');
		await output.ended;
		const alphaChunk = output.chunks.find((chunk) => chunk.includes('alpha-ready'))!;
		expect(alphaChunk).toContain('data-oct-s="' + alphaBoundary + '"');
		expect(alphaChunk).toContain('data-boundary-id=":page-b' + alphaBoundary + '-in-0:"');

		for (const values of seen.values()) expect(new Set(values).size).toBe(1);
		const stableIds = ['alpha', 'beta', 'shell'].map((label) => seen.get(label)![0]);
		expect(new Set(stableIds).size).toBe(3);
		expect(seen.get('shell')![0]).toBe(':page-in-0:');
	});

	it('retires unresolved boundaries owned only by a removed fallback', async () => {
		const outer = deferred<string>();
		const inner = deferred<string>();
		const output = collector();
		const onError = vi.fn();
		ServerRuntime.renderToPipeableStream(
			mod.PendingInsideFallback,
			{ outer: outer.promise, inner: inner.promise },
			{ timeoutMs: 80, onError },
		).pipe(output.destination);
		const shell = document.createElement('div');
		shell.innerHTML = output.chunks[0];
		expect(shell.querySelectorAll('template[data-oct-b]')).toHaveLength(2);

		outer.resolve('READY');
		await output.ended;
		const html = output.chunks.join('');
		expect(html).toContain('class="outer-ready"');
		expect(html).not.toContain('$OCTRX(');
		expect(onError).not.toHaveBeenCalled();
	});

	it('retires unresolved content descendants omitted by an outer catch segment', async () => {
		const outer = deferred<string>();
		const inner = deferred<string>();
		const output = collector();
		const onError = vi.fn();
		ServerRuntime.renderToPipeableStream(
			mod.PendingBeforeOuterCatch,
			{ outer: outer.promise, inner: inner.promise },
			{ timeoutMs: 80, onError },
		).pipe(output.destination);

		outer.reject(new Error('outer failed'));
		await output.ended;
		const html = output.chunks.join('');
		expect(html).toContain('class="outer-catch"');
		expect(html).toContain('outer failed');
		expect(html).not.toContain('$OCTRX(');
		expect(onError).not.toHaveBeenCalled();
	});

	it('keeps buffered content and pending-arm child caches disjoint', async () => {
		const outer = deferred<string>();
		const fallback = deferred<string>();
		const content = deferred<string>();
		let finished = false;
		const rendering = prerender(mod.SharedAcrossOuterArms, {
			outer: outer.promise,
			fallback: fallback.promise,
			content: content.promise,
		}).then((result) => {
			finished = true;
			return result;
		});

		fallback.resolve('FALLBACK');
		outer.resolve('OUTER');
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(finished).toBe(false);

		content.resolve('CONTENT');
		const result = await rendering;
		expect(result.html).toContain('content:CONTENT');
		expect(result.html).not.toContain('content:FALLBACK');
	});

	it('never reintroduces an already-flushed fallback child boundary id', async () => {
		const outer = deferred<string>();
		const inner = deferred<string>();
		const output = collector();
		ServerRuntime.renderToPipeableStream(mod.SharedAcrossOuterArms, {
			outer: outer.promise,
			fallback: inner.promise,
			content: inner.promise,
		}).pipe(output.destination);

		const [outerId, fallbackChildId] = boundaryIds(output.chunks[0]);
		inner.resolve('INNER');
		await vi.waitFor(() => {
			expect(
				output.chunks.some(
					(chunk) =>
						chunk.includes('data-oct-s="' + fallbackChildId + '"') && chunk.includes('INNER'),
				),
			).toBe(true);
		});

		outer.resolve('OUTER');
		await output.ended;
		const outerChunk = output.chunks.find((chunk) =>
			chunk.includes('data-oct-s="' + outerId + '"'),
		)!;
		expect(outerChunk).not.toContain('data-oct-b="' + fallbackChildId + '"');
		const introduced = boundaryIds(outerChunk);
		for (const id of introduced) {
			expect(output.chunks.join('')).toContain('data-oct-s="' + id + '"');
		}

		const container = activateChunks(output.chunks);
		expect(container.querySelector('[data-label="content"]')!.textContent).toBe('content:INNER');
		expect(container.querySelector('[data-label="fallback"]')).toBeNull();
		container.remove();
		delete (window as any).$OCTS;
		delete (window as any).$OCTRC;
		delete (window as any).$OCTRX;
	});

	it.each([
		['@if arm', mod.RenderPhaseIf],
		['@switch arm', mod.RenderPhaseSwitch],
		['@for item/empty arm', mod.RenderPhaseForEmpty],
		['single descriptor key', mod.SingleKeySwitch],
		['dynamic component type', mod.DynamicTypeSwitch],
		['host descriptor type', mod.HostTypeSwitch],
	] as const)(
		'isolates async identity when a render-phase retry switches %s',
		async (_label, App) => {
			const a = deferred<string>();
			const b = deferred<string>();
			let finished = false;
			const rendering = prerender(App, { a: a.promise, b: b.promise }).then((result) => {
				finished = true;
				return result;
			});

			a.resolve('A');
			await new Promise((resolve) => setTimeout(resolve, 20));
			expect(finished).toBe(false);
			b.resolve('B');
			const result = await rendering;
			expect(result.html).toContain('b:B');
			expect(result.html).not.toContain('b:A');
		},
	);

	it('preserves keyed descriptor values when a render-phase retry reverses the array', async () => {
		const a = deferred<string>();
		const b = deferred<string>();
		const rendering = prerender(mod.KeyedArraySwitch, { a: a.promise, b: b.promise });
		a.resolve('A');
		b.resolve('B');
		const result = await rendering;
		const labels = [...result.html.matchAll(/data-label="([ab])"[^>]*>([ab]:[AB])/g)].map(
			(match) => [match[1], match[2]],
		);
		expect(labels).toEqual([
			['b', 'b:B'],
			['a', 'a:A'],
		]);
	});

	it('fails a late ancestor-catch stream promptly instead of spinning 50 passes', async () => {
		const inner = deferred<string>();
		const output = collector();
		const onError = vi.fn();
		ServerRuntime.renderToPipeableStream(
			mod.LateOuterCatch,
			{ inner: inner.promise },
			{ onError, timeoutMs: 100 },
		).pipe(output.destination);
		const [innerId] = boundaryIds(output.chunks[0]);

		inner.reject(new Error('inner failed'));
		await output.ended;
		expect(onError).toHaveBeenCalledTimes(1);
		expect(String(onError.mock.calls[0][0])).toContain('no longer has resumable work');
		expect(String(onError.mock.calls[0][0])).not.toContain('50 consecutive');
		expect(output.chunks.join('')).toContain('$OCTRX(' + JSON.stringify(innerId) + ')');
	});
});
