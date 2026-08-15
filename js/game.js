const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const startScreen = document.getElementById('startScreen');
const startHint = document.getElementById('startHint');
const moveControls = document.getElementById('moveControls');
const combatButtonsEl = document.getElementById('combatButtons');
const btnLeft = document.getElementById('btnLeft');
const btnRight = document.getElementById('btnRight');
const btnJump = document.getElementById('btnJump');
const btnExit = document.getElementById('btnExit');

const IS_TOUCH_DEVICE = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
const START_HINT_TEXT = IS_TOUCH_DEVICE ? 'TOCA PARA DESPEGAR' : 'PULSA ESPACIO PARA DESPEGAR';
if (startHint) startHint.textContent = START_HINT_TEXT;

const SAVE_KEY = 'astroLeapSave_v1';

function makeStars(count, maxX) {
    const stars = [];
    for (let i = 0; i < count; i++) {
        stars.push({ x: Math.random() * maxX, y: Math.random() * GAME_HEIGHT, size: Math.random() < 0.15 ? 1.6 : 0.9, tw: Math.random() * Math.PI * 2 });
    }
    return stars;
}

class Game {
    constructor() {
        this.player = new Player(20, 100);
        this.currentLevel = 0; this.platforms = []; this.enemies = []; this.goalFlag = null;
        this.combat = null; this.keys = {}; this.cameraX = 0; this.gameStarted = false;
        this.levelUpMessage = 0; this.levelCompleteMessage = 0;
        this.worldMap = new WorldMap(); this.inWorldMap = false; this.inLevel = false;
        this.levelCompleting = false; this.playerInvulnerable = 0;
        this.particles = new ParticleSystem();
        this.shake = 0;
        this.mapStars = makeStars(70, GAME_WIDTH);
        this.levelStars = makeStars(140, 1200);
        this.loadProgress();
        this.setupInput();
        this.setupTouchControls();
    }

