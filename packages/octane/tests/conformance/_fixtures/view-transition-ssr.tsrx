import { ViewTransition, use } from 'octane';

// Fixtures for conformance/view-transition-ssr.test.ts — ports of
// facebook/react ReactDOMFizzViewTransition-test.js (the test file carries
// the per-`it` citations). Octane's @try/@pending is the directive form of
// the same Suspense tryBlock React drives with <Suspense>.

// :100 — the four annotation shapes (no Suspense involved).
export function AnnotationsApp(props) @{
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
export function ArmsContent(props) @{
	const text = use(props.promise) as string;
	<div>
		<ViewTransition>
			<span>{text}</span>
		</ViewTransition>
	</div>
}

// :148 — enter/exit annotations for boundaries inside Suspense: the fallback
// root exits on reveal; the content root enters when streamed in.
export function ArmsApp(props) @{
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
export function DualApp(props) @{
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
export function OutsideApp(props) @{
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
