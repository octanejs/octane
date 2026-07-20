import * as THREE from 'three';
import { useGameStore } from '../hooks/useGameStore';
import { preloadModels } from './loaders/ModelLoader';
import { preloadGameFonts } from './loaders/FontLoader';
import { Sky } from './entities/Sky';
import { Ocean } from './entities/Ocean';
import { Boat } from './entities/Boat';
import { Coins } from './entities/Coins';
import { Islands } from './entities/Islands';
import { OceanRocks } from './entities/OceanRocks';
import { BoundaryWalls } from './entities/BoundaryWalls';
import { AIShips } from './entities/AIShips';
import { Cannonballs } from './entities/Cannonballs';
import { AIDebug } from './entities/AIDebug';

// Global engine reference for HMR
let __hmrEngine: GameEngine | null = null;
import { CameraSystem } from './systems/CameraSystem';
import { BoatControlSystem } from './systems/BoatControlSystem';
import { DiscoverySystem } from './systems/DiscoverySystem';
import { CoinSystem } from './systems/CoinSystem';
import { AISystem } from './systems/AISystem';
import { CannonballSystem } from './systems/CannonballSystem';
import {
	generateIslands,
	generateExpandedIslands,
	generateShowcaseIslands,
	generateCornerIslands,
} from '../utils/islandGenerator';
import { generateRockColliders } from '../utils/collision';
import { generateCoins, generateExpandedCoins } from '../utils/coinGenerator';
import { libraries } from '~/libraries';
import { partners } from '~/utils/partners';
import { fetchGameShowcases } from '../utils/showcases';

// Filter to only active partners
const ACTIVE_PARTNERS = partners
	.filter((p) => p.status === 'active')
	.map((p) => ({
		id: p.id,
		name: p.name,
		href: p.href,
		brandColor: p.brandColor,
		tagline: p.tagline,
		// Get logo URLs - prefer white/light versions for colored backgrounds
		logoLight: 'dark' in p.image ? p.image.dark : 'src' in p.image ? p.image.src : undefined,
		logoDark: 'light' in p.image ? p.image.light : 'src' in p.image ? p.image.src : undefined,
	}));

export class GameEngine {
	private canvas: HTMLCanvasElement;
	private renderer: THREE.WebGLRenderer;
	private scene: THREE.Scene;
	private camera: THREE.PerspectiveCamera;
	private clock: THREE.Clock;
	private animationFrameId: number | null = null;
	private unsubscribers: Array<() => void> = [];
	private isDisposed = false;
	private isPaused = false;
	private raycaster = new THREE.Raycaster();
	private pointer = new THREE.Vector2();

	// Entities
	private sky: Sky;
	private ocean: Ocean;
	private boat: Boat;
	private coins: Coins;
	private islands: Islands;
	private oceanRocks: OceanRocks;
	private boundaryWalls: BoundaryWalls;
	private directionalLight: THREE.DirectionalLight | null = null;
	private aiShips: AIShips;
	private cannonballs: Cannonballs;
	private aiDebug: AIDebug;

	// Systems
	private cameraSystem: CameraSystem;
	private boatControlSystem: BoatControlSystem;
	private discoverySystem: DiscoverySystem;
	private coinSystem: CoinSystem;
	private aiSystem: AISystem;
	private cannonballSystem: CannonballSystem;

