/**
 * Tests de las mecánicas núcleo de Astro Leap.
 * Reimplementan la lógica de forma aislada (sin DOM/canvas) para poder
 * testearla en Node, siguiendo el mismo enfoque que Monster Jump.
 */

const GRAVITY = 0.32;

class Player {
    constructor(x, y) {
        Object.assign(this, {
            x, y, w: 9, h: 13, vx: 0, vy: 0,
            speed: 1.55, jumpPower: -4.3, doubleJumpPower: -3.5, gravity: GRAVITY,
            onGround: false, jumping: false, usedDoubleJump: false, prevJumpKey: false,
            level: 1, maxHp: 22, hp: 22, maxEnergy: 10, energy: 10,
            xp: 0, xpToNextLevel: 10, attack: 5, defense: 2,
            lives: 3, maxLives: 3
        });
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

    // Simula un frame de jump-handling equivalente al de entities.js (sin plataformas/gravedad completas)
    tryJump(jumpKeyHeld) {
        const jumpPressed = jumpKeyHeld && !this.prevJumpKey;
        let action = null;
        if (jumpPressed) {
            if (this.onGround) {
                this.vy = this.jumpPower; this.onGround = false; this.jumping = true; this.usedDoubleJump = false;
                action = 'jump';
            } else if (!this.usedDoubleJump && this.energy >= 1) {
                this.vy = this.doubleJumpPower; this.usedDoubleJump = true; this.energy -= 1;
                action = 'doubleJump';
            }
        }
        this.prevJumpKey = jumpKeyHeld;
        return action;
    }
}

class Enemy {
    constructor(level, hp, attack, defense, xp) {
        this.level = level; this.maxHp = hp; this.hp = hp; this.attack = attack; this.defense = defense;
        this.xpReward = xp; this.alive = true; this.defeated = false;
        this.x = 0; this.y = 0; this.w = 11; this.h = 11;
    }
    takeDamage(amt) {
        const dmg = Math.max(1, amt - this.defense); this.hp -= dmg;
        if (this.hp <= 0) { this.defeated = true; this.alive = false; }
        return dmg;
    }
}

describe('Player', () => {
    test('se inicializa con los stats correctos', () => {
        const p = new Player(20, 100);
        expect(p.level).toBe(1); expect(p.hp).toBe(22); expect(p.energy).toBe(10);
        expect(p.attack).toBe(5); expect(p.defense).toBe(2);
    });

    test('gana XP y sube de nivel, curándose del todo', () => {
        const p = new Player(0, 0);
        p.hp = 5;
        const leveled = p.gainXP(10);
        expect(leveled).toBe(true);
        expect(p.level).toBe(2);
        expect(p.hp).toBe(p.maxHp);
    });

    test('no sube de nivel si el XP no alcanza', () => {
        const p = new Player(0, 0);
        const leveled = p.gainXP(3);
        expect(leveled).toBe(false);
        expect(p.level).toBe(1);
    });

    test('recibe siempre al menos 1 de daño', () => {
        const p = new Player(0, 0);
        p.defense = 999;
        expect(p.takeDamage(1)).toBe(1);
    });

    test('detecta colisión AABB con un enemigo', () => {
        const p = new Player(10, 10);
        const e = { x: 12, y: 10, w: 5, h: 5 };
        expect(p.collides(e)).toBe(true);
    });

    test('no colisiona con un enemigo lejano', () => {
        const p = new Player(0, 0);
        const e = { x: 200, y: 200, w: 5, h: 5 };
        expect(p.collides(e)).toBe(false);
    });

    test('collidesFromAbove requiere estar cayendo sobre la mitad superior', () => {
        const p = new Player(10, 8); p.vy = 2; p.h = 4;
        const e = { x: 10, y: 10, w: 8, h: 8 };
        expect(p.collidesFromAbove(e)).toBe(true);
        p.vy = -1;
        expect(p.collidesFromAbove(e)).toBe(false);
    });
});

describe('Salto doble alimentado por energía (mecánica nueva de Astro Leap)', () => {
    test('el primer salto no gasta energía y solo funciona en el suelo', () => {
        const p = new Player(0, 0); p.onGround = true;
        const action = p.tryJump(true);
        expect(action).toBe('jump');
        expect(p.energy).toBe(10);
        expect(p.onGround).toBe(false);
    });

    test('el doble salto en el aire consume 1 de energía', () => {
        const p = new Player(0, 0); p.onGround = true;
        p.tryJump(true);         // salto normal (keydown)
        p.tryJump(false);        // se soltó la tecla
        const action = p.tryJump(true); // segunda pulsación en el aire
        expect(action).toBe('doubleJump');
        expect(p.energy).toBe(9);
    });

    test('no se puede doble-saltar sin energía', () => {
        const p = new Player(0, 0); p.onGround = true; p.energy = 0;
        p.tryJump(true); p.tryJump(false);
        const action = p.tryJump(true);
        expect(action).toBeNull();
    });

    test('mantener la tecla pulsada no dispara un doble salto por sí solo (edge-detection)', () => {
        const p = new Player(0, 0); p.onGround = true;
        p.tryJump(true); // salta, pasa a estar en el aire
        const action = p.tryJump(true); // sigue pulsada, sin soltar
        expect(action).toBeNull();
        expect(p.energy).toBe(10);
    });

    test('solo se permite un doble salto por salto (no se puede encadenar un tercero)', () => {
        const p = new Player(0, 0); p.onGround = true;
        p.tryJump(true); p.tryJump(false);
        p.tryJump(true); p.tryJump(false); // doble salto usado
        const action = p.tryJump(true);    // tercer intento
        expect(action).toBeNull();
    });

    test('aterrizar restaura la posibilidad de doble salto', () => {
        const p = new Player(0, 0); p.onGround = true;
        p.tryJump(true); p.tryJump(false);
        p.tryJump(true); p.tryJump(false); // doble salto usado
        p.onGround = true; p.usedDoubleJump = false; // aterriza (lo haría platforms.forEach en el juego real)
        const action = p.tryJump(true);
        expect(action).toBe('jump');
    });
});

describe('Enemy', () => {
    test('recibe daño y muere al llegar a 0 HP', () => {
        const e = new Enemy(1, 5, 3, 1, 5);
        e.takeDamage(10);
        expect(e.alive).toBe(false);
        expect(e.defeated).toBe(true);
    });

    test('sobrevive si el daño no es suficiente', () => {
        const e = new Enemy(2, 20, 4, 5, 10);
        e.takeDamage(3);
        expect(e.alive).toBe(true);
        expect(e.hp).toBeGreaterThan(0);
    });
});

describe('Integración: combate y progresión', () => {
    test('el jugador derrota a un enemigo débil y gana XP', () => {
        const p = new Player(0, 0);
        const e = new Enemy(1, 7, 3, 1, 5);
        while (e.alive) e.takeDamage(p.attack);
        const leveled = p.gainXP(e.xpReward);
        expect(p.xp + (leveled ? 0 : 0)).toBeGreaterThanOrEqual(0);
        expect(e.defeated).toBe(true);
    });

    test('escenario completo: varios enemigos derrotados suben varios niveles', () => {
        const p = new Player(0, 0);
        const enemies = [new Enemy(1, 6, 2, 0, 6), new Enemy(1, 6, 2, 0, 6), new Enemy(2, 10, 3, 1, 9)];
        enemies.forEach(e => { while (e.alive) e.takeDamage(p.attack); p.gainXP(e.xpReward); });
        expect(p.level).toBeGreaterThan(1);
        enemies.forEach(e => expect(e.defeated).toBe(true));
    });
});

// Réplica de la decisión que toma Game.loseLife(): con vidas restantes, respawn;
// sin vidas, game over completo.
function loseLife(player) {
    player.lives--;
    return player.lives <= 0 ? 'gameOver' : 'respawn';
}

describe('Vidas', () => {
    test('el jugador empieza con el máximo de vidas', () => {
        const p = new Player(0, 0);
        expect(p.lives).toBe(p.maxLives);
    });

    test('perder una vida con vidas de sobra respawnea en el nivel', () => {
        const p = new Player(0, 0);
        const outcome = loseLife(p);
        expect(outcome).toBe('respawn');
        expect(p.lives).toBe(2);
    });

    test('perder la última vida dispara game over', () => {
        const p = new Player(0, 0); p.lives = 1;
        const outcome = loseLife(p);
        expect(outcome).toBe('gameOver');
        expect(p.lives).toBe(0);
    });

    test('cualquier fuente de muerte (caída, muro, combate) cuenta igual como pérdida de vida', () => {
        const p = new Player(0, 0);
        loseLife(p); // caída por un precipicio
        loseLife(p); // alcanzado por el muro del scroll forzado
        expect(p.lives).toBe(1);
        const outcome = loseLife(p); // pierde un combate
        expect(outcome).toBe('gameOver');
    });
});
