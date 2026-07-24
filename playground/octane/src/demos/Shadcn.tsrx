import { useState, createElement } from 'octane';
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from '@/components/ui/accordion.tsrx';
import { Badge } from '@/components/ui/badge.tsrx';
import { Button } from '@/components/ui/button.tsrx';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card.tsrx';
import { Checkbox } from '@/components/ui/checkbox.tsrx';
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from '@/components/ui/dialog.tsrx';
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu.tsrx';
import { Label } from '@/components/ui/label.tsrx';
import { Switch } from '@/components/ui/switch.tsrx';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs.tsrx';

// shadcn registry-mode demo: these components were installed AS SOURCE by the
// real shadcn CLI (`shadcn add @octane/…` against the generated registry) into
// src/components/ui — the app owns them. Styling comes from Tailwind v4 +
// the installed theme tokens + the vendored pinned style-nova sheet (scoped
// under .style-nova on this demo's root).
export function ShadcnDemo() @{
	const [notifications, setNotifications] = useState(true);
	const [statusBar, setStatusBar] = useState(false);
	const [agreed, setAgreed] = useState(false);
	const [lastAction, setLastAction] = useState('none');

	<div>
		<h2 class="demo-title">{'shadcn/ui on octane'}</h2>
		<p
			class="demo-blurb"
		>{'@octanejs/shadcn (radix base @ 4baadbc6): buttons, dialog portal, dropdown with controlled checkbox item, tabs, and controlled switches.'}</p>

		<div class="row" style="gap: 8px; flex-wrap: wrap;">
			<Button onClick={() => setLastAction('default button')}>{'Default'}</Button>
			<Button
				variant="secondary"
				size="sm"
				onClick={() => setLastAction('secondary sm')}
			>{'Secondary'}</Button>
			<Button
				variant="destructive"
				onClick={() => setLastAction('destructive')}
			>{'Destructive'}</Button>
			<Button variant="outline" disabled>{'Disabled'}</Button>
			<Badge variant="secondary">{'Beta'}</Badge>
			<Badge variant="destructive">{'Breaking'}</Badge>
		</div>
		<p class="demo-blurb">{'last action: ' + lastAction}</p>

		<div class="row" style="align-items: flex-start; gap: 16px; flex-wrap: wrap;">
			<Card style="min-width: 260px;">
				<CardHeader>
					<CardTitle>{'Dialog + dropdown'}</CardTitle>
					<CardDescription>{'Both portal into document.body.'}</CardDescription>
				</CardHeader>
				<CardContent>
					<div class="row" style="gap: 8px;">
						<Dialog>
							{createElement(
								DialogTrigger,
								{ asChild: true },
								createElement(Button, { variant: 'outline' }, 'Open dialog'),
							)}
							<DialogContent>
								<DialogHeader>
									<DialogTitle>{'Hello from a portal'}</DialogTitle>
									<DialogDescription>{'Radix Dialog through @octanejs/radix, wrapped by shadcn.'}</DialogDescription>
								</DialogHeader>
								<DialogFooter>{createElement(
									DialogClose,
									{ asChild: true },
									createElement(Button, { variant: 'secondary' }, 'Close'),
								)}</DialogFooter>
							</DialogContent>
						</Dialog>

						<DropdownMenu>
							{createElement(
								DropdownMenuTrigger,
								{ asChild: true },
								createElement(Button, { variant: 'outline' }, 'Menu'),
							)}
							<DropdownMenuContent>
								<DropdownMenuLabel>{'Appearance'}</DropdownMenuLabel>
								<DropdownMenuSeparator />
								<DropdownMenuCheckboxItem
									checked={statusBar}
									onCheckedChange={(value: boolean) => setStatusBar(value)}
								>{'Status bar'}</DropdownMenuCheckboxItem>
								<DropdownMenuItem
									onSelect={() => setLastAction('menu: profile')}
								>{'Profile'}</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					</div>
					<p class="demo-blurb">{'status bar: ' + (statusBar ? 'on' : 'off')}</p>
				</CardContent>
			</Card>

			<Card style="min-width: 260px;">
				<CardHeader>
					<CardTitle>{'Tabs + controls'}</CardTitle>
				</CardHeader>
				<CardContent>
					<Tabs defaultValue="account">
						<TabsList>
							<TabsTrigger value="account">{'Account'}</TabsTrigger>
							<TabsTrigger value="password">{'Password'}</TabsTrigger>
						</TabsList>
						<TabsContent value="account">{'Account settings live here.'}</TabsContent>
						<TabsContent value="password">{'Change your password here.'}</TabsContent>
					</Tabs>
					<div class="row" style="gap: 8px; align-items: center; margin-top: 8px;">
						<Switch
							id="notif"
							checked={notifications}
							onCheckedChange={(value: boolean) => setNotifications(value)}
						/>
						<Label htmlFor="notif">{'Notifications ' + (notifications ? 'on' : 'off')}</Label>
					</div>
					<div class="row" style="gap: 8px; align-items: center;">
						<Checkbox
							id="agree"
							checked={agreed}
							onCheckedChange={(value: boolean) => setAgreed(value === true)}
						/>
						<Label htmlFor="agree">{'Agree to terms: ' + (agreed ? 'yes' : 'no')}</Label>
					</div>
				</CardContent>
			</Card>
		</div>

		<Accordion type="single" collapsible>
			<AccordionItem value="a">
				<AccordionTrigger>{'Is it faithful to upstream?'}</AccordionTrigger>
				<AccordionContent>{'Class strings, data-slots, and behavior are byte-compared against the pinned shadcn sources.'}</AccordionContent>
			</AccordionItem>
			<AccordionItem value="b">
				<AccordionTrigger>{'Does it SSR?'}</AccordionTrigger>
				<AccordionContent>{'Portal-free components server-render; overlays are client-side.'}</AccordionContent>
			</AccordionItem>
		</Accordion>
	</div>
}