	constructor(canvas: HTMLCanvasElement) {
		this.canvas = canvas;
		this.clock = new THREE.Clock();

		// Get dimensions - use clientWidth/Height for aspect ratio, canvas.width/height for resolution
		const displayWidth = canvas.clientWidth || window.innerWidth;
		const displayHeight = canvas.clientHeight || window.innerHeight;

		// Create renderer
		this.renderer = new THREE.WebGLRenderer({
			canvas,
			antialias: true,
		});
		// Don't call setPixelRatio since canvas is already sized with DPR
		this.renderer.setSize(displayWidth, displayHeight, false); // false = don't update canvas style
		this.renderer.shadowMap.enabled = true;
		this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
		this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
		this.renderer.toneMappingExposure = 1.2;

		// PCSS disabled - was causing shader compilation errors
		// this.setupPCSS()

		// Create scene
		this.scene = new THREE.Scene();

		// Add atmospheric fog - matches horizon color for seamless blend
		// Extended far range so edges of 520-unit world aren't cut off
		this.scene.fog = new THREE.Fog('#B0E0E6', 200, 800);

		// Create camera
		this.camera = new THREE.PerspectiveCamera(
			20, // Narrow FOV for isometric feel
			displayWidth / displayHeight || 1,
			0.1,
			1000,
		);
		this.camera.position.set(22, 15, 22);
		this.camera.lookAt(0, 0, 0);

		// Create entities (will be initialized in init())
		this.sky = new Sky();
		this.ocean = new Ocean();
		this.boat = new Boat();
		this.coins = new Coins();
		this.islands = new Islands();
		this.oceanRocks = new OceanRocks();
		this.boundaryWalls = new BoundaryWalls();
		this.aiShips = new AIShips();
		this.cannonballs = new Cannonballs();
		this.aiDebug = new AIDebug();

		// Create systems
		this.cameraSystem = new CameraSystem(this.camera);
		this.boatControlSystem = new BoatControlSystem();
		this.discoverySystem = new DiscoverySystem();
		this.coinSystem = new CoinSystem();
		this.aiSystem = new AISystem();
		this.cannonballSystem = new CannonballSystem();

		// Connect debug entity to AI system
		this.aiDebug.setAISystem(this.aiSystem);

		// Handle resize
		window.addEventListener('resize', this.handleResize);

		// Handle visibility change (pause when tab not active)
		document.addEventListener('visibilitychange', this.handleVisibilityChange);

		// Handle clicks for info signs
		this.canvas.addEventListener('click', this.handleClick);
		this.canvas.addEventListener('pointermove', this.handlePointerMove);

		// Store for HMR
		// eslint-disable-next-line @typescript-eslint/no-this-alias
		__hmrEngine = this;
	}

	async init(): Promise<void> {
		// Preload assets
		try {
			await Promise.all([preloadModels(), preloadGameFonts()]);
		} catch (err) {
			console.error('[GameEngine] Failed to preload assets:', err);
		}

		// Setup lighting
		this.setupLighting();

		// Initialize game data
		this.initializeGameData();

		// Add entities to scene
		// Render order: lower = renders first (back to front for transparency)
		this.scene.add(this.sky.mesh);

		this.ocean.seaFloor.renderOrder = 0; // Sea floor first (deepest)
		this.scene.add(this.ocean.seaFloor);

		this.islands.group.renderOrder = 1; // Islands above sea floor
		this.scene.add(this.islands.group);

		this.ocean.mesh.renderOrder = 2; // Water surface on top
		this.scene.add(this.ocean.mesh);

		this.scene.add(this.boat.group);
		this.scene.add(this.boat.getWakeMesh());
		this.scene.add(this.coins.group);
		this.scene.add(this.oceanRocks.group);
		this.scene.add(this.boundaryWalls.group);
		this.scene.add(this.aiShips.group);
		this.scene.add(this.cannonballs.group);
		this.scene.add(this.aiDebug.group);

		// Initialize boat model
		const { boatType } = useGameStore.getState();
		this.boat.setBoatType(boatType);

		// Setup subscriptions
		this.setupSubscriptions();

		// Initialize systems
		this.boatControlSystem.init();
	}

	private setupLighting(): void {
		// Ambient light
		const ambient = new THREE.AmbientLight('#FFF8E7', 0.5);
		this.scene.add(ambient);

		// Main directional light
		const directional = new THREE.DirectionalLight('#FFF5E0', 1.3);
		directional.position.set(50, 100, 50);
		directional.castShadow = true;
		directional.shadow.mapSize.set(4096, 4096);
		directional.shadow.camera.far = 150;
		directional.shadow.camera.near = 20;
		directional.shadow.camera.left = -40;
		directional.shadow.camera.right = 40;
		directional.shadow.camera.top = 40;
		directional.shadow.camera.bottom = -40;
		directional.shadow.bias = -0.0003;
		directional.shadow.normalBias = 0.02;
		this.scene.add(directional);
		this.scene.add(directional.target);
		this.directionalLight = directional;

		// Fill light
		const fill = new THREE.DirectionalLight('#87CEEB', 0.4);
		fill.position.set(-30, 40, -30);
		this.scene.add(fill);

		// Hemisphere light
		const hemi = new THREE.HemisphereLight('#87CEEB', '#8B4513', 0.5);
		this.scene.add(hemi);
	}

