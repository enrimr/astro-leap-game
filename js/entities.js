const GAME_WIDTH = 320;
const GAME_HEIGHT = 180;
const PALETTE = {
    bg1: '#0b0620', bg2: '#160c33', ink: '#f5f3ff',
    dim: '#a89ee0', panel: '#1c1140', panelLight: '#2a1a5e',
    accent: '#7cf5ff', accent2: '#ff5ecb', accent3: '#ffd23f',
    hp: '#4ee08a', hpLow: '#ff5c6c', en: '#7cf5ff', xp: '#ffd23f'
};

class Particle {
    constructor(x, y, vx, vy, color, life, size) {
        Object.assign(this, { x, y, vx, vy, color, life, maxLife: life, size });
    }
    update() { this.x += this.vx; this.y += this.vy; this.vy += 0.05; this.life--; return this.life > 0; }
    draw(ctx, cx) {
        const a = Math.max(0, this.life / this.maxLife);
        ctx.globalAlpha = a;
        ctx.fillStyle = this.color;
        const s = this.size * a;
        ctx.fillRect(this.x - cx - s / 2, this.y - s / 2, s, s);
        ctx.globalAlpha = 1;
    }
}

class ParticleSystem {
    constructor() { this.particles = []; }
    burst(x, y, color, count = 8, opts = {}) {
        const { speed = 1.6, life = 22, size = 3 } = opts;
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const spd = speed * (0.4 + Math.random() * 0.8);
            this.particles.push(new Particle(x, y, Math.cos(angle) * spd, Math.sin(angle) * spd - 0.5, color, life * (0.6 + Math.random() * 0.6), size));
        }
    }
    update() { this.particles = this.particles.filter(p => p.update()); }
    draw(ctx, cx) { this.particles.forEach(p => p.draw(ctx, cx)); }
}

const MAX_LIVES = 3;

class Player {
    constructor(x, y) {
        Object.assign(this, {
            x, y, w: 9, h: 13, vx: 0, vy: 0, facing: 1,
            speed: 1.55, jumpPower: -4.3, doubleJumpPower: -3.5, gravity: 0.32,
            onGround: false, jumping: false, usedDoubleJump: false,
            prevJumpKey: false, squash: 1, animT: 0, blinkTimer: 90 + Math.random() * 120,
            level: 1, maxHp: 22, hp: 22, maxEnergy: 10, energy: 10,
            xp: 0, xpToNextLevel: 10, attack: 5, defense: 2,
            lives: MAX_LIVES, maxLives: MAX_LIVES
        });
    }
    update(keys, platforms, particles) {
        const left = keys.ArrowLeft || keys.KeyA;
        const right = keys.ArrowRight || keys.KeyD;
        this.vx = left ? -this.speed : right ? this.speed : 0;
        if (left) this.facing = -1; else if (right) this.facing = 1;

        const jumpKey = !!(keys.Space || keys.ArrowUp || keys.KeyW);
        const jumpPressed = jumpKey && !this.prevJumpKey;
        if (jumpPressed) {
            if (this.onGround) {
                this.vy = this.jumpPower; this.onGround = false; this.jumping = true;
                this.usedDoubleJump = false; this.squash = 1.35;
                if (window.SFX) SFX.jump();
                particles.burst(this.x + this.w / 2, this.y + this.h, PALETTE.accent, 6, { speed: 1, life: 14, size: 2 });
            } else if (!this.usedDoubleJump && this.energy >= 1) {
                this.vy = this.doubleJumpPower; this.usedDoubleJump = true; this.energy -= 1;
                this.squash = 1.5;
                if (window.SFX) SFX.doubleJump();
                particles.burst(this.x + this.w / 2, this.y + this.h / 2, PALETTE.accent2, 10, { speed: 1.6, life: 18, size: 2.5 });
            }
        }
        this.prevJumpKey = jumpKey;

        const wasOnGround = this.onGround;
        this.vy += this.gravity; this.x += this.vx; this.y += this.vy; this.onGround = false;
        platforms.forEach(p => {
            if (this.x < p.x + p.w && this.x + this.w > p.x && this.y < p.y + p.h && this.y + this.h > p.y) {
                if (this.vy > 0 && this.y + this.h <= p.y + 10) {
                    this.y = p.y - this.h; this.vy = 0; this.onGround = true; this.jumping = false; this.usedDoubleJump = false;
                }
            }
        });
        if (!wasOnGround && this.onGround) {
            this.squash = 0.7;
            if (window.SFX) SFX.land();
            particles.burst(this.x + this.w / 2, this.y + this.h, PALETTE.dim, 5, { speed: 0.8, life: 12, size: 2 });
        }
        this.squash += (1 - this.squash) * 0.25;
        this.animT += this.onGround && this.vx !== 0 ? 0.35 : 0.06;
        this.blinkTimer--;
        if (this.blinkTimer <= 0) this.blinkTimer = 90 + Math.random() * 140;
        if (this.x < 0) this.x = 0;
        if (this.y > GAME_HEIGHT) return 'fell';
    }
    collides(e) { return this.x < e.x + e.w && this.x + this.w > e.x && this.y < e.y + e.h && this.y + this.h > e.y; }
    collidesFromAbove(e) { return this.vy > 0 && this.y + this.h <= e.y + e.h / 2 && this.collides(e); }
    gainXP(amt) {
        this.xp += amt;
        let leveled = false;
        while (this.xp >= this.xpToNextLevel) {
            this.xp -= this.xpToNextLevel;
            this.level++; this.xpToNextLevel = Math.floor(this.xpToNextLevel * 1.5);
            this.maxHp += 5; this.hp = this.maxHp; this.maxEnergy += 2; this.energy = this.maxEnergy;
            this.attack += 2; this.defense += 1; leveled = true;
        }
        return leveled;
    }
    takeDamage(amt) { const dmg = Math.max(1, amt - this.defense); this.hp -= dmg; return dmg; }
    draw(ctx, cx) {
        const walking = this.onGround && this.vx !== 0;
        const idleBreathe = this.onGround && !walking ? Math.sin(this.animT) * 0.4 : 0;
        const walkBounce = walking ? Math.abs(Math.sin(this.animT)) * 1.1 : 0;
        const sx = this.x - cx + this.w / 2, sy = this.y + this.h - walkBounce;
        const w = this.w * (2 - this.squash), h = this.h * this.squash + idleBreathe;
        const grad = ctx.createLinearGradient(0, sy - h, 0, sy);
        grad.addColorStop(0, PALETTE.accent);
        grad.addColorStop(1, '#3fa9c9');
        ctx.fillStyle = grad;
        ctx.shadowColor = PALETTE.accent; ctx.shadowBlur = 6;
        ctx.fillRect(sx - w / 2, sy - h, w, h);
        ctx.shadowBlur = 0;
        // pie adelantado: marca el paso mientras camina
        if (walking) {
            ctx.fillStyle = '#3fa9c9';
            const lead = Math.sin(this.animT) > 0 ? sx - w / 2 : sx + w / 2 - 2;
            ctx.fillRect(lead, sy, 2, 1.5);
        }
        ctx.fillStyle = PALETTE.bg1;
        const blink = this.blinkTimer < 6 ? 0.3 : 1;
        const eyeOffset = this.facing > 0 ? 1 : -1;
        ctx.fillRect(sx - 2 + eyeOffset, sy - h + 3, 2, 2 * blink);
        ctx.fillRect(sx + 1 + eyeOffset, sy - h + 3, 2, 2 * blink);
    }
    // Mismo aspecto que draw(), pero a una posición/tamaño fijos en pantalla (para el retrato de combate).
    drawPortrait(ctx, x, y, w, h) {
        const grad = ctx.createLinearGradient(0, y, 0, y + h);
        grad.addColorStop(0, PALETTE.accent);
        grad.addColorStop(1, '#3fa9c9');
        ctx.save();
        ctx.shadowColor = PALETTE.accent; ctx.shadowBlur = 8;
        ctx.fillStyle = grad;
        if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x, y, w, h, 3); ctx.fill(); }
        else ctx.fillRect(x, y, w, h);
        ctx.restore();
        ctx.fillStyle = PALETTE.bg1;
        const es = Math.max(2, Math.round(w * 0.16)), eo = Math.round(w * 0.2);
        const blink = this.blinkTimer < 6 ? 0.3 : 1;
        ctx.fillRect(x + eo, y + h * 0.2, es, es * blink);
        ctx.fillRect(x + w - eo - es, y + h * 0.2, es, es * blink);
    }
}

const ENEMY_STATS = {
    drone:      { level: 1, hp: 7,  atk: 3, def: 1, xp: 5,  color: PALETTE.accent2, speed: 0.3, canJump: false, range: 24, boss: false, flying: false },
    crawler:    { level: 2, hp: 11, atk: 4, def: 2, xp: 8,  color: '#ff8a3f', speed: 0.5, canJump: false, range: 30, boss: false, flying: false },
    spiker:     { level: 3, hp: 15, atk: 6, def: 2, xp: 12, color: '#ff5ecb', speed: 0.5, canJump: true,  range: 30, boss: false, flying: false },
    hoverbot:   { level: 4, hp: 16, atk: 6, def: 3, xp: 14, color: '#7cf5ff', speed: 0.7, canJump: false, range: 40, boss: false, flying: true },
    magnetite:  { level: 5, hp: 22, atk: 8, def: 5, xp: 18, color: '#ffd23f', speed: 0.4, canJump: false, range: 35, boss: false, flying: false },
    ionwisp:    { level: 6, hp: 20, atk: 9, def: 3, xp: 22, color: '#b58bff', speed: 0.9, canJump: false, range: 45, boss: false, flying: true },
    queen_larva:{ level: 8, hp: 55, atk: 12, def: 6, xp: 60, color: '#ff5ecb', speed: 0, canJump: false, range: 0, boss: true, flying: false },
    sentinel:   { level: 12, hp: 90, atk: 17, def: 9, xp: 120, color: '#8b83c2', speed: 0, canJump: false, range: 0, boss: true, flying: false },
    overlord:   { level: 16, hp: 140, atk: 23, def: 12, xp: 220, color: '#ffd23f', speed: 0, canJump: false, range: 0, boss: true, flying: false }
};

class Enemy {
    constructor(x, y, type, customRange = null) {
        const s = ENEMY_STATS[type] || ENEMY_STATS.drone;
        Object.assign(this, {
            x, y, initialX: x, initialY: y, type, alive: true, defeated: false,
            level: s.level, maxHp: s.hp, hp: s.hp, attack: s.atk, defense: s.def, xpReward: s.xp,
            color: s.color, speed: s.speed, canJump: s.canJump, moveRange: customRange ?? s.range,
            isBoss: s.boss, isFlying: s.flying,
            w: s.boss ? 20 : 11, h: s.boss ? 20 : 11,
            vx: s.speed, vy: 0, gravity: s.flying ? 0 : 0.3, onGround: false,
            jumpTimer: 0, jumpCooldown: 120 + Math.random() * 60, flyTimer: Math.random() * 100, flyAmplitude: 14,
            animT: Math.random() * Math.PI * 2, blinkTimer: 60 + Math.random() * 150
        });
    }
    update(platforms) {
        if (!this.alive) return;
        this.animT += 0.07;
        this.blinkTimer--;
        if (this.blinkTimer <= 0) this.blinkTimer = 60 + Math.random() * 150;
        if (this.isBoss) return;
        if (this.isFlying) {
            this.flyTimer++;
            this.x += this.vx;
            if (Math.abs(this.x - this.initialX) > this.moveRange) this.vx = -this.vx;
            this.y = this.initialY + Math.sin(this.flyTimer * 0.05) * this.flyAmplitude;
            return;
        }
        if (this.speed > 0) {
            this.x += this.vx;
            if (Math.abs(this.x - this.initialX) > this.moveRange) this.vx = -this.vx;
        }
        this.vy += this.gravity; this.y += this.vy;
        this.onGround = false;
        let platform = null;
        for (const p of platforms) {
            if (this.x < p.x + p.w && this.x + this.w > p.x && this.y < p.y + p.h && this.y + this.h > p.y) {
                if (this.vy > 0 && this.y + this.h <= p.y + 10) {
                    this.y = p.y - this.h; this.vy = 0; this.onGround = true; platform = p;
                }
            }
        }
        if (this.onGround && platform && !this.canJump) {
            const margin = 3;
            if (this.vx > 0 && this.x + this.w >= platform.x + platform.w - margin) this.vx = -this.vx;
            if (this.vx < 0 && this.x <= platform.x + margin) this.vx = -this.vx;
        }
        if (this.canJump && this.onGround) {
            this.jumpTimer++;
            if (this.jumpTimer >= this.jumpCooldown) { this.vy = -3.4; this.jumpTimer = 0; this.jumpCooldown = 120 + Math.random() * 60; }
        }
    }
    takeDamage(amt) {
        const dmg = Math.max(1, amt - this.defense); this.hp -= dmg;
        if (this.hp <= 0) { this.defeated = true; this.alive = false; }
        return dmg;
    }
    draw(ctx, cx) {
        if (!this.alive) return;
        const sx = this.x - cx, sy = this.y;
        if (this.isBoss) this.drawBoss(ctx, sx, sy, this.w, this.h);
        else this.drawRegular(ctx, sx, sy, this.w, this.h);
        ctx.fillStyle = PALETTE.dim; ctx.font = '7px "Rajdhani", sans-serif';
        ctx.fillText(`Lv${this.level}`, sx, sy - 2);
        if (this.isBoss) { ctx.fillStyle = PALETTE.accent3; ctx.fillText('JEFE', sx, sy - 10); }
    }
    // Mismo aspecto que draw(), pero a una posición/tamaño fijos en pantalla (para el retrato de combate).
    drawPortrait(ctx, x, y, w, h) {
        if (this.isBoss) this.drawBoss(ctx, x, y, w, h);
        else this.drawRegular(ctx, x, y, w, h);
    }
    // Enemigos comunes: caja redondeada con ojos, más flourish según tipo. Reutilizado por draw()/drawPortrait().
    drawRegular(ctx, x, y, w, h) {
        const bob = this.isFlying ? 0 : Math.sin(this.animT) * (h * 0.05);
        const sy = y + bob;
        ctx.save();
        ctx.shadowColor = this.color; ctx.shadowBlur = 8;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(x, sy, w, h, 3) : ctx.rect(x, sy, w, h);
        ctx.fill();
        ctx.restore();

        if (this.type === 'spiker') {
            // Púa superior — distingue al erizo del dron base del que evoluciona
            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.moveTo(x + w * 0.5, sy - h * 0.35); ctx.lineTo(x + w * 0.72, sy + 1); ctx.lineTo(x + w * 0.28, sy + 1);
            ctx.closePath(); ctx.fill();
        } else if (this.type === 'crawler') {
            // Patitas alternas mientras avanza — proporcionales a w/h, igual que los ojos
            ctx.fillStyle = '#ff8a3f';
            const legSize = Math.max(2, Math.round(w * 0.18));
            const stride = Math.sin(this.animT) * h * 0.18;
            ctx.fillRect(x + w * 0.09, sy + h - legSize * 0.5 + Math.max(0, stride), legSize, legSize);
            ctx.fillRect(x + w - w * 0.09 - legSize, sy + h - legSize * 0.5 + Math.max(0, -stride), legSize, legSize);
        } else if (this.type === 'magnetite') {
            // Anillo magnético pulsante
            const pulse = 0.4 + Math.sin(this.animT * 1.3) * 0.3;
            ctx.save();
            ctx.globalAlpha = Math.max(0, pulse);
            ctx.strokeStyle = this.color; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.arc(x + w / 2, sy + h / 2, w * 0.75, 0, Math.PI * 2); ctx.stroke();
            ctx.restore();
        } else if (this.isFlying) {
            // Brillo de propulsión bajo el chasis
            const glow = 0.4 + Math.sin(this.animT * 2) * 0.25;
            ctx.save();
            ctx.globalAlpha = Math.max(0, glow); ctx.fillStyle = this.color;
            ctx.beginPath(); ctx.ellipse(x + w / 2, sy + h + 1, w * 0.3, h * 0.12, 0, 0, Math.PI * 2); ctx.fill();
            ctx.restore();
        }

        ctx.fillStyle = PALETTE.bg1;
        // Proporcionales a w/h, no en píxeles fijos — así el bicho se ve igual en el mapa (11px) que en el retrato de combate (24px)
        const es = Math.max(2, Math.round(w * 0.18)), eo = Math.round(w * 0.22), ey = sy + h * 0.27;
        const blink = this.blinkTimer < 5 ? 0.25 : 1;
        ctx.fillRect(x + eo, ey, es, es * blink);
        ctx.fillRect(x + w - eo - es, ey, es, es * blink);
    }
    // Jefes: silueta y animación propias por tipo, coherentes con lore/character-bible.html
    drawBoss(ctx, x, y, w, h) {
        if (this.type === 'queen_larva') this.drawQueenLarva(ctx, x, y, w, h);
        else if (this.type === 'sentinel') this.drawSentinel(ctx, x, y, w, h);
        else if (this.type === 'overlord') this.drawOverlord(ctx, x, y, w, h);
        else { // fallback genérico por si se añade un jefe sin diseño propio todavía
            ctx.save();
            ctx.shadowColor = this.color; ctx.shadowBlur = 10; ctx.fillStyle = this.color;
            ctx.beginPath();
            if (ctx.roundRect) ctx.roundRect(x, y, w, h, 4); else ctx.rect(x, y, w, h);
            ctx.fill(); ctx.restore();
        }
    }
    // Reina Larva: masa orgánica que respira, con crías/bultos alrededor y mirada triste.
    drawQueenLarva(ctx, x, y, w, h) {
        const t = this.animT;
        const cx = x + w / 2, cy = y + h / 2;
        const pulse = 1 + Math.sin(t) * 0.045;
        ctx.save();
        ctx.translate(cx, cy); ctx.scale(pulse, pulse);
        ctx.shadowColor = '#ff5ecb'; ctx.shadowBlur = w * 0.4;
        const grad = ctx.createRadialGradient(-w * 0.12, -h * 0.18, w * 0.05, 0, 0, w * 0.62);
        grad.addColorStop(0, '#ffb3e6'); grad.addColorStop(1, '#c93f96');
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.ellipse(0, 0, w * 0.5, h * 0.48, 0, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#c93f96';
        [[-0.54, -0.05], [0.54, -0.1], [-0.36, 0.5], [0.34, 0.52]].forEach(([bx, by]) => {
            ctx.beginPath(); ctx.arc(bx * w, by * h, w * 0.1, 0, Math.PI * 2); ctx.fill();
        });
        const blink = this.blinkTimer < 5 ? 0.15 : 1;
        ctx.fillStyle = '#0b0620';
        ctx.beginPath(); ctx.ellipse(-w * 0.1, -h * 0.06, w * 0.1, h * 0.12 * blink, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(w * 0.12, -h * 0.02, w * 0.08, h * 0.1 * blink, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        // boca triste — ni villana ni feliz, una víctima
        ctx.strokeStyle = '#0b0620'; ctx.globalAlpha = 0.4; ctx.lineWidth = Math.max(1, w * 0.045);
        ctx.beginPath(); ctx.moveTo(cx - w * 0.16, cy + h * 0.22); ctx.quadraticCurveTo(cx, cy + h * 0.19, cx + w * 0.17, cy + h * 0.21); ctx.stroke();
        ctx.globalAlpha = 1;
    }
    // Centinela: bloque simétrico y ordenado con grietas rosas de la Red superpuestas — dos arquitecturas en conflicto.
    drawSentinel(ctx, x, y, w, h) {
        const t = this.animT;
        const shake = Math.sin(t * 3.1) * (w * 0.012);
        ctx.save();
        ctx.translate(shake, 0);
        ctx.shadowColor = '#8b83c2'; ctx.shadowBlur = w * 0.3;
        const bw = w * 0.72, bh = h * 0.86, bx = x + (w - bw) / 2, by = y + h * 0.08;
        const grad = ctx.createLinearGradient(0, by, 0, by + bh);
        grad.addColorStop(0, '#c9c4e8'); grad.addColorStop(1, '#6c63a8');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(bx, by, bw, bh, w * 0.08) : ctx.rect(bx, by, bw, bh);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = '#453d80'; ctx.lineWidth = Math.max(1, w * 0.05); ctx.strokeRect(bx, by, bw, bh);
        ctx.fillStyle = '#8b83c2';
        ctx.fillRect(x, y + h * 0.35, w * 0.12, h * 0.4);
        ctx.fillRect(x + w - w * 0.12, y + h * 0.35, w * 0.12, h * 0.4);
        ctx.strokeStyle = '#ff5ecb'; ctx.globalAlpha = 0.6 + Math.sin(t * 2) * 0.3; ctx.lineWidth = Math.max(1, w * 0.045);
        ctx.beginPath();
        ctx.moveTo(bx + bw * 0.12, by + bh * 0.25); ctx.lineTo(bx + bw * 0.5, by + bh * 0.25);
        ctx.lineTo(bx + bw * 0.35, by + bh * 0.55); ctx.lineTo(bx + bw * 0.68, by + bh * 0.55);
        ctx.lineTo(bx + bw * 0.55, by + bh * 0.92);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#0b0620';
        ctx.fillRect(bx + bw * 0.14, by + bh * 0.22, bw * 0.72, bh * 0.2);
        const glow = 0.6 + Math.sin(t * 1.6) * 0.4;
        const blink = this.blinkTimer < 5 ? 0.2 : 1;
        ctx.fillStyle = '#7cf5ff'; ctx.shadowColor = '#7cf5ff'; ctx.shadowBlur = w * 0.15 * glow;
        ctx.fillRect(bx + bw * 0.2, by + bh * 0.26, bw * 0.18, bh * 0.12 * blink);
        ctx.fillRect(bx + bw * 0.6, by + bh * 0.26, bw * 0.18, bh * 0.12 * blink);
        ctx.shadowBlur = 0;
        ctx.restore();
    }
    // Overlord: fragmento facetado e inestable de la Red — sin cara fija, girando ligeramente, núcleo pulsante.
    drawOverlord(ctx, x, y, w, h) {
        const t = this.animT;
        const cx = x + w / 2, cy = y + h / 2;
        const rot = Math.sin(t * 0.6) * 0.09;
        ctx.save();
        ctx.translate(cx, cy); ctx.rotate(rot);
        ctx.shadowColor = '#ffd23f'; ctx.shadowBlur = w * 0.35;
        const grad = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
        grad.addColorStop(0, '#fff3c4'); grad.addColorStop(1, '#ff5c6c');
        ctx.fillStyle = grad;
        const pts = [[0, -0.38], [0.25, -0.2], [0.325, 0.1], [0.1, 0.375], [-0.1, 0.375], [-0.325, 0.1], [-0.25, -0.2]];
        ctx.beginPath();
        pts.forEach(([px, py], i) => { const X = px * w, Y = py * h; i === 0 ? ctx.moveTo(X, Y) : ctx.lineTo(X, Y); });
        ctx.closePath(); ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(255,243,196,0.5)';
        ctx.beginPath();
        ctx.moveTo(0, -0.38 * h); ctx.lineTo(0.25 * w, -0.2 * h); ctx.lineTo(0.1 * w, -0.15 * h); ctx.lineTo(-0.075 * w, -0.25 * h);
        ctx.closePath(); ctx.fill();
        ctx.restore();
        const pulse = 0.7 + Math.sin(t * 2.3) * 0.3;
        const blink = this.blinkTimer < 5 ? 0.3 : 1;
        ctx.fillStyle = '#0b0620';
        ctx.beginPath(); ctx.arc(cx, cy, w * 0.19, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffd23f'; ctx.shadowColor = '#ffd23f'; ctx.shadowBlur = w * 0.25 * pulse;
        ctx.beginPath(); ctx.arc(cx, cy, w * 0.08 * pulse * blink, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
    }
}

class Platform {
    constructor(x, y, w, h, variant = 'normal') { Object.assign(this, { x, y, w, h, variant }); }
    draw(ctx, cx) {
        const sx = this.x - cx;
        const grad = ctx.createLinearGradient(0, this.y, 0, this.y + this.h);
        if (this.variant === 'ice') { grad.addColorStop(0, '#bfe9ff'); grad.addColorStop(1, '#5fb8d9'); }
        else if (this.variant === 'metal') { grad.addColorStop(0, '#8892b0'); grad.addColorStop(1, '#4a5170'); }
        else { grad.addColorStop(0, PALETTE.panelLight); grad.addColorStop(1, PALETTE.panel); }
        ctx.fillStyle = grad;
        ctx.fillRect(sx, this.y, this.w, this.h);
        ctx.fillStyle = PALETTE.accent; ctx.globalAlpha = 0.5;
        ctx.fillRect(sx, this.y, this.w, 1);
        ctx.globalAlpha = 1;
    }
}

class GoalFlag {
    constructor(x, y) { this.x = x; this.y = y; this.w = 8; this.h = 22; this.t = 0; }
    update() { this.t = (this.t + 1) % 120; }
    draw(ctx, cx) {
        const sx = this.x - cx;
        ctx.fillStyle = PALETTE.dim;
        ctx.fillRect(sx, this.y, 2, this.h);
        const pulse = 0.6 + Math.sin(this.t * 0.1) * 0.4;
        ctx.save();
        ctx.shadowColor = PALETTE.accent3; ctx.shadowBlur = 10 * pulse;
        ctx.fillStyle = PALETTE.accent3;
        ctx.beginPath();
        ctx.arc(sx + 2, this.y + 6, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        ctx.fillStyle = PALETTE.ink; ctx.font = '7px "Rajdhani", sans-serif';
        ctx.fillText('BASE', sx - 6, this.y - 3);
    }
}

// Cápsula de soporte vital: coleccionable opcional escondido fuera del camino principal, da +1 vida.
class LifeCapsule {
    constructor(x, y) { this.x = x; this.y = y; this.w = 8; this.h = 9; this.collected = false; this.t = Math.random() * Math.PI * 2; }
    update() { this.t += 0.07; }
    collides(e) { return this.x < e.x + e.w && this.x + this.w > e.x && this.y < e.y + e.h && this.y + this.h > e.y; }
    draw(ctx, cx) {
        if (this.collected) return;
        const bob = Math.sin(this.t) * 2.5;
        const sx = this.x - cx, sy = this.y + bob;
        const pulse = 0.6 + Math.sin(this.t * 1.4) * 0.4;
        ctx.save();
        ctx.shadowColor = PALETTE.accent2; ctx.shadowBlur = 7 + pulse * 4;
        const grad = ctx.createLinearGradient(0, sy, 0, sy + this.h);
        grad.addColorStop(0, '#ffb3e6'); grad.addColorStop(1, PALETTE.accent2);
        ctx.fillStyle = grad;
        if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(sx, sy, this.w, this.h, 3); ctx.fill(); }
        else ctx.fillRect(sx, sy, this.w, this.h);
        ctx.restore();
        ctx.fillStyle = PALETTE.bg1; ctx.font = '7px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('♥', sx + this.w / 2, sy + this.h - 2);
        ctx.textAlign = 'left';
    }
}

// Célula de energía: coleccionable opcional escondido, sube el máximo de Energía en +1 para siempre.
class EnergyCell {
    constructor(x, y) { this.x = x; this.y = y; this.w = 8; this.h = 9; this.collected = false; this.t = Math.random() * Math.PI * 2; }
    update() { this.t += 0.07; }
    collides(e) { return this.x < e.x + e.w && this.x + this.w > e.x && this.y < e.y + e.h && this.y + this.h > e.y; }
    draw(ctx, cx) {
        if (this.collected) return;
        const bob = Math.sin(this.t) * 2.5;
        const sx = this.x - cx, sy = this.y + bob;
        const pulse = 0.6 + Math.sin(this.t * 1.4) * 0.4;
        ctx.save();
        ctx.shadowColor = PALETTE.en; ctx.shadowBlur = 7 + pulse * 4;
        const grad = ctx.createLinearGradient(0, sy, 0, sy + this.h);
        grad.addColorStop(0, '#d6fbff'); grad.addColorStop(1, PALETTE.en);
        ctx.fillStyle = grad;
        if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(sx, sy, this.w, this.h, 3); ctx.fill(); }
        else ctx.fillRect(sx, sy, this.w, this.h);
        ctx.restore();
        ctx.fillStyle = PALETTE.bg1; ctx.font = '7px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('⚡', sx + this.w / 2, sy + this.h - 2);
        ctx.textAlign = 'left';
    }
}

class LevelNode {
    constructor(x, y, levelIndex, name) {
        this.x = x; this.y = y; this.levelIndex = levelIndex; this.name = name;
        this.completed = false; this.unlocked = levelIndex === 0;
        this.w = 16; this.h = 16; this.t = 0;
    }
    update() { this.t = (this.t + 1) % 120; }
    draw(ctx) {
        const glow = this.unlocked && !this.completed ? 0.5 + Math.sin(this.t * 0.1) * 0.5 : 0;
        ctx.save();
        if (glow > 0) { ctx.shadowColor = PALETTE.accent; ctx.shadowBlur = 10 * glow; }
        ctx.fillStyle = this.completed ? PALETTE.accent3 : this.unlocked ? PALETTE.accent : PALETTE.panelLight;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.w / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        ctx.fillStyle = PALETTE.bg1;
        ctx.font = 'bold 10px "Rajdhani", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText((this.levelIndex + 1).toString(), this.x, this.y + 4);
        ctx.textAlign = 'left';
        if (this.completed) {
            ctx.fillStyle = PALETTE.bg1;
            ctx.font = '9px sans-serif';
            ctx.fillText('✓', this.x - 3, this.y - 8);
        }
    }
}

class WorldMap {
    constructor() {
        this.nodes = [
            new LevelNode(28, 140, 0, 'Cráter de Amerizaje'),
            new LevelNode(58, 108, 1, 'Grietas de Hielo'),
            new LevelNode(90, 138, 2, 'Nido de la Reina Larva'),
            new LevelNode(130, 104, 3, 'Chatarral Magnético'),
            new LevelNode(162, 74, 4, 'Tormenta de Iones'),
            new LevelNode(195, 104, 5, 'Núcleo del Centinela'),
            new LevelNode(230, 134, 6, 'Muelle de Carga'),
            new LevelNode(262, 100, 7, 'Túnel de Escape'),
            new LevelNode(298, 68, 8, 'Núcleo del Reactor')
        ];
        this.currentNodeIndex = 0;
        this.paths = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 8]];
    }
    update(keys) {
        const node = this.nodes[this.currentNodeIndex];
        if (keys.ArrowRight || keys.KeyD) {
            if (this.currentNodeIndex < this.nodes.length - 1 && this.nodes[this.currentNodeIndex + 1].unlocked) {
                this.currentNodeIndex++; keys.ArrowRight = false; keys.KeyD = false;
                if (window.SFX) SFX.select();
            }
        }
        if (keys.ArrowLeft || keys.KeyA) {
            if (this.currentNodeIndex > 0) {
                this.currentNodeIndex--; keys.ArrowLeft = false; keys.KeyA = false;
                if (window.SFX) SFX.select();
            }
        }
        this.nodes.forEach(n => n.update());
        if (keys.Space || keys.Enter) {
            if (node.unlocked) { keys.Space = false; keys.Enter = false; if (window.SFX) SFX.confirm(); return node.levelIndex; }
        }
        return null;
    }
    draw(ctx) {
        const grad = ctx.createLinearGradient(0, 0, 0, GAME_HEIGHT);
        grad.addColorStop(0, PALETTE.bg2); grad.addColorStop(1, PALETTE.bg1);
        ctx.fillStyle = grad; ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
        ctx.fillStyle = PALETTE.ink; ctx.font = 'bold 12px "Orbitron", sans-serif';
        ctx.fillText('MAPA ESTELAR', 100, 16);
        ctx.strokeStyle = PALETTE.dim; ctx.globalAlpha = 0.4; ctx.setLineDash([2, 3]);
        this.paths.forEach(([a, b]) => {
            const n1 = this.nodes[a], n2 = this.nodes[b];
            ctx.beginPath(); ctx.moveTo(n1.x, n1.y); ctx.lineTo(n2.x, n2.y); ctx.stroke();
        });
        ctx.setLineDash([]); ctx.globalAlpha = 1;
        this.nodes.forEach(n => n.draw(ctx));
        const cur = this.nodes[this.currentNodeIndex];
        ctx.save();
        ctx.shadowColor = PALETTE.accent2; ctx.shadowBlur = 6;
        ctx.fillStyle = PALETTE.accent2;
        ctx.beginPath(); ctx.arc(cur.x, cur.y + 14, 3, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        ctx.fillStyle = PALETTE.dim; ctx.font = '9px "Rajdhani", sans-serif';
        ctx.fillText('← →: Navegar', 10, 168);
        ctx.fillText('ESPACIO: Entrar', 220, 168);
        ctx.fillStyle = PALETTE.panel; ctx.fillRect(8, 24, 304, 16);
        ctx.fillStyle = PALETTE.accent; ctx.font = '9px "Rajdhani", sans-serif';
        ctx.fillText(`Nivel ${cur.levelIndex + 1}: ${LEVELS[cur.levelIndex].name}`, 14, 35);
    }
    completeLevel(levelIndex) {
        this.nodes[levelIndex].completed = true;
        if (levelIndex < this.nodes.length - 1) this.nodes[levelIndex + 1].unlocked = true;
    }
}

class CombatSystem {
    constructor(player, enemy) {
        this.player = player; this.enemy = enemy; this.turn = 'player';
        this.message = 'Tu turno. Elige acción:';
        this.actions = ['ATACAR', 'HABILIDAD', 'DEFENDER', 'HUIR'];
        this.defending = false; this.active = true; this.result = null; this.messageTimer = 0;
        this.selectedIndex = 0; this.shake = 0;
    }
    handleInput(key) {
        if (this.turn !== 'player' || this.messageTimer > 0) return;
        if (key === 'ArrowUp' || key === 'ArrowLeft') { this.selectedIndex = (this.selectedIndex + this.actions.length - 1) % this.actions.length; if (window.SFX) SFX.select(); return; }
        if (key === 'ArrowDown' || key === 'ArrowRight') { this.selectedIndex = (this.selectedIndex + 1) % this.actions.length; if (window.SFX) SFX.select(); return; }
        if (key === 'Space' || key === 'Enter') { this.executePlayerAction(this.selectedIndex); return; }
        const idx = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(key);
        if (idx >= 0) { this.selectedIndex = idx; this.executePlayerAction(idx); }
    }
    executePlayerAction(action) {
        this.defending = false;
        if (window.SFX) SFX.confirm();
        if (action === 0) {
            const dealt = this.enemy.takeDamage(Math.floor(this.player.attack * (0.8 + Math.random() * 0.4)));
            this.message = `Disparaste! Daño: ${dealt}`; this.shake = 6;
            if (window.SFX) SFX.hitEnemy();
        } else if (action === 1) {
            if (this.player.energy >= 3) {
                const dealt = this.enemy.takeDamage(Math.floor(this.player.attack * 1.5));
                this.player.energy -= 3; this.message = `¡Sobrecarga! Daño: ${dealt}`; this.shake = 9;
                if (window.SFX) SFX.hitEnemy();
            } else { this.message = 'Energía insuficiente!'; if (window.SFX) SFX.select(); return; }
        } else if (action === 2) {
            this.defending = true; this.message = 'Escudos arriba...';
        } else if (action === 3) {
            if (Math.random() < 0.5) { this.message = 'Escapaste!'; this.result = 'flee'; this.active = false; if (window.SFX) SFX.flee(); return; }
            else { this.message = 'No pudiste escapar!'; }
        }
        this.messageTimer = 60;
        if (this.enemy.defeated) { this.result = 'win'; this.active = false; return; }
        this.turn = 'enemy';
    }
    update() {
        // El jugador y el enemigo no pasan por su update() normal durante el combate,
        // así que sus retratos animan aquí (parpadeo, respiración, pulso de los jefes).
        this.player.animT += 0.06;
        this.player.blinkTimer--;
        if (this.player.blinkTimer <= 0) this.player.blinkTimer = 90 + Math.random() * 140;
        this.enemy.animT += 0.07;
        this.enemy.blinkTimer--;
        if (this.enemy.blinkTimer <= 0) this.enemy.blinkTimer = 60 + Math.random() * 150;
        if (this.shake > 0) this.shake *= 0.85;
        if (this.messageTimer > 0) {
            this.messageTimer--;
            if (this.messageTimer === 0 && this.turn === 'enemy') {
                const dmg = Math.floor(this.enemy.attack * (0.8 + Math.random() * 0.4));
                let rec;
                if (this.defending) { rec = Math.max(1, Math.floor(dmg * 0.5)); this.player.hp -= rec; }
                else { rec = this.player.takeDamage(dmg); }
                this.message = `${this.enemy.type} ataca! Daño: ${rec}`; this.messageTimer = 60; this.shake = 6;
                if (window.SFX) SFX.hitPlayer();
                if (this.player.hp <= 0) { this.result = 'lose'; this.active = false; return; }
                this.turn = 'player';
                setTimeout(() => { this.message = 'Tu turno. Elige acción:'; }, 1000);
            }
        }
    }
    draw(ctx) {
        const shakeX = this.shake ? (Math.random() - 0.5) * this.shake : 0;
        ctx.save();
        ctx.translate(shakeX, 0);
        const grad = ctx.createLinearGradient(0, 0, 0, GAME_HEIGHT);
        grad.addColorStop(0, PALETTE.bg2); grad.addColorStop(1, PALETTE.bg1);
        ctx.fillStyle = grad; ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
        ctx.fillStyle = PALETTE.ink; ctx.font = 'bold 13px "Orbitron", sans-serif';
        ctx.fillText('DUELO DE ENERGÍA', 90, 16);

        // Columna del enemigo (retrato a la derecha, stats a la izquierda del retrato)
        const enemyPortraitSize = this.enemy.isBoss ? 32 : 24;
        this.enemy.drawPortrait(ctx, 280 - enemyPortraitSize / 2, 24, enemyPortraitSize, enemyPortraitSize);
        ctx.fillStyle = PALETTE.ink; ctx.font = '10px "Rajdhani", sans-serif';
        ctx.fillText(`${this.enemy.type} Lv${this.enemy.level}`, 185, 34);
        ctx.fillText(`HP: ${this.enemy.hp}/${this.enemy.maxHp}`, 185, 46);
        const ehp = Math.max(0, this.enemy.hp / this.enemy.maxHp);
        ctx.fillStyle = PALETTE.panel; ctx.fillRect(185, 50, 78, 6);
        ctx.fillStyle = ehp < 0.3 ? PALETTE.hpLow : PALETTE.hp; ctx.fillRect(185, 50, 78 * ehp, 6);

        // Columna del jugador (retrato a la izquierda, stats a la derecha del retrato)
        this.player.drawPortrait(ctx, 14, 20, 20, 26);
        ctx.fillStyle = PALETTE.ink; ctx.font = '10px "Rajdhani", sans-serif';
        ctx.fillText(`TÚ Lv${this.player.level}  ♥${this.player.lives}`, 40, 30);
        ctx.fillText(`HP: ${this.player.hp}/${this.player.maxHp}`, 40, 42);
        const php = Math.max(0, this.player.hp / this.player.maxHp);
        ctx.fillStyle = PALETTE.panel; ctx.fillRect(40, 46, 60, 5);
        ctx.fillStyle = php < 0.3 ? PALETTE.hpLow : PALETTE.hp; ctx.fillRect(40, 46, 60 * php, 5);
        ctx.fillStyle = PALETTE.ink; ctx.fillText(`EN: ${this.player.energy}/${this.player.maxEnergy}`, 40, 58);
        const pep = Math.max(0, this.player.energy / this.player.maxEnergy);
        ctx.fillStyle = PALETTE.panel; ctx.fillRect(40, 62, 60, 5);
        ctx.fillStyle = PALETTE.en; ctx.fillRect(40, 62, 60 * pep, 5);

        // Caja de mensaje (banda propia, sin solapar retratos ni menú)
        ctx.fillStyle = PALETTE.panel; ctx.fillRect(10, 78, 300, 20);
        ctx.fillStyle = PALETTE.ink; ctx.font = '10px "Rajdhani", sans-serif';
        ctx.fillText(this.message, 16, 92);

        // Menú de acciones (banda propia, debajo del todo)
        if (this.turn === 'player' && this.messageTimer === 0) {
            this.actions.forEach((a, i) => {
                const by = 116 + i * 15;
                if (i === this.selectedIndex) {
                    ctx.fillStyle = PALETTE.accent; ctx.globalAlpha = 0.25;
                    ctx.fillRect(9, by - 10, 130, 13);
                    ctx.globalAlpha = 1; ctx.fillStyle = PALETTE.accent;
                } else { ctx.fillStyle = PALETTE.dim; }
                ctx.font = '10px "Rajdhani", sans-serif';
                ctx.fillText(`${i + 1}. ${a}`, 14, by);
            });
        }
        ctx.restore();
    }
}
