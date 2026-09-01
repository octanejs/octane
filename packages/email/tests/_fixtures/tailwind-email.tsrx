import { Body, Head, Html, Text } from '../../src/components.tsrx';
import { Tailwind, pixelBasedPreset } from '../../src/tailwind/index.ts';

export function TailwindEmail() @{
	<Html>
		<Tailwind config={{ presets: [pixelBasedPreset] }}>
			<Head />
			<Body>
				<img className="p-2" alt="Spacer" src="spacer.png" />
				<Text className="rounded bg-white text-gray-900">Stock theme</Text>
				<Text className="p-2" style={{ fontFamily: '\'Helvetica Neue\', Arial, sans-serif' }}>
					Quoted font
				</Text>
				<Text
					className="bg-blue-500 p-4 !p-8 text-sm hover:text-red-500 md:text-lg"
					style={{ color: 'rebeccapurple', paddingTop: '99px' }}
				>
					Price: $1
				</Text>
			</Body>
		</Tailwind>
	</Html>
}

export function TwoTailwindBoundaries() @{
	<Html>
		<Head />
		<Body>
			<Tailwind config={{ presets: [pixelBasedPreset] }}>
				<Text className="p-2">First</Text>
			</Tailwind>
			<Tailwind config={{ presets: [pixelBasedPreset] }}>
				<Text className="m-3">Second</Text>
			</Tailwind>
		</Body>
	</Html>
}

export function NestedTailwindBoundaries() @{
	<Html>
		<Head />
		<Body>
			<Tailwind>
				<Tailwind>
					<Text className="p-2">Nested</Text>
				</Tailwind>
			</Tailwind>
		</Body>
	</Html>
}
