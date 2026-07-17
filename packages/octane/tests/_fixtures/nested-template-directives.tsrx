function StoryRow(props) @{
	const label = props.read(props.story);
	<article class="story" data-story-id={props.story.id}>
		{label as string}
	</article>
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
					<p class="story-error" data-story-id={story.id}>
						{'Unavailable: ' + error.message}
					</p>
				};
			} @empty {
				<p id="empty-feed">No stories</p>
			}
		} @else {
			<p id="hidden-feed">Stories hidden</p>
		}
	</section>
}
