import { HiddenText, LiveRegion, useAnnouncement } from '@octanejs/dnd-kit-accessibility';

/** Announcements flow from useAnnouncement into a live region beside its instructions. */
export function Announcer() @{
	const { announce, announcement } = useAnnouncement();
	<div>
		<button id="announce" onClick={() => announce('Picked up item 1.')}>
			announce
		</button>
		<button id="ignore" onClick={() => announce(undefined)}>
			ignore
		</button>
		<button id="clear" onClick={() => announce('')}>
			clear
		</button>
		<HiddenText id="instructions" value="Press space to pick up an item." />
		<LiveRegion id="assertive" announcement={announcement} />
		<LiveRegion id="polite" announcement={announcement} ariaLiveType="polite" />
	</div>
}
