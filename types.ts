export enum GamePhase {
    INTRO = 'INTRO',     // Story intro
    IDLE = 'IDLE',       // Waiting to warp
    WARPING = 'WARPING', // Countdown to jump
    SCANNING = 'SCANNING', // Active combat/mining
    LEVEL_UP = 'LEVEL_UP', // Paused for upgrade
    GAME_OVER = 'GAME_OVER',
    VICTORY = 'VICTORY'
}

export enum EnemyType {
    TANK = 'TANK',      // Type A: Slow, Tanky
    RANGED = 'RANGED',  // Type B: Stops to shoot
    SWARM = 'SWARM',    // Type C: Fast, Weak
    BOSS = 'BOSS'       // New: Massive, Spawner
}

export enum WeaponType {
    MACHINE_GUN = 'MACHINE_GUN',
    MISSILE = 'MISSILE',
    LASER = 'LASER'
}

export interface Vector2 {
    x: number;
    y: number;
}

export interface Entity {
    id: string;
    position: Vector2;
    velocity: Vector2;
    radius: number;
    color: string;
    rotation: number;
}

export interface Player extends Entity {
    hp: number;
    maxHp: number;
    xp: number;
    maxXp: number;
    level: number;
    crystals: number; // Victory condition
    weapons: {
        [key in WeaponType]: {
            level: number;
            cooldown: number; // Current cooldown
            maxCooldown: number; // Fire rate
            damage: number;
            range: number;
        }
    };
}

export interface Enemy extends Entity {
    type: EnemyType;
    hp: number;
    maxHp: number;
    attackCooldown: number;
}

export interface Projectile extends Entity {
    damage: number;
    targetId?: string; // For homing missiles
    duration: number; // Lifespan
    isEnemy: boolean;
    type: 'BULLET' | 'MISSILE' | 'LASER_BEAM' | 'ENEMY_ORB';
}

export interface Particle extends Entity {
    life: number;
    maxLife: number;
    scale: number;
}

export interface Asteroid extends Entity {
    isTarget: boolean;
    isScanned: boolean;
}

export interface FloatingText {
    id: string;
    text: string;
    position: Vector2;
    life: number;
    color: string;
    size: number;
}

export interface XpOrb extends Entity {
    value: number;
    isMagnetized?: boolean;
}

export interface Shockwave {
    position: Vector2;
    radius: number;
    maxRadius: number;
    speed: number;
    color: string;
}

export interface GameState {
    phase: GamePhase;
    player: Player;
    enemies: Enemy[];
    projectiles: Projectile[];
    particles: Particle[];
    asteroids: Asteroid[];
    floatingTexts: FloatingText[];
    xpOrbs: XpOrb[];
    shockwaves: Shockwave[]; // New visual element
    cameraShake: number;
    
    // Logic State
    scanTimer: number; // 0 to 60
    warpTimer: number; // 0 to 10
    scanTargetId: string | null;
    waveTimer: number; // For enemy spawning
    magnetTimer: number; // For auto-collecting XP
    
    // UI Triggers
    justLeveledUp: boolean; // For triggering animation
    levelUpQueued: boolean; // Delayed trigger (waits for effects to clear)
    justScanned: boolean; // For triggering animation
}

export type UpgradeOption = {
    id: string;
    title: string;
    description: string;
    rarity: 'COMMON' | 'RARE' | 'LEGENDARY';
    apply: (state: GameState) => void;
}