import { ViewTransition, use, type ViewTransitionProps } from 'octane';

interface StreamProps {
	promise: Promise<string>;
}
interface RelayProps extends StreamProps {
	relay?: string;
	handler?: () => void;
}
interface StreamTextProps extends StreamProps {
	id: string;
	styled?: boolean;
	style?: string;
	name?: string;
}

// Fixtures for conformance/view-transition-ssr.test.ts — ports of
// facebook/react ReactDOMFizzViewTransition-test.js (the test file carries
// the per-`it` citations). Octane's @try/@pending is the directive form of
// the same Suspense tryBlock React drives with <Suspense>.

// :100 — the four annotation shapes (no Suspense involved).
export function AnnotationsApp(props: {}) @{
	<div>
		<ViewTransition>
			<div />
		</ViewTransition>
		<ViewTransition name="foo" update="bar">
			<div />
		</ViewTransition>
		<ViewTransition update={{ something: 'a', default: 'baz' }}>
			<div />
		</ViewTransition>
		<ViewTransition name="outer" update="bar" share="pair">
			<ViewTransition>
				<div />
			</ViewTransition>
		</ViewTransition>
	</div>
}

// The resolved-content shape shared by the streaming fixtures (React's
// resolve(<div><ViewTransition><span>Content</span></ViewTransition></div>)).
export function ArmsContent(props: StreamProps) @{
	const text = use(props.promise) as string;
	<div>
		<ViewTransition>
			<span>{text}</span>
		</ViewTransition>
	</div>
}

// :148 — enter/exit annotations for boundaries inside Suspense: the fallback
// root exits on reveal; the content root enters when streamed in.
export function ArmsApp(props: StreamProps) @{
	<div>
		<>
			@try {
				<ViewTransition>
					<ArmsContent promise={props.promise} />
				</ViewTransition>
			} @pending {
				<ViewTransition>
					<div>
						<ViewTransition>
							<span>{'Loading'}</span>
						</ViewTransition>
					</div>
				</ViewTransition>
			}
		</>
	</div>
}

// :213 — both enter AND exit on the same node: the fallback's boundary is
// itself Suspense CONTENT (of an inner, non-suspending @try) sitting inside
// the outer FALLBACK arm.
export function DualApp(props: StreamProps) @{
	<div>
		<>
			@try {
				<ViewTransition enter="hi">
					<ArmsContent promise={props.promise} />
				</ViewTransition>
			} @pending {
				<>
					@try {
						<ViewTransition enter="hello" exit="goodbye">
							<div>
								<ViewTransition>
									<span>{'Loading'}</span>
								</ViewTransition>
							</div>
						</ViewTransition>
					} @pending {
						<></>
					}
				</>
			}
		</>
	</div>
}

// :280 — a boundary OUTSIDE (wrapping) the Suspense: it pairs the fallback
// and content across the swap, so both captures carry the same auto
// vt-name + vt-share.
export function OutsideApp(props: StreamProps) @{
	<div>
		<ViewTransition>
			<>
				@try {
					<ArmsContent promise={props.promise} />
				} @pending {
					<div>
						<ViewTransition>
							<span>{'Loading'}</span>
						</ViewTransition>
					</div>
				}
			</>
		</ViewTransition>
	</div>
}

export function RelayContent(props: RelayProps) @{
	const text = use(props.promise) as string;
	<div id="content">
		<ViewTransition parentEnter={props.relay} onParentEnter={props.handler}>
			<div id="relay">
				<ViewTransition parentEnter="deep-enter">
					<span id="deep">{text}</span>
				</ViewTransition>
			</div>
		</ViewTransition>
	</div>
}

export function RelayApp(props: RelayProps) @{
	<div>
		<>
			@try {
				<ViewTransition enter="page-enter">
					<RelayContent promise={props.promise} relay={props.relay} handler={props.handler} />
				</ViewTransition>
			} @pending {
				<ViewTransition exit="page-exit">
					<div id="fallback">
						<ViewTransition parentExit={props.relay} onParentExit={props.handler}>
							<div id="fallback-relay">
								<ViewTransition parentExit="deep-exit">
									<span id="fallback-deep">{'Loading'}</span>
								</ViewTransition>
							</div>
						</ViewTransition>
					</div>
				</ViewTransition>
			}
		</>
	</div>
}

export function MultipleHostsApp(props: {}) @{
	<div>
		<ViewTransition name="siblings" update="resize">
			<>
				<div id="first">{'One'}</div>
				<div id="second">{'Two'}</div>
			</>
		</ViewTransition>
		<ViewTransition name="auto">
			<span id="automatic">{'Auto'}</span>
		</ViewTransition>
	</div>
}

export function OutsideClassesApp(props: StreamProps) @{
	<div>
		<ViewTransition name="outer-classes" update="resize" share="shared">
			<>
				@try {
					<ArmsContent promise={props.promise} />
				} @pending {
					<div>{'Loading'}</div>
				}
			</>
		</ViewTransition>
	</div>
}

export function StreamTextContent(props: StreamTextProps) @{
	const text = use(props.promise) as string;
	<div
		id={props.id}
		style={props.styled
			? { viewTransitionName: 'authored', viewTransitionClass: 'authored-class', color: 'red' }
			: undefined}
	>{text}</div>
}

export function StreamTextApp(props: StreamTextProps) @{
	<section>
		<>
			@try {
				<ViewTransition enter="stream-enter">
					<StreamTextContent promise={props.promise} id={props.id} styled={props.styled} />
				</ViewTransition>
			} @pending {
				<ViewTransition exit="stream-exit">
					<p>{'Loading ' + props.id}</p>
				</ViewTransition>
			}
		</>
	</section>
}

