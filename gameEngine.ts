import { 
    GameState, GamePhase, EnemyType, WeaponType, Entity, 
    Vector2, Enemy, Projectile, Particle, FloatingText, XpOrb,
    Asteroid, Player, Shockwave
} from './types';
import { 
    COLORS, SCREEN_WIDTH, SCREEN_HEIGHT, ENEMY_STATS, WEAPON_STATS, 
    SCAN_DURATION_SEC, WARP_DURATION_SEC, TARGET_CRYSTALS, PLAYER_CONFIG,
    ASTEROID_CONFIG, TEXT_CONFIG
} from './constants';

// --- Math Helpers ---
const dist = (v1: Vector2, v2: Vector2) => Math.sqrt(Math.pow(v2.x - v1.x, 2) + Math.pow(v2.y - v1.y, 2));
const angle = (v1: Vector2, v2: Vector2) => Math.atan2(v2.y - v1.y, v2.x - v1.x);

// Check if a line segment between start and end intersects with any asteroid
export const isLineBlocked = (start: Vector2, end: Vector2, asteroids: Asteroid[]): boolean => {
    for (const ast of asteroids) {
        // Vector math to find distance from point (ast center) to line segment (start-end)
        const l2 = Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2);
        if (l2 === 0) continue;
        
        const t = ((ast.position.x - start.x) * (end.x - start.x) + (ast.position.y - start.y) * (end.y - start.y)) / l2;
        const tClamped = Math.max(0, Math.min(1, t));
        
        const projX = start.x + tClamped * (end.x - start.x);
        const projY = start.y + tClamped * (end.y - start.y);
        
        const distSq = Math.pow(ast.position.x - projX, 2) + Math.pow(ast.position.y - projY, 2);
        
        // Check if distance is less than radius
        // REMOVED +10 buffer to match visual shadow exactly
        if (distSq < Math.pow(ast.radius, 2)) {
            return true;
        }
    }
    return false;
};

// --- Initialization ---
export const createInitialState = (): GameState => ({
    phase: GamePhase.INTRO, // Start at INTRO
    player: {
        id: 'player',
        position: { x: SCREEN_WIDTH / 2, y: SCREEN_HEIGHT / 2 },
        velocity: { x: 0, y: 0 },
        radius: 20,
        color: COLORS.player,
        rotation: 0,
        hp: PLAYER_CONFIG.baseHp,
        maxHp: PLAYER_CONFIG.baseHp,
        xp: 0,
        maxXp: PLAYER_CONFIG.baseXp, 
        level: 1,
        crystals: 0,
        weapons: {
            [WeaponType.MACHINE_GUN]: { ...WEAPON_STATS.MACHINE_GUN, level: 1, maxCooldown: WEAPON_STATS.MACHINE_GUN.cooldown },
            [WeaponType.MISSILE]: { ...WEAPON_STATS.MISSILE, level: 0, maxCooldown: WEAPON_STATS.MISSILE.cooldown }, // Locked
            [WeaponType.LASER]: { ...WEAPON_STATS.LASER, level: 0, maxCooldown: WEAPON_STATS.LASER.cooldown }, // Locked
        }
    },
    enemies: [],
    projectiles: [],
    particles: [],
    asteroids: [],
    floatingTexts: [],
    xpOrbs: [],
    shockwaves: [],
    cameraShake: 0,
    scanTimer: 0,
    warpTimer: 0,
    scanTargetId: null,
    waveTimer: 0,
    magnetTimer: 0,
    justLeveledUp: false,
    levelUpQueued: false,
    justScanned: false
});

