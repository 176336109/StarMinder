import React, { useEffect, useRef, useState, useCallback } from 'react';
import { 
    GameState, GamePhase, WeaponType, UpgradeOption, EnemyType, Vector2, Asteroid
} from './types';
import { 
    COLORS, SCREEN_WIDTH, SCREEN_HEIGHT, FPS, SCAN_DURATION_SEC, 
    WARP_DURATION_SEC, TARGET_CRYSTALS, TEXT_CONFIG, ASTEROID_CONFIG 
} from './constants';
import { createInitialState, updateGame, isLineBlocked } from './gameEngine';
import { Zap, Target, Shield, Skull, TrendingUp, Heart, MousePointerClick, AlertTriangle } from 'lucide-react';

// Shadow rendering helper
const drawShadows = (ctx: CanvasRenderingContext2D, playerPos: Vector2, asteroids: Asteroid[]) => {
    ctx.save();
    
    // VISUAL UPDATE: Make Fog of War distinct
    // Background is black (#000), so we make the fog a dark grey/slate color 
    // to represent "unscanned/interference zones".
    ctx.fillStyle = 'rgba(30, 41, 59, 0.95)'; // Slate-800, distinct from black space
    
    // Add a border to the fog to make the cone edges sharp and visible
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.3)'; // Slate-400, faint line
    ctx.lineWidth = 2;

    asteroids.forEach(ast => {
        const dx = ast.position.x - playerPos.x;
        const dy = ast.position.y - playerPos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist <= ast.radius) return; 

        // Angle from player to asteroid center
        const angleToCenter = Math.atan2(dy, dx);
        
        // Angular half-width of the asteroid as seen by player
        const angleOffset = Math.asin(ast.radius / dist);
        
        // Tangent points on the asteroid
        const tangentDist = Math.sqrt(dist * dist - ast.radius * ast.radius);
        
        const a1 = angleToCenter - angleOffset;
        const a2 = angleToCenter + angleOffset;
        
        // Start points (tangents on the asteroid)
        const p1 = {
            x: playerPos.x + Math.cos(a1) * tangentDist,
            y: playerPos.y + Math.sin(a1) * tangentDist
        };
        const p2 = {
            x: playerPos.x + Math.cos(a2) * tangentDist,
            y: playerPos.y + Math.sin(a2) * tangentDist
        };
        
        // Project "far" points well off-screen
        const SHADOW_LENGTH = 3000;
        const p3 = {
             x: playerPos.x + Math.cos(a1) * SHADOW_LENGTH,
             y: playerPos.y + Math.sin(a1) * SHADOW_LENGTH
        };
        const p4 = {
             x: playerPos.x + Math.cos(a2) * SHADOW_LENGTH,
             y: playerPos.y + Math.sin(a2) * SHADOW_LENGTH
        };
        
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p3.x, p3.y);
        ctx.lineTo(p4.x, p4.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.closePath();
        
        ctx.fill();
        ctx.stroke();
    });
    ctx.restore();
};

