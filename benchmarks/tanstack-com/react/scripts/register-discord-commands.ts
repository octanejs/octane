/**
 * Register Discord slash commands with the Discord API.
 *
 * Run this script after adding new commands or modifying existing ones:
 *   pnpm tsx scripts/register-discord-commands.ts
 *
 * Required environment variables:
 *   DISCORD_APPLICATION_ID - Your Discord application ID
 *   DISCORD_BOT_TOKEN - Your Discord bot token
 */

const DISCORD_APPLICATION_ID = process.env.DISCORD_APPLICATION_ID;
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;

if (!DISCORD_APPLICATION_ID || !DISCORD_BOT_TOKEN) {
	console.error('Missing required environment variables:');
	if (!DISCORD_APPLICATION_ID) console.error('  - DISCORD_APPLICATION_ID');
	if (!DISCORD_BOT_TOKEN) console.error('  - DISCORD_BOT_TOKEN');
	process.exit(1);
}

const commands = [
	{
		name: 'tanstack',
		description: 'Check TanStack Bot status',
		type: 1, // CHAT_INPUT
	},
];

async function registerCommands() {
	const url = `https://discord.com/api/v10/applications/${DISCORD_APPLICATION_ID}/commands`;

	console.log('Registering commands with Discord API...');
	console.log(`Application ID: ${DISCORD_APPLICATION_ID}`);
	console.log(`Commands to register: ${commands.map((c) => c.name).join(', ')}`);

	const response = await fetch(url, {
		method: 'PUT',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
		},
		body: JSON.stringify(commands),
	});

	if (!response.ok) {
		const error = await response.text();
		console.error(`Failed to register commands: ${response.status}`);
		console.error(error);
		process.exit(1);
	}

	const registered = await response.json();
	console.log('\nSuccessfully registered commands:');
	for (const cmd of registered) {
		console.log(`  - /${cmd.name} (ID: ${cmd.id})`);
	}
}

registerCommands().catch((error) => {
	console.error('Failed to register commands:', error);
	process.exit(1);
});
