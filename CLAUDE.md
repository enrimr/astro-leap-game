# CLAUDE.md — convenciones de trabajo en ASTRO LEAP

## Regla de oro: la documentación viaja con el código

**Todo cambio en el juego debe actualizar `GUIA.md` en el mismo commit.** La guía documenta datos exactos leídos del código (fórmulas de combate, stats del bestiario, patrones de jefes, secretos y fichas de nivel) — si el código cambia y la guía no, miente.

- Si cambia `js/levels.js` (plataformas, enemigos, metas, secretos): regenerar los mapas con `npm run generate-level-maps` y commitear los PNG de `guia/`.
- Si cambian stats, fórmulas o mecánicas (`js/entities.js`, `js/game.js`): revisar las tablas y secciones afectadas de `GUIA.md`.
- Las decisiones de diseño con su porqué van a `DESIGN.md` (sección nueva numerada); `README.md` refleja lo que ve el jugador.

## El resto de convenciones del repo

- Tests con `npm test` antes de cada commit — incluyen un BFS de alcanzabilidad que valida que los 14 niveles (12 del mapa + 2 torres Extra) se completan con salto simple (Scrap); si tocas niveles y falla, el nivel quedó imposible sin habilidad aérea.
- Regla de level design: huecos ≤30 en llano para salto simple; subidas solo con hueco corto; camino bajo de piedras de paso donde la ruta alta exige habilidad aérea.
- `git push` a `main` despliega automáticamente a https://astroleap.enri.me/.
- Commits en español, estilo del historial (imperativo, cuerpo con el porqué).
- JS plano sin build: `const` de nivel superior NO cuelga de `window` (bug histórico de `window.SFX`) — los scripts de puppeteer acceden a `game`/`LEVELS` como bindings léxicos.
- Scripts de desarrollo en `scripts/` (banner OG, mapas de la guía, grabador de gameplay con bot).