export default function App() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const requestRef = useRef<number>(0);
    const gameState = useRef<GameState>(createInitialState());
    
    // Time tracking for fixed time step
    const lastTimeRef = useRef<number>(0);
    const accumulatorRef = useRef<number>(0);
    
    // Animations / Overlays
    const [showLevelUpAnim, setShowLevelUpAnim] = useState(false);
    const [showScanCompleteAnim, setShowScanCompleteAnim] = useState(false);
    const [showScanWarning, setShowScanWarning] = useState(false);

    // React state for UI overlays (detached from 60fps loop to save perf)
    const [uiState, setUiState] = useState<{
        phase: GamePhase;
        hp: number;
        maxHp: number;
        xp: number;
        maxXp: number;
        level: number;
        crystals: number;
        scanProgress: number;
        warpProgress: number;
    }>({
        phase: GamePhase.INTRO,
        hp: 100, maxHp: 100, xp: 0, maxXp: 100, level: 1, crystals: 0,
        scanProgress: 0, warpProgress: 0
    });

    // --- Rendering ---
    const draw = (ctx: CanvasRenderingContext2D, state: GameState) => {
        // Clear
        ctx.fillStyle = COLORS.background;
        ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);

        // Shake
        ctx.save();
        if (state.cameraShake > 0) {
            ctx.translate((Math.random()-0.5)*state.cameraShake, (Math.random()-0.5)*state.cameraShake);
        }

        // 1. Stars (Background)
        ctx.fillStyle = '#fff';
        const isWarping = state.phase === GamePhase.WARPING;
        for (let i=0; i<100; i++) {
            const x = (Math.sin(i * 123) * SCREEN_WIDTH + SCREEN_WIDTH) % SCREEN_WIDTH;
            const y = (Math.cos(i * 321) * SCREEN_HEIGHT + SCREEN_HEIGHT) % SCREEN_HEIGHT;
            
            if (isWarping) {
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(SCREEN_WIDTH/2, SCREEN_HEIGHT/2);
                ctx.lineTo(x, y);
                ctx.stroke();
            } else {
                ctx.fillRect(x, y, 2, 2);
            }
        }

        // 2. FOG OF WAR (Shadows)
        // Drawn BEFORE entities but AFTER background stars
        drawShadows(ctx, state.player.position, state.asteroids);

        // 3. Asteroids
        state.asteroids.forEach(a => {
            ctx.fillStyle = a.color;
            ctx.beginPath();
            ctx.arc(a.position.x, a.position.y, a.radius, 0, Math.PI * 2);
            ctx.fill();

            // Labels
            ctx.font = 'bold 12px monospace';
            ctx.textAlign = 'center';
            if (a.isScanned) {
                 ctx.fillStyle = '#64748b';
                 ctx.fillText(TEXT_CONFIG.gameplay.scanned, a.position.x, a.position.y - a.radius - 8);
            } else if (state.phase === GamePhase.IDLE) {
                 ctx.fillStyle = '#4ade80';
                 ctx.fillText(TEXT_CONFIG.gameplay.scanable, a.position.x, a.position.y - a.radius - 8);
                 
                 ctx.strokeStyle = 'rgba(74, 222, 128, 0.5)';
                 ctx.lineWidth = 1;
                 ctx.stroke();
            }

            if (a.isTarget) {
                // Draw target box
                ctx.strokeStyle = COLORS.asteroidTarget;
                ctx.lineWidth = 2;
                const s = a.radius * 2.5;
                ctx.strokeRect(a.position.x - s/2, a.position.y - s/2, s, s);
                
                // Progress Bar above asteroid
                const w = 60;
                const h = 6;
                const pct = state.scanTimer / SCAN_DURATION_SEC;
                ctx.fillStyle = '#000';
                ctx.fillRect(a.position.x - w/2, a.position.y - a.radius - 20, w, h);
                ctx.fillStyle = COLORS.asteroidTarget;
                ctx.fillRect(a.position.x - w/2, a.position.y - a.radius - 20, w * pct, h);
                
                ctx.fillStyle = COLORS.asteroidTarget;
                ctx.fillText(TEXT_CONFIG.gameplay.scanning, a.position.x, a.position.y - a.radius - 28);
            }
        });

        // 4. XP Orbs
        state.xpOrbs.forEach(orb => {
            ctx.fillStyle = orb.color;
            ctx.beginPath();
            ctx.arc(orb.position.x, orb.position.y, orb.radius, 0, Math.PI * 2);
            ctx.fill();
        });

        // 5. Enemies
        state.enemies.forEach(e => {
            // CHECK VISIBILITY (Line of Sight)
            const isBlocked = isLineBlocked(state.player.position, e.position, state.asteroids);
            
            ctx.save();
            ctx.translate(e.position.x, e.position.y);
            
            if (isBlocked) {
                // --- HIDDEN ENEMY: SIGNAL ONLY ---
                
                // Bobbing animation for the signal
                const offset = Math.sin(Date.now() / 150) * 3;
                ctx.translate(0, offset);

                // 1. Scanner Bracket (Tech look)
                ctx.strokeStyle = '#eab308'; // Yellow
                ctx.lineWidth = 2;
                const s = 15;
                const gap = 5;
                
                ctx.beginPath();
                // Top-Left
                ctx.moveTo(-s, -s + 10); ctx.lineTo(-s, -s); ctx.lineTo(-s + 10, -s);
                // Top-Right
                ctx.moveTo(s, -s + 10); ctx.lineTo(s, -s); ctx.lineTo(s - 10, -s);
                // Bottom-Left
                ctx.moveTo(-s, s - 10); ctx.lineTo(-s, s); ctx.lineTo(-s + 10, s);
                // Bottom-Right
                ctx.moveTo(s, s - 10); ctx.lineTo(s, s); ctx.lineTo(s - 10, s);
                ctx.stroke();

                // 2. Warning Triangle
                ctx.beginPath();
                ctx.moveTo(0, -10);
                ctx.lineTo(10, 8);
                ctx.lineTo(-10, 8);
                ctx.closePath();
                ctx.fillStyle = 'rgba(234, 179, 8, 0.8)'; 
                ctx.fill();

                // 3. Exclamation
                ctx.fillStyle = '#000';
                ctx.font = 'bold 14px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('!', 0, 2);

            } else {
                // --- VISIBLE ENEMY ---
                ctx.rotate(e.rotation);
                ctx.fillStyle = e.color;
                
                // Draw shape based on type
                if (e.type === EnemyType.BOSS) {
                    ctx.beginPath();
                    const sides = 8;
                    for (let i = 0; i < sides; i++) {
                        const angle = (i / sides) * Math.PI * 2;
                        const r = e.radius * (1 + Math.sin(Date.now() / 200 + i) * 0.1); 
                        ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
                    }
                    ctx.closePath();
                    ctx.fill();
                    ctx.fillStyle = '#000';
                    ctx.beginPath();
                    ctx.arc(0, 0, e.radius * 0.4, 0, Math.PI*2);
                    ctx.fill();
                } else if (e.type === EnemyType.TANK) {
                    ctx.fillRect(-e.radius, -e.radius, e.radius*2, e.radius*2); 
                } else if (e.type === EnemyType.RANGED) {
                     ctx.beginPath();
                     ctx.moveTo(e.radius, 0);
                     ctx.lineTo(-e.radius, e.radius);
                     ctx.lineTo(-e.radius, -e.radius);
                     ctx.fill(); 
                } else {
                    ctx.beginPath();
                    ctx.arc(0, 0, e.radius, 0, Math.PI*2);
                    ctx.fill(); 
                }
            }
            ctx.restore();

            // HP Bar (Only show if visible and damaged)
            if (!isBlocked && (e.type === EnemyType.TANK || e.type === EnemyType.BOSS) && e.hp < e.maxHp) {
                const w = e.type === EnemyType.BOSS ? 120 : 40;
                ctx.fillStyle = 'red';
                ctx.fillRect(e.position.x - w/2, e.position.y - e.radius - 10, w * (e.hp / e.maxHp), 6);
            }
        });

        // 6. Player
        const p = state.player;
        ctx.save();
        ctx.translate(p.position.x, p.position.y);
        ctx.rotate(p.rotation);
        
        ctx.fillStyle = p.color;
        // Ship Body
        ctx.beginPath();
        ctx.moveTo(20, 0);
        ctx.lineTo(-15, 15);
        ctx.lineTo(-10, 0);
        ctx.lineTo(-15, -15);
        ctx.closePath();
        ctx.fill();
        
        if (p.weapons[WeaponType.MISSILE].level > 0) {
            ctx.fillStyle = '#f97316';
            ctx.fillRect(-5, -20, 10, 5);
            ctx.fillRect(-5, 15, 10, 5);
        }

        if (state.phase === GamePhase.SCANNING) {
            ctx.strokeStyle = 'rgba(59, 130, 246, 0.1)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(0, 0, 150, 0, Math.PI*2);
            ctx.stroke();
        }

        ctx.restore();

        // 7. Projectiles
        state.projectiles.forEach(proj => {
            ctx.fillStyle = proj.color;
            ctx.shadowBlur = 10;
            ctx.shadowColor = proj.color;
            
            ctx.beginPath();
            ctx.arc(proj.position.x, proj.position.y, proj.radius, 0, Math.PI*2);
            ctx.fill();

            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.arc(proj.position.x, proj.position.y, proj.radius * 0.5, 0, Math.PI*2);
            ctx.fill();
            
            ctx.shadowBlur = 0;
            ctx.shadowColor = 'transparent';
        });
        
        // Laser Beams
        if (state.phase === GamePhase.SCANNING) {
             if (state.player.weapons[WeaponType.LASER].level > 0) {
                 let nearest = null;
                 let minD = Infinity;
                 state.enemies.forEach(e => {
                     // Can only laser visible enemies
                     if (isLineBlocked(p.position, e.position, state.asteroids)) return;

                     const d = Math.hypot(e.position.x - p.position.x, e.position.y - p.position.y);
                     if (d < minD) { minD = d; nearest = e; }
                 });
                 if (nearest && minD < state.player.weapons[WeaponType.LASER].range) {
                     ctx.strokeStyle = '#06b6d4';
                     ctx.lineWidth = 2 + Math.random() * 2;
                     ctx.shadowBlur = 15;
                     ctx.shadowColor = '#06b6d4';
                     
                     ctx.beginPath();
                     ctx.moveTo(p.position.x, p.position.y);
                     ctx.lineTo(nearest.position.x, nearest.position.y);
                     ctx.stroke();
                     
                     ctx.shadowBlur = 0;
                 }
             }
        }

        // 8. Shockwaves
        state.shockwaves.forEach(wave => {
            ctx.save();
            ctx.strokeStyle = wave.color;
            ctx.lineWidth = 8;
            ctx.beginPath();
            ctx.arc(wave.position.x, wave.position.y, wave.radius, 0, Math.PI * 2);
            ctx.stroke();
            
            // Inner faint glow
            ctx.fillStyle = wave.color;
            ctx.globalAlpha = 0.2;
            ctx.fill();
            ctx.restore();
        });

        // 9. Particles
        state.particles.forEach(part => {
            ctx.fillStyle = part.color;
            ctx.globalAlpha = part.life / part.maxLife;
            ctx.beginPath();
            ctx.arc(part.position.x, part.position.y, part.radius * part.scale, 0, Math.PI*2);
            ctx.fill();
            ctx.globalAlpha = 1.0;
        });

        // 10. Floating Text
        ctx.font = 'bold 14px monospace';
        ctx.textAlign = 'center';
        state.floatingTexts.forEach(txt => {
            ctx.fillStyle = txt.color;
            ctx.font = `bold ${txt.size}px monospace`;
            ctx.fillText(txt.text, txt.position.x, txt.position.y);
        });

        // Range indicator
        if (state.phase === GamePhase.SCANNING && state.scanTargetId) {
            const target = state.asteroids.find(a => a.id === state.scanTargetId);
            if (target) {
                ctx.setLineDash([5, 5]);
                ctx.strokeStyle = COLORS.asteroidTarget;
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(p.position.x, p.position.y);
                ctx.lineTo(target.position.x, target.position.y);
                ctx.stroke();
                ctx.setLineDash([]);
            }
        }

        ctx.restore();
    };

    // --- Loop ---
    const tick = useCallback((time: number) => {
        // Initialize lastTime if it's the first frame
        if (lastTimeRef.current === 0) {
            lastTimeRef.current = time;
        }

        const deltaTime = time - lastTimeRef.current;
        lastTimeRef.current = time;

        // Add to accumulator (clamp max delta to prevent spiral of death on tab switch)
        const safeDelta = Math.min(deltaTime, 100);
        accumulatorRef.current += safeDelta;

        const FIXED_STEP = 1000 / FPS; // 16.666 ms (60 FPS)

        let updated = false;
        // Consume accumulated time in fixed steps
        while (accumulatorRef.current >= FIXED_STEP) {
            const newState = updateGame(gameState.current);
            accumulatorRef.current -= FIXED_STEP;
            updated = true;

            // Check for one-off events inside the update loop
            if (newState.justScanned) {
                newState.justScanned = false;
                setShowScanCompleteAnim(true);
                setTimeout(() => setShowScanCompleteAnim(false), 2000);
            }
            
            if (newState.justLeveledUp) {
                newState.justLeveledUp = false;
                newState.phase = GamePhase.LEVEL_UP;
                setShowLevelUpAnim(true);
            }
        }

        // Only update React state if logic ran, but draw every frame
        if (updated) {
            const s = gameState.current;
            setUiState({
                phase: s.phase,
                hp: s.player.hp,
                maxHp: s.player.maxHp,
                xp: s.player.xp,
                maxXp: s.player.maxXp,
                level: s.player.level,
                crystals: s.player.crystals,
                scanProgress: (s.scanTimer / SCAN_DURATION_SEC) * 100,
                warpProgress: (s.warpTimer / WARP_DURATION_SEC) * 100,
            });
        }

        if (canvasRef.current) {
            const ctx = canvasRef.current.getContext('2d');
            if (ctx) draw(ctx, gameState.current);
        }

        requestRef.current = requestAnimationFrame(tick);
    }, []);

    useEffect(() => {
        requestRef.current = requestAnimationFrame(tick);
        return () => {
            if (requestRef.current) cancelAnimationFrame(requestRef.current);
        };
    }, [tick]);

    // --- Actions ---
    const handleWarp = () => {
        const state = gameState.current;
        if (state.phase === GamePhase.IDLE) {
            state.phase = GamePhase.WARPING;
            state.warpTimer = WARP_DURATION_SEC;
        }
    };
    
    const startGame = () => {
        gameState.current.phase = GamePhase.IDLE;
        // Generate initial asteroids if needed
        // Since engine starts with INTRO, we might need to manually trigger spawnAsteroids logic
        // But App.tsx's restartGame already did this on mount. 
        setUiState(prev => ({ ...prev, phase: GamePhase.IDLE }));
    };

    const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const state = gameState.current;
        if (state.phase !== GamePhase.IDLE) return;

        const canvas = canvasRef.current;
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;

        const clickX = (e.clientX - rect.left) * scaleX;
        const clickY = (e.clientY - rect.top) * scaleY;

        const clickedAsteroid = state.asteroids.find(a => {
            const dist = Math.sqrt(Math.pow(clickX - a.position.x, 2) + Math.pow(clickY - a.position.y, 2));
            return dist <= a.radius + 15; 
        });

        if (clickedAsteroid && !clickedAsteroid.isScanned) {
            clickedAsteroid.isTarget = true;
            clickedAsteroid.color = COLORS.asteroidTarget;
            state.scanTargetId = clickedAsteroid.id;
            state.phase = GamePhase.SCANNING;
            state.scanTimer = 0;
            state.waveTimer = 0;
            
            // Trigger Warning
            setShowScanWarning(true);
            setTimeout(() => setShowScanWarning(false), 3000);

            setUiState(prev => ({ ...prev, phase: GamePhase.SCANNING }));
        }
    };

    const generateUpgrades = (): UpgradeOption[] => {
        const state = gameState.current;
        const options: UpgradeOption[] = [];
        
        options.push({
            id: 'mg_dmg', 
            title: TEXT_CONFIG.upgrades.machineGun.title, 
            description: TEXT_CONFIG.upgrades.machineGun.desc, 
            rarity: 'COMMON',
            apply: (s) => s.player.weapons[WeaponType.MACHINE_GUN].damage += 5
        });
        
        const missileLvl = state.player.weapons[WeaponType.MISSILE].level;
        options.push({
            id: 'missile_up', 
            title: missileLvl === 0 ? TEXT_CONFIG.upgrades.missileUnlock.title : TEXT_CONFIG.upgrades.missileUpgrade.title, 
            description: missileLvl === 0 ? TEXT_CONFIG.upgrades.missileUnlock.desc : TEXT_CONFIG.upgrades.missileUpgrade.desc, 
            rarity: missileLvl === 0 ? 'LEGENDARY' : 'RARE',
            apply: (s) => {
                const w = s.player.weapons[WeaponType.MISSILE];
                w.level++;
                if (w.level > 1) w.maxCooldown *= 0.8; 
            }
        });

        const laserLvl = state.player.weapons[WeaponType.LASER].level;
        options.push({
            id: 'laser_up', 
            title: laserLvl === 0 ? TEXT_CONFIG.upgrades.laserUnlock.title : TEXT_CONFIG.upgrades.laserUpgrade.title, 
            description: laserLvl === 0 ? TEXT_CONFIG.upgrades.laserUnlock.desc : TEXT_CONFIG.upgrades.laserUpgrade.desc, 
            rarity: laserLvl === 0 ? 'LEGENDARY' : 'RARE',
            apply: (s) => {
                 const w = s.player.weapons[WeaponType.LASER];
                 w.level++;
                 if (w.level > 1) w.damage *= 1.5;
            }
        });

        options.push({
            id: 'heal', 
            title: TEXT_CONFIG.upgrades.heal.title, 
            description: TEXT_CONFIG.upgrades.heal.desc, 
            rarity: 'COMMON',
            apply: (s) => s.player.hp = Math.min(s.player.maxHp, s.player.hp + s.player.maxHp * 0.5)
        });

        return options.sort(() => 0.5 - Math.random()).slice(0, 3);
    };

    const [upgrades, setUpgrades] = useState<UpgradeOption[]>([]);
    
    // Watch for Level Up transition ending
    useEffect(() => {
        // If we are in LEVEL_UP phase, but still showing the "LEVEL UP!" animation, wait.
        if (uiState.phase === GamePhase.LEVEL_UP && !showLevelUpAnim && upgrades.length === 0) {
            setUpgrades(generateUpgrades());
        }
    }, [uiState.phase, showLevelUpAnim, upgrades.length]);

    const selectUpgrade = (opt: UpgradeOption) => {
        const state = gameState.current;
        opt.apply(state);
        // Resume
        if (state.scanTargetId) {
             state.phase = GamePhase.SCANNING;
        } else {
             state.phase = GamePhase.IDLE;
        }
        setUpgrades([]);
    };

    const restartGame = () => {
        gameState.current = createInitialState();
        gameState.current.asteroids = [];
        
        // Consistent restart logic using ASTEROID_CONFIG
        const min = ASTEROID_CONFIG.min;
        const max = ASTEROID_CONFIG.max;
        const count = min + Math.floor(Math.random() * (max - min + 1));

        for(let i=0; i<count; i++) {
             gameState.current.asteroids.push({
                id: `ast-${i}`,
                position: { x: Math.random() * SCREEN_WIDTH, y: Math.random() * SCREEN_HEIGHT },
                velocity: { x: 0, y: 0 },
                radius: 20 + Math.random() * 30,
                rotation: 0,
                color: COLORS.asteroid,
                isTarget: false,
                isScanned: false
            });
        }
        // If restarting, ensure we go back to INTRO in UI
        setUiState(prev => ({ ...prev, phase: GamePhase.INTRO }));
    };

    useEffect(() => {
        restartGame();
    }, []);


    return (
        <div className="relative w-screen h-screen bg-black flex items-center justify-center overflow-hidden">
            <div className="scanlines"></div>
            
            {/* Canvas */}
            <canvas 
                ref={canvasRef} 
                width={SCREEN_WIDTH} 
                height={SCREEN_HEIGHT}
                className={`border-2 border-slate-700 shadow-2xl rounded-sm ${uiState.phase === GamePhase.IDLE ? 'cursor-pointer' : 'cursor-default'}`}
                onClick={handleCanvasClick}
            />

            {/* HUD: Top Left (Status) */}
            <div className="absolute top-4 left-4 text-white font-mono space-y-2 pointer-events-none z-10">
                <div className="flex items-center gap-2">
                    <Heart className="w-5 h-5 text-red-500" fill="currentColor" />
                    <div className="w-48 h-4 bg-slate-800 border border-slate-600">
                        <div 
                            className="h-full bg-red-600 transition-all duration-200" 
                            style={{ width: `${(uiState.hp / uiState.maxHp) * 100}%` }}
                        ></div>
                    </div>
                    <span>{Math.ceil(uiState.hp)}/{Math.ceil(uiState.maxHp)}</span>
                </div>
                <div className="flex items-center gap-2">
                    <Zap className="w-5 h-5 text-yellow-400" fill="currentColor" />
                    <div className="w-48 h-2 bg-slate-800 border border-slate-600">
                        <div 
                            className="h-full bg-yellow-400 transition-all duration-200" 
                            style={{ width: `${(uiState.xp / uiState.maxXp) * 100}%` }}
                        ></div>
                    </div>
                    <span className="text-sm">{TEXT_CONFIG.ui.level}{uiState.level}</span>
                </div>
            </div>

            {/* HUD: Top Right (Mission) */}
            <div className="absolute top-4 right-4 text-white font-mono text-right pointer-events-none z-10">
                <div className="text-xl font-bold flex items-center justify-end gap-2 text-cyan-400">
                    <Shield className="w-6 h-6" />
                    {TEXT_CONFIG.ui.title}
                </div>
                <div className="mt-2 text-emerald-400">
                    {TEXT_CONFIG.ui.crystalObjective}: {uiState.crystals} / {TARGET_CRYSTALS}
                </div>
                {uiState.phase === GamePhase.SCANNING && (
                    <div className="mt-4 text-red-400 animate-pulse text-2xl font-bold">
                        {TEXT_CONFIG.ui.warningAttack} ({Math.floor(uiState.scanProgress)}%)
                    </div>
                )}
                 {uiState.phase === GamePhase.WARPING && (
                    <div className="mt-4 text-blue-400 text-4xl font-bold">
                         {TEXT_CONFIG.ui.warpCountdown}: {Math.ceil(WARP_DURATION_SEC * (1 - uiState.warpProgress/100))}
                    </div>
                )}
            </div>
            
            {/* Contextual Hints */}
            {uiState.phase === GamePhase.IDLE && (
                <>
                 <div className="absolute top-24 left-1/2 -translate-x-1/2 text-emerald-400 font-mono text-lg animate-pulse pointer-events-none z-10 flex items-center gap-2">
                    <MousePointerClick className="w-5 h-5" />
                    {TEXT_CONFIG.ui.clickToScan}
                 </div>
                 {/* Bottom Instruction */}
                 <div className="absolute bottom-24 left-1/2 -translate-x-1/2 text-center pointer-events-none z-10 w-full px-4">
                     <p className="text-yellow-400/80 font-mono text-sm bg-black/50 inline-block px-4 py-2 rounded border border-yellow-400/30">
                        {TEXT_CONFIG.ui.scanInstruction}
                     </p>
                 </div>
                 </>
            )}

            {/* Prominent Progress Bar in Scanning Phase */}
            {uiState.phase === GamePhase.SCANNING && (
                <div className="absolute top-20 left-1/2 -translate-x-1/2 w-1/2 max-w-2xl pointer-events-none z-20">
                    <div className="flex justify-between text-red-400 font-bold mb-1 text-lg shadow-black drop-shadow-md">
                        <span>{TEXT_CONFIG.ui.scanProgress}</span>
                        <span>{Math.floor(uiState.scanProgress)}%</span>
                    </div>
                    <div className="h-6 w-full bg-slate-900/80 border-2 border-red-500/50 rounded overflow-hidden shadow-[0_0_15px_rgba(239,68,68,0.3)]">
                        <div 
                            className="h-full bg-gradient-to-r from-red-600 via-red-500 to-orange-500 transition-all duration-200 relative"
                            style={{ 
                                width: `${uiState.scanProgress}%`,
                                backgroundImage: 'linear-gradient(45deg,rgba(255,255,255,.15) 25%,transparent 25%,transparent 50%,rgba(255,255,255,.15) 50%,rgba(255,255,255,.15) 75%,transparent 75%,transparent)',
                                backgroundSize: '1rem 1rem'
                            }}
                        >
                        </div>
                    </div>
                </div>
            )}

            {/* Controls */}
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex gap-4 z-10">
                {uiState.phase === GamePhase.IDLE && (
                    <button 
                        onClick={handleWarp}
                        className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 px-8 rounded border-2 border-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.5)] flex items-center gap-2 text-xl active:scale-95 transition-transform"
                    >
                        <TrendingUp /> {TEXT_CONFIG.ui.warpButton}
                    </button>
                )}
            </div>

            {/* INTRO SCREEN */}
            {uiState.phase === GamePhase.INTRO && (
                <div className="absolute inset-0 bg-black z-50 flex flex-col items-center justify-center p-8 text-center">
                    <div className="max-w-3xl space-y-8 animate-in fade-in duration-1000">
                        <h1 className="text-6xl font-black text-blue-500 mb-8 tracking-wider">{TEXT_CONFIG.intro.title}</h1>
                        <p className="text-2xl text-slate-300 leading-relaxed font-light">
                            {TEXT_CONFIG.intro.story1}<br/>
                            {TEXT_CONFIG.intro.story2}<br/>
                            <span className="text-red-500 font-bold block mt-4">{TEXT_CONFIG.intro.story3}</span>
                        </p>
                        <button 
                            onClick={startGame}
                            className="mt-12 bg-white text-black font-bold py-4 px-12 rounded-full text-2xl hover:scale-105 hover:bg-blue-400 transition-all shadow-[0_0_30px_rgba(255,255,255,0.3)]"
                        >
                            {TEXT_CONFIG.intro.button}
                        </button>
                    </div>
                </div>
            )}

            {/* WARNING OVERLAY */}
            {showScanWarning && (
                <div className="absolute top-1/3 left-0 w-full text-center pointer-events-none z-30">
                    <div className="bg-red-900/50 backdrop-blur-sm py-4 border-y-2 border-red-500 animate-pulse">
                         <h2 className="text-red-500 text-5xl font-black flex items-center justify-center gap-4">
                            <AlertTriangle className="w-12 h-12" />
                            {TEXT_CONFIG.ui.scanWarningTitle}
                            <AlertTriangle className="w-12 h-12" />
                         </h2>
                         <p className="text-red-300 text-xl mt-2 tracking-[0.5em]">{TEXT_CONFIG.ui.scanWarningSubtitle}</p>
                    </div>
                </div>
            )}

            {/* Level Up Animation Overlay */}
            {showLevelUpAnim && (
                <div 
                    className="absolute inset-0 flex items-center justify-center z-50 bg-black/50 backdrop-blur-sm cursor-pointer"
                    onClick={() => setShowLevelUpAnim(false)} // Allow clicking to skip
                >
                    <div className="text-center animate-in fade-in zoom-in duration-300">
                         <h1 className="text-6xl font-bold text-yellow-400 drop-shadow-md">{TEXT_CONFIG.ui.levelUpTitle}</h1>
                         <p className="text-white text-2xl mt-4 animate-pulse">{TEXT_CONFIG.ui.clickContinue}</p>
                    </div>
                </div>
            )}

            {/* Scan Complete Animation Overlay */}
            {showScanCompleteAnim && (
                <div className="absolute inset-0 flex items-center justify-center z-40 pointer-events-none">
                     <div className="text-center">
                         <h1 className="text-6xl font-black text-emerald-400 drop-shadow-[0_0_20px_rgba(52,211,153,0.8)] animate-pulse">{TEXT_CONFIG.ui.scanComplete}</h1>
                         <p className="text-emerald-200 text-xl mt-2">{TEXT_CONFIG.ui.empActivate}</p>
                    </div>
                </div>
            )}

            {/* Level Up Modal (Selection) */}
            {uiState.phase === GamePhase.LEVEL_UP && !showLevelUpAnim && (
                <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-50">
                    <div className="bg-slate-900 border-2 border-yellow-500 p-8 rounded-lg max-w-2xl w-full">
                        <h2 className="text-3xl font-bold text-yellow-400 mb-6 text-center">{TEXT_CONFIG.ui.systemUpgrade}</h2>
                        <div className="grid grid-cols-3 gap-4">
                            {upgrades.map((opt) => (
                                <button 
                                    key={opt.id}
                                    onClick={() => selectUpgrade(opt)}
                                    className={`p-4 rounded border-2 text-left hover:bg-slate-800 transition-colors ${
                                        opt.rarity === 'LEGENDARY' ? 'border-orange-500 text-orange-200' :
                                        opt.rarity === 'RARE' ? 'border-blue-400 text-blue-200' :
                                        'border-slate-500 text-gray-200'
                                    }`}
                                >
                                    <div className="text-xl font-bold mb-2">{opt.title}</div>
                                    <div className="text-sm opacity-80">{opt.description}</div>
                                    <div className="mt-4 text-xs font-mono uppercase tracking-widest opacity-50">{opt.rarity}</div>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Game Over Screen */}
            {uiState.phase === GamePhase.GAME_OVER && (
                <div className="absolute inset-0 bg-red-900/80 flex items-center justify-center z-50 flex-col">
                    <Skull className="w-24 h-24 text-white mb-4" />
                    <h1 className="text-6xl font-bold text-white mb-2">{TEXT_CONFIG.screens.gameOver.title}</h1>
                    <p className="text-xl text-red-200 mb-8">{TEXT_CONFIG.screens.gameOver.subtitle}</p>
                    <button 
                        onClick={restartGame}
                        className="bg-white text-red-900 font-bold py-3 px-8 rounded text-xl hover:scale-105 transition-transform"
                    >
                        {TEXT_CONFIG.screens.gameOver.button}
                    </button>
                </div>
            )}

             {/* Victory Screen */}
             {uiState.phase === GamePhase.VICTORY && (
                <div className="absolute inset-0 bg-emerald-900/90 flex items-center justify-center z-50 flex-col">
                    <Shield className="w-24 h-24 text-yellow-400 mb-4" />
                    <h1 className="text-6xl font-bold text-white mb-2">{TEXT_CONFIG.screens.victory.title}</h1>
                    <p className="text-xl text-emerald-200 mb-8">{TEXT_CONFIG.screens.victory.subtitle}</p>
                    <button 
                        onClick={restartGame}
                        className="bg-white text-emerald-900 font-bold py-3 px-8 rounded text-xl hover:scale-105 transition-transform"
                    >
                        {TEXT_CONFIG.screens.victory.button}
                    </button>
                </div>
            )}
        </div>
    );
}