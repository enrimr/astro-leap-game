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

// El canvas dibuja siempre en el sistema de coordenadas lógico GAME_WIDTH x GAME_HEIGHT,
// pero el buffer interno se redimensiona a la resolución real de pantalla (con devicePixelRatio)
// para que las formas, gradientes y texto salgan nítidos en vez de pixelados/borrosos al escalar por CSS.
let fitCanvasW = 0, fitCanvasH = 0;
function fitCanvas() {
    const cssW = canvas.clientWidth, cssH = canvas.clientHeight;
    if (cssW === 0 || cssH === 0) return;
    const dpr = window.devicePixelRatio || 1;
    const targetW = Math.round(cssW * dpr), targetH = Math.round(cssH * dpr);
    if (targetW === fitCanvasW && targetH === fitCanvasH) return;
    fitCanvasW = targetW; fitCanvasH = targetH;
    canvas.width = targetW; canvas.height = targetH;
    ctx.setTransform(targetW / GAME_WIDTH, 0, 0, targetH / GAME_HEIGHT, 0, 0);
}

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
        this.currentLevel = 0; this.platforms = []; this.enemies = []; this.goalFlag = null; this.capsules = [];
        this.combat = null; this.keys = {}; this.cameraX = 0; this.gameStarted = false;
        this.levelUpMessage = 0; this.levelCompleteMessage = 0; this.livesLostMessage = 0; this.extraLifeMessage = 0;
        this.collectedCapsules = new Set(); // por nivel, para no poder re-recoger saliendo y entrando
        this.worldMap = new WorldMap(); this.inWorldMap = false; this.inLevel = false;
        this.levelCompleting = false; this.playerInvulnerable = 0;
        this.autoScrollX = 0; this.forcedScrollDelay = 0;
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
        const capsuleKey = `${lvl}`;
        this.capsules = (level.capsules || []).map(([cx, cy]) => {
            const cap = new LifeCapsule(cx, cy);
            if (this.collectedCapsules.has(capsuleKey)) cap.collected = true;
            return cap;
        });
        this.player.x = 20; this.player.y = 100; this.player.vx = 0; this.player.vy = 0;
        this.player.energy = this.player.maxEnergy; this.cameraX = 0;
        this.autoScrollX = 0;
        this.forcedScrollDelay = level.forcedScroll ? level.forcedScroll.startDelay : 0;
    }

    exitLevel() {
        this.inLevel = false; this.inWorldMap = true;
        this.player.hp = this.player.maxHp; this.player.energy = this.player.maxEnergy;
    }

    // Se pierde una vida al morir (caer a un precipicio, que te alcance el muro, o perder un combate).
    // Con vidas restantes: reaparece al inicio del nivel actual, con vida y energía llenas.
    // Sin vidas restantes: Game Over completo, se reinicia todo desde el principio.
    loseLife() {
        this.player.lives--;
        this.combat = null;
        this.particles.burst(this.player.x + this.player.w / 2, this.player.y, PALETTE.hpLow, 16, { speed: 2.2, life: 30, size: 3 });
        if (this.player.lives <= 0) {
            this.fullGameOver();
        } else {
            if (window.SFX) SFX.loseLife();
            this.livesLostMessage = 110; this.extraLifeMessage = 0;
            this.levelCompleting = false;
            this.loadLevel(this.currentLevel);
            this.player.hp = this.player.maxHp;
            this.player.energy = this.player.maxEnergy;
        }
    }

    fullGameOver() {
        if (window.SFX) SFX.gameOver();
        this.gameStarted = false;
        startScreen.innerHTML = `<h1>GAME OVER</h1><p class="subtitle">Sin vidas restantes — vuelves a empezar.</p><p class="hint blink-anim">${START_HINT_TEXT}</p>`;
        startScreen.style.display = 'flex';
        this.player = new Player(20, 100);
        this.worldMap = new WorldMap();
        this.collectedCapsules = new Set();
        this.clearProgress();
        this.loadLevel(0);
        this.inLevel = false; this.inWorldMap = false; this.combat = null;
    }

    setupInput() {
        document.addEventListener('keydown', (e) => {
            this.keys[e.code] = true;
            if (!this.gameStarted && e.code === 'Space') { this.startGame(); this.keys[e.code] = false; return; }
            if (this.combat && this.combat.active) this.combat.handleInput(e.code);
            if (e.code === 'Escape' && this.inLevel && !this.combat) this.exitLevel();
            // Atajo de depuración: reiniciar el nivel actual al instante (útil ajustando niveles)
            if (e.code === 'KeyR' && this.inLevel && !this.combat) {
                this.levelCompleting = false;
                this.loadLevel(this.currentLevel);
                this.player.hp = this.player.maxHp;
            }
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

        // Tocar/clicar directamente un nodo del mapa estelar entra a ese nivel (si está desbloqueado)
        const mapTap = (e) => {
            if (!this.inWorldMap) return;
            e.preventDefault();
            const rect = canvas.getBoundingClientRect();
            const point = e.changedTouches ? e.changedTouches[0] : e;
            const gx = (point.clientX - rect.left) / rect.width * GAME_WIDTH;
            const gy = (point.clientY - rect.top) / rect.height * GAME_HEIGHT;
            let closest = null, closestDist = Infinity;
            for (const node of this.worldMap.nodes) {
                const dist = Math.hypot(node.x - gx, node.y - gy);
                if (dist < closestDist) { closest = node; closestDist = dist; }
            }
            if (closest && closestDist <= closest.w) {
                if (!closest.unlocked) { if (window.SFX) SFX.select(); return; }
                this.worldMap.currentNodeIndex = closest.levelIndex;
                if (window.SFX) SFX.confirm();
                this.currentLevel = closest.levelIndex;
                this.loadLevel(closest.levelIndex);
                this.inWorldMap = false;
                this.inLevel = true;
            }
        };
        canvas.addEventListener('touchstart', mapTap, { passive: false });
        canvas.addEventListener('click', mapTap);
    }

    updateTouchUI() {
        const inCombat = !!(this.combat && this.combat.active);
        if (moveControls) moveControls.classList.toggle('active', this.gameStarted && !inCombat);
        if (combatButtonsEl) combatButtonsEl.classList.toggle('active', inCombat);
        if (btnJump) btnJump.textContent = this.inWorldMap ? 'ENTRAR' : 'SALTO';
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
                    this.loseLife();
                    return;
                } else if (this.combat.result === 'flee') {
                    this.playerInvulnerable = 180;
                }
                this.combat = null;
            }
        } else {
            const level = LEVELS[this.currentLevel];
            let outcome = null;
            if (!this.levelCompleting) outcome = this.player.update(this.keys, this.platforms, this.particles);
            if (outcome === 'fell') { this.loseLife(); return; }
            if (this.player.hp <= 0) { this.loseLife(); return; }
            this.particles.update();
            const CAMERA_END_MARGIN = 40; // deja la meta con aire a la derecha en vez de pegada al borde
            const maxScroll = level.goal + CAMERA_END_MARGIN - GAME_WIDTH;

            if (level.forcedScroll) {
                if (this.forcedScrollDelay > 0) this.forcedScrollDelay--;
                else this.autoScrollX = Math.min(this.autoScrollX + level.forcedScroll.speed, maxScroll);
                this.cameraX = Math.max(0, this.autoScrollX);
                const leftEdge = this.cameraX + 2;
                if (this.player.x < leftEdge) {
                    this.player.x = leftEdge;
                    if (this.playerInvulnerable === 0) {
                        this.player.takeDamage(3);
                        this.playerInvulnerable = 40;
                        this.shake = Math.max(this.shake, 4);
                        if (window.SFX) SFX.hitPlayer();
                        if (this.player.hp <= 0) { this.loseLife(); return; }
                    }
                }
            } else {
                this.cameraX = Math.max(0, Math.min(this.player.x - GAME_WIDTH / 2, maxScroll));
            }
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

            for (const cap of this.capsules) {
                if (cap.collected) continue;
                cap.update();
                if (this.player.collides(cap)) {
                    cap.collected = true;
                    this.collectedCapsules.add(`${this.currentLevel}`);
                    this.player.lives++;
                    this.extraLifeMessage = 110; this.livesLostMessage = 0;
                    if (window.SFX) SFX.levelUp();
                    this.particles.burst(cap.x + cap.w / 2, cap.y, PALETTE.accent2, 16, { speed: 2, life: 32, size: 3 });
                }
            }

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
                    this.collectedCapsules = new Set();
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
            if (this.livesLostMessage > 0) this.livesLostMessage--;
            if (this.extraLifeMessage > 0) this.extraLifeMessage--;
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
        fitCanvas();
        this.updateTouchUI();
        const shakeX = this.shake ? (Math.random() - 0.5) * this.shake : 0;
        const shakeY = this.shake ? (Math.random() - 0.5) * this.shake * 0.6 : 0;
        ctx.save();
        ctx.translate(shakeX, shakeY);

        if (this.inWorldMap) {
            this.drawStars(this.mapStars, 0);
            this.worldMap.draw(ctx);
            ctx.fillStyle = PALETTE.accent2; ctx.font = '10px "Rajdhani", sans-serif'; ctx.textAlign = 'right';
            ctx.fillText(`♥×${this.player.lives}`, 308, 16);
            ctx.textAlign = 'left';
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
            for (const cap of this.capsules) cap.draw(ctx, this.cameraX);
            for (const e of this.enemies) e.draw(ctx, this.cameraX);
            this.particles.draw(ctx, this.cameraX);
            if (this.playerInvulnerable === 0 || Math.floor(this.playerInvulnerable / 8) % 2 === 0) {
                this.player.draw(ctx, this.cameraX);
            }

            const level = LEVELS[this.currentLevel];
            if (level.forcedScroll) {
                const pulse = 0.6 + Math.sin(Date.now() * 0.012) * 0.4;
                const wallGrad = ctx.createLinearGradient(0, 0, 18, 0);
                wallGrad.addColorStop(0, `rgba(255,70,70,${0.9 * pulse})`);
                wallGrad.addColorStop(1, 'rgba(255,70,70,0)');
                ctx.fillStyle = wallGrad;
                ctx.fillRect(0, 20, 18, GAME_HEIGHT - 20);
                if (this.forcedScrollDelay === 0) {
                    ctx.fillStyle = `rgba(255,100,100,${0.7 + pulse * 0.3})`;
                    ctx.font = 'bold 8px "Rajdhani", sans-serif'; ctx.textAlign = 'center';
                    ctx.fillText('⚠ NÚCLEO', 90, 28);
                    ctx.textAlign = 'left';
                }
                if (this.forcedScrollDelay > 0) {
                    ctx.fillStyle = PALETTE.accent2; ctx.font = 'bold 22px "Orbitron", sans-serif'; ctx.textAlign = 'center';
                    const secs = Math.ceil(this.forcedScrollDelay / 60);
                    ctx.fillText(secs > 0 ? String(secs) : '¡CORRE!', GAME_WIDTH / 2, GAME_HEIGHT / 2);
                    ctx.font = '10px "Rajdhani", sans-serif'; ctx.fillStyle = PALETTE.dim;
                    ctx.fillText('EL NÚCLEO VA A COLAPSAR', GAME_WIDTH / 2, GAME_HEIGHT / 2 + 18);
                    ctx.textAlign = 'left';
                }
            }

            ctx.fillStyle = 'rgba(11,6,32,0.75)'; ctx.fillRect(0, 0, GAME_WIDTH, 20);
            ctx.fillStyle = PALETTE.ink; ctx.font = '10px "Rajdhani", sans-serif';
            ctx.fillText(`Lv${this.player.level}`, 4, 14);
            ctx.fillStyle = PALETTE.hp; ctx.fillText(`HP:${this.player.hp}/${this.player.maxHp}`, 30, 14);
            ctx.fillStyle = PALETTE.en; ctx.fillText(`EN:${this.player.energy}/${this.player.maxEnergy}`, 108, 14);
            ctx.fillStyle = PALETTE.accent2; ctx.fillText(`♥${this.player.lives}`, 178, 14);
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
            if (this.livesLostMessage > 0) {
                ctx.textAlign = 'center';
                ctx.fillStyle = PALETTE.hpLow; ctx.font = 'bold 14px "Orbitron", sans-serif';
                ctx.fillText('¡PERDISTE UNA VIDA!', GAME_WIDTH / 2, 70);
                ctx.fillStyle = PALETTE.ink; ctx.font = '11px "Rajdhani", sans-serif';
                ctx.fillText(`Quedan ${this.player.lives}`, GAME_WIDTH / 2, 86);
                ctx.textAlign = 'left';
            }
            if (this.extraLifeMessage > 0) {
                ctx.textAlign = 'center';
                ctx.fillStyle = PALETTE.accent2; ctx.font = 'bold 14px "Orbitron", sans-serif';
                ctx.fillText('¡VIDA EXTRA!', GAME_WIDTH / 2, 70);
                ctx.fillStyle = PALETTE.ink; ctx.font = '11px "Rajdhani", sans-serif';
                ctx.fillText(`Ahora tienes ${this.player.lives}`, GAME_WIDTH / 2, 86);
                ctx.textAlign = 'left';
            }
        }
        ctx.restore();
    }
}