	private setupPCSS(): void {
		// PCSS - Percentage Closer Soft Shadows
		// Shadows are sharp near caster, soft far from caster
		const pcssShaderChunk = /* glsl */ `
      #define LIGHT_WORLD_SIZE 0.05
      #define LIGHT_FRUSTUM_WIDTH 80.0
      #define LIGHT_SIZE_UV (LIGHT_WORLD_SIZE / LIGHT_FRUSTUM_WIDTH)
      #define NEAR_PLANE 20.0
      #define NUM_SAMPLES 17
      #define NUM_RINGS 11
      #define BLOCKER_SEARCH_NUM_SAMPLES NUM_SAMPLES

      vec2 poissonDisk[NUM_SAMPLES];

      void initPoissonSamples(const in vec2 randomSeed) {
        float ANGLE_STEP = PI2 * float(NUM_RINGS) / float(NUM_SAMPLES);
        float INV_NUM_SAMPLES = 1.0 / float(NUM_SAMPLES);
        float angle = rand(randomSeed) * PI2;
        float radius = INV_NUM_SAMPLES;
        float radiusStep = radius;
        for (int i = 0; i < NUM_SAMPLES; i++) {
          poissonDisk[i] = vec2(cos(angle), sin(angle)) * pow(radius, 0.75);
          radius += radiusStep;
          angle += ANGLE_STEP;
        }
      }

      float penumbraSize(const in float zReceiver, const in float zBlocker) {
        return (zReceiver - zBlocker) / zBlocker;
      }

      float findBlocker(sampler2D shadowMap, const in vec2 uv, const in float zReceiver) {
        float searchRadius = LIGHT_SIZE_UV * (zReceiver - NEAR_PLANE) / zReceiver;
        float blockerDepthSum = 0.0;
        int numBlockers = 0;
        for (int i = 0; i < BLOCKER_SEARCH_NUM_SAMPLES; i++) {
          float shadowMapDepth = unpackRGBAToDepth(texture2D(shadowMap, uv + poissonDisk[i] * searchRadius));
          if (shadowMapDepth < zReceiver) {
            blockerDepthSum += shadowMapDepth;
            numBlockers++;
          }
        }
        if (numBlockers == 0) return -1.0;
        return blockerDepthSum / float(numBlockers);
      }

      float PCF_Filter(sampler2D shadowMap, vec2 uv, float zReceiver, float filterRadius) {
        float sum = 0.0;
        for (int i = 0; i < NUM_SAMPLES; i++) {
          float depth = unpackRGBAToDepth(texture2D(shadowMap, uv + poissonDisk[i] * filterRadius));
          if (zReceiver <= depth) sum += 1.0;
        }
        for (int i = 0; i < NUM_SAMPLES; i++) {
          float depth = unpackRGBAToDepth(texture2D(shadowMap, uv + -poissonDisk[i].yx * filterRadius));
          if (zReceiver <= depth) sum += 1.0;
        }
        return sum / (2.0 * float(NUM_SAMPLES));
      }

      float PCSS(sampler2D shadowMap, vec4 coords) {
        vec2 uv = coords.xy;
        float zReceiver = coords.z;
        initPoissonSamples(uv);
        float avgBlockerDepth = findBlocker(shadowMap, uv, zReceiver);
        if (avgBlockerDepth == -1.0) return 1.0;
        float penumbraRatio = penumbraSize(zReceiver, avgBlockerDepth);
        float filterRadius = penumbraRatio * LIGHT_SIZE_UV * NEAR_PLANE / zReceiver;
        return PCF_Filter(shadowMap, uv, zReceiver, filterRadius);
      }
    `;

		// Override Three.js shadow sampling
		let shader = THREE.ShaderChunk.shadowmap_pars_fragment;
		shader = shader.replace('#ifdef USE_SHADOWMAP', '#ifdef USE_SHADOWMAP\n' + pcssShaderChunk);
		shader = shader.replace(
			'#if defined( SHADOWMAP_TYPE_PCF )',
			`return PCSS(shadowMap, shadowCoord);
      #if defined( SHADOWMAP_TYPE_PCF_DISABLED )`,
		);
		THREE.ShaderChunk.shadowmap_pars_fragment = shader;
	}