// --- Spawning Logic ---
const spawnEnemy = (state: GameState, forceType?: EnemyType, position?: Vector2) => {
    let x = 0, y = 0;
    
    if (position) {
        x = position.x;
        y = position.y;
    } else {
        const edge = Math.floor(Math.random() * 4); // 0: top, 1: right, 2: bottom, 3: left
        const buffer = 80;

        if (edge === 0) { x = Math.random() * SCREEN_WIDTH; y = -buffer; }
        else if (edge === 1) { x = SCREEN_WIDTH + buffer; y = Math.random() * SCREEN_HEIGHT; }
        else if (edge === 2) { x = Math.random() * SCREEN_WIDTH; y = SCREEN_HEIGHT + buffer; }
        else { x = -buffer; y = Math.random() * SCREEN_HEIGHT; }
    }

    let type = EnemyType.SWARM;
    if (forceType) {
        type = forceType;
    } else {
        const rand = Math.random();
        // Small chance for BOSS if not already present
        const hasBoss = state.enemies.some(e => e.type === EnemyType.BOSS);
        if (!hasBoss && rand > 0.99 && state.scanTimer > 20) {
            type = EnemyType.BOSS;
        } else if (rand > 0.8) type = EnemyType.TANK;
        else if (rand > 0.6) type = EnemyType.RANGED;
    }

    const stats = ENEMY_STATS[type];

    const enemy: Enemy = {
        id: `e-${Date.now()}-${Math.random()}`,
        position: { x, y },
        velocity: { x: 0, y: 0 },
        rotation: 0,
        type,
        radius: stats.radius,
        color: type === EnemyType.BOSS ? COLORS.enemyBoss : (type === EnemyType.TANK ? COLORS.enemyTank : type === EnemyType.RANGED ? COLORS.enemyRanged : COLORS.enemySwarm),
        hp: stats.hp,
        maxHp: stats.hp,
        attackCooldown: Math.random() * 200, 
    };
    state.enemies.push(enemy);
};

const spawnAsteroids = (state: GameState) => {
    state.asteroids = [];
    const min = ASTEROID_CONFIG.min;
    const max = ASTEROID_CONFIG.max;
    const count = min + Math.floor(Math.random() * (max - min + 1));

    for (let i = 0; i < count; i++) {
        let pos = { x: 0, y: 0 };
        let d = 0;
        do {
            pos = { x: Math.random() * SCREEN_WIDTH, y: Math.random() * SCREEN_HEIGHT };
            d = dist(pos, state.player.position);
        } while (d < 150);

        state.asteroids.push({
            id: `ast-${i}`,
            position: pos,
            velocity: { x: (Math.random() - 0.5) * 0.2, y: (Math.random() - 0.5) * 0.2 },
            radius: 20 + Math.random() * 30,
            rotation: Math.random() * Math.PI * 2,
            color: COLORS.asteroid,
            isTarget: false,
            isScanned: false
        });
    }
};

const spawnParticles = (state: GameState, pos: Vector2, count: number, color: string) => {
    for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 5 + 2; 
        state.particles.push({
            id: `p-${Math.random()}`,
            position: { ...pos },
            velocity: { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed },
            radius: Math.random() * 4 + 1,
            color,
            rotation: 0,
            life: 40 + Math.random() * 20,
            maxLife: 60,
            scale: 1
        });
    }
};

const addFloatingText = (state: GameState, text: string, pos: Vector2, color: string, size: number = 14) => {
    state.floatingTexts.push({
        id: `ft-${Math.random()}`,
        text,
        position: { x: pos.x, y: pos.y - 10 },
        color,
        life: 60,
        size
    });
};

const triggerShockwave = (state: GameState, origin: Vector2) => {
    state.shockwaves.push({
        position: { ...origin },
        radius: 10,
        maxRadius: Math.max(SCREEN_WIDTH, SCREEN_HEIGHT) * 1.2,
        speed: 25, // Fast expansion
        color: COLORS.shockwave
    });
    state.cameraShake = 30;
};

