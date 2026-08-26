const GAME_WIDTH = 320;
const GAME_HEIGHT = 180;

// Generador de números aleatorios intercambiable: Math.random por defecto, pero Game lo sustituye
// por uno determinista (sembrado por la fecha, ver mulberry32 en game.js) durante el Reto Diario,
// para que el daño, las fugas y el timing de los enemigos sean IGUALES para todo el mundo ese
// día — si no, comparar tiempos no significaría nada. Solo se usa en los sitios que afectan al
// RESULTADO (variación de daño, huir, cuándo salta/vuela un enemigo); lo puramente visual
// (partículas, parpadeo, temblor de pantalla) sigue con Math.random real — no aporta nada a la
// comparación y sembrarlo también solo añadiría complicación sin beneficio.
let RNG = Math.random;
const PALETTE = {
    bg1: '#0b0620', bg2: '#160c33', ink: '#f5f3ff',
    dim: '#a89ee0', panel: '#1c1140', panelLight: '#2a1a5e',
    accent: '#7cf5ff', accent2: '#ff5ecb', accent3: '#ffd23f',
    hp: '#4ee08a', hpLow: '#ff5c6c', en: '#7cf5ff', xp: '#ffd23f'
};

// Escuadrón Chatarra: los 4 héroes jugables. Cada uno se desbloquea al derrotar
// al jefe de un mundo (salvo Kes, que empieza desbloqueada) y usa el MISMO botón
// de salto que ya existe para una habilidad de traversal propia — ver Player.update().
const HERO_ORDER = ['kes', 'bolt', 'shade', 'scrap'];
// combatName: el nombre de la acción "HABILIDAD" del menú de combate (CombatSystem), propio de
// cada piloto — distinto de `ability`, que es la habilidad de TRAVERSAL en plataformas. Mismo
// daño (×1.5 el ataque base, ver CombatSystem.executePlayerAction) para los 4: esto es solo
// identidad, un nombre acorde a cada personaje según LORE.md §3, no un cambio de mecánica.
const HEROES = {
    kes:   { id: 'kes',   name: 'Kes',   ability: 'Doble salto',     combatName: 'Sobrecarga',       color: PALETTE.accent,  requiresBoss: null,
             desc: 'Un segundo impulso en el aire para ganar altura extra. Cuesta 1 de Energía.' },
    bolt:  { id: 'bolt',  name: 'Bolt',  ability: 'Vuelo breve',     combatName: 'Pulso EMP',         color: '#ffd23f',        requiresBoss: 'queen_larva',
             desc: 'Mantén pulsado el salto en el aire para ascender despacio mientras te dure la Energía.' },
    shade: { id: 'shade', name: 'Shade', ability: 'Impulso lateral', combatName: 'Zarpazo',           color: PALETTE.accent2,  requiresBoss: 'sentinel',
             desc: 'Pulsa salto una vez en el aire para lanzarte hacia delante y cruzar huecos anchos.' },
    scrap: { id: 'scrap', name: 'Scrap', ability: 'Rompe refuerzos', combatName: 'Puño Cibernético',  color: '#c98a2b',        requiresBoss: 'overlord',
             desc: 'Sin salto extra, pero camina sobre plataformas de franjas ámbar para romperlas y colarse.' }
};

// Árbol de mejoras (DESIGN.md §2.22): 1 punto por subida de nivel, 3 ramas × 3 nodos con
// prerrequisito lineal (el nodo 2 de una rama exige su nodo 1, etc.). Encima de las subidas
// automáticas de gainXP, no en su lugar — el árbol es expresión del jugador, no reequilibrio.
// NINGÚN nodo toca la geometría del movimiento (salto/dash/velocidad): los invariantes de level
// design (BFS, puertas de 40, huecos de hielo) están protegidos por tests justo para eso.
const SKILL_TREE = {
    combate: {
        name: 'COMBATE', color: PALETTE.accent2,
        nodes: [
            { id: 'crit', name: 'Punto débil', desc: 'Atacar tiene un 25% de probabilidad de crítico: daño ×1.5.' },
            { id: 'guardia', name: 'Guardia férrea', desc: 'Defender reduce el golpe al 35% en vez de al 50%.' },
            { id: 'ejecutor', name: 'Ejecutor', desc: 'La Habilidad de tu piloto hace daño ×2 en vez de ×1.5.' }
        ]
    },
    energia: {
        name: 'ENERGÍA', color: PALETTE.en,
        nodes: [
            { id: 'reciclador', name: 'Reciclador', desc: 'Cada enemigo derrotado da +3 de Energía en vez de +2.' },
            { id: 'eficiente', name: 'Habilidad eficiente', desc: 'La Habilidad en combate cuesta 2 de Energía en vez de 3.' },
            { id: 'nucleo', name: 'Núcleo amplio', desc: '+4 de Energía máxima, al instante y para siempre.' }
        ]
    },
    supervivencia: {
        name: 'SUPERVIVENCIA', color: PALETTE.hp,
        nodes: [
            { id: 'blindaje', name: 'Blindaje', desc: '+6 de HP máximo, al instante y para siempre.' },
            { id: 'aislante', name: 'Aislante', desc: 'Los peligros del terreno (puertas, tormenta, muro) hacen la mitad de daño.' },
            { id: 'emergencia', name: 'Sistema de emergencia', desc: 'Una vez por nivel, un golpe letal te deja a 1 HP en vez de matarte.' }
        ]
    }
};

// Retratos de los héroes reutilizables por id, sin depender de una instancia de
// Player — así el selector de personaje del mapa puede dibujar los 4 sin tener
// que crear jugadores de mentira. Player.drawPortrait() delega aquí con this.character.
function drawHeroPortrait(ctx, heroId, x, y, w, h, facing = 1) {
    if (heroId === 'bolt') return drawBoltPortrait(ctx, x, y, w, h);
    if (heroId === 'shade') return drawShadePortrait(ctx, x, y, w, h);
    if (heroId === 'scrap') return drawScrapPortrait(ctx, x, y, w, h);
    return drawKesPortrait(ctx, x, y, w, h, facing);
}
function drawKesPortrait(ctx, x, y, w, h) {
    const grad = ctx.createLinearGradient(0, y, 0, y + h);
    grad.addColorStop(0, PALETTE.accent); grad.addColorStop(1, '#3fa9c9');
    ctx.save();
    ctx.shadowColor = PALETTE.accent; ctx.shadowBlur = 8;
    ctx.fillStyle = grad;
    if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x, y, w, h, 3); ctx.fill(); }
    else ctx.fillRect(x, y, w, h);
    ctx.restore();
    ctx.fillStyle = PALETTE.bg1;
    const es = Math.max(2, Math.round(w * 0.16)), eo = Math.round(w * 0.2);
    ctx.fillRect(x + eo, y + h * 0.2, es, es);
    ctx.fillRect(x + w - eo - es, y + h * 0.2, es, es);
}
function drawBoltPortrait(ctx, x, y, w, h) {
    const cx = x + w / 2, cy = y + h / 2, r = Math.min(w, h) / 2;
    const grad = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.4, r * 0.1, cx, cy, r);
    grad.addColorStop(0, '#ffe28a'); grad.addColorStop(1, '#ffd23f');
    ctx.save();
    ctx.shadowColor = '#ffd23f'; ctx.shadowBlur = 8;
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#0b0620';
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.32, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.13, 0, Math.PI * 2); ctx.fill();
}
function drawShadePortrait(ctx, x, y, w, h) {
    const grad = ctx.createLinearGradient(0, y, 0, y + h);
    grad.addColorStop(0, '#ffb3e6'); grad.addColorStop(1, '#c93f96');
    ctx.save();
    ctx.shadowColor = PALETTE.accent2; ctx.shadowBlur = 8;
    ctx.fillStyle = grad;
    if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x, y, w, h, [w * 0.35, w * 0.35, 4, 4]); ctx.fill(); }
    else ctx.fillRect(x, y, w, h);
    ctx.restore();
    ctx.fillStyle = '#ffe3f5';
    const es = Math.max(2, Math.round(w * 0.13)), eo = Math.round(w * 0.28);
    ctx.fillRect(x + eo, y + h * 0.26, es, es);
    ctx.fillRect(x + w - eo - es, y + h * 0.26, es, es);
}
function drawScrapPortrait(ctx, x, y, w, h) {
    const grad = ctx.createLinearGradient(0, y, 0, y + h);
    grad.addColorStop(0, '#e0a94a'); grad.addColorStop(1, '#c98a2b');
    ctx.save();
    ctx.shadowColor = '#ffd23f'; ctx.shadowBlur = 8;
    ctx.fillStyle = grad;
    if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x, y, w, h, 3); ctx.fill(); }
    else ctx.fillRect(x, y, w, h);
    ctx.restore();
    ctx.fillStyle = '#0b0620';
    const es = Math.max(2, Math.round(w * 0.18)), eo = Math.round(w * 0.2);
    ctx.fillRect(x + eo, y + h * 0.22, es, es);
    ctx.fillRect(x + w - eo - es, y + h * 0.22, es, es);
}

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
// Energía recuperada por cada enemigo derrotado (pisotón o duelo ganado) — la otra mitad de la
// regla de DESIGN.md §2.2: la Energía "se regenera solo al derrotar enemigos o al inicio de cada
// nivel". Menos que el coste de la Habilidad (3), para que gastarla siga siendo una decisión.
const ENERGY_PER_KILL = 2;

// Hielo resbaladizo (plataformas variant 'ice' — DESIGN.md §2.20): sobre hielo el movimiento
// tiene inercia — acelerar con carrerilla supera la velocidad normal (1.55 → 2.6) y ese impulso
// se conserva al saltar, así que un salto con carrerilla llega bastante más lejos que uno normal.
// Solo afecta al suelo 'ice': el game feel de todos los demás niveles queda intacto, y la
// medición de alcance del test BFS (que simula el salto SIN carrerilla) sigue siendo fiel.
const ICE_MAX_SPEED = 2.6;
const ICE_ACCEL = 0.07;   // qué fracción del déficit de velocidad se gana por frame (lerp)
const ICE_FRICTION = 0.94; // decaimiento por frame al soltar la dirección (~25u hasta pararse)

class Player {
    constructor(x, y, character = 'kes') {
        Object.assign(this, {
            x, y, w: 9, h: 13, vx: 0, vy: 0, facing: 1, character,
            speed: 1.55, jumpPower: -4.3, doubleJumpPower: -3.5, gravity: 0.32,
            onGround: false, jumping: false, usedAirAbility: false,
            groundPlatform: null, iceMomentum: false,
            dashTimer: 0, dashSpeed: 3.2, flyDrainTimer: 0,
            prevJumpKey: false, squash: 1, animT: 0, blinkTimer: 90 + Math.random() * 120,
            level: 1, maxHp: 22, hp: 22, maxEnergy: 10, energy: 10,
            xp: 0, xpToNextLevel: 10, attack: 5, defense: 2,
            lives: MAX_LIVES, maxLives: MAX_LIVES,
            // Árbol de mejoras: puntos sin gastar, nodos desbloqueados, y el "ya usé el sistema
            // de emergencia en este nivel" (se rearma en Game.loadLevel).
            skillPoints: 0, skills: new Set(), emergencyUsed: false
        });
    }
    hasSkill(id) { return this.skills.has(id); }
    // Sistema de emergencia (árbol): una vez por nivel, un golpe letal deja a 1 HP. Método
    // aparte de takeDamage porque la rama "defendiendo" del combate resta HP directamente
    // sin pasar por takeDamage — ambas rutas deben poder salvarte.
    checkEmergency() {
        if (this.hp <= 0 && this.hasSkill('emergencia') && !this.emergencyUsed) {
            this.hp = 1;
            this.emergencyUsed = true;
        }
    }
    update(keys, platforms, particles) {
        const left = keys.ArrowLeft || keys.KeyA;
        const right = keys.ArrowRight || keys.KeyD;
        // Hielo resbaladizo: sobre suelo 'ice' el movimiento tiene inercia (ver constantes ICE_*).
        // groundPlatform es el suelo del frame ANTERIOR — el orden input→física hace imposible
        // saber el de este frame aquí, y un frame de retardo es imperceptible.
        const onIce = this.onGround && this.groundPlatform && this.groundPlatform.variant === 'ice';
        if (this.dashTimer <= 0) {
            if (onIce) {
                // Con dirección: lerp hacia ±ICE_MAX_SPEED (acelera con carrerilla, frena y gira
                // con la misma inercia). Sin dirección: sigues deslizándote, no te paras en seco.
                const target = left ? -ICE_MAX_SPEED : right ? ICE_MAX_SPEED : null;
                if (target !== null) this.vx += (target - this.vx) * ICE_ACCEL;
                else this.vx *= ICE_FRICTION;
                this.iceMomentum = true;
            } else if (!this.onGround && this.iceMomentum && Math.abs(this.vx) > this.speed && !(this.vx > 0 ? left : right)) {
                // Impulso de hielo conservado en el aire: mantener la dirección (o soltar todo)
                // no lo pierde, solo decae suave; pulsar la contraria devuelve el control normal.
                // El flag iceMomentum acota esto a saltos que salen DE hielo — sin él, el dash de
                // Shade (vx 3.2) también quedaría flotando tras sus 12 frames y cambiaría su alcance.
                this.vx *= 0.995;
            } else {
                this.vx = left ? -this.speed : right ? this.speed : 0;
                this.iceMomentum = false;
            }
        }
        if (left) this.facing = -1; else if (right) this.facing = 1;
        // Viruta de hielo bajo los pies mientras te deslizas por encima de la velocidad normal —
        // el aviso visual de que llevas carrerilla (puramente estético: Math.random, no RNG).
        if (onIce && Math.abs(this.vx) > this.speed && Math.random() < 0.35) {
            particles.burst(this.x + this.w / 2 - this.facing * 4, this.y + this.h, '#bfe9ff', 1, { speed: 0.5, life: 10, size: 1.5 });
        }

        const jumpKey = !!(keys.Space || keys.ArrowUp || keys.KeyW);
        const jumpPressed = jumpKey && !this.prevJumpKey;
        if (jumpPressed && this.onGround) {
            this.vy = this.jumpPower; this.onGround = false; this.jumping = true;
            this.usedAirAbility = false; this.squash = 1.35;
            if (window.SFX) SFX.jump();
            particles.burst(this.x + this.w / 2, this.y + this.h, PALETTE.accent, 6, { speed: 1, life: 14, size: 2 });
        } else if (jumpPressed && !this.onGround && !this.usedAirAbility && this.character !== 'bolt' && this.character !== 'scrap') {
            // Kes y Shade comparten el gatillo "un uso por salto", pero el efecto difiere:
            // Kes gana altura (doble salto), Shade gana un impulso lateral (dash).
            if (this.energy >= 1) {
                this.usedAirAbility = true; this.energy -= 1; this.squash = 1.5;
                if (this.character === 'shade') { this.dashTimer = 12; this.vy = Math.min(this.vy, -0.5); }
                else this.vy = this.doubleJumpPower;
                if (window.SFX) SFX.doubleJump();
                particles.burst(this.x + this.w / 2, this.y + this.h / 2, PALETTE.accent2, 10, { speed: 1.6, life: 18, size: 2.5 });
            }
        }
        // Bolt no gasta su habilidad en un solo toque: mientras se mantenga pulsado salto en
        // el aire, asciende despacio consumiendo Energía por tiempo, no de golpe.
        if (this.character === 'bolt' && !this.onGround && jumpKey && this.energy > 0) {
            // Velocidad fija de ascenso: se fija cada frame (no se acumula), así que la gravedad
            // de más abajo solo la frena un poco en vez de cancelarla — asciende de verdad.
            this.vy = -1.1;
            this.flyDrainTimer--;
            if (this.flyDrainTimer <= 0) { this.energy -= 1; this.flyDrainTimer = 22; }
            if (Math.random() < 0.4) particles.burst(this.x + this.w / 2, this.y + this.h, PALETTE.accent3, 1, { speed: 0.5, life: 10, size: 1.5 });
        }
        if (this.dashTimer > 0) { this.vx = this.facing * this.dashSpeed; this.dashTimer--; }
        this.prevJumpKey = jumpKey;

        const wasOnGround = this.onGround;
        this.vy += this.gravity; this.x += this.vx; this.y += this.vy; this.onGround = false;
        platforms.forEach(p => {
            if (!p.solid) return;
            if (this.x < p.x + p.w && this.x + this.w > p.x && this.y < p.y + p.h && this.y + this.h > p.y) {
                if (this.vy > 0 && this.y + this.h <= p.y + 10) {
                    this.y = p.y - this.h; this.vy = 0; this.onGround = true; this.jumping = false; this.usedAirAbility = false;
                    this.groundPlatform = p; // qué suelo pisas — el frame siguiente decide si resbala (hielo)
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
            this.skillPoints++; // árbol de mejoras: cada subida da un punto que se gasta en el mapa
        }
        return leveled;
    }
    takeDamage(amt) {
        const dmg = Math.max(1, amt - this.defense);
        this.hp -= dmg;
        this.checkEmergency();
        return dmg;
    }
    draw(ctx, cx) {
        if (this.character === 'bolt') return this.drawBoltChar(ctx, cx);
        if (this.character === 'shade') return this.drawShadeChar(ctx, cx);
        if (this.character === 'scrap') return this.drawScrapChar(ctx, cx);
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
    // Bolt: esfera pequeña con un único ojo-cámara, sin pies (flota).
    drawBoltChar(ctx, cx) {
        const bob = Math.sin(this.animT) * 0.6;
        const sx = this.x - cx + this.w / 2, sy = this.y + this.h / 2 + bob;
        const r = this.h / 2;
        const grad = ctx.createRadialGradient(sx - r * 0.3, sy - r * 0.4, r * 0.1, sx, sy, r);
        grad.addColorStop(0, '#ffe28a'); grad.addColorStop(1, '#ffd23f');
        ctx.save();
        ctx.shadowColor = '#ffd23f'; ctx.shadowBlur = 6;
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        const eyeOffset = this.facing > 0 ? 1 : -1;
        const blink = this.blinkTimer < 6 ? 0.3 : 1;
        ctx.fillStyle = '#0b0620';
        ctx.beginPath(); ctx.ellipse(sx + eyeOffset, sy, 2.2, 2.2 * blink, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffd23f';
        ctx.beginPath(); ctx.arc(sx + eyeOffset, sy, 0.9, 0, Math.PI * 2); ctx.fill();
    }
    // Shade: pastilla-capucha magenta, ojos en rombo sin visera.
    drawShadeChar(ctx, cx) {
        const walking = this.onGround && this.vx !== 0;
        const walkBounce = walking ? Math.abs(Math.sin(this.animT)) * 1.1 : 0;
        const sx = this.x - cx + this.w / 2, sy = this.y + this.h - walkBounce;
        const w = this.w * (2 - this.squash), h = this.h * this.squash;
        const grad = ctx.createLinearGradient(0, sy - h, 0, sy);
        grad.addColorStop(0, '#ffb3e6'); grad.addColorStop(1, '#c93f96');
        ctx.save();
        ctx.shadowColor = PALETTE.accent2; ctx.shadowBlur = 6;
        ctx.fillStyle = grad;
        if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(sx - w / 2, sy - h, w, h, [w * 0.4, w * 0.4, 2, 2]); ctx.fill(); }
        else ctx.fillRect(sx - w / 2, sy - h, w, h);
        ctx.restore();
        const eyeOffset = this.facing > 0 ? 1 : -1;
        const blink = this.blinkTimer < 6 ? 0.3 : 1;
        ctx.fillStyle = '#ffe3f5';
        ctx.fillRect(sx - 2 + eyeOffset, sy - h + 4, 1.8, 1.8 * blink);
        ctx.fillRect(sx + 0.5 + eyeOffset, sy - h + 4, 1.8, 1.8 * blink);
    }
    // Scrap: bloque ámbar más ancho, ojos cuadrados. Sin habilidad aérea: pisa firme.
    drawScrapChar(ctx, cx) {
        const walking = this.onGround && this.vx !== 0;
        const walkBounce = walking ? Math.abs(Math.sin(this.animT)) * 1 : 0;
        const sx = this.x - cx + this.w / 2, sy = this.y + this.h - walkBounce;
        const w = (this.w + 1.5) * (2 - this.squash), h = this.h * this.squash;
        const grad = ctx.createLinearGradient(0, sy - h, 0, sy);
        grad.addColorStop(0, '#e0a94a'); grad.addColorStop(1, '#c98a2b');
        ctx.save();
        ctx.shadowColor = '#ffd23f'; ctx.shadowBlur = 6;
        ctx.fillStyle = grad;
        ctx.fillRect(sx - w / 2, sy - h, w, h);
        ctx.restore();
        if (walking) {
            ctx.fillStyle = '#c98a2b';
            const lead = Math.sin(this.animT) > 0 ? sx - w / 2 : sx + w / 2 - 2.4;
            ctx.fillRect(lead, sy, 2.4, 1.6);
        }
        const eyeOffset = this.facing > 0 ? 1 : -1;
        const blink = this.blinkTimer < 6 ? 0.3 : 1;
        ctx.fillStyle = '#0b0620';
        ctx.fillRect(sx - 2.2 + eyeOffset, sy - h + 3, 2.2, 2.2 * blink);
        ctx.fillRect(sx + 0.8 + eyeOffset, sy - h + 3, 2.2, 2.2 * blink);
    }
    // Mismo aspecto que draw(), pero a una posición/tamaño fijos en pantalla (para el retrato de combate).
    drawPortrait(ctx, x, y, w, h) {
        drawHeroPortrait(ctx, this.character, x, y, w, h, this.facing);
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
    overlord:   { level: 16, hp: 140, atk: 23, def: 12, xp: 220, color: '#ffd23f', speed: 0, canJump: false, range: 0, boss: true, flying: false },
    // Jefe final de la Zona 4 (Núcleo Expuesto) — no un fragmento como el Overlord, la Red misma.
    // Notablemente por encima del Overlord en todo: es el auténtico último jefe, no un mundo más.
    nodo_cero:  { level: 20, hp: 190, atk: 27, def: 14, xp: 380, color: '#ff3366', speed: 0, canJump: false, range: 0, boss: true, flying: false }
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
            jumpTimer: 0, jumpCooldown: 120 + RNG() * 60, flyTimer: RNG() * 100, flyAmplitude: 14,
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
            if (!p.solid) continue;
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
            if (this.jumpTimer >= this.jumpCooldown) { this.vy = -3.4; this.jumpTimer = 0; this.jumpCooldown = 120 + RNG() * 60; }
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
        else if (this.type === 'nodo_cero') this.drawNodoCero(ctx, x, y, w, h);
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
    // Nodo Cero: no un cuerpo único, sino una red de nodos orbitando un núcleo — cada nodo lleva
    // el color de uno de los guardianes anteriores (Reina Larva, Centinela, Overlord) más el suyo
    // propio, para que se lea a simple vista "esto absorbió a los tres" sin decirlo en un texto.
    // Nunca tiene una silueta fija — es justo lo contrario a "posar" para el jugador.
    drawNodoCero(ctx, x, y, w, h) {
        const t = this.animT;
        const cx = x + w / 2, cy = y + h / 2;
        const orbitR = w * 0.42;
        const colors = ['#ff5ecb', '#8b83c2', '#ffd23f', '#ff3366'];
        const nodes = colors.map((c, i) => {
            const angle = t * 0.5 + (i * Math.PI / 2);
            return { x: cx + Math.cos(angle) * orbitR, y: cy + Math.sin(angle) * orbitR * 0.85, c };
        });
        ctx.save();
        ctx.strokeStyle = 'rgba(255,51,102,0.5)'; ctx.lineWidth = 1;
        nodes.forEach(n => { ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(n.x, n.y); ctx.stroke(); });
        ctx.restore();
        const pulse = 0.7 + Math.sin(t * 2.1) * 0.3;
        const blink = this.blinkTimer < 5 ? 0.3 : 1;
        ctx.save();
        ctx.shadowColor = '#ff3366'; ctx.shadowBlur = w * 0.35 * pulse;
        ctx.fillStyle = '#ff3366';
        ctx.beginPath(); ctx.arc(cx, cy, w * 0.16 * blink, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        nodes.forEach(n => {
            ctx.save();
            ctx.shadowColor = n.c; ctx.shadowBlur = w * 0.22;
            ctx.fillStyle = n.c;
            ctx.beginPath(); ctx.arc(n.x, n.y, w * 0.09, 0, Math.PI * 2); ctx.fill();
            ctx.restore();
        });
    }
}

class Platform {
    constructor(x, y, w, h, variant = 'normal') {
        Object.assign(this, {
            x, y, w, h, variant, broken: false,
            // Frágil ('fragile'): se desmorona ~0.8s después de pisarla y reaparece a los 3s —
            // reaparecer es lo que garantiza que un nivel nunca queda bloqueado sin salida.
            crumbleTimer: -1, gone: false, respawnTimer: 0,
            beltT: 0 // fase de animación de las cintas ('beltL'/'beltR')
        });
    }
    // Sólida = pisable ahora mismo. broken es permanente (refuerzos de Scrap);
    // gone es temporal (frágiles desmoronadas, reaparecen).
    get solid() { return !this.broken && !this.gone; }
    update() {
        if (this.variant === 'fragile') {
            if (this.gone) {
                this.respawnTimer--;
                if (this.respawnTimer <= 0) { this.gone = false; this.crumbleTimer = -1; }
            } else if (this.crumbleTimer >= 0) {
                this.crumbleTimer++;
                if (this.crumbleTimer >= 50) { this.gone = true; this.respawnTimer = 180; }
            }
        }
        if (this.variant === 'beltL' || this.variant === 'beltR') this.beltT++;
    }
    // La pisa el jugador: una frágil intacta empieza su cuenta atrás de desmoronarse.
    touched() { if (this.variant === 'fragile' && this.crumbleTimer < 0) this.crumbleTimer = 0; }
    draw(ctx, cx) {
        if (!this.solid) return;
        // Frágil pisada: tiembla mientras cuenta atrás (o parpadea en alfa con REDUCE_EFFECTS)
        let shakeX = 0;
        if (this.variant === 'fragile' && this.crumbleTimer >= 0) {
            if (window.REDUCE_EFFECTS) ctx.globalAlpha = 0.55 + (this.crumbleTimer % 10 < 5 ? 0.25 : 0);
            else shakeX = (Math.random() - 0.5) * 1.6;
        }
        const sx = this.x - cx + shakeX;
        const grad = ctx.createLinearGradient(0, this.y, 0, this.y + this.h);
        if (this.variant === 'ice') { grad.addColorStop(0, '#bfe9ff'); grad.addColorStop(1, '#5fb8d9'); }
        else if (this.variant === 'metal') { grad.addColorStop(0, '#8892b0'); grad.addColorStop(1, '#4a5170'); }
        else if (this.variant === 'reinforced') { grad.addColorStop(0, '#5a4a2a'); grad.addColorStop(1, '#3a2a0f'); }
        else if (this.variant === 'fragile') { grad.addColorStop(0, '#7a6f9e'); grad.addColorStop(1, '#3f3660'); }
        else if (this.variant === 'beltL' || this.variant === 'beltR') { grad.addColorStop(0, '#6c7a9c'); grad.addColorStop(1, '#3b4460'); }
        else { grad.addColorStop(0, PALETTE.panelLight); grad.addColorStop(1, PALETTE.panel); }
        ctx.fillStyle = grad;
        ctx.fillRect(sx, this.y, this.w, this.h);
        if (this.variant === 'fragile') {
            // grietas: se lee "esto no aguanta" antes de pisarla
            ctx.strokeStyle = 'rgba(11,6,32,0.55)'; ctx.lineWidth = 0.8;
            ctx.beginPath();
            ctx.moveTo(sx + this.w * 0.25, this.y); ctx.lineTo(sx + this.w * 0.35, this.y + this.h);
            ctx.moveTo(sx + this.w * 0.6, this.y); ctx.lineTo(sx + this.w * 0.52, this.y + this.h * 0.6);
            ctx.moveTo(sx + this.w * 0.82, this.y + this.h * 0.3); ctx.lineTo(sx + this.w * 0.75, this.y + this.h);
            ctx.stroke();
            ctx.globalAlpha = 1;
        }
        if (this.variant === 'beltL' || this.variant === 'beltR') {
            // chevrones en movimiento marcando la dirección de arrastre de la cinta
            const dir = this.variant === 'beltR' ? 1 : -1;
            const shift = ((this.beltT * 0.4 * dir) % 9 + 9) % 9;
            ctx.save();
            ctx.beginPath(); ctx.rect(sx, this.y, this.w, this.h); ctx.clip();
            ctx.strokeStyle = PALETTE.accent3; ctx.globalAlpha = 0.7; ctx.lineWidth = 1.2;
            for (let cxx = -9; cxx < this.w + 9; cxx += 9) {
                const bx = sx + cxx + shift, my = this.y + this.h / 2;
                ctx.beginPath();
                ctx.moveTo(bx - 2 * dir, my - 2.5); ctx.lineTo(bx + 2 * dir, my); ctx.lineTo(bx - 2 * dir, my + 2.5);
                ctx.stroke();
            }
            ctx.restore();
            ctx.globalAlpha = 1;
        }
        if (this.variant === 'reinforced') {
            // franjas de peligro: solo Scrap puede romper esto
            ctx.save();
            ctx.beginPath(); ctx.rect(sx, this.y, this.w, this.h); ctx.clip();
            ctx.fillStyle = PALETTE.accent3; ctx.globalAlpha = 0.55;
            for (let sxx = -this.h; sxx < this.w; sxx += 7) {
                ctx.beginPath();
                ctx.moveTo(sx + sxx, this.y + this.h); ctx.lineTo(sx + sxx + this.h, this.y);
                ctx.lineTo(sx + sxx + this.h + 3, this.y); ctx.lineTo(sx + sxx + 3, this.y + this.h);
                ctx.closePath(); ctx.fill();
            }
            ctx.restore();
        }
        ctx.fillStyle = PALETTE.accent; ctx.globalAlpha = 0.5;
        ctx.fillRect(sx, this.y, this.w, 1);
        ctx.globalAlpha = 1;
    }
}

// Plataforma que sube y baja en senoide alrededor de su Y base. El motor de físicas existente ya
// "lleva" al jugador de serie: al estar de pie, cada frame la gravedad lo deja caer un pelín y el
// snap de aterrizaje lo vuelve a pegar al borde superior — por eso la velocidad vertical máxima
// (amplitude × omega) debe quedar por debajo de la gravedad (0.32), o el snap pierde al jugador.
// IMPORTANTE (level design): van en el array movingPlatforms de levels.js, que el test BFS de
// alcanzabilidad NO cuenta — son atajos/ruta alta opcionales, el camino obligatorio del nivel
// tiene que funcionar sin ellas (así nunca dependes de cazar una plataforma en movimiento).
class MovingPlatform extends Platform {
    constructor(x, y, w, h, amplitude = 14, omega = 0.02, variant = 'normal') {
        super(x, y, w, h, variant);
        this.baseY = y; this.amplitude = amplitude; this.omega = omega; this.t = 0;
    }
    update() { this.t++; this.y = this.baseY + Math.sin(this.t * this.omega) * this.amplitude; }
    draw(ctx, cx) {
        // raíl vertical tenue marcando el recorrido, para que se lea que se mueve
        const mx = this.x - cx + this.w / 2;
        ctx.save();
        ctx.strokeStyle = PALETTE.dim; ctx.globalAlpha = 0.3; ctx.setLineDash([2, 3]);
        ctx.beginPath();
        ctx.moveTo(mx, this.baseY - this.amplitude);
        ctx.lineTo(mx, this.baseY + this.amplitude + this.h);
        ctx.stroke();
        ctx.restore();
        super.draw(ctx, cx);
    }
}

// Puerta de energía VERTICAL entre dos emisores (uno arriba, otro clavado en el suelo), al
// estilo de las pirañas de las tuberías: ciclo FIJO de 150 frames — 90 apagada, 15 de aviso
// (los emisores chisporrotean) y 45 encendida y dañina. Bloquea el paso a ras de suelo cuando
// está activa: o esperas el hueco del ciclo, o la superas por ARRIBA — con 40 de alto, el salto
// simple no basta (sube ~29), pero el doble salto/vuelo/dash sí: la Energía compra tiempo.
// offset desfasa el ciclo entre puertas del mismo nivel para que no se abran todas a la vez.
// Frames, no tiempo real: determinista, mismo patrón en cualquier máquina.
// (La primera versión eran rayos HORIZONTALES sobre los huecos — el arco del salto pasaba casi
// siempre por encima o cruzaba la franja ya fuera de su rango, y en la práctica no tocaban nunca.)
class EnergyBeam {
    constructor(x, y, height, offset = 0) {
        Object.assign(this, { x, y, w: 4, h: height, t: offset, PERIOD: 150, WARN: 15, ON: 45 });
    }
    update() { this.t++; }
    phase() {
        const c = this.t % this.PERIOD;
        if (c >= this.PERIOD - this.ON) return 'on';
        if (c >= this.PERIOD - this.ON - this.WARN) return 'warn';
        return 'off';
    }
    collides(pl) {
        return this.phase() === 'on'
            && pl.x < this.x + 2 && pl.x + pl.w > this.x - 2
            && pl.y < this.y + this.h && pl.y + pl.h > this.y;
    }
    draw(ctx, cx) {
        const x = this.x - cx, y1 = this.y, y2 = this.y + this.h;
        const ph = this.phase();
        // emisores arriba y abajo: siempre visibles, el paso "se lee" peligroso también apagado
        ctx.save();
        ctx.fillStyle = ph === 'off' ? '#8a84b8' : PALETTE.accent3;
        if (ph !== 'off') { ctx.shadowColor = PALETTE.accent3; ctx.shadowBlur = 6; }
        ctx.fillRect(x - 3, y1 - 2, 6, 4);
        ctx.fillRect(x - 3, y2 - 2, 6, 4);
        ctx.restore();
        if (ph === 'warn') {
            // chisporroteo de aviso (fijo y tenue con REDUCE_EFFECTS, sin parpadeo)
            const a = window.REDUCE_EFFECTS ? 0.3 : (Math.random() < 0.5 ? 0.15 : 0.45);
            ctx.save();
            ctx.strokeStyle = PALETTE.accent3; ctx.globalAlpha = a; ctx.lineWidth = 1;
            ctx.setLineDash([2, 5]);
            ctx.beginPath(); ctx.moveTo(x, y1); ctx.lineTo(x, y2); ctx.stroke();
            ctx.restore();
        } else if (ph === 'on') {
            const flick = window.REDUCE_EFFECTS ? 1 : 0.85 + Math.random() * 0.15;
            ctx.save();
            ctx.shadowColor = PALETTE.accent; ctx.shadowBlur = 8;
            ctx.strokeStyle = `rgba(124,245,255,${flick})`; ctx.lineWidth = 2.4;
            ctx.beginPath(); ctx.moveTo(x, y1); ctx.lineTo(x, y2); ctx.stroke();
            ctx.strokeStyle = `rgba(245,243,255,${flick})`; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(x, y1); ctx.lineTo(x, y2); ctx.stroke();
            ctx.restore();
        }
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

// Cristal de Señal (◆ dorado): el objetivo secundario. Restos de la red de vigilancia de los
// constructores del Centinela (LORE.md §2.2) — reunir suficientes triangula sus emisores y hace
// APARECER las torres Extra en el mapa estelar (SIGNAL_GATES en game.js). Mismo molde que
// EnergyCell: flotante, se recoge al rozarlo, uno por nivel del mapa.
class SignalCrystal {
    constructor(x, y) { this.x = x; this.y = y; this.w = 8; this.h = 9; this.collected = false; this.t = Math.random() * Math.PI * 2; }
    update() { this.t += 0.07; }
    collides(e) { return this.x < e.x + e.w && this.x + this.w > e.x && this.y < e.y + e.h && this.y + this.h > e.y; }
    draw(ctx, cx) {
        if (this.collected) return;
        const bob = Math.sin(this.t) * 2.5;
        const sx = this.x - cx + this.w / 2, sy = this.y + bob + this.h / 2;
        const pulse = 0.6 + Math.sin(this.t * 1.4) * 0.4;
        ctx.save();
        ctx.shadowColor = PALETTE.accent3; ctx.shadowBlur = 7 + pulse * 4;
        const grad = ctx.createLinearGradient(0, sy - 5, 0, sy + 5);
        grad.addColorStop(0, '#ffe9a8'); grad.addColorStop(1, PALETTE.accent3);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(sx, sy - 5); ctx.lineTo(sx + 4, sy); ctx.lineTo(sx, sy + 5); ctx.lineTo(sx - 4, sy);
        ctx.closePath(); ctx.fill();
        ctx.restore();
        // faceta interior, para que se lea "cristal" y no un simple rombo plano
        ctx.fillStyle = 'rgba(11,6,32,0.45)';
        ctx.beginPath();
        ctx.moveTo(sx, sy - 2.2); ctx.lineTo(sx + 1.8, sy); ctx.lineTo(sx, sy + 2.2); ctx.lineTo(sx - 1.8, sy);
        ctx.closePath(); ctx.fill();
    }
}

class LevelNode {
    constructor(x, y, levelIndex, name, extra = false) {
        this.x = x; this.y = y; this.levelIndex = levelIndex; this.name = name;
        this.completed = false; this.unlocked = levelIndex === 0;
        this.extra = extra; // nodo-portal de nivel Extra: oculto hasta triangular la señal
        this.w = 16; this.h = 16; this.t = 0;
    }
    update() { this.t = (this.t + 1) % 120; }
    draw(ctx) {
        // Las puertas de las torres no existen en el mapa hasta reunir los cristales: no se
        // dibujan bloqueadas — APARECEN (por eso tampoco tienen path en la constelación).
        if (this.extra && !this.unlocked) return;
        const glow = this.unlocked && !this.completed ? 0.5 + Math.sin(this.t * 0.1) * 0.5 : 0;
        if (this.extra) {
            // anillo pulsante dorado: se lee "portal", distinto de un sector normal
            const ring = 0.5 + Math.sin(this.t * 0.1) * 0.5;
            ctx.save();
            ctx.strokeStyle = PALETTE.accent3; ctx.globalAlpha = 0.3 + ring * 0.45; ctx.lineWidth = 1.2;
            ctx.beginPath(); ctx.arc(this.x, this.y, this.w / 2 + 3.5, 0, Math.PI * 2); ctx.stroke();
            ctx.restore();
        }
        ctx.save();
        if (glow > 0) { ctx.shadowColor = this.extra ? PALETTE.accent3 : PALETTE.accent; ctx.shadowBlur = 10 * glow; }
        ctx.fillStyle = this.completed ? PALETTE.accent3 : this.unlocked ? (this.extra ? PALETTE.accent3 : PALETTE.accent) : PALETTE.panelLight;
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
        // Espaciado horizontal recalculado para los 12 nodos: con solo 9, el último ya llegaba casi
        // al borde derecho del canvas (298 de 320px) — no había sitio para añadir 3 más sin
        // reapretar todo el recorrido. El último nodo (Nodo Cero) queda deliberadamente más alto
        // que cualquier otro pico del mapa: es el clímax, y así debe leerse antes de tocarlo.
        this.nodes = [
            new LevelNode(28, 140, 0, 'Cráter de Amerizaje'),
            new LevelNode(52, 108, 1, 'Grietas de Hielo'),
            new LevelNode(76, 138, 2, 'Nido de la Reina Larva'),
            new LevelNode(100, 104, 3, 'Chatarral Magnético'),
            new LevelNode(124, 74, 4, 'Tormenta de Iones'),
            new LevelNode(148, 104, 5, 'Núcleo del Centinela'),
            new LevelNode(172, 134, 6, 'Muelle de Carga'),
            new LevelNode(196, 100, 7, 'Túnel de Escape'),
            new LevelNode(220, 68, 8, 'Núcleo del Reactor'),
            new LevelNode(244, 110, 9, 'Bóveda Sellada'),
            new LevelNode(268, 145, 10, 'Galería de Ecos'),
            new LevelNode(292, 50, 11, 'Nodo Cero'),
            // Nodos EXTRA (las torres de la red de vigilancia): ocultos hasta reunir los
            // Cristales de Señal (SIGNAL_GATES en game.js). Fuera de la constelación y sin
            // paths a propósito — son puertas que APARECEN, no parte de la ruta.
            new LevelNode(125, 152, 12, 'Torre de Vigía', true),
            new LevelNode(165, 152, 13, 'Aguja Glacial', true)
        ];
        this.currentNodeIndex = 0;
        this.paths = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 8], [8, 9], [9, 10], [10, 11]];
    }
    // Sectores del recorrido principal (los "N/12" del marcador): los nodos extra no cuentan.
    get mainCount() { return this.nodes.filter(n => !n.extra).length; }
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
        if (!this.nodes[levelIndex]) return; // defensivo: nivel sin nodo
        this.nodes[levelIndex].completed = true;
        // El desbloqueo en cadena SALTA los nodos extra: las torres solo se abren reuniendo
        // Cristales de Señal (completar Nodo Cero no destapa la Torre; completar la Torre no
        // destapa la Aguja).
        const next = this.nodes[levelIndex + 1];
        if (next && !next.extra) next.unlocked = true;
    }
}

class CombatSystem {
    constructor(player, enemy) {
        this.player = player; this.enemy = enemy; this.turn = 'player';
        this.message = 'Tu turno. Elige acción:';
        // La acción de "Habilidad" lleva el nombre propio del piloto (ver HEROES.combatName) —
        // mismo daño para los 4, solo cambia cómo se llama y cómo suena al usarla.
        this.actions = ['ATACAR', HEROES[player.character].combatName.toUpperCase(), 'DEFENDER', 'HUIR'];
        this.defending = false; this.active = true; this.result = null; this.messageTimer = 0;
        this.selectedIndex = 0; this.shake = 0;
        this.enemyTurnCount = 0; // cuenta turnos de ENEMIGO (no del jugador), para los patrones de jefe
        this.bossCharging = false; // true en el turno siguiente a una carga (Centinela o Nodo Cero): el próximo golpe viene reforzado
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
            let raw = Math.floor(this.player.attack * (0.8 + RNG() * 0.4));
            // Punto débil (árbol): 25% de crítico sobre Atacar. RNG y no Math.random a
            // propósito: en el Reto Diario los críticos caen igual para todo el mundo.
            const crit = this.player.hasSkill('crit') && RNG() < 0.25;
            if (crit) raw = Math.floor(raw * 1.5);
            const dealt = this.enemy.takeDamage(raw);
            this.message = crit ? `¡CRÍTICO! Daño: ${dealt}` : `Disparaste! Daño: ${dealt}`;
            this.shake = crit ? 9 : 6;
            if (window.SFX) SFX.hitEnemy();
        } else if (action === 1) {
            // Habilidad eficiente / Ejecutor (árbol): coste 3→2 y multiplicador ×1.5→×2.
            const cost = this.player.hasSkill('eficiente') ? 2 : 3;
            const mult = this.player.hasSkill('ejecutor') ? 2 : 1.5;
            if (this.player.energy >= cost) {
                const dealt = this.enemy.takeDamage(Math.floor(this.player.attack * mult));
                this.player.energy -= cost; this.message = `¡${HEROES[this.player.character].combatName}! Daño: ${dealt}`; this.shake = 9;
                if (window.SFX) SFX.hitEnemy();
            } else { this.message = 'Energía insuficiente!'; if (window.SFX) SFX.select(); return; }
        } else if (action === 2) {
            this.defending = true; this.message = 'Escudos arriba...';
        } else if (action === 3) {
            if (RNG() < 0.5) { this.message = 'Escapaste!'; this.result = 'flee'; this.active = false; if (window.SFX) SFX.flee(); return; }
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
                this.resolveEnemyTurn();
                if (this.player.hp <= 0) { this.result = 'lose'; this.active = false; return; }
                this.turn = 'player';
                setTimeout(() => { this.message = 'Tu turno. Elige acción:'; }, 1000);
            }
        }
    }
    // Decide la acción del enemigo en su turno. Los enemigos normales siempre atacan (sin cambios);
    // los 4 jefes tienen un patrón propio encima de eso, para que cada uno se lea distinto en
    // combate y no solo en el sprite (ver DESIGN.md §2.12, que ya les da identidad visual pero no
    // mecánica). El contador es de turnos de ENEMIGO, no de ronda completa, así el ritmo del patrón
    // no depende de cuántas veces el jugador haya Defendido/Huido fallido de más.
    resolveEnemyTurn() {
        this.enemyTurnCount++;
        // Reina Larva: no es agresiva por naturaleza (es una víctima, no la villana — LORE.md) así
        // que cada 3 turnos se regenera en vez de atacar. Convierte el duelo en una carrera: si no
        // le metes suficiente daño entre curaciones, la pelea se alarga en vez de ponerse más dura.
        if (this.enemy.type === 'queen_larva' && this.enemyTurnCount % 3 === 0) return this.bossHealTurn();
        // Centinela: dos arquitecturas en conflicto (la suya y la Red). Cada 3 turnos "pierde el
        // control" un turno (carga, sin dañar, con aviso) y el turno siguiente golpea el doble —
        // el aviso le da al jugador una ventana real para Defender antes del golpe fuerte.
        if (this.enemy.type === 'sentinel') {
            if (this.bossCharging) { this.bossCharging = false; return this.enemyStrikeTurn({ multiplier: 2, verb: '¡Descarga corrupta!' }); }
            if (this.enemyTurnCount % 3 === 0) return this.bossChargeTurn();
        }
        // Overlord: la Red hablando por primera vez, sin las reglas de nadie más — cada 3 turnos
        // ignora Defender por completo, para que el jefe final se sienta como que juega sucio de
        // verdad, no solo con más HP/ataque que los otros dos.
        if (this.enemy.type === 'overlord' && this.enemyTurnCount % 3 === 0) {
            // El aviso especial solo tiene sentido si de verdad estabas defendiendo ESE turno —
            // si no, "ignora tus defensas" sería mentira (no había nada que ignorar) aunque el
            // flag ignoreDefense siga activo (no tiene efecto ninguno cuando defending es false).
            const verb = this.defending ? 'El Overlord ignora tus defensas!' : null;
            return this.enemyStrikeTurn({ ignoreDefense: true, verb });
        }
        // Nodo Cero: no es un fragmento como el Overlord — es la Red misma, ya sin ocultarse
        // (LORE.md §2.2: "Ganar esa pelea no acaba la amenaza. La deja al descubierto"). Por eso
        // no tiene un patrón propio nuevo: usa los TRES a la vez, en un ciclo de 6 turnos —
        // literalmente aprendió de cada guardián que le has derrotado hasta ahora.
        if (this.enemy.type === 'nodo_cero') {
            if (this.bossCharging) { this.bossCharging = false; return this.enemyStrikeTurn({ multiplier: 2, verb: '¡Sobrecarga de la Red!' }); }
            const t = this.enemyTurnCount % 6;
            if (t === 3) return this.bossHealTurn();
            if (t === 4) return this.bossChargeTurn();
            if (t === 0) {
                const verb = this.defending ? 'La Red ignora tus defensas!' : null;
                return this.enemyStrikeTurn({ ignoreDefense: true, verb });
            }
        }
        return this.enemyStrikeTurn({});
    }
    enemyStrikeTurn({ multiplier = 1, ignoreDefense = false, verb = null } = {}) {
        const dmg = Math.floor(this.enemy.attack * multiplier * (0.8 + RNG() * 0.4));
        let rec;
        if (this.defending && !ignoreDefense) {
            // Guardia férrea (árbol): Defender pasa de reducir al 50% a reducir al 35%.
            const reduction = this.player.hasSkill('guardia') ? 0.35 : 0.5;
            rec = Math.max(1, Math.floor(dmg * reduction));
            this.player.hp -= rec;
            this.player.checkEmergency(); // esta ruta no pasa por takeDamage — el sistema de emergencia debe cubrirla igual
        } else { rec = this.player.takeDamage(dmg); }
        this.message = verb ? `${verb} Daño: ${rec}` : `${this.enemy.type} ataca! Daño: ${rec}`;
        this.messageTimer = 60; this.shake = multiplier > 1 ? 10 : 6;
        if (window.SFX) SFX.hitPlayer();
    }
    bossChargeTurn() {
        this.bossCharging = true;
        this.message = `${this.enemy.type} carga una descarga...`;
        this.messageTimer = 60; this.shake = 3;
        if (window.SFX) SFX.bossCharge();
    }
    bossHealTurn() {
        const amount = Math.max(1, Math.floor(this.enemy.maxHp * 0.12));
        this.enemy.hp = Math.min(this.enemy.maxHp, this.enemy.hp + amount);
        this.message = `${this.enemy.type} se regenera... +${amount} HP`;
        this.messageTimer = 60; this.shake = 0;
        if (window.SFX) SFX.bossHeal();
    }
    draw(ctx) {
        // window.REDUCE_EFFECTS: ajuste de accesibilidad de Game (game.js) — CombatSystem no tiene
        // referencia a Game, así que se lee vía global, mismo patrón que window.SFX.
        const shakeMag = window.REDUCE_EFFECTS ? 0 : this.shake;
        const shakeX = shakeMag ? (Math.random() - 0.5) * shakeMag : 0;
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
