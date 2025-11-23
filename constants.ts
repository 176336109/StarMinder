import { WeaponType } from "./types";

export const SCREEN_WIDTH = 1200;
export const SCREEN_HEIGHT = 720;
export const FPS = 60;

// Colors
export const COLORS = {
    background: '#0a0a12',
    player: '#3b82f6', // Blue
    enemyTank: '#ef4444', // Red
    enemyRanged: '#f59e0b', // Amber
    enemySwarm: '#a855f7', // Purple
    enemyBoss: '#7f1d1d', // Deep Red (almost maroon)
    asteroid: '#4b5563', // Gray
    asteroidTarget: '#10b981', // Green
    projectile: '#fef08a',
    xpOrb: '#22d3ee', // Cyan
    textDamage: '#fff',
    textHeal: '#4ade80',
    uiBg: 'rgba(15, 23, 42, 0.8)',
    shockwave: '#06b6d4' // Cyan/Blue energy
};

// Gameplay
export const TARGET_CRYSTALS = 10;
export const SCAN_DURATION_SEC = 90;
export const WARP_DURATION_SEC = 10;

// Asteroid Spawning Configuration
export const ASTEROID_CONFIG = {
    min: 10,
    max: 20
};

export const PLAYER_CONFIG = {
    baseHp: 100,
    baseXp: 100,
    hpGrowth: 20,
    xpGrowth: 2,
    magnetRange: 150,
    magnetSpeed: 10,
    passiveSpeed: 2
};

// Text Configuration (Localization / Config)
export const TEXT_CONFIG = {
    intro: {
        title: "星际考古工作室",
        story1: "你一个人到深空寻找史前文明的神器。",
        story2: "但是，消灭史前文明的虫族，将因为你扫描神器的能力而来。",
        story3: "一场恶战在所难免。",
        button: "开始任务 (INITIALIZE)"
    },
    ui: {
        hp: "HP",
        level: "LV.",
        title: "星际矿业公司",
        crystalObjective: "晶体收集",
        warningAttack: "警告: 敌袭",
        warpCountdown: "折跃倒计时",
        clickToScan: "点击屏幕上的陨石开始扫描 (CLICK ASTEROID TO SCAN)",
        scanInstruction: "说明：扫描陨石将引来大量虫群，请务必存活至扫描结束！",
        scanProgress: "解析进度 (ANALYSIS PROGRESS)",
        warpButton: "折跃 (WARP)",
        levelUpTitle: "LEVEL UP!",
        clickContinue: "点击继续 (CLICK TO CONTINUE)",
        scanComplete: "SCAN COMPLETE!",
        empActivate: "EMP ACTIVATE",
        systemUpgrade: "系统升级 (SYSTEM UPGRADE)",
        scanWarningTitle: "警告：发现虫群折跃信号",
        scanWarningSubtitle: "WARNING: ZERG WARP DETECTED"
    },
    gameplay: {
        scanned: "【已扫描】",
        scanable: "【可扫描】",
        scanning: "扫描中...",
        bossDefeated: "BOSS DEFEATED",
        emp: "EMP"
    },
    upgrades: {
        machineGun: {
            title: "机枪增幅",
            desc: "增加机枪伤害 +5"
        },
        missileUnlock: {
            title: "解锁导弹",
            desc: "每2秒发射自动追踪导弹"
        },
        missileUpgrade: {
            title: "导弹升级",
            desc: "减少导弹冷却时间"
        },
        laserUnlock: {
            title: "解锁激光",
            desc: "对最近敌人造成持续伤害"
        },
        laserUpgrade: {
            title: "激光增幅",
            desc: "增加激光伤害"
        },
        heal: {
            title: "紧急修复",
            desc: "恢复 50% 生命值"
        }
    },
    screens: {
        gameOver: {
            title: "任务失败",
            subtitle: "飞船已被摧毁",
            button: "重新开始 (RESTART)"
        },
        victory: {
            title: "任务完成",
            subtitle: "已收集足够晶体，正在返回基地...",
            button: "再次出征 (PLAY AGAIN)"
        }
    }
};

// Weapons
export const WEAPON_STATS = {
    [WeaponType.MACHINE_GUN]: {
        cooldown: 10, // Frames
        damage: 15,
        range: 400,
        color: '#ffff00' // Bright Yellow
    },
    [WeaponType.MISSILE]: {
        cooldown: 120, // Frames (2 seconds)
        damage: 80,
        range: 600,
        speed: 4,
        color: '#ffaa00' // Bright Orange
    },
    [WeaponType.LASER]: {
        cooldown: 1, // Continuous
        damage: 2, // Per frame
        range: 300,
        color: '#06b6d4'
    }
};

// Enemy Stats
// Speed reduced again by 50% (previous was 0.075, 0.15, 0.3)
export const ENEMY_STATS = {
    TANK: { hp: 300, speed: 0.1375, radius: 25, score: 50 },
    RANGED: { hp: 100, speed: 0.175, radius: 18, score: 30 },
    SWARM: { hp: 30, speed: 0.5, radius: 10, score: 10 },
    BOSS: { hp: 5000, speed: 0.015, radius: 60, score: 500 } // Huge, Slow, Tanky
};