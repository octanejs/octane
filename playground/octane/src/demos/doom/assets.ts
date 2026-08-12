export type DoomCue = 'background' | 'fire' | 'pickup' | 'death';

export function createProceduralAudio() {
	let context: AudioContext | null = null;
	let drone: OscillatorNode | null = null;
	let droneGain: GainNode | null = null;
	const ensure = () => (context ??= new AudioContext());
	const tone = (frequency: number, duration: number, volume: number, type: OscillatorType) => {
		const audio = ensure();
		const oscillator = audio.createOscillator();
		const gain = audio.createGain();
		oscillator.type = type;
		oscillator.frequency.setValueAtTime(frequency, audio.currentTime);
		gain.gain.setValueAtTime(volume, audio.currentTime);
		gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + duration);
		oscillator.connect(gain).connect(audio.destination);
		oscillator.start();
		oscillator.stop(audio.currentTime + duration);
	};
	return {
		async unlock() {
			const audio = ensure();
			await audio.resume();
			if (audio.state === 'closed') return;
			if (!drone) {
				drone = audio.createOscillator();
				droneGain = audio.createGain();
				drone.type = 'sawtooth';
				drone.frequency.value = 43;
				droneGain.gain.value = 0.035;
				drone.connect(droneGain).connect(audio.destination);
				drone.start();
			}
		},
		play(cue: Exclude<DoomCue, 'background'>) {
			// After stop(), do not recreate a closed AudioContext from leftover cues.
			if (context === null || context.state === 'closed') return;
			if (cue === 'fire') tone(72, 0.11, 0.5, 'square');
			else if (cue === 'pickup') tone(620, 0.18, 0.18, 'sine');
			else tone(95, 0.55, 0.28, 'sawtooth');
		},
		stop() {
			drone?.stop();
			drone = null;
			droneGain = null;
			void context?.close();
			context = null;
		},
	};
}