export function StreamResourceContent(props: StreamProps) @{
	const text = use(props.promise) as string;
	<div>
		<span>{text}</span>
		<img id="stream-eager" src="/view-transition-test-eager.png" />
		<img id="stream-lazy" src="/view-transition-test-lazy.png" loading="lazy" />
	</div>
}

export function StreamResourceApp(props: StreamProps) @{
	<section>
		<>
			@try {
				<ViewTransition>
					<StreamResourceContent promise={props.promise} />
				</ViewTransition>
			} @pending {
				<ViewTransition>
					<p>{'Loading'}</p>
				</ViewTransition>
			}
		</>
	</section>
}

export function SharedWaveApp(props: StreamProps) @{
	<section>
		<>
			@try {
				<StreamTextContent promise={props.promise} id="wave-first" />
			} @pending {
				<ViewTransition name="wave-hero" share="old-share">
					<div id="wave-old">{'Loading first'}</div>
				</ViewTransition>
			}
			@try {
				<ViewTransition name="wave-hero" share="new-share">
					<StreamTextContent promise={props.promise} id="wave-new" />
				</ViewTransition>
			} @pending {
				<p>{'Loading second'}</p>
			}
		</>
	</section>
}

function LateViewContent(props: StreamProps) @{
	const text = use(props.promise) as string;
	<ViewTransition enter="late-enter">
		<div id="late-content">{text}</div>
	</ViewTransition>
}

export function LateViewApp(props: StreamProps) @{
	<section>
		@try {
			<LateViewContent promise={props.promise} />
		} @pending {
			<p>{'Loading'}</p>
		}
	</section>
}

export function ScopedStreamApp(props: StreamTextProps) @{
	<ViewTransition scope="element" name={props.name} update="scope-update">
		<section id={props.id} style={props.style}>
			<SharedWaveApp promise={props.promise} />
		</section>
	</ViewTransition>
}

export function NestedScopedStreamApp(props: StreamProps) @{
	<ViewTransition scope="element" update="outer-update">
		<section id="outer-scope">
			<StreamTextApp promise={props.promise} id="outer-content" />
			<ScopedStreamApp promise={props.promise} id="inner-scope" />
		</section>
	</ViewTransition>
}

export function ReplacedScopedStreamApp(props: StreamProps) @{
	<ViewTransition scope="element">
		@try {
			<StreamTextContent promise={props.promise} id="replaced-scope" />
		} @pending {
			<p id="old-scope">{'Loading'}</p>
		}
	</ViewTransition>
}

export function MultipleScopedStreamApp(props: StreamProps) @{
	<ViewTransition scope="element">
		<>
			<section>
				<StreamTextApp promise={props.promise} id="multiple-content" />
			</section>
			<aside>{'Sibling'}</aside>
		</>
	</ViewTransition>
}

export function TextScopedStreamApp(props: StreamProps) @{
	<ViewTransition scope="element">
		<>
			{'Outside'}
			<section>
				<StreamTextApp promise={props.promise} id="text-content" />
			</section>
		</>
	</ViewTransition>
}

export function ResourceScopedStreamApp(props: StreamProps) @{
	<ViewTransition scope="element">
		<>
			<section>
				<StreamTextApp promise={props.promise} id="resource-content" />
			</section>
			<script type="application/json">
				{
					('{"ready":true}');
				}
			</script>
		</>
	</ViewTransition>
}

export function ScopedTwoWaveApp(props: { first: Promise<string>; second: Promise<string> }) @{
	<ViewTransition scope="element">
		<section id="queued-scope">
			<StreamTextApp promise={props.first} id="first-wave" />
			<StreamTextApp promise={props.second} id="second-wave" />
		</section>
	</ViewTransition>
}

export function ScopedStylesApp(props: {
	scope?: 'element';
	title?: string;
	style?: string;
	text: string;
}) @{
	<ViewTransition scope={props.scope}>
		<section
			id="scope-styles"
			title={props.title}
			style={props.style}
		>{props.text as string}</section>
	</ViewTransition>
}

export function SameHostScopesApp(props: {
	outer?: 'element';
	inner?: 'element';
	text: string;
	style: string;
	onUpdate?: () => void;
}) @{
	<ViewTransition scope={props.outer}>
		<ViewTransition scope={props.inner} onUpdate={props.onUpdate}>
			<section id="same-host-scope" style={props.style}>{props.text}</section>
		</ViewTransition>
	</ViewTransition>
}

export function StaticScopeStyleApp() @{
	<ViewTransition scope="element">
		<section
			id="static-scope-style"
			style="color:red;view-transition-scope:none!important"
		>{'Static'}</section>
	</ViewTransition>
}

export function ScopedRefNameApp(props: { name?: string; reference: ViewTransitionProps['ref'] }) @{
	<ViewTransition scope="element" name={props.name} ref={props.reference}>
		<section id="scope-ref-name" style="view-transition-name:hero">{'Content'}</section>
	</ViewTransition>
}

// An invalid element scope (two hosts) is stamped `vt-scope="none"` by the
// server. Hydration must leave the outer document boundary capturing those
// hosts exactly as a client-only mount does.
export function InvalidScopeApp(props: { text: string; onUpdate: () => void }) @{
	<ViewTransition onUpdate={props.onUpdate}>
		<ViewTransition scope="element">
			<>
				<div id="invalid-first">{props.text as string}</div>
				<div id="invalid-second">{'Two'}</div>
			</>
		</ViewTransition>
	</ViewTransition>
}
