# ASTRO LEAP

Plataformas + duelos por turnos, ambientado en dos lunas alienígenas. Construido sobre la misma mecánica que [Monster Jump](https://github.com/enrimr/juego-rol-plataformas) — ver [`DESIGN.md`](./DESIGN.md) para la descripción completa de esa mecánica y de qué añade este juego.

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

## Estructura del proyecto

```
index.html          punto de entrada, controles en pantalla, meta tags
style.css           tema visual (neón espacial)
js/audio.js         SFX sintetizados con Web Audio (sin archivos externos)
js/entities.js      Player, Enemy, Platform, ParticleSystem, WorldMap, CombatSystem
js/levels.js        definición de los 6 niveles y stats de enemigos
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