	private initializeGameData(): void {
		const state = useGameStore.getState();

		if (state.islands.length === 0) {
			// Generate islands
			const generatedIslands = generateIslands(libraries);
			state.setIslands(generatedIslands);

			// Generate rock colliders
			const rockColliders = generateRockColliders(generatedIslands, 30, 140);
			state.setRockColliders(rockColliders);

			// Generate coins
			const generatedCoins = generateCoins(generatedIslands);
			state.setCoins(generatedCoins);
		}

		// Initialize entities with data
		const islands = useGameStore.getState().islands;
		this.islands.setIslands(islands, []);
		this.oceanRocks.generate(islands, 30, 140);
		this.coins.setCoins(useGameStore.getState().coins);

		// Set ocean island gradients
		this.updateOceanIslandPositions(islands, [], []);
	}

	private setupSubscriptions(): void {
		const initialState = useGameStore.getState();

		// Handle loading directly into battle stage (page reload while in battle)
		console.log('[Game Init] State:', {
			stage: initialState.stage,
			phase: initialState.phase,
			showcaseUnlocked: initialState.showcaseUnlocked,
			showcaseIslandsCount: initialState.showcaseIslands.length,
			worldBoundary: initialState.worldBoundary,
		});
		if (initialState.stage === 'battle' && initialState.phase === 'playing') {
			// Generate expanded islands if needed
			if (initialState.expandedIslands.length === 0) {
				const partnerIslands = generateExpandedIslands(ACTIVE_PARTNERS);
				initialState.setExpandedIslands(partnerIslands);
			}
			const expandedIslands = useGameStore.getState().expandedIslands;

			// Generate showcase islands if showcase was unlocked
			const showcaseIslands = initialState.showcaseIslands;
			// Generate corner islands if corners were unlocked
			let cornerIslands = initialState.cornerIslands;
			if (initialState.cornersUnlocked && cornerIslands.length === 0) {
				cornerIslands = generateCornerIslands();
				initialState.setCornerIslands(cornerIslands);
			}

			if (initialState.showcaseUnlocked && showcaseIslands.length === 0) {
				console.log('[Game Init] Showcase was unlocked but no islands - fetching...');
				// Fetch and generate showcase islands async
				fetchGameShowcases().then((showcases) => {
					console.log('[Game Init] Fetched showcases for reload:', showcases.length);
					if (showcases.length > 0) {
						const generated = generateShowcaseIslands(showcases);
						console.log('[Game Init] Generated showcase islands:', generated.length);
						initialState.setShowcaseIslands(generated);
						this.islands.setIslands(
							initialState.islands,
							expandedIslands,
							generated,
							cornerIslands,
						);
						this.updateOceanIslandPositions(
							initialState.islands,
							expandedIslands,
							generated,
							cornerIslands,
						);
					}
				});
			} else {
				console.log('[Game Init] Showcase state:', {
					showcaseUnlocked: initialState.showcaseUnlocked,
					showcaseIslandsCount: showcaseIslands.length,
				});
			}

			this.islands.setIslands(
				initialState.islands,
				expandedIslands,
				showcaseIslands,
				cornerIslands,
			);

			// Update ocean gradients for current islands
			this.updateOceanIslandPositions(
				initialState.islands,
				expandedIslands,
				showcaseIslands,
				cornerIslands,
			);

			// Generate expanded coins if needed (check if we have coins in outer ring)
			const hasExpandedCoins = initialState.coins.some(
				(c) => Math.abs(c.position[0]) > 90 || Math.abs(c.position[2]) > 90,
			);
			if (!hasExpandedCoins) {
				const allIslands = [...initialState.islands, ...expandedIslands, ...showcaseIslands];
				const expandedCoins = generateExpandedCoins(initialState.coins, allIslands);
				initialState.setCoins(expandedCoins);
			}

			// Set boat type
			this.boat.setBoatType(initialState.boatType);

			// Spawn AI
			this.aiSystem.spawn(6);

			// Spawn outer rim AIs if showcase is unlocked
			if (initialState.showcaseUnlocked) {
				this.aiSystem.spawn(8, true);
			}

			// Spawn corner bosses if corners unlocked
			if (initialState.cornersUnlocked) {
				this.aiSystem.spawnCornerBosses();
			}
		}

		// Track previous values for change detection
		let prevPhase = initialState.phase;
		let prevBoatType = initialState.boatType;
		let prevStage = initialState.stage;
		let prevCoins = initialState.coins;
		let prevOtherPlayers = initialState.otherPlayers;
		let prevCannonballs = initialState.cannonballs;
		let prevShowcaseUnlocked = initialState.showcaseUnlocked;
		let prevCornersUnlocked = initialState.cornersUnlocked;

		this.unsubscribers.push(
			useGameStore.subscribe((state) => {
				// Phase change (detect reset - going back to intro)
				if (state.phase !== prevPhase) {
					const wasReset = prevPhase !== 'intro' && state.phase === 'intro';
					prevPhase = state.phase;

					if (wasReset) {
						// Reset AI system
						this.aiSystem.reset();
						// Reset boat to dinghy
						this.boat.setBoatType('dinghy');
						// Clear AI ships
						this.aiShips.updatePlayers([]);
						// Clear cannonballs
						this.cannonballs.updateBalls([]);
						// Reset stage tracking
						prevStage = 'exploration';
						prevBoatType = 'dinghy';
						prevShowcaseUnlocked = false;
						prevCornersUnlocked = false;
					}
				}

				// Boat type change
				if (state.boatType !== prevBoatType) {
					prevBoatType = state.boatType;
					this.boat.setBoatType(state.boatType);
				}

				// Stage change (expand world, add partner islands)
				if (state.stage !== prevStage) {
					prevStage = state.stage;
					if (state.stage === 'battle') {
						if (state.expandedIslands.length === 0) {
							const partnerIslands = generateExpandedIslands(ACTIVE_PARTNERS);
							state.setExpandedIslands(partnerIslands);
						}
						const expandedIslands = useGameStore.getState().expandedIslands;
						this.islands.setIslands(
							state.islands,
							expandedIslands,
							state.showcaseIslands,
							state.cornerIslands,
						);

						// Update ocean gradients
						this.updateOceanIslandPositions(
							state.islands,
							expandedIslands,
							state.showcaseIslands,
							state.cornerIslands,
						);

						// Generate expanded coins for outer ring
						const allIslands = [...state.islands, ...expandedIslands, ...state.showcaseIslands];
						const expandedCoins = generateExpandedCoins(state.coins, allIslands);
						state.setCoins(expandedCoins);

						this.aiSystem.spawn(6);
					}
				}

				// Showcase unlock (generate showcase islands - NOT corner islands yet)
				// Debug: Log showcase state on every subscription tick
				if (state.showcaseUnlocked !== prevShowcaseUnlocked) {
					console.log('[Game] Showcase state changed:', {
						showcaseUnlocked: state.showcaseUnlocked,
						prevShowcaseUnlocked,
						showcaseIslandsCount: state.showcaseIslands.length,
					});
				}
				if (state.showcaseUnlocked && !prevShowcaseUnlocked) {
					prevShowcaseUnlocked = true;
					console.log(
						'[Game] Showcase unlocked! Expanding world and generating showcase islands...',
					);

					// Expand world boundary for showcase zone
					state.setWorldBoundary(520);

					// Spawn tough outer rim AIs for the showcase zone
					this.aiSystem.spawn(8, true);

					// Fetch and generate showcase islands async (no corner islands yet)
					if (state.showcaseIslands.length === 0) {
						console.log('[Game] Fetching showcase data...');
						fetchGameShowcases().then((showcases) => {
							console.log('[Game] Fetched showcases:', showcases.length);
							if (showcases.length > 0) {
								const generated = generateShowcaseIslands(showcases);
								console.log('[Game] Generated showcase islands:', generated.length);
								// Get fresh state for current islands
								const currentState = useGameStore.getState();
								currentState.setShowcaseIslands(generated);

								// Update islands entity with showcase islands
								this.islands.setIslands(
									currentState.islands,
									currentState.expandedIslands,
									generated,
									currentState.cornerIslands,
								);
								// Update ocean gradients
								this.updateOceanIslandPositions(
									currentState.islands,
									currentState.expandedIslands,
									generated,
									currentState.cornerIslands,
								);
							}
						});
					} else {
						this.islands.setIslands(
							state.islands,
							state.expandedIslands,
							state.showcaseIslands,
							state.cornerIslands,
						);
						// Update ocean gradients
						this.updateOceanIslandPositions(
							state.islands,
							state.expandedIslands,
							state.showcaseIslands,
							state.cornerIslands,
						);
					}
				}

				// Corners unlock (after all showcases discovered)
				if (state.cornersUnlocked && !prevCornersUnlocked) {
					prevCornersUnlocked = true;

					// Generate corner islands
					const cornerIslands = generateCornerIslands();
					state.setCornerIslands(cornerIslands);

					// Spawn corner boss AIs
					this.aiSystem.spawnCornerBosses();

					// Update islands entity with corner islands
					this.islands.setIslands(
						state.islands,
						state.expandedIslands,
						state.showcaseIslands,
						cornerIslands,
					);
					// Update ocean gradients
					this.updateOceanIslandPositions(
						state.islands,
						state.expandedIslands,
						state.showcaseIslands,
						cornerIslands,
					);
				}

				// Coins update
				if (state.coins !== prevCoins) {
					prevCoins = state.coins;
					this.coins.setCoins(state.coins);
				}

				// Other players update (AI ships)
				if (state.otherPlayers !== prevOtherPlayers) {
					const hadPlayers = prevOtherPlayers.length > 0;
					const nowEmpty = state.otherPlayers.length === 0;
					prevOtherPlayers = state.otherPlayers;
					this.aiShips.updatePlayers(state.otherPlayers);

					// Respawn AI if we're in battle stage and players were cleared (restart after death)
					if (state.stage === 'battle' && state.phase === 'playing' && nowEmpty && hadPlayers) {
						// Reset AI system state so spawn works again
						this.aiSystem.reset();

						// Delay spawn slightly to let state settle
						setTimeout(() => {
							// Get fresh state to check unlock status
							const currentState = useGameStore.getState();
							this.aiSystem.spawn(6);
							// Spawn outer rim AIs if showcase is unlocked
							if (currentState.showcaseUnlocked) {
								this.aiSystem.spawn(8, true);
							}
							// Spawn corner bosses if corners are unlocked
							if (currentState.cornersUnlocked) {
								this.aiSystem.spawnCornerBosses();
							}
						}, 100);
					}
				}

				// Cannonballs update
				if (state.cannonballs !== prevCannonballs) {
					prevCannonballs = state.cannonballs;
					this.cannonballs.updateBalls(state.cannonballs);
				}
			}),
		);
	}

