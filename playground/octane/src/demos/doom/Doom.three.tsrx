/** @jsxImportSource @octanejs/three/intrinsics */
import { Instance, Instances, Stats } from '@octanejs/drei/core';
import { useFrame } from '@octanejs/three';
import type { GameState } from './model.js';
import { BLOCKING_PROP, WALL_CELLS } from './model.js';

export function DoomScene({ state }: { state: GameState }) @{
	useFrame(({ camera }) => {
		camera.position.set(state.player.x, state.player.y, state.player.z);
		camera.rotation.order = 'YXZ';
		// Player yaw is locomotion/projectile heading; Three camera yaw is opposite (`-yaw`).
		// Pointer-lock mouse look applies +movementX into player yaw under that contract.
		camera.rotation.set(0, -state.player.yaw, 0);
	});

	<>
		<color attach="background" args={['#080806']} />
		<fog attach="fog" args={['#080806', 5, 24]} />
		<ambientLight intensity={0.62} color="#d0a577" />
		<directionalLight position={[-4, 8, -2]} intensity={1.5} color="#ff9c5b" />

		<mesh position={[0, -0.08, 0]} rotation={[-Math.PI / 2, 0, 0]}>
			<planeGeometry args={[22, 22, 22, 22]} />
			<meshStandardMaterial color="#29271f" roughness={1} />
		</mesh>
		<mesh position={[0, 2.7, 0]} rotation={[Math.PI / 2, 0, 0]}>
			<planeGeometry args={[22, 22]} />
			<meshStandardMaterial color="#171713" roughness={1} />
		</mesh>

		<Instances limit={WALL_CELLS.length} range={WALL_CELLS.length} frames={Infinity}>
			<boxGeometry args={[0.3, 3, 0.3]} />
			<meshStandardMaterial color="#493e31" roughness={0.92} />
			@for (const wall of WALL_CELLS; key `${wall.x}:${wall.z}`) {
				<Instance
					position={[wall.x, 1.45, wall.z]}
					color={(wall.x + wall.z) % 2 ? '#554735' : '#40382f'}
				/>
			}
		</Instances>

		<mesh position={[BLOCKING_PROP.x, 0.75, BLOCKING_PROP.z]} rotation={[0, 0.4, 0]}>
			<boxGeometry args={[1.35, 1.5, 1.35]} />
			<meshStandardMaterial color="#662c1d" emissive="#270500" emissiveIntensity={0.7} />
		</mesh>

		<Instances limit={11} range={11} frames={Infinity}>
			<octahedronGeometry args={[0.24, 0]} />
			<meshStandardMaterial color="#7dffb2" emissive="#22c96f" emissiveIntensity={2.2} />
			@for (const pickup of state.pickups; key pickup.id) {
				<Instance
					position={[pickup.x, 0.52 + Math.sin(state.now / 180 + pickup.id) * 0.08, pickup.z]}
					rotation={[0, state.now / 700 + pickup.id, 0]}
					scale={pickup.visible ? 1 : 0}
				/>
			}
		</Instances>

		@for (const enemy of state.enemies; key enemy.id) {
			<group
				position={[enemy.x, enemy.dead ? 0.18 : 0.82, enemy.z]}
				rotation={[0, -state.player.yaw, 0]}
			>
				<mesh
					scale={enemy.dead
						? [1.15, 0.18, 0.5]
						: enemy.deathStartedAt !== null
							? [1.2, 0.65, 1]
							: [1, 1 + Math.sin(state.now / 140 + enemy.id) * 0.05, 1]}
				>
					<planeGeometry args={[1.25, 1.55]} />
					<meshStandardMaterial
						color={enemy.dead
							? '#50150f'
							: enemy.deathStartedAt !== null
								? '#ff4b24'
								: '#a5301e'}
						emissive={enemy.dead ? '#180000' : '#3d0500'}
						emissiveIntensity={enemy.deathStartedAt !== null ? 2.4 : 0.7}
						roughness={0.86}
					/>
				</mesh>
				@if (!enemy.dead) {
					<>
						<mesh position={[-0.22, 0.2, 0.02]}>
							<boxGeometry args={[0.12, 0.12, 0.04]} />
							<meshBasicMaterial color="#ffd55c" />
						</mesh>
						<mesh position={[0.22, 0.2, 0.02]}>
							<boxGeometry args={[0.12, 0.12, 0.04]} />
							<meshBasicMaterial color="#ffd55c" />
						</mesh>
					</>
				}
			</group>
		}

		@for (const projectile of state.projectiles; key projectile.id) {
			<mesh position={[projectile.x, projectile.owner === 'player' ? 0.9 : 0.72, projectile.z]}>
				<sphereGeometry args={[projectile.owner === 'player' ? 0.1 : 0.14, 6, 4]} />
				<meshBasicMaterial color={projectile.owner === 'player' ? '#fff4aa' : '#ff491f'} />
			</mesh>
		}

		<Stats className="octane-doom-stats" />
	</>
}
