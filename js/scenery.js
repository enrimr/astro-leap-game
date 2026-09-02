// Escenografía por mundo (DESIGN.md §2.44): fondos con parallax y decoración no colisionable.
// Todo es PRESENTACIÓN pura — nada de aquí toca físicas, colisiones ni al test BFS: los datos
// de levels.js siguen siendo la única verdad jugable. Dos reglas duras:
//   1. DETERMINISTA: la composición de cada fondo sale de un generador sembrado por el nombre
//      del nivel (no Math.random) — el mismo nivel se ve igual en cada carga, y los mapas de la
//      guía (scripts/generate-level-maps.js) dan diffs limpios entre ejecuciones.
//   2. LEGIBLE: siluetas oscuras y decoración sin glow ni animación de bob — nada puede
//      confundirse con un pickup (esos brillan y flotan) ni competir con enemigos o peligros.
const SCENERY = (() => {

    // Generador determinista minúsculo (la variante mulberry32 de game.js, replicada aquí para
    // que este fichero no dependa del orden de carga de game.js).
    function seededRand(seed) {
        let s = seed | 0;
        return function () {
            s = (s + 0x6D2B79F5) | 0;
            let t = Math.imul(s ^ (s >>> 15), 1 | s);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }
    function hashSeed(str) {
        let h = 0;
        for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
        return h;
    }

    // Un tema visual por mundo. Los niveles Extra eligen el suyo con la clave `theme` en
    // levels.js (la Aguja Glacial es 'glacial'); sin ella, el mundo decide y el 5 (torres)
    // cae al tema del Mundo 1 — las torres son restos de la misma red, en las mismas lunas.
    const THEME_BY_WORLD = { 1: 'cenizal', 2: 'ferrosa', 3: 'estacion', 4: 'nucleo' };
    function themeFor(level) {
        if (level.theme) return level.theme;
        return THEME_BY_WORLD[level.world] || 'cenizal';
    }

    // Cielo por tema: de arriba (con carácter) a abajo (siempre el negro espacial base, para que
    // el suelo del nivel y el HUD conserven exactamente el contraste que ya tienen).
    const SKIES = {
        cenizal:  ['#1a0e3c', '#0b0620'],
        ferrosa:  ['#241019', '#0b0620'],
        estacion: ['#101528', '#0b0620'],
        nucleo:   ['#1d0716', '#0b0620'],
        glacial:  ['#0e1a3a', '#0b0620']
    };

    // ---- Composición del fondo: dos capas de siluetas con distinto parallax ----
    // prepare() genera las listas de elementos UNA vez por carga de nivel; draw las recorre.
    // Cada elemento es {x, ...params} en coordenadas de "pantalla virtual" de su capa: al
    // dibujar, su x en pantalla es x - cameraX * parallax.
    const FAR = 0.12, NEAR = 0.38; // las estrellas van a 0.35: las siluetas cercanas las tapan, como debe ser

    // Cuánta "pantalla virtual" tiene que cubrir una capa para que nunca se acabe antes que el
    // nivel: el máximo desplazamiento de cámara por su parallax, más el ancho del viewport.
    function layerSpan(levelW, parallax) {
        return Math.max(0, (levelW - GAME_WIDTH)) * parallax + GAME_WIDTH + 60;
    }
    // Reparte elementos a lo largo de una capa con separación media `gap` (±40%).
    function scatter(rand, span, gap, make) {
        const items = [];
        for (let x = rand() * gap; x < span; x += gap * (0.6 + rand() * 0.8)) items.push(make(x, rand));
        return items;
    }

    const THEMES = {
        // Luna Cenizal: la luna rosa en el cielo, crestas de cráter y —una vez por nivel— la
        // silueta de una nave estrellada: la premisa del juego, de fondo en su propio mundo.
        cenizal: {
            far(rand, span) {
                const items = scatter(rand, span, 130, (x, r) => ({ kind: 'ridge', x, w: 90 + r() * 70, h: 16 + r() * 14 }));
                items.push({ kind: 'moon', x: 60 + rand() * Math.max(80, span - 160), r: 20 + rand() * 8 });
                return items;
            },
            near(rand, span) {
                const items = scatter(rand, span, 150, (x, r) => (
                    r() < 0.7 ? { kind: 'crater', x, w: 60 + r() * 60, h: 12 + r() * 10 }
                              : { kind: 'spire', x, w: 8 + r() * 6, h: 22 + r() * 16 }
                ));
                items.push({ kind: 'wreck', x: span * (0.3 + rand() * 0.4), w: 34, h: 12 });
                return items;
            },
            farColor: '#150b30', nearColor: '#1e1148'
        },
        // Luna Ferrosa: chatarra flotando a lo lejos, pilas de restos y mástiles con baliza.
        ferrosa: {
            far(rand, span) {
                return scatter(rand, span, 110, (x, r) => (
                    r() < 0.55 ? { kind: 'debris', x, w: 14 + r() * 18, h: 8 + r() * 10, y: 28 + r() * 60, tilt: (r() - 0.5) * 0.9 }
                               : { kind: 'ridge', x, w: 70 + r() * 60, h: 12 + r() * 12 }
                ));
            },
            near(rand, span) {
                return scatter(rand, span, 135, (x, r) => (
                    r() < 0.6 ? { kind: 'scrapheap', x, w: 40 + r() * 40, h: 14 + r() * 12 }
                              : { kind: 'mast', x, h: 26 + r() * 18 }
                ));
            },
            farColor: '#251327', nearColor: '#31182b'
        },
        // Estación Colapsada: interior con el casco abierto al espacio — vigas verticales,
        // ventanales con estrellas dentro y cables colgando de un techo que ya no existe.
        estacion: {
            far(rand, span) {
                return scatter(rand, span, 95, (x, r) => (
                    r() < 0.5 ? { kind: 'girder', x, w: 8 + r() * 8 }
                              : { kind: 'window', x, w: 26 + r() * 22, y: 34 + r() * 46, h: 20 + r() * 14, stars: 2 + Math.floor(r() * 3) }
                ));
            },
            near(rand, span) {
                return scatter(rand, span, 120, (x, r) => (
                    r() < 0.55 ? { kind: 'cable', x, drop: 26 + r() * 34, sway: 8 + r() * 12 }
                               : { kind: 'brokenbeam', x, w: 40 + r() * 30, tilt: (r() - 0.5) * 0.5 }
                ));
            },
            farColor: '#181d3a', nearColor: '#232a52'
        },
        // Núcleo Expuesto: la Red como circuitería viva — trazas, nodos rojos y el resplandor
        // difuso del núcleo respirando al fondo.
        nucleo: {
            far(rand, span) {
                const items = scatter(rand, span, 100, (x, r) => ({ kind: 'hexnode', x, y: 30 + r() * 70, r: 5 + r() * 6 }));
                items.push({ kind: 'coreglow', x: span * (0.35 + rand() * 0.3), r: 70 });
                return items;
            },
            near(rand, span) {
                return scatter(rand, span, 90, (x, r) => ({
                    kind: 'trace', x, w: 50 + r() * 50, y: 36 + r() * 82,
                    steps: 1 + Math.floor(r() * 2), dir: r() < 0.5 ? 1 : -1
                }));
            },
            farColor: '#260a20', nearColor: '#33102a'
        },
        // Aguja Glacial: picos helados y una banda de aurora — frío incluso de fondo.
        glacial: {
            far(rand, span) {
                const items = scatter(rand, span, 110, (x, r) => ({ kind: 'peak', x, w: 50 + r() * 50, h: 30 + r() * 26 }));
                items.push({ kind: 'aurora', x: 0, span });
                return items;
            },
            near(rand, span) {
                return scatter(rand, span, 120, (x, r) => ({ kind: 'shards', x, w: 26 + r() * 24, h: 14 + r() * 14 }));
            },
            farColor: '#14204a', nearColor: '#1c2c5e'
        }
    };

    // flatWidth (opcional): compone ambas capas a lo ancho de ese lienzo SIN parallax — para
    // renders estáticos del nivel entero (los mapas de la guía), donde la cámara no se mueve
    // y el span comprimido del parallax dejaría el fondo apelotonado a la izquierda.
    function prepare(level, flatWidth) {
        const theme = themeFor(level);
        const t = THEMES[theme];
        const levelW = level.goal + 60;
        const rand = seededRand(hashSeed(level.name + '|' + theme));
        return {
            theme,
            far: t.far(rand, flatWidth || layerSpan(levelW, FAR)),
            near: t.near(rand, flatWidth || layerSpan(levelW, NEAR)),
            farColor: t.farColor, nearColor: t.nearColor
        };
    }

    // w opcional: los renders estáticos de la guía pintan el nivel entero, más ancho que el viewport.
    function drawSky(ctx, layout, w = GAME_WIDTH) {
        const [top, bottom] = SKIES[layout.theme] || SKIES.cenizal;
        const grad = ctx.createLinearGradient(0, 0, 0, GAME_HEIGHT);
        grad.addColorStop(0, top); grad.addColorStop(1, bottom);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, GAME_HEIGHT);
    }

    const GROUND = 165; // línea de "horizonte" de las siluetas, bajo el suelo jugable (y=150)

    function drawElement(ctx, el, x, color, reduce) {
        switch (el.kind) {
            case 'ridge': { // cresta suave de horizonte
                ctx.fillStyle = color;
                ctx.beginPath();
                ctx.moveTo(x, GROUND);
                ctx.quadraticCurveTo(x + el.w / 2, GROUND - el.h * 2, x + el.w, GROUND);
                ctx.closePath(); ctx.fill();
                break;
            }
            case 'moon': { // la luna rosa, con halo tenue
                ctx.save();
                ctx.fillStyle = 'rgba(255,94,203,0.10)';
                ctx.beginPath(); ctx.arc(x, 42, el.r * 1.5, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = '#2a1454';
                ctx.beginPath(); ctx.arc(x, 42, el.r, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = 'rgba(255,94,203,0.22)';
                ctx.beginPath(); ctx.arc(x - el.r * 0.3, 38, el.r * 0.22, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.arc(x + el.r * 0.35, 48, el.r * 0.14, 0, Math.PI * 2); ctx.fill();
                ctx.restore();
                break;
            }
            case 'crater': { // borde de cráter: dos lomas con hueco en medio
                ctx.fillStyle = color;
                ctx.beginPath();
                ctx.moveTo(x, GROUND);
                ctx.quadraticCurveTo(x + el.w * 0.2, GROUND - el.h, x + el.w * 0.35, GROUND);
                ctx.moveTo(x + el.w * 0.65, GROUND);
                ctx.quadraticCurveTo(x + el.w * 0.8, GROUND - el.h, x + el.w, GROUND);
                ctx.closePath(); ctx.fill();
                break;
            }
            case 'spire': { // aguja de roca
                ctx.fillStyle = color;
                ctx.beginPath();
                ctx.moveTo(x, GROUND); ctx.lineTo(x + el.w / 2, GROUND - el.h); ctx.lineTo(x + el.w, GROUND);
                ctx.closePath(); ctx.fill();
                break;
            }
            case 'wreck': { // la nave estrellada, de morro clavado — la premisa, de fondo
                ctx.save();
                ctx.translate(x, GROUND);
                ctx.rotate(-0.5);
                ctx.fillStyle = color;
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.quadraticCurveTo(el.w * 0.5, -el.h * 1.6, el.w, -el.h * 0.4);
                ctx.lineTo(el.w, 0);
                ctx.closePath(); ctx.fill();
                ctx.fillRect(el.w * 0.75, -el.h * 1.1, 3, el.h * 0.7); // aleta
                ctx.restore();
                break;
            }
            case 'debris': { // chatarra flotante angulosa
                ctx.save();
                ctx.translate(x, el.y); ctx.rotate(el.tilt);
                ctx.fillStyle = color;
                ctx.beginPath();
                ctx.moveTo(-el.w / 2, 0); ctx.lineTo(0, -el.h / 2); ctx.lineTo(el.w / 2, -el.h * 0.1); ctx.lineTo(el.w * 0.2, el.h / 2);
                ctx.closePath(); ctx.fill();
                ctx.restore();
                break;
            }
            case 'scrapheap': { // pila de restos: rectángulos apilados a desnivel
                ctx.fillStyle = color;
                ctx.fillRect(x, GROUND - el.h * 0.5, el.w, el.h * 0.5);
                ctx.fillRect(x + el.w * 0.15, GROUND - el.h * 0.85, el.w * 0.45, el.h * 0.4);
                ctx.fillRect(x + el.w * 0.55, GROUND - el.h, el.w * 0.3, el.h * 0.55);
                break;
            }
            case 'mast': { // mástil con baliza ámbar
                ctx.fillStyle = color;
                ctx.fillRect(x, GROUND - el.h, 2, el.h);
                ctx.fillRect(x - 3, GROUND - el.h * 0.6, 8, 1.5);
                ctx.fillStyle = 'rgba(255,210,63,0.4)';
                ctx.fillRect(x + 0.2, GROUND - el.h - 2, 1.6, 1.6);
                break;
            }
            case 'girder': { // viga vertical del casco
                ctx.fillStyle = color;
                ctx.fillRect(x, 22, el.w, GROUND - 22);
                ctx.fillStyle = 'rgba(11,6,32,0.5)';
                for (let ry = 34; ry < GROUND - 8; ry += 22) ctx.fillRect(x + 1, ry, el.w - 2, 2);
                break;
            }
            case 'window': { // ventanal roto con estrellas dentro
                ctx.fillStyle = '#0b0620';
                ctx.fillRect(x, el.y, el.w, el.h);
                ctx.strokeStyle = color; ctx.lineWidth = 2;
                ctx.strokeRect(x, el.y, el.w, el.h);
                ctx.fillStyle = 'rgba(245,243,255,0.5)';
                for (let s = 0; s < el.stars; s++) {
                    ctx.fillRect(x + 4 + ((s * 47) % Math.max(4, el.w - 8)), el.y + 3 + ((s * 29) % Math.max(3, el.h - 6)), 1, 1);
                }
                break;
            }
            case 'cable': { // cable colgando de fuera de pantalla, con leve curva
                ctx.strokeStyle = color; ctx.lineWidth = 1.4;
                ctx.beginPath();
                ctx.moveTo(x, 18);
                ctx.quadraticCurveTo(x + el.sway, 18 + el.drop * 0.6, x + el.sway * 0.4, 18 + el.drop);
                ctx.stroke();
                ctx.fillStyle = 'rgba(124,245,255,0.35)';
                ctx.fillRect(x + el.sway * 0.4 - 1, 17 + el.drop, 2, 2); // conector suelto
                break;
            }
            case 'brokenbeam': { // viga caída en diagonal
                ctx.save();
                ctx.translate(x, GROUND); ctx.rotate(el.tilt - 0.15);
                ctx.fillStyle = color;
                ctx.fillRect(0, -4, el.w, 4);
                ctx.restore();
                break;
            }
            case 'hexnode': { // nodo hexagonal de la Red, apagado
                ctx.strokeStyle = color; ctx.lineWidth = 1;
                ctx.beginPath();
                for (let i = 0; i < 6; i++) {
                    const a = Math.PI / 3 * i + Math.PI / 6;
                    const px = x + Math.cos(a) * el.r, py = el.y + Math.sin(a) * el.r;
                    i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
                }
                ctx.closePath(); ctx.stroke();
                break;
            }
            case 'coreglow': { // el núcleo respirando al fondo (fijo con reduceEffects)
                const pulse = reduce ? 0.1 : 0.07 + Math.sin(Date.now() * 0.0012) * 0.04;
                const g = ctx.createRadialGradient(x, 70, 4, x, 70, el.r);
                g.addColorStop(0, `rgba(255,51,102,${pulse})`);
                g.addColorStop(1, 'rgba(255,51,102,0)');
                ctx.fillStyle = g;
                ctx.fillRect(x - el.r, 70 - el.r, el.r * 2, el.r * 2);
                break;
            }
            case 'trace': { // traza de circuito con codos y nodo rojo al final
                ctx.strokeStyle = color; ctx.lineWidth = 1.2;
                ctx.beginPath();
                let tx = x, ty = el.y;
                ctx.moveTo(tx, ty);
                for (let s = 0; s <= el.steps; s++) {
                    tx += el.w / (el.steps + 1); ctx.lineTo(tx, ty);
                    ty += el.dir * 9; ctx.lineTo(tx, ty);
                }
                ctx.stroke();
                ctx.fillStyle = 'rgba(255,51,102,0.35)';
                ctx.fillRect(tx - 1.5, ty - 1.5, 3, 3);
                break;
            }
            case 'peak': { // pico helado con arista iluminada
                ctx.fillStyle = color;
                ctx.beginPath();
                ctx.moveTo(x, GROUND); ctx.lineTo(x + el.w * 0.55, GROUND - el.h); ctx.lineTo(x + el.w, GROUND);
                ctx.closePath(); ctx.fill();
                ctx.strokeStyle = 'rgba(124,245,255,0.18)'; ctx.lineWidth = 1;
                ctx.beginPath(); ctx.moveTo(x + el.w * 0.55, GROUND - el.h); ctx.lineTo(x + el.w * 0.75, GROUND); ctx.stroke();
                break;
            }
            case 'aurora': { // banda de aurora, quieta (una onda que se moviera sería un parpadeo)
                ctx.save();
                ctx.strokeStyle = 'rgba(124,245,255,0.07)'; ctx.lineWidth = 7;
                ctx.beginPath();
                for (let ax = 0; ax <= el.span; ax += 16) {
                    const ay = 34 + Math.sin(ax * 0.02) * 8;
                    ax === 0 ? ctx.moveTo(ax, ay) : ctx.lineTo(ax, ay);
                }
                ctx.stroke();
                ctx.restore();
                break;
            }
            case 'shards': { // grupo de esquirlas de hielo a pie de horizonte
                ctx.fillStyle = color;
                ctx.beginPath();
                ctx.moveTo(x, GROUND); ctx.lineTo(x + el.w * 0.25, GROUND - el.h); ctx.lineTo(x + el.w * 0.45, GROUND);
                ctx.moveTo(x + el.w * 0.4, GROUND); ctx.lineTo(x + el.w * 0.65, GROUND - el.h * 0.7); ctx.lineTo(x + el.w * 0.85, GROUND);
                ctx.closePath(); ctx.fill();
                break;
            }
        }
    }

    function drawLayer(ctx, items, color, cameraX, parallax, reduce, viewW) {
        for (const el of items) {
            const x = el.x - cameraX * parallax;
            // margen ancho: hay elementos (crestas, auroras) de más de 100 de ancho
            if (el.kind !== 'aurora' && (x < -180 || x > viewW + 40)) continue;
            drawElement(ctx, el, el.kind === 'aurora' ? -cameraX * parallax : x, color, reduce);
        }
    }

    // viewW (opcional): ancho del lienzo de destino — GAME_WIDTH en el juego; el ancho del
    // nivel entero en los renders estáticos de la guía (si no, el culling recortaría el fondo).
    function drawLayers(ctx, layout, cameraX, reduce, viewW = GAME_WIDTH) {
        ctx.save();
        drawLayer(ctx, layout.far, layout.farColor, cameraX, FAR, reduce, viewW);
        drawLayer(ctx, layout.near, layout.nearColor, cameraX, NEAR, reduce, viewW);
        ctx.restore();
    }

    // ---- Fondo de combate: el duelo hereda el cielo y el horizonte del nivel donde ocurre ----
    // Game.loadLevel registra aquí el layout del nivel actual; CombatSystem (entities.js) lo pide
    // sin conocer a Game — mismo patrón que window.SFX/window.REDUCE_EFFECTS.
    let current = null;
    function setCurrent(layout) { current = layout; }
    function drawCombatBg(ctx) {
        if (!current) return false;
        drawSky(ctx, current);
        drawLayer(ctx, current.far, current.farColor, 0, FAR, true); // quieto y sin pulsos: es un telón
        // Velo oscuro encima: el mundo se reconoce, pero los retratos y el texto mandan.
        ctx.fillStyle = 'rgba(11,6,32,0.55)';
        ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
        return true;
    }

    // ---- Decoración de plataformas: textura leve por variant + atrezzo por tema ----
    // Solo en losas grandes (h≥10 y w≥30): las piedras de paso, móviles, frágiles, refuerzos,
    // cintas y techos QUEDAN LIMPIOS — su dibujo es señal mecánica y no se le pone nada encima.
    const DECOR_VARIANTS = new Set(['normal', 'metal', 'ice']);
    function decoratePlatform(ctx, p, sx) {
        if (!p.theme || p.h < 10 || p.w < 30 || !DECOR_VARIANTS.has(p.variant)) return;
        if (!p._decor || p._decor.theme !== p.theme) p._decor = buildDecor(p);
        // Textura del cuerpo, recortada al rectángulo de la plataforma.
        ctx.save();
        ctx.beginPath(); ctx.rect(sx, p.y, p.w, p.h); ctx.clip();
        if (p.variant === 'metal') {
            ctx.fillStyle = 'rgba(11,6,32,0.3)';
            for (let vx = 24; vx < p.w; vx += 26) ctx.fillRect(sx + vx, p.y, 1, p.h);
            ctx.fillStyle = 'rgba(245,243,255,0.14)';
            for (let vx = 12; vx < p.w; vx += 26) ctx.fillRect(sx + vx, p.y + 2, 1.4, 1.4);
        } else if (p.variant === 'ice') {
            ctx.strokeStyle = 'rgba(255,255,255,0.13)'; ctx.lineWidth = 1;
            for (let vx = 14; vx < p.w; vx += 34) {
                ctx.beginPath(); ctx.moveTo(sx + vx, p.y + p.h); ctx.lineTo(sx + vx + 8, p.y + 1); ctx.stroke();
            }
        } else {
            ctx.fillStyle = 'rgba(11,6,32,0.3)';
            for (const [dx, dy] of p._decor.speckles) ctx.fillRect(sx + dx, p.y + dy, 1.4, 1.4);
        }
        ctx.restore();
        // Atrezzo sobre la superficie: estático, sin glow — nunca se confunde con un pickup.
        for (const it of p._decor.items) drawProp(ctx, it, sx + it.dx, p.y);
    }
    function buildDecor(p) {
        const rand = seededRand(hashSeed(`${p.x},${p.y},${p.w},${p.theme}`));
        const speckles = [];
        for (let dx = 4; dx < p.w - 3; dx += 9 + rand() * 14) speckles.push([dx, 2 + rand() * (p.h - 4)]);
        const props = PROPS[p.theme] || PROPS.cenizal;
        const items = [];
        // uno por cada ~46px de losa, con hueco libre en ambos extremos
        for (let dx = 8 + rand() * 24; dx < p.w - 12; dx += 46 * (0.7 + rand() * 0.7)) {
            if (rand() < 0.68) items.push({ dx, kind: props[Math.floor(rand() * props.length)], s: 0.75 + rand() * 0.5, flip: rand() < 0.5 ? -1 : 1 });
        }
        return { theme: p.theme, speckles, items };
    }
    const PROPS = {
        cenizal:  ['rocks', 'crystal', 'sprout'],
        ferrosa:  ['scrapnub', 'antenna', 'plate'],
        estacion: ['pipe', 'crate', 'lamp'],
        nucleo:   ['pin', 'vent'],
        glacial:  ['icicle', 'snow']
    };
    function drawProp(ctx, it, x, top) {
        const s = it.s;
        ctx.save();
        switch (it.kind) {
            case 'rocks':
                ctx.fillStyle = 'rgba(30,17,72,0.9)';
                ctx.beginPath(); ctx.arc(x, top, 2.4 * s, Math.PI, 0); ctx.fill();
                ctx.beginPath(); ctx.arc(x + 3 * s * it.flip, top, 1.6 * s, Math.PI, 0); ctx.fill();
                break;
            case 'crystal':
                ctx.fillStyle = 'rgba(181,139,255,0.55)';
                ctx.beginPath();
                ctx.moveTo(x, top); ctx.lineTo(x + 1.4 * s, top - 6 * s); ctx.lineTo(x + 2.8 * s, top);
                ctx.closePath(); ctx.fill();
                break;
            case 'sprout':
                ctx.strokeStyle = 'rgba(78,224,138,0.45)'; ctx.lineWidth = 1;
                ctx.beginPath(); ctx.moveTo(x, top); ctx.quadraticCurveTo(x + 1.5 * it.flip, top - 3 * s, x + 0.5 * it.flip, top - 4.5 * s); ctx.stroke();
                ctx.fillStyle = 'rgba(78,224,138,0.4)';
                ctx.fillRect(x + 0.5 * it.flip - 1, top - 5 * s, 2, 1.4);
                break;
            case 'scrapnub':
                ctx.fillStyle = 'rgba(122,90,58,0.8)';
                ctx.fillRect(x, top - 2.6 * s, 4 * s, 2.6 * s);
                ctx.fillRect(x + 1.4 * s, top - 4 * s, 2 * s, 1.6 * s);
                break;
            case 'antenna':
                ctx.fillStyle = 'rgba(136,146,176,0.7)';
                ctx.fillRect(x, top - 7 * s, 1, 7 * s);
                ctx.fillRect(x - 1.4, top - 4.6 * s, 3.8, 1);
                ctx.fillStyle = 'rgba(255,210,63,0.5)';
                ctx.fillRect(x - 0.3, top - 8.2 * s, 1.6, 1.6);
                break;
            case 'plate':
                ctx.strokeStyle = 'rgba(11,6,32,0.5)'; ctx.lineWidth = 1;
                ctx.strokeRect(x, top - 2 * s, 6 * s, 2 * s);
                break;
            case 'pipe':
                ctx.fillStyle = 'rgba(90,98,140,0.7)';
                ctx.fillRect(x, top - 3 * s, 1.8, 3 * s);
                ctx.fillRect(x, top - 3.8 * s, 4.4 * s * it.flip, 1.6);
                break;
            case 'crate':
                ctx.strokeStyle = 'rgba(136,146,176,0.5)'; ctx.lineWidth = 1;
                ctx.strokeRect(x, top - 4 * s, 4 * s, 4 * s);
                ctx.beginPath(); ctx.moveTo(x, top - 4 * s); ctx.lineTo(x + 4 * s, top); ctx.stroke();
                break;
            case 'lamp':
                ctx.fillStyle = 'rgba(136,146,176,0.7)';
                ctx.fillRect(x, top - 6 * s, 1, 6 * s);
                ctx.fillStyle = 'rgba(124,245,255,0.45)';
                ctx.fillRect(x - 0.5, top - 7.4 * s, 2, 1.8);
                break;
            case 'pin':
                ctx.fillStyle = 'rgba(136,146,176,0.6)';
                ctx.fillRect(x, top - 3.4 * s, 1, 3.4 * s);
                ctx.fillStyle = 'rgba(255,51,102,0.5)';
                ctx.fillRect(x - 0.6, top - 4.6 * s, 2.2, 2.2);
                break;
            case 'vent':
                ctx.fillStyle = 'rgba(11,6,32,0.55)';
                ctx.fillRect(x, top - 1.6, 5 * s, 1);
                ctx.fillRect(x, top - 3.2, 5 * s, 1);
                break;
            case 'icicle':
                ctx.fillStyle = 'rgba(191,233,255,0.5)';
                ctx.beginPath();
                ctx.moveTo(x, top); ctx.lineTo(x + 1.2 * s, top - 5 * s); ctx.lineTo(x + 2.4 * s, top);
                ctx.moveTo(x + 2.6 * s, top); ctx.lineTo(x + 3.4 * s, top - 3 * s); ctx.lineTo(x + 4.2 * s, top);
                ctx.closePath(); ctx.fill();
                break;
            case 'snow':
                ctx.fillStyle = 'rgba(245,243,255,0.22)';
                ctx.beginPath(); ctx.ellipse(x + 2, top - 0.6, 3.4 * s, 1.1, 0, 0, Math.PI * 2); ctx.fill();
                break;
        }
        ctx.restore();
    }

    return { themeFor, prepare, drawSky, drawLayers, setCurrent, drawCombatBg, decoratePlatform };
})();

// Como SFX: un `const` de nivel superior no cuelga de `window` en scripts clásicos, y todos los
// consumidores (entities.js, game.js, el generador de mapas) comprueban `window.SCENERY` antes.
window.SCENERY = SCENERY;