	start(): void {
		if (this.animationFrameId !== null || this.isDisposed) {
			return;
		}

		this.isPaused = document.hidden;
		this.clock.start();

		if (!this.isPaused) {
			this.animationFrameId = requestAnimationFrame(this.loop);
		}
	}

	stop(): void {
		if (this.animationFrameId !== null) {
			cancelAnimationFrame(this.animationFrameId);
			this.animationFrameId = null;
		}
	}

	private loop = (): void => {
		this.animationFrameId = null;

		if (this.isDisposed || this.isPaused) {
			return;
		}

		const delta = this.clock.getDelta();
		const time = this.clock.getElapsedTime();

		this.update(delta, time);
		this.render();
		this.animationFrameId = requestAnimationFrame(this.loop);
	};

	private update(delta: number, time: number): void {
		const state = useGameStore.getState();

		// Always update sky and ocean animation
		this.sky.update(time);
		this.ocean.update(time);

		// Only update game systems when playing
		if (state.phase === 'playing') {
			// Update systems
			this.boatControlSystem.update(delta);
			this.discoverySystem.update(delta);
			this.coinSystem.update(delta, this.coins);
			this.cameraSystem.update(delta, time);

			// Respawn coins that have been collected for long enough
			useGameStore.getState().respawnCoins();

			if (state.stage === 'battle') {
				this.aiSystem.update(delta);
				this.cannonballSystem.update(delta, this.cannonballs);
				this.aiDebug.update();

				// Health regeneration
				const { boatHealth, shipStats, purchasedBoosts, setBoatHealth } = useGameStore.getState();
				const totalMaxHealth = shipStats.maxHealth + purchasedBoosts.permHealth * 25;
				if (boatHealth < totalMaxHealth && shipStats.healthRegen > 0) {
					const newHealth = Math.min(totalMaxHealth, boatHealth + shipStats.healthRegen * delta);
					setBoatHealth(newHealth);
				}
			}

			// Update entities
			const { boatPosition, boatRotation, boatVelocity } = state;
			this.boat.update(time, boatPosition, boatRotation, boatVelocity);
			this.coins.update(time, boatPosition);
			this.islands.update(time, boatPosition);
			this.oceanRocks.update(time, boatPosition);
			this.boundaryWalls.update(delta);
			this.aiShips.update(time);
			this.cannonballs.update(delta);

			// Update shadow camera to follow boat for better shadow quality
			if (this.directionalLight) {
				this.directionalLight.position.set(boatPosition[0] + 50, 100, boatPosition[2] + 50);
				this.directionalLight.target.position.set(boatPosition[0], 0, boatPosition[2]);
				this.directionalLight.target.updateMatrixWorld();
			}
		}
	}