// --- Update Loop ---
export const updateGame = (state: GameState): GameState => {
    // Add INTRO to the pause list
    if (state.phase === GamePhase.INTRO || state.phase === GamePhase.LEVEL_UP || state.phase === GamePhase.GAME_OVER || state.phase === GamePhase.VICTORY) return state;

    const { player } = state;

    // 1. Timers
    if (state.phase === GamePhase.WARPING) {
        state.warpTimer -= 1 / 60;
        if (state.warpTimer <= 0) {
            state.phase = GamePhase.IDLE;
            spawnAsteroids(state);
            state.enemies = []; // Clear enemies on warp
            state.xpOrbs = [];
            state.projectiles = [];
            state.shockwaves = [];
            state.levelUpQueued = false;
        }
    } else if (state.phase === GamePhase.SCANNING) {
        state.scanTimer += 1 / 60;
        state.waveTimer++;

        const spawnRate = Math.max(10, (100 - (state.scanTimer)) * 0.5); 
        
        if (state.waveTimer > spawnRate) {
            spawnEnemy(state);
            state.waveTimer = 0;
        }

        // Scan Completion
        if (state.scanTimer >= SCAN_DURATION_SEC) {
            state.phase = GamePhase.IDLE;
            state.player.crystals++;
            state.justScanned = true; // Trigger UI celebration
            
            // Mark target
            const targetIndex = state.asteroids.findIndex(a => a.id === state.scanTargetId);
            if (targetIndex !== -1) {
                const target = state.asteroids[targetIndex];
                // TRIGGER EMP from the asteroid
                triggerShockwave(state, target.position);
                
                // Spawn debris particles for the destroyed asteroid
                spawnParticles(state, target.position, 20, COLORS.asteroid);

                // REMOVE ASTEROID
                state.asteroids.splice(targetIndex, 1);
            }

            state.scanTargetId = null;
            state.asteroids.forEach(a => { 
                a.isTarget = false; 
                // Color reset not strictly needed if removed, but good safety
                if (!a.isScanned) a.color = COLORS.asteroid; 
            });
        }
    }

    // 2. Player Logic (Auto Fire)
    let nearestVisible: Enemy | null = null;
    let minDstVisible = Infinity;
    
    let nearestAny: Enemy | null = null;
    let minDstAny = Infinity;

    state.enemies.forEach(e => {
        const d = dist(player.position, e.position);
        
        // Check for visible target (for MG / Laser)
        if (!isLineBlocked(player.position, e.position, state.asteroids)) {
            if (d < minDstVisible) {
                minDstVisible = d;
                nearestVisible = e;
            }
        }

        // Check for ANY target (for Missiles)
        if (d < minDstAny) {
            minDstAny = d;
            nearestAny = e;
        }
    });

    // Rotation Priority: Visible > Hidden (if missile available) > Keep Rotation
    if (nearestVisible) {
        player.rotation = angle(player.position, nearestVisible.position);
    } else if (nearestAny && player.weapons[WeaponType.MISSILE].level > 0) {
        player.rotation = angle(player.position, nearestAny.position);
    }

    // Fire Weapons
    Object.entries(player.weapons).forEach(([key, weapon]) => {
        const wType = key as WeaponType;
        
        // Missiles can target anyone, others need Line of Sight
        const target = wType === WeaponType.MISSILE ? nearestAny : nearestVisible;

        if (target && weapon.level > 0 && weapon.cooldown <= 0) {
            const distToTarget = dist(player.position, target.position);
            
            if (distToTarget <= weapon.range) {
                if (wType === WeaponType.MACHINE_GUN) {
                    state.projectiles.push({
                        id: `p-${Math.random()}`,
                        position: { ...player.position },
                        velocity: { 
                            x: Math.cos(player.rotation) * 10, 
                            y: Math.sin(player.rotation) * 10 
                        },
                        rotation: player.rotation,
                        radius: 8, 
                        color: WEAPON_STATS.MACHINE_GUN.color,
                        damage: weapon.damage,
                        duration: 60,
                        isEnemy: false,
                        type: 'BULLET'
                    });
                    weapon.cooldown = weapon.maxCooldown;
                } else if (wType === WeaponType.MISSILE) {
                         state.projectiles.push({
                            id: `m-${Math.random()}`,
                            position: { ...player.position },
                            velocity: { 
                                x: Math.cos(player.rotation + (Math.random()-0.5)) * 2, 
                                y: Math.sin(player.rotation + (Math.random()-0.5)) * 2 
                            },
                            rotation: player.rotation,
                            radius: 14, 
                            color: WEAPON_STATS.MISSILE.color,
                            damage: weapon.damage,
                            duration: 180,
                            isEnemy: false,
                            targetId: target.id, // Target the hidden/visible enemy
                            type: 'MISSILE'
                        });
                        weapon.cooldown = weapon.maxCooldown;
                    } else if (wType === WeaponType.LASER) {
                        target.hp -= weapon.damage;
                        spawnParticles(state, target.position, 1, COLORS.player);
                         if (Math.random() > 0.8) {
                            addFloatingText(state, Math.floor(weapon.damage).toString(), target.position, COLORS.textDamage);
                        }
                        weapon.cooldown = weapon.maxCooldown;
                    }
                }
            } else {
                weapon.cooldown--;
            }
        });

    // 3. Enemies
    state.enemies.forEach(e => {
        // Boss Logic: Spawner
        if (e.type === EnemyType.BOSS) {
            e.attackCooldown--;
            if (e.attackCooldown <= 0) {
                e.attackCooldown = 180; // 3 seconds
                // Spawn 3 swarm enemies around boss
                for(let i=0; i<3; i++) {
                    spawnEnemy(state, EnemyType.SWARM, { 
                        x: e.position.x + (Math.random()-0.5)*50, 
                        y: e.position.y + (Math.random()-0.5)*50 
                    });
                }
            }
        }

        const distToPlayer = dist(e.position, player.position);
        
        // Ranged Logic Check - Stop to shoot IF close enough AND has LOS
        const hasLineOfSight = !isLineBlocked(e.position, player.position, state.asteroids);
        
        if (e.type === EnemyType.RANGED && distToPlayer < 300 && hasLineOfSight) {
            e.attackCooldown--;
            if (e.attackCooldown <= 0) {
                e.attackCooldown = 300; 
                const ang = angle(e.position, player.position);
                state.projectiles.push({
                    id: `ep-${Math.random()}`,
                    position: { ...e.position },
                    velocity: { x: Math.cos(ang) * 4, y: Math.sin(ang) * 4 },
                    rotation: ang,
                    radius: 5,
                    color: '#ff0000',
                    damage: 1, 
                    duration: 120,
                    isEnemy: true,
                    type: 'ENEMY_ORB'
                });
            }
        } else {
            // MOVEMENT (Steering / Pathfinding)
            
            // 1. Seek Player
            const dx = player.position.x - e.position.x;
            const dy = player.position.y - e.position.y;
            // Normalize
            let dirX = dx / distToPlayer;
            let dirY = dy / distToPlayer;
            
            // 2. Avoid Asteroids (Repulsion)
            let avoidX = 0;
            let avoidY = 0;
            
            state.asteroids.forEach(ast => {
                const distToAst = dist(e.position, ast.position);
                const detectionRange = ast.radius + e.radius + 60; // Start avoiding before hitting
                
                if (distToAst < detectionRange) {
                    const pushAng = angle(ast.position, e.position); // Vector away from asteroid
                    // Stronger repulsion the closer they are
                    const force = (detectionRange - distToAst) / detectionRange; 
                    avoidX += Math.cos(pushAng) * force * 2.5; // Multiplier for avoidance strength
                    avoidY += Math.sin(pushAng) * force * 2.5;
                }
            });

            // Combine vectors
            let finalX = dirX + avoidX;
            let finalY = dirY + avoidY;
            
            // Re-normalize and apply speed
            const finalLen = Math.hypot(finalX, finalY);
            if (finalLen > 0) {
                finalX = finalX / finalLen;
                finalY = finalY / finalLen;
            }
            
            const speed = ENEMY_STATS[e.type].speed;
            e.velocity.x = finalX * speed;
            e.velocity.y = finalY * speed;
            
            e.position.x += e.velocity.x;
            e.position.y += e.velocity.y;
            
            // Face movement direction
            if (finalLen > 0.1) {
                e.rotation = Math.atan2(finalY, finalX);
            }
        }

        // Collision with Player
        if (dist(e.position, player.position) < e.radius + player.radius) {
            player.hp -= 0.5; // Contact damage
            state.cameraShake = 2;
        }
    });

    // 4. Projectiles
    for (let i = state.projectiles.length - 1; i >= 0; i--) {
        const p = state.projectiles[i];
        
        // Homing Logic for Missiles
        if (p.type === 'MISSILE' && p.targetId) {
            const target = state.enemies.find(e => e.id === p.targetId);
            if (target) {
                const ang = angle(p.position, target.position);
                const currentAng = Math.atan2(p.velocity.y, p.velocity.x);
                let diff = ang - currentAng;
                while (diff < -Math.PI) diff += Math.PI * 2;
                while (diff > Math.PI) diff -= Math.PI * 2;
                const turnRate = 0.1;
                const newAng = currentAng + Math.max(-turnRate, Math.min(turnRate, diff));
                const speed = 4;
                p.velocity.x = Math.cos(newAng) * speed;
                p.velocity.y = Math.sin(newAng) * speed;
            }
        }

        p.position.x += p.velocity.x;
        p.position.y += p.velocity.y;
        p.duration--;

        let hit = false;
        
        // Projectiles hit asteroids too (simple collision)
        // MISSILES bypass obstacles
        if (!p.isEnemy && p.type !== 'MISSILE') {
            for (const ast of state.asteroids) {
                if (dist(p.position, ast.position) < ast.radius + p.radius) {
                    hit = true;
                    spawnParticles(state, p.position, 3, COLORS.asteroid);
                    break;
                }
            }
        }
        
        if (!hit) {
            if (p.isEnemy) {
                if (dist(p.position, player.position) < player.radius + p.radius) {
                    player.hp -= p.damage;
                    state.cameraShake = 5;
                    addFloatingText(state, `-${p.damage}`, player.position, '#ff0000');
                    hit = true;
                }
            } else {
                for (const e of state.enemies) {
                    if (dist(p.position, e.position) < e.radius + p.radius) {
                        e.hp -= p.damage;
                        hit = true;
                        addFloatingText(state, Math.floor(p.damage).toString(), e.position, '#fff');
                        spawnParticles(state, p.position, 3, '#fff');
                        
                        if (p.type === 'MISSILE') {
                            state.enemies.forEach(subE => {
                                if (dist(p.position, subE.position) < 80) {
                                    subE.hp -= p.damage * 0.5;
                                }
                            });
                            state.cameraShake = 3;
                        }
                        break; 
                    }
                }
            }
        }

        if (hit || p.duration <= 0) {
            state.projectiles.splice(i, 1);
        }
    }

    // 5. Shockwaves (EMP)
    const isShockwaveActive = state.shockwaves.length > 0;
    
    for (let i = state.shockwaves.length - 1; i >= 0; i--) {
        const wave = state.shockwaves[i];
        wave.radius += wave.speed;
        
        // Check collision with enemies
        for (const e of state.enemies) {
            const d = dist(e.position, wave.position);
            // Hit if enemy is within the ring roughly
            if (d < wave.radius && d > wave.radius - wave.speed * 2) {
                 e.hp = 0; // Instant kill
                 addFloatingText(state, TEXT_CONFIG.gameplay.emp, e.position, COLORS.shockwave, 20);
            }
        }

        if (wave.radius > wave.maxRadius) {
            state.shockwaves.splice(i, 1);
            // After EMP clears, check victory condition
            if (state.player.crystals >= TARGET_CRYSTALS) {
                state.phase = GamePhase.VICTORY;
            }
        }
    }

    // 6. Cleanup Dead Enemies
    for (let i = state.enemies.length - 1; i >= 0; i--) {
        const e = state.enemies[i];
        if (e.hp <= 0) {
            const isBoss = e.type === EnemyType.BOSS;
            spawnParticles(state, e.position, isBoss ? 100 : 30, e.color); 
            // Drop XP
            // If EMP is active, immediately magnetize the dropped orb
            state.xpOrbs.push({
                id: `xp-${Math.random()}`,
                position: { ...e.position },
                velocity: { x: 0, y: 0 },
                radius: isBoss ? 12 : 4,
                color: COLORS.xpOrb,
                rotation: 0,
                value: isBoss ? 500 : 10, // Boss drops massive XP
                isMagnetized: isShockwaveActive || state.justScanned
            });
            state.enemies.splice(i, 1);
            
            if (isBoss) {
                 addFloatingText(state, TEXT_CONFIG.gameplay.bossDefeated, e.position, '#ffd700', 40);
                 state.cameraShake = 50;
            }
        }
    }

    // 7. XP Orbs (Magnetic)
    state.magnetTimer++;
    if (state.magnetTimer > 60) {
        state.magnetTimer = 0;
        const distantOrbs = state.xpOrbs.filter(o => !o.isMagnetized && dist(o.position, player.position) > 200);
        if (distantOrbs.length > 0) {
            const target = distantOrbs[Math.floor(Math.random() * distantOrbs.length)];
            target.isMagnetized = true;
        }
    }

    // Collect ALL XP if scan just finished (EMP logic makes them drop, now we need to suck them in fast)
    // Continuously magnetize if shockwaves are present
    if (state.justScanned || isShockwaveActive) {
         state.xpOrbs.forEach(o => o.isMagnetized = true);
    }

    for (let i = state.xpOrbs.length - 1; i >= 0; i--) {
        const xp = state.xpOrbs[i];
        const d = dist(xp.position, player.position);
        
        if (d < PLAYER_CONFIG.magnetRange || xp.isMagnetized) {
            const ang = angle(xp.position, player.position);
            const speed = xp.isMagnetized ? PLAYER_CONFIG.magnetSpeed : PLAYER_CONFIG.passiveSpeed; 
            xp.position.x += Math.cos(ang) * speed;
            xp.position.y += Math.sin(ang) * speed;
            
            if (d < 20) {
                player.xp += xp.value;
                // Check level up (using while for potential multi-level gain)
                while (player.xp >= player.maxXp) {
                    player.xp -= player.maxXp; 
                    // Non-linear scaling
                    player.maxXp = Math.floor(player.maxXp * PLAYER_CONFIG.xpGrowth); 
                    player.level++;
                    player.maxHp += PLAYER_CONFIG.hpGrowth;
                    player.hp = player.maxHp;
                    // Queue the level up trigger, do NOT pause yet if EMP is active
                    state.levelUpQueued = true; 
                }
                state.xpOrbs.splice(i, 1);
            }
        }
    }

    // 8. Particles & Text
    state.particles.forEach((p, i) => {
        p.position.x += p.velocity.x;
        p.position.y += p.velocity.y;
        p.life--;
        p.scale = p.life / p.maxLife;
        if (p.life <= 0) state.particles.splice(i, 1);
    });

    state.floatingTexts.forEach((t, i) => {
        t.position.y -= 0.5;
        t.life--;
        if (t.life <= 0) state.floatingTexts.splice(i, 1);
    });

    // 9. Process Queued Level Up
    if (state.levelUpQueued) {
        // Only trigger the UI Pause if no active shockwaves.
        // This lets the player enjoy the EMP explosion visual before the menu pops up.
        if (state.shockwaves.length === 0) {
            state.justLeveledUp = true;
            state.levelUpQueued = false;
        }
    }

    // 10. Game Over Check
    if (player.hp <= 0) {
        state.phase = GamePhase.GAME_OVER;
    }

    // Camera Shake Decay
    if (state.cameraShake > 0) state.cameraShake *= 0.9;
    if (state.cameraShake < 0.5) state.cameraShake = 0;

    return state;
};