# Island Explorer Game - TODO

## Completed

- [x] Define upgrade types and partner-to-upgrade mapping (`utils/upgrades.ts`)
- [x] Add ship stats to store (fireRate, cannonRange, dualCannons, doubleShot, gatlingGuns, maxHealth, regenSpeed)
- [x] Update fireCannon to use ship stats (range, dual, double shot, spread)
- [x] Update island count in HUD when expanded islands unlock
- [x] Object culling for islands, rocks, AI ships
- [x] Beach sign discovery animation (scale up, rectangle border progress, checkmark)
- [x] Discovery time 8 seconds
- [x] Island indicator arrow pointing to nearest undiscovered island (exploration only)
- [x] Floating info signs fade in/out
- [x] Upgrade overlay waits for button click (no auto-timeout)
- [x] Reduced ocean wave amplitude
- [x] Grant upgrades when discovering partner islands (fixed order progression)
- [x] Upgrade notification UI (shows upgrade name, icon, description)
- [x] Health bar UI (battle stage, bottom center)
- [x] Cooldown gauge UI for cannon (battle stage, shows READY/LOADING)
- [x] Health regeneration in game loop (0.5 HP/s base, upgrades stack 1.5x each)
- [x] Gatling guns fire while SPACE held (if unlocked)
- [x] Tiered upgrade system (15 upgrades for partners, more for showcase)
- [x] Partner island signs: white/black with partner logo instead of colored signs
- [x] Shop/buying interface for spending coins (click coin counter to open)
- [x] Compass item: one-time use, points to random undiscovered island
- [x] Speed boost item: 2x speed for 30 seconds
- [x] Health pack item: restore 50 HP (battle stage only)
- [x] Split fireRate into sideFireRate (cannons) and frontFireRate (gatling)

## High Priority

- [ ] Sprint ability: double-tap forward (W/Up) or screen to activate temporary speed boost, drains stamina bar, regens slowly when not sprinting

## Medium Priority

- [ ] Unlock top 10 showcase islands after all partner islands discovered
- [ ] Showcase island generation (outer ring beyond partners)

## Low Priority / Future

- [ ] AI ships fire back at player
- [ ] Multiplayer infrastructure (WebSocket/WebRTC)
- [ ] Sound effects and music
- [ ] Mobile touch controls improvements
- [ ] Particle effects for cannon hits
- [ ] Ship damage visual feedback
- [ ] Minimap improvements (show partner islands, AI ships)

## Upgrade System Notes

Upgrades are tiered and granted in order as partner islands are discovered.
Stackable upgrades have multiple tiers; one-time unlocks are single tier.

### Partner Upgrades (15 total, matches partner count)

| #   | Upgrade            | Effect           |
| --- | ------------------ | ---------------- |
| 1   | Quick Load I       | Cooldown -33%    |
| 2   | Crow's Nest I      | FOV +15%         |
| 3   | Long Range I       | Range +25%       |
| 4   | Reinforced Hull I  | Max HP +25       |
| 5   | Dual Cannons       | Fire both sides  |
| 6   | Auto Repair I      | Regen +50%       |
| 7   | Quick Load II      | Cooldown -33%    |
| 8   | Long Range II      | Range +25%       |
| 9   | Reinforced Hull II | Max HP +25       |
| 10  | Double Shot        | 2 balls per shot |
| 11  | Crow's Nest II     | FOV +15%         |
| 12  | Auto Repair II     | Regen +50%       |
| 13  | Quick Load III     | Cooldown -33%    |
| 14  | Long Range III     | Range +25%       |
| 15  | Gatling Guns       | Hold SPACE rapid |

### Showcase Upgrades (future)

| #   | Upgrade             | Effect     |
| --- | ------------------- | ---------- |
| 16  | Reinforced Hull III | Max HP +25 |
| ... | TBD                 | ...        |

## Ship Stats (Base Values)

- Side Fire Rate: 2000ms cooldown (upgrades: x0.67 each tier) - side cannons
- Front Fire Rate: 200ms cooldown - gatling guns (unlocked once)
- Cannon Range: 0.7x multiplier (upgrades: x1.25 each tier)
- Field of View: 1.0x (upgrades: x1.15 each tier)
- Max Health: 100 (upgrades: +25 each tier)
- Health Regen: 0.5 HP/second (upgrades: x1.5 each tier)
- Dual Cannons: false (unlocked once)
- Double Shot: false (unlocked once)
- Gatling Guns: false (unlocked once)

## Shop Items (Coin Purchases)

| Item        | Cost      | Description                                                                                                     |
| ----------- | --------- | --------------------------------------------------------------------------------------------------------------- |
| Compass     | 10 coins? | One-time use. Points to a random undiscovered island (not nearest). Disappears after that island is discovered. |
| Speed Boost | 5 coins?  | Temporary speed increase                                                                                        |
| Health Pack | 15 coins? | Restore health (battle stage only)                                                                              |
| TBD         |           | More items to be added                                                                                          |

## Game Progression

1. **Exploration Stage** (Dinghy)
   - Discover all TanStack library islands
   - Collect coins for speed boost
   - World boundary: 85 units

2. **Battle Stage** (Ship) - unlocked after all libraries discovered
   - Upgrade to battle ship with cannons
   - Partner islands spawn in outer ring (90-160 units)
   - AI opponent ships appear
   - World boundary expands to 180 units
   - Press SPACE to fire cannons
   - Discover partner islands to gain upgrades

3. **Showcase Stage** (Future) - unlocked after all partners discovered
   - Top 10 showcase islands spawn in outermost ring
   - Final challenge / completion state
