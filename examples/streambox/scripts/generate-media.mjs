import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import fixWebmDuration from 'fix-webm-duration';

const output = fileURLToPath(new URL('../public/media/streambox-demo.webm', import.meta.url));
await mkdir(fileURLToPath(new URL('../public/media', import.meta.url)), { recursive: true });

// fix-webm-duration targets browsers. Node has Blob but not FileReader, so give
// the library the tiny standards surface it needs to parse this generated blob.
if (globalThis.FileReader === undefined) {
	globalThis.FileReader = class BlobFileReader {
		result = null;
		onloadend = null;

		readAsArrayBuffer(blob) {
			void blob.arrayBuffer().then((buffer) => {
				this.result = buffer;
				this.onloadend?.();
			});
		}
	};
}

const browser = await chromium.launch({ headless: true });
try {
	const page = await browser.newPage();
	const base64 = await page.evaluate(async () => {
		const width = 640;
		const height = 360;
		const canvas = document.createElement('canvas');
		canvas.width = width;
		canvas.height = height;
		const context = canvas.getContext('2d');
		if (!context) throw new Error('Canvas 2D is unavailable');

		const stream = canvas.captureStream(24);
		const recorder = new MediaRecorder(stream, {
			mimeType: 'video/webm;codecs=vp8',
			videoBitsPerSecond: 560_000,
		});
		const chunks = [];
		recorder.addEventListener('dataavailable', (event) => {
			if (event.data.size > 0) chunks.push(event.data);
		});
		const stopped = new Promise((resolve) => recorder.addEventListener('stop', resolve));
		recorder.start(250);

		const started = performance.now();
		await new Promise((resolve) => {
			const draw = (now) => {
				const elapsed = Math.min((now - started) / 1000, 6);
				const phase = elapsed / 6;
				const sky = context.createLinearGradient(0, 0, width, height);
				sky.addColorStop(0, '#11152f');
				sky.addColorStop(0.58, '#34204e');
				sky.addColorStop(1, '#f04f84');
				context.fillStyle = sky;
				context.fillRect(0, 0, width, height);

				context.fillStyle = 'rgba(255, 225, 236, .92)';
				context.beginPath();
				context.arc(510, 82, 38 + Math.sin(elapsed) * 3, 0, Math.PI * 2);
				context.fill();

				context.fillStyle = '#0b0e1d';
				for (let index = 0; index < 12; index++) {
					const buildingWidth = 42 + ((index * 17) % 28);
					const buildingHeight = 58 + ((index * 29) % 105);
					context.fillRect(index * 62 - 18, 216 - buildingHeight, buildingWidth, buildingHeight);
				}

				const water = context.createLinearGradient(0, 216, 0, height);
				water.addColorStop(0, '#171a35');
				water.addColorStop(1, '#070810');
				context.fillStyle = water;
				context.fillRect(0, 216, width, height - 216);

				for (let line = 0; line < 7; line++) {
					context.beginPath();
					for (let x = -20; x <= width + 20; x += 8) {
						const y = 238 + line * 18 + Math.sin(x / 44 + elapsed * 2.4 + line) * (5 + line);
						if (x === -20) context.moveTo(x, y);
						else context.lineTo(x, y);
					}
					context.strokeStyle =
						line % 2 === 0 ? 'rgba(255, 102, 151, .68)' : 'rgba(137, 111, 255, .52)';
					context.lineWidth = 2.5;
					context.stroke();
				}

				context.fillStyle = 'rgba(255,255,255,.92)';
				context.font = '600 18px system-ui, sans-serif';
				context.fillText('STREAMBOX FIELD LOOP', 28, 38);
				context.fillStyle = 'rgba(255,255,255,.64)';
				context.font = '13px system-ui, sans-serif';
				context.fillText(
					`CHAPTER ${Math.min(3, Math.floor(phase * 3) + 1)} · 00:0${Math.floor(elapsed)}`,
					29,
					60,
				);

				if (elapsed >= 6) resolve();
				else requestAnimationFrame(draw);
			};
			requestAnimationFrame(draw);
		});

		recorder.stop();
		await stopped;
		stream.getTracks().forEach((track) => track.stop());
		const blob = new Blob(chunks, { type: 'video/webm' });
		const bytes = new Uint8Array(await blob.arrayBuffer());
		let binary = '';
		for (let offset = 0; offset < bytes.length; offset += 0x8000) {
			binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
		}
		return btoa(binary);
	});
	const recordedBytes = Buffer.from(base64, 'base64');
	if (recordedBytes.length < 10_000) {
		throw new Error(`Generated media is unexpectedly small (${recordedBytes.length} bytes)`);
	}
	const fixedBlob = await fixWebmDuration(
		new Blob([recordedBytes], { type: 'video/webm' }),
		6_000,
		{ logger: false },
	);
	const bytes = Buffer.from(await fixedBlob.arrayBuffer());
	await writeFile(output, bytes);
	console.log(`Generated ${output} (${bytes.length} bytes)`);
} finally {
	await browser.close();
}