	private render(): void {
		this.renderer.render(this.scene, this.camera);
	}

	resize(width: number, height: number): void {
		if (width === 0 || height === 0) return;

		// Update canvas resolution with DPR
		const dpr = Math.min(window.devicePixelRatio, 2);
		this.canvas.width = width * dpr;
		this.canvas.height = height * dpr;
		this.canvas.style.width = `${width}px`;
		this.canvas.style.height = `${height}px`;

		this.camera.aspect = width / height;
		this.camera.updateProjectionMatrix();
		this.renderer.setSize(width, height, false);
	}

	private handleResize = (): void => {
		const width = this.canvas.clientWidth;
		const height = this.canvas.clientHeight;
		this.resize(width, height);
	};

	private handleVisibilityChange = (): void => {
		this.isPaused = document.hidden;

		if (document.hidden) {
			this.stop();
			return;
		}

		if (!document.hidden) {
			// Reset clock delta when resuming to avoid large time jumps
			this.clock.getDelta();

			if (this.animationFrameId === null && !this.isDisposed) {
				this.animationFrameId = requestAnimationFrame(this.loop);
			}
		}
	};

	private handleClick = (event: MouseEvent): void => {
		const infoGroup = this.raycastInfoGroup(event.clientX, event.clientY);
		if (!infoGroup) return;

		// Get island data and navigate
		const island = this.islands.getIslandByInfoGroup(infoGroup);
		if (!island) return;

		if (island.type === 'partner' && island.partner?.href) {
			window.open(island.partner.href, '_blank');
		} else if (island.type === 'showcase' && island.showcase?.url) {
			window.open(island.showcase.url, '_blank');
		} else if (island.type === 'library' && island.library) {
			window.open(`/${island.library.id}`, '_blank');
		}
	};

