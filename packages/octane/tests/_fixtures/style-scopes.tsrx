import { use } from 'octane';

// Lexically scoped <style> blocks (RFC tsrx-org/RFCs#1, amendment A1): the
// list a block sits in is its scope — a `@{}` body, a directive branch body,
// or the children list of an element or fragment. A block styles the items
// beside it and everything below them; it never styles the element that
// contains it. Every block of one list shares one position-derived hash and
// one injection; elements carry the hashes of every enclosing scope, outer
// first.

// One scope, two blocks: both rules share the scope hash and one injection,
// wherever the blocks sit in the fragment's children list.
export function MultiBlock() @{
	<>
		<style>
			.mb-root {
				color: rgb(10, 20, 30);
			}
		</style>
		<section id="mb-root" class="mb-root">
			<b class="mb-title">{'title'}</b>
		</section>
		<style>
			.mb-title {
				font-weight: 700;
			}
		</style>
	</>
}

// A nested `@{}` is scope B inside scope A: A reaches everything, B only its
// own body.
export function NestedBlocks() @{
	<>
		<style>
			.nb-outer {
				color: rgb(1, 2, 3);
			}
			.nb-inner {
				letter-spacing: 2px;
			}
		</style>
		<div id="nb-outer" class="nb-outer">
			<p id="nb-p" class="nb-p">{'outer'}</p>
			@{
				<>
					<style>
						.nb-inner {
							font-weight: 700;
						}
					</style>
					<span id="nb-inner" class="nb-inner">{'inner'}</span>
				</>
			}
		</div>
	</>
}

// `{style(expr)}` resolves to the full scope chain plus the value.
export function StyleCallChain(props: { cls: string }) @{
	<>
		<style>
			.sc-row {
				color: rgb(4, 5, 6);
			}
		</style>
		<div id="sc-host" class="sc-host">@{
			<>
				<style>
					.sc-cell {
						font-weight: 700;
					}
				</style>
				<p id="sc-static" class={style('sc-row')}>{'static'}</p>
				<p id="sc-dynamic" class={style(props.cls)}>{'dynamic'}</p>
			</>
		}</div>
	</>
}

// Every directive branch renders a fragment holding a block: each of those
// children lists is a scope of its own whose CSS ships whether or not the
// branch is active.
export function ControlFlow(props: {
	ready: boolean;
	maybe: boolean;
	items: string[];
	kind: number;
}) @{
	<>
		<style>
			.cf-root {
				color: rgb(9, 9, 9);
			}
		</style>
		<div id="cf-root" class="cf-root">
			@if (props.ready) {
				<>
					<style>
						.cf-yes {
							color: rgb(1, 1, 1);
						}
						b {
							font-weight: 700;
						}
					</style>
					<p id="cf-yes" class="cf-yes">
						<b id="cf-yes-text">{'yes'}</b>
					</p>
				</>
			} @else if (props.maybe) {
				<>
					<style>
						.cf-maybe {
							color: rgb(2, 2, 2);
						}
					</style>
					<p id="cf-maybe" class="cf-maybe">{'maybe'}</p>
				</>
			} @else {
				<>
					<style>
						.cf-no {
							color: rgb(3, 3, 3);
						}
					</style>
					<p id="cf-no" class="cf-no">{'no'}</p>
				</>
			}
			<ul id="cf-list">
				@for (const item of props.items) {
					<>
						<style>
							.cf-item {
								color: rgb(4, 4, 4);
							}
							li {
								letter-spacing: 1px;
							}
						</style>
						<li class="cf-item">{item}</li>
					</>
				} @empty {
					<>
						<style>
							.cf-empty {
								color: rgb(5, 5, 5);
							}
						</style>
						<li id="cf-empty" class="cf-empty">{'none'}</li>
					</>
				}
			</ul>
			@switch (props.kind) {
				@case 1: {
					<>
						<style>
							.cf-one {
								color: rgb(6, 6, 6);
							}
						</style>
						<b id="cf-one" class="cf-one">{'one'}</b>
					</>
				}
				@default: {
					<>
						<style>
							.cf-other {
								color: rgb(7, 7, 7);
							}
						</style>
						<i id="cf-other" class="cf-other">{'other'}</i>
					</>
				}
			}
			@try {
				<>
					<style>
						.cf-ok {
							color: rgb(8, 8, 8);
						}
					</style>
					<em id="cf-ok" class="cf-ok">{'ok'}</em>
				</>
			} @catch (error) {
				<>
					<style>
						.cf-err {
							color: rgb(10, 10, 10);
						}
					</style>
					<s id="cf-err" class="cf-err">{'err'}</s>
				</>
			}
		</div>
	</>
}

// Two sibling `@{}` scopes: neither reaches the other.
export function SiblingScopes() @{
	<>
		@{
			<>
				<style>
					.sib-a {
						color: rgb(11, 0, 0);
					}
				</style>
				<p id="sib-a" class="sib-a">{'a'}</p>
			</>
		}
		@{
			<>
				<style>
					.sib-b {
						color: rgb(0, 11, 0);
					}
				</style>
				<p id="sib-b" class="sib-b">{'b'}</p>
			</>
		}
	</>
}

// A React Float style resource (`href` + `precedence`) next to a scoped block:
// the resource hoists to the head by identity, the block scopes as usual.
export function FloatSibling() @{
	<>
		<style href="scope-sibling-tokens" precedence="default">
			.fs-tokens {
				color: teal;
			}
		</style>
		<style>
			.fs-scoped {
				color: rgb(12, 13, 14);
			}
		</style>
		<div id="fs-host" class="fs-scoped fs-tokens">{'float sibling'}</div>
	</>
}

// Streaming: the same scoped child revealed by two boundaries carries two
// scope hashes, each shipped once across waves.
function StreamedLeaf(props: { promise: Promise<string> }) @{
	const value = use(props.promise);
	<>
		<style>
			.leaf {
				color: rgb(2, 2, 2);
			}
		</style>
		<section class="leaf">
			<b class="leaf-text">{value as string}</b>
			@{
				<>
					<style>
						.leaf-deep {
							font-weight: 700;
						}
					</style>
					<i class="leaf-deep">{'deep'}</i>
				</>
			}
		</section>
	</>
}

export function StreamedScopes(props: { a: Promise<string>; b: Promise<string> }) @{
	<>
		<style>
			.shell {
				color: rgb(1, 1, 1);
			}
		</style>
		<div id="streamed-scopes" class="shell">
			@try {
				<StreamedLeaf promise={props.a} />
			} @pending {
				<p class="pending-a">{'a'}</p>
			}
			@try {
				<StreamedLeaf promise={props.b} />
			} @pending {
				<p class="pending-b">{'b'}</p>
			}
		</div>
	</>
}