    saveProgress() {
        try {
            const data = {
                nodes: this.worldMap.nodes.map(n => ({ completed: n.completed, unlocked: n.unlocked })),
                player: {
                    level: this.player.level, xp: this.player.xp, xpToNextLevel: this.player.xpToNextLevel,
                    maxHp: this.player.maxHp, maxEnergy: this.player.maxEnergy,
                    attack: this.player.attack, defense: this.player.defense
                }
            };
            localStorage.setItem(SAVE_KEY, JSON.stringify(data));
        } catch (e) { /* almacenamiento no disponible: seguimos sin guardar */ }
    }
    loadProgress() {
        try {
            const raw = localStorage.getItem(SAVE_KEY);
            if (!raw) return;
            const data = JSON.parse(raw);
            if (data.nodes) data.nodes.forEach((n, i) => { if (this.worldMap.nodes[i]) Object.assign(this.worldMap.nodes[i], n); });
            if (data.player) Object.assign(this.player, data.player, { hp: data.player.maxHp, energy: data.player.maxEnergy });
        } catch (e) { /* save corrupto: ignorar */ }
    }
    clearProgress() {
        try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* noop */ }
    }

    startGame() {
        if (this.gameStarted) return;
        if (window.SFX) { SFX.unlock(); SFX.boot(); }
        this.gameStarted = true;
        startScreen.style.display = 'none';
        this.inWorldMap = true;
    }

    loadLevel(lvl) {
        this.currentLevel = lvl;
        const level = LEVELS[lvl];
        this.platforms = level.platforms.map(p => new Platform(...p, level.variant));
        const levelCompleted = this.worldMap.nodes[lvl].completed;
        this.enemies = level.enemies.map(e => {
            const enemy = new Enemy(...e);
            if (levelCompleted) enemy.xpReward = Math.floor(enemy.xpReward / 2);
            return enemy;
        });
        this.goalFlag = new GoalFlag(level.goal, 128);
        this.player.x = 20; this.player.y = 100; this.player.vx = 0; this.player.vy = 0;
        this.player.energy = this.player.maxEnergy; this.cameraX = 0;
    }

    exitLevel() {
        this.inLevel = false; this.inWorldMap = true;
        this.player.hp = this.player.maxHp; this.player.energy = this.player.maxEnergy;
    }

    setupInput() {
        document.addEventListener('keydown', (e) => {
            this.keys[e.code] = true;
            if (!this.gameStarted && e.code === 'Space') { this.startGame(); this.keys[e.code] = false; return; }
            if (this.combat && this.combat.active) this.combat.handleInput(e.code);
            if (e.code === 'Escape' && this.inLevel && !this.combat) this.exitLevel();
        });
        document.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    }

    setupTouchControls() {
        const bindHold = (el, code) => {
            if (!el) return;
            const press = (e) => { e.preventDefault(); if (window.SFX) SFX.unlock(); this.keys[code] = true; };
            const release = (e) => { e.preventDefault(); this.keys[code] = false; };
            el.addEventListener('touchstart', press, { passive: false });
            el.addEventListener('touchend', release, { passive: false });
            el.addEventListener('touchcancel', release, { passive: false });
            el.addEventListener('mousedown', press);
            el.addEventListener('mouseup', release);
            el.addEventListener('mouseleave', release);
        };
        bindHold(btnLeft, 'ArrowLeft');
        bindHold(btnRight, 'ArrowRight');
        bindHold(btnJump, 'Space');

        if (btnExit) {
            const exitTap = (e) => { e.preventDefault(); if (this.inLevel && !this.combat) this.exitLevel(); };
            btnExit.addEventListener('touchstart', exitTap, { passive: false });
            btnExit.addEventListener('click', exitTap);
        }
        if (combatButtonsEl) {
            combatButtonsEl.querySelectorAll('button[data-code]').forEach((btn) => {
                const code = btn.dataset.code;
                const tap = (e) => { e.preventDefault(); if (this.combat && this.combat.active) this.combat.handleInput(code); };
                btn.addEventListener('touchstart', tap, { passive: false });
                btn.addEventListener('click', tap);
            });
        }
        const startTap = (e) => { e.preventDefault(); this.startGame(); };
        startScreen.addEventListener('touchstart', startTap, { passive: false });
        startScreen.addEventListener('click', startTap);
    }

    updateTouchUI() {
        const inCombat = !!(this.combat && this.combat.active);
        if (moveControls) moveControls.classList.toggle('active', this.gameStarted && !inCombat);
        if (combatButtonsEl) combatButtonsEl.classList.toggle('active', inCombat);
        if (btnExit) btnExit.classList.toggle('active', this.inLevel && !inCombat);
    }

    update() {
        if (!this.gameStarted) return;
        if (this.shake > 0) this.shake *= 0.85;

        if (this.inWorldMap) {
            const selected = this.worldMap.update(this.keys);
            if (selected !== null) {
                this.currentLevel = selected; this.loadLevel(selected);
                this.inWorldMap = false; this.inLevel = true;
            }
            return;
        }

        if (this.combat) {
            this.combat.update();
            this.shake = Math.max(this.shake, this.combat.shake || 0);
            if (!this.combat.active) {
                if (this.combat.result === 'win') {
                    const leveled = this.player.gainXP(this.combat.enemy.xpReward);
                    this.levelUpMessage = leveled ? 100 : 0;
                    if (leveled && window.SFX) SFX.levelUp();
                    this.particles.burst(this.player.x + this.player.w / 2, this.player.y, PALETTE.accent3, 14, { speed: 2, life: 30, size: 3 });
                    this.saveProgress();
                } else if (this.combat.result === 'lose') {
                    if (window.SFX) SFX.gameOver();
                    this.gameStarted = false;
                    startScreen.innerHTML = `<h1>MISIÓN FALLIDA</h1><p class="hint blink-anim">${START_HINT_TEXT}</p>`;
                    startScreen.style.display = 'flex';
                    this.player = new Player(20, 100);
                    this.loadProgress();
                    this.loadLevel(0);
                } else if (this.combat.result === 'flee') {
                    this.playerInvulnerable = 180;
                }
                this.combat = null;
            }
        } else {
            if (!this.levelCompleting) this.player.update(this.keys, this.platforms, this.particles);
            this.particles.update();
            this.cameraX = Math.max(0, Math.min(this.player.x - GAME_WIDTH / 2, LEVELS[this.currentLevel].goal - GAME_WIDTH));
            if (this.playerInvulnerable > 0) this.playerInvulnerable--;

            for (const enemy of this.enemies) {
                if (!enemy.alive) continue;
                enemy.update(this.platforms);
                if (this.player.collides(enemy) && this.playerInvulnerable === 0) {
                    if (this.player.collidesFromAbove(enemy) && enemy.level < this.player.level) {
                        enemy.alive = false; enemy.defeated = true;
                        this.player.gainXP(enemy.xpReward);
                        this.player.vy = -3; this.levelUpMessage = 80;
                        if (window.SFX) SFX.stomp();
                        this.particles.burst(enemy.x + enemy.w / 2, enemy.y, enemy.color, 10, { speed: 1.8, life: 20, size: 2.5 });
                    } else {
                        this.combat = new CombatSystem(this.player, enemy);
                    }
                }
            }

            const level = LEVELS[this.currentLevel];
            if (this.player.x >= level.goal && !this.levelCompleting) {
                if (level.boss) {
                    const boss = this.enemies.find(e => e.isBoss);
                    if (boss && boss.alive) { this.player.x = level.goal - 5; this.player.vx = 0; return; }
                }
                this.levelCompleting = true;
                if (window.SFX) SFX.levelComplete();
                this.worldMap.completeLevel(this.currentLevel);
                this.levelCompleteMessage = 150;
                this.saveProgress();

                if (this.currentLevel === LEVELS.length - 1) {
                    this.levelCompleting = false; this.gameStarted = false;
                    if (window.SFX) SFX.victory();
                    startScreen.innerHTML = `<h1>¡MISIÓN CUMPLIDA!</h1><p class="subtitle">Reparaste la nave y escapaste del sistema.</p><p class="hint blink-anim">${START_HINT_TEXT}</p>`;
                    startScreen.style.display = 'flex';
                    this.player = new Player(20, 100);
                    this.worldMap = new WorldMap();
                    this.clearProgress();
                    this.inLevel = false; this.inWorldMap = false;
                } else {
                    setTimeout(() => {
                        this.levelCompleting = false; this.inLevel = false; this.inWorldMap = true;
                        this.worldMap.currentNodeIndex = Math.min(this.currentLevel + 1, LEVELS.length - 1);
                        this.player.hp = this.player.maxHp; this.player.energy = this.player.maxEnergy;
                    }, 1800);
                }
            }
            if (this.goalFlag) this.goalFlag.update();
            if (this.levelUpMessage > 0) this.levelUpMessage--;
            if (this.levelCompleteMessage > 0) this.levelCompleteMessage--;
        }
    }

    drawStars(stars, parallax) {
        stars.forEach(s => {
            const sx = s.x - this.cameraX * parallax;
            if (sx < -4 || sx > GAME_WIDTH + 4) return;
            const tw = 0.5 + Math.sin(s.tw + Date.now() * 0.002) * 0.5;
            ctx.globalAlpha = 0.4 + tw * 0.6;
            ctx.fillStyle = PALETTE.ink;
            ctx.fillRect(sx, s.y, s.size, s.size);
        });
        ctx.globalAlpha = 1;
    }

    draw() {
        this.updateTouchUI();
        const shakeX = this.shake ? (Math.random() - 0.5) * this.shake : 0;
        const shakeY = this.shake ? (Math.random() - 0.5) * this.shake * 0.6 : 0;
        ctx.save();
        ctx.translate(shakeX, shakeY);

        if (this.inWorldMap) {
            this.drawStars(this.mapStars, 0);
            this.worldMap.draw(ctx);
            ctx.restore();
            return;
        }

        const grad = ctx.createLinearGradient(0, 0, 0, GAME_HEIGHT);
        grad.addColorStop(0, PALETTE.bg2); grad.addColorStop(1, PALETTE.bg1);
        ctx.fillStyle = grad; ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
        this.drawStars(this.levelStars, 0.35);

        if (this.combat) {
            this.combat.draw(ctx);
        } else {
            for (const p of this.platforms) p.draw(ctx, this.cameraX);
            if (this.goalFlag) this.goalFlag.draw(ctx, this.cameraX);
            for (const e of this.enemies) e.draw(ctx, this.cameraX);
            this.particles.draw(ctx, this.cameraX);
            if (this.playerInvulnerable === 0 || Math.floor(this.playerInvulnerable / 8) % 2 === 0) {
                this.player.draw(ctx, this.cameraX);
            }

            ctx.fillStyle = 'rgba(11,6,32,0.75)'; ctx.fillRect(0, 0, GAME_WIDTH, 20);
            ctx.fillStyle = PALETTE.ink; ctx.font = '10px "Rajdhani", sans-serif';
            ctx.fillText(`Lv${this.player.level}`, 4, 14);
            ctx.fillStyle = PALETTE.hp; ctx.fillText(`HP:${this.player.hp}/${this.player.maxHp}`, 30, 14);
            ctx.fillStyle = PALETTE.en; ctx.fillText(`EN:${this.player.energy}/${this.player.maxEnergy}`, 108, 14);
            ctx.fillStyle = PALETTE.panel; ctx.fillRect(256, 7, 56, 7);
            ctx.fillStyle = PALETTE.xp; ctx.fillRect(256, 7, 56 * Math.min(1, this.player.xp / this.player.xpToNextLevel), 7);
            ctx.fillStyle = PALETTE.dim; ctx.font = '8px "Rajdhani", sans-serif'; ctx.fillText('XP', 236, 13);
            ctx.fillStyle = PALETTE.dim; ctx.font = '9px "Rajdhani", sans-serif';
            ctx.fillText(`${LEVELS[this.currentLevel].name}`, 6, 32);

            if (this.levelUpMessage > 0) {
                ctx.fillStyle = PALETTE.accent3; ctx.font = 'bold 14px "Orbitron", sans-serif';
                ctx.fillText('¡SUBISTE DE NIVEL!', 55, 70);
            }
            if (this.levelCompleteMessage > 0) {
                ctx.fillStyle = PALETTE.accent; ctx.font = 'bold 14px "Orbitron", sans-serif';
                ctx.fillText('SECTOR COMPLETADO', 55, 70);
            }
        }
        ctx.restore();
    }
}

const game = new Game();
function gameLoop() { game.update(); game.draw(); requestAnimationFrame(gameLoop); }
gameLoop();