	private handlePointerMove = (event: PointerEvent): void => {
		const infoGroup = this.raycastInfoGroup(event.clientX, event.clientY);
		this.canvas.style.cursor = infoGroup ? 'pointer' : 'auto';
		this.islands.setInfoHover(infoGroup);
	};

	private updateOceanIslandPositions(
		islands: Array<{ position: [number, number, number] }>,
		expandedIslands: Array<{ position: [number, number, number] }>,
		showcaseIslands: Array<{ position: [number, number, number] }>,
		cornerIslands: Array<{ position: [number, number, number] }> = [],
	): void {
		const positions: Array<[number, number]> = [];
		for (const island of islands) {
			positions.push([island.position[0], island.position[2]]);
		}
		for (const island of expandedIslands) {
			positions.push([island.position[0], island.position[2]]);
		}
		for (const island of showcaseIslands) {
			positions.push([island.position[0], island.position[2]]);
		}
		for (const island of cornerIslands) {
			positions.push([island.position[0], island.position[2]]);
		}
		this.ocean.setIslandPositions(positions);
	}

	private raycastInfoGroup(clientX: number, clientY: number): THREE.Group | null {
		// Calculate normalized device coordinates
		const rect = this.canvas.getBoundingClientRect();
		this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
		this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;

		// Update raycaster
		this.raycaster.setFromCamera(this.pointer, this.camera);

		// Get clickable info groups
		const clickableGroups = this.islands.getClickableInfoGroups();
		if (clickableGroups.length === 0) return null;

		// Check for intersections with info group children (meshes)
		const allMeshes: THREE.Object3D[] = [];
		for (const group of clickableGroups) {
			group.traverse((child) => {
				if (child instanceof THREE.Mesh) {
					allMeshes.push(child);
				}
			});
		}

		const intersects = this.raycaster.intersectObjects(allMeshes, false);
		if (intersects.length === 0) return null;

		// Find the parent info group of the intersected mesh
		let obj: THREE.Object3D | null = intersects[0].object;
		while (obj) {
			if (obj.userData.islandId) {
				return obj as THREE.Group;
			}
			obj = obj.parent;
		}

		return null;
	}

	// HMR: Rebuild islands entity with new code
	rebuildIslands(NewIslands: typeof Islands): void {
		// Remove old islands from scene
		this.scene.remove(this.islands.group);
		this.islands.dispose();

		// Create new islands with updated code
		this.islands = new NewIslands();
		this.scene.add(this.islands.group);

		// Re-initialize with current game data
		const { islands, expandedIslands, showcaseIslands, cornerIslands } = useGameStore.getState();
		this.islands.setIslands(islands, expandedIslands, showcaseIslands, cornerIslands);
	}

	dispose(): void {
		this.isDisposed = true;
		__hmrEngine = null;
		this.stop();

		// Cleanup subscriptions
		this.unsubscribers.forEach((unsub) => unsub());
		this.unsubscribers = [];

		// Cleanup systems
		try {
			this.boatControlSystem.dispose();
		} catch (e) {
			console.warn('Error disposing boatControlSystem:', e);
		}

		// Cleanup entities
		try {
			this.sky.dispose();
			this.ocean.dispose();
			this.boat.dispose();
			this.coins.dispose();
			this.islands.dispose();
			this.oceanRocks.dispose();
			this.boundaryWalls.dispose();
			this.aiShips.dispose();
			this.cannonballs.dispose();
			this.aiDebug.dispose();
		} catch (e) {
			console.warn('Error disposing entities:', e);
		}

		// Cleanup renderer
		try {
			this.renderer.dispose();
		} catch (e) {
			console.warn('Error disposing renderer:', e);
		}

		window.removeEventListener('resize', this.handleResize);
		document.removeEventListener('visibilitychange', this.handleVisibilityChange);
		this.canvas.removeEventListener('click', this.handleClick);
		this.canvas.removeEventListener('pointermove', this.handlePointerMove);
	}
}

// HMR support for Islands
if (import.meta.hot) {
	import.meta.hot.accept('./entities/Islands', (newModule) => {
		if (newModule && __hmrEngine) {
			console.log('[HMR] Rebuilding islands...');
			__hmrEngine.rebuildIslands(newModule.Islands);
		}
	});
}
