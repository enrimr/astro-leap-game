# ASTRO LEAP

Plataformas + duelos por turnos, ambientado en dos lunas alienígenas y una estación abandonada. Construido sobre la misma mecánica que [Monster Jump](https://github.com/enrimr/juego-rol-plataformas) — ver [`DESIGN.md`](./DESIGN.md) para la descripción completa de esa mecánica y de qué añade este juego.

## Jugar en local

No requiere build. Es HTML/CSS/JS plano.

```bash
python3 -m http.server 8000
# abre http://localhost:8000/
```

O simplemente abre `index.html` directamente en el navegador.

## Controles

- `←` `→` — mover
- `ESPACIO` — saltar. Una segunda pulsación en el aire = **propulsor** (doble salto), cuesta 1 de Energía.
- En combate: `↑`/`↓` (o `←`/`→`) navegan el menú, `ESPACIO`/`Enter` confirma, o `1`-`4` como atajo directo.
- `ESC` — salir del nivel actual.
- Táctil y ratón: los mismos controles aparecen siempre en pantalla, debajo del juego.

## La mecánica nueva

La Energía es un recurso **compartido** entre el doble salto en plataformas y la Habilidad en combate. No se regenera con el tiempo — solo derrotando enemigos o al empezar un nivel. Cada salto extra que gastas es una carga menos para el próximo duelo. Ver `DESIGN.md` §2.2 para el detalle.

## El nivel de scroll forzado

El sector 8 ("Túnel de Escape") es distinto al resto: al entrar, el núcleo de la estación empieza una cuenta atrás y luego una pared de energía avanza sola desde el borde izquierdo de la pantalla — no puedes detenerla ni ir más despacio que ella. Si te alcanza, empuja al jugador y hace daño (con un breve respiro entre golpes, no es instantáneo). Es el mismo tipo de tramo que en *Super Mario World* obliga a mantener el ritmo del mapa en vez de explorar a tu aire. Ver `DESIGN.md` §2.6.

## Probar/depurar un nivel concreto

No hace falta jugar desde el principio ni tocar la consola:

- `?level=N` (1-9) — entra directo a ese nivel, con vida y energía al máximo, saltándose el mapa.
  Ej: `http://localhost:8000/?level=8` te deja directamente en el Túnel de Escape.
- `?unlock=all` — desbloquea todos los nodos del mapa estelar para poder elegir cualquiera a mano
  con las flechas y `ESPACIO`, en vez de tener que completarlos en orden.
- Combinables: `?level=8&unlock=all`.
- Ya dentro de un nivel, la tecla `R` lo reinicia al instante (posición, vida y energía), para iterar rápido sin salir al mapa.

## Estructura del proyecto

```
index.html          punto de entrada, controles en pantalla, meta tags
style.css           tema visual (neón espacial)
js/audio.js         SFX sintetizados con Web Audio (sin archivos externos)
js/entities.js      Player, Enemy, Platform, ParticleSystem, WorldMap, CombatSystem
js/levels.js        definición de los 9 niveles (incluido el de scroll forzado) y stats de enemigos
js/game.js          bucle principal, input (teclado/ratón/táctil), guardado, render
__tests__/          suite de Jest sobre la lógica núcleo
scripts/            generador del banner og-image.png (dev-time, node-canvas)
```

## Tests

```bash
npm install
npm test
```

## Progreso guardado

El progreso (nivel del jugador, stats, sectores desbloqueados/completados) se guarda automáticamente en `localStorage` al completar cada sector. Se limpia al terminar el juego (victoria) para permitir una partida nueva.