const game = new Game();

// ---- Modo depuración vía URL, sin tocar la consola ----
// ?level=N        -> entra directo al nivel N (1-9), con vida/energía llenas, saltándose el mapa.
// ?unlock=all     -> desbloquea todos los nodos del mapa para poder elegir cualquiera a mano.
// Combinables: ?level=8&unlock=all dejará además el mapa entero abierto si sales del nivel con ESC.
(function setupDebugMode() {
    const params = new URLSearchParams(location.search);
    if (params.get('unlock') === 'all') {
        game.worldMap.nodes.forEach(n => { n.unlocked = true; });
    }
    const debugLevel = params.get('level');
    if (debugLevel !== null) {
        const idx = parseInt(debugLevel, 10) - 1;
        if (idx >= 0 && idx < LEVELS.length) {
            game.worldMap.nodes[idx].unlocked = true;
            game.gameStarted = true;
            startScreen.style.display = 'none';
            game.loadLevel(idx);
            game.inWorldMap = false;
            game.inLevel = true;
            game.player.hp = game.player.maxHp;
            game.player.energy = game.player.maxEnergy;
            game.player.lives = game.player.maxLives;
        }
    }
})();

function gameLoop() { game.update(); game.draw(); requestAnimationFrame(gameLoop); }
gameLoop();
