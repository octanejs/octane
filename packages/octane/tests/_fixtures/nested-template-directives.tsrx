function StoryRow(props) @{
	const label = props.read(props.story);
	<article class="story" data-story-id={props.story.id}>{label as string}</article>
}

// Product-style feed composition: visibility owns the keyed collection and
// every item owns its own loading/error boundary.
export function NestedStoryFeed(props) @{
	<section id="story-feed">
		@if (props.visible) {
			@for (const story of props.stories; key story.id) {
				@try {
					<StoryRow story={story} read={props.read} />
				} @pending {
					<p class="story-pending" data-story-id={story.id}>Loading story</p>
				} @catch (error) {
					<p class="story-error" data-story-id={story.id}>{'Unavailable: ' + error.message}</p>
				}
			} @empty {
				<p id="empty-feed">No stories</p>
			}
		} @else {
			<p id="hidden-feed">Stories hidden</p>
		}
	</section>
}

interface SparseRow {
	id: string;
	label: string;
	selected: boolean;
}

// The item and empty arms read different parent locals. Within an item, the
// selected and plain arms read different subsets again, including a later
// captured value after a skipped sibling. Reordering must not swap those
// values between keyed survivors.
export function SparseCaptureFeed(props: {
	rows: SparseRow[];
	prefix: string;
	suffix: string;
}) @{
	const alpha = props.prefix;
	const zulu = props.suffix;
	<ul id="sparse-feed">
		@for (const row of props.rows; key row.id) {
			const alpha = 'plain: ';
			@if (row.selected) {
				<li data-row={row.id}>{row.label + zulu}</li>
			} @else {
				<li data-row={row.id}>{alpha + row.label}</li>
			}
		} @empty {
			<li id="sparse-empty">{'empty: ' + alpha}</li>
		}
	</ul>
}
