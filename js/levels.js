const LEVELS = [
    // ===== MUNDO 1: LUNA CENIZAL =====
    {
        name: 'Cráter de Amerizaje', world: 1, variant: 'normal',
        platforms: [
            [0, 150, 130, 15], [160, 150, 150, 15], [330, 150, 240, 15],
            [70, 120, 35, 6], [230, 110, 40, 6], [320, 95, 40, 6], [420, 115, 45, 6],
            // bóveda oculta bajo el refuerzo [310,150,20,8]: solo se ve/alcanza si Scrap lo rompe
            [305, 172, 30, 6],
            // Tramo final añadido al alargar el nivel: huecos ≤30 en llano (salto simple),
            // con una plataforma elevada opcional para la ruta alta.
            [595, 150, 55, 15], [680, 150, 80, 15], [620, 118, 35, 6]
        ],
        // Parche reforzado que tapa la bóveda de abajo — cualquiera camina por encima sin notarlo
        // (mismo nivel de suelo y=150 que sus vecinos, solo más fino), solo Scrap puede romperlo
        // (ver Game.update()) y caer a por la cápsula.
        reinforcedBlocks: [[310, 150, 20, 8]],
        enemies: [[100, 138, 'drone'], [260, 98, 'drone'], [360, 83, 'crawler'], [610, 138, 'drone'], [630, 106, 'crawler']],
        // Célula de energía sobre la plataforma flotante más alta [320,95,40,6], puramente decorativa/opcional
        energyCells: [[335, 85]],
        capsules: [[312, 162]],
        goal: 730
    },
    {
        name: 'Grietas de Hielo', world: 1, variant: 'ice',
        platforms: [
            [0, 150, 100, 15], [130, 150, 60, 15],
            [70, 118, 30, 6], [250, 140, 70, 15], [355, 125, 40, 6],
            [430, 105, 40, 6], [510, 130, 60, 15], [610, 150, 80, 15],
            // plataforma secreta muy alta sobre [430,105,40,6]: fuera del alcance de un doble salto
            // normal, solo se llega manteniendo pulsado el salto de Bolt (vuelo)
            [440, 40, 24, 6],
            // Camino bajo: piedras de paso alcanzables con un salto SIMPLE, para que Scrap (sin
            // habilidad aérea) también pueda cruzar los huecos de arriba, que exigen doble salto.
            // Cualquier piloto puede usarlas, pero solo Scrap las NECESITA — para los demás son un
            // desvío más lento que saltar directo.
            [215, 150, 20, 6], [348, 150, 20, 6], [423, 135, 20, 6],
            // Tramo final añadido al alargar el nivel (huecos ≤25 en llano, salto simple).
            [715, 150, 55, 15], [795, 150, 60, 15], [745, 120, 35, 6]
        ],
        enemies: [[80, 106, 'drone'], [260, 128, 'spiker'], [440, 93, 'crawler'], [530, 118, 'spiker'], [730, 138, 'spiker'], [810, 138, 'crawler']],
        // Cápsula escondida sobre la plataforma flotante [70,118,30,6], que no hace falta pisar para avanzar
        capsules: [[82, 108]],
        energyCells: [[447, 27]],
        goal: 825
    },
    {
        name: 'Nido de la Reina Larva', world: 1, variant: 'normal',
        platforms: [
            [0, 150, 90, 15], [120, 150, 70, 15], [220, 140, 50, 6],
            [310, 150, 60, 15], [400, 135, 45, 6],
            // Antesala añadida al alargar el nivel: la arena de la Reina (la plataforma ancha
            // final) se desplaza a la derecha y estos dos tramos rellenan el camino.
            [470, 150, 55, 15], [550, 150, 60, 15], [640, 150, 220, 15],
            // hueco ancho a propósito: un salto normal no llega al otro lado (aterriza en la red
            // de seguridad de abajo, sin perder nada); solo el impulso lateral de Shade cruza del
            // todo hasta la plataforma ancha con la cápsula.
            [330, 108, 18, 6], [390, 100, 70, 8], [330, 160, 150, 6]
        ],
        enemies: [[135, 138, 'drone'], [230, 128, 'crawler'], [485, 138, 'crawler'], [720, 130, 'queen_larva']],
        capsules: [[420, 86]],
        goal: 810, boss: 'queen_larva'
    },

    // ===== MUNDO 2: LUNA FERROSA =====
    {
        name: 'Chatarral Magnético', world: 2, variant: 'metal',
        platforms: [
            [0, 150, 80, 15], [140, 150, 55, 15], [235, 130, 45, 6],
            [325, 150, 55, 15], [420, 115, 45, 6], [510, 150, 55, 15],
            [605, 130, 45, 6], [695, 150, 130, 15],
            [335, 110, 25, 6], // plataforma secreta: exige doble salto desde [325,150,55,15]
            // Camino bajo con salto simple (ver Grietas de Hielo) — sin él, todo este nivel exige
            // doble salto/dash/vuelo de un extremo a otro y Scrap se quedaría atascado en el primer hueco.
            [105, 150, 20, 6], [220, 150, 20, 6], [308, 140, 20, 6],
            [388, 120, 20, 6], [590, 150, 20, 6], [678, 140, 20, 6],
            // Tramo final añadido al alargar el nivel (huecos ≤25 en llano, salto simple).
            [850, 150, 55, 15], [930, 150, 70, 15], [880, 115, 40, 6]
        ],
        enemies: [[150, 138, 'magnetite'], [250, 118, 'hoverbot', 55], [340, 138, 'crawler'], [435, 103, 'hoverbot', 60], [615, 118, 'magnetite'], [860, 138, 'crawler'], [890, 103, 'hoverbot', 50]],
        energyCells: [[345, 100]],
        goal: 965
    },
    {
        name: 'Tormenta de Iones', world: 2, variant: 'metal',
        platforms: [
            [0, 150, 70, 15], [200, 145, 45, 6], [340, 125, 45, 6],
            [480, 105, 45, 6], [620, 125, 45, 6], [760, 145, 45, 6], [900, 150, 100, 15],
            [635, 88, 28, 6], // plataforma secreta: solo se alcanza con doble salto desde [620,125,45,6]
            // Camino bajo: este nivel es EL ejemplo de "doble salto obligatorio" del diseño original
            // (huecos de 95-130u, muy por encima de lo que llega un salto simple), así que necesita
            // varias piedras seguidas en vez de una sola — el desvío más largo de los 9 niveles.
            [95, 150, 20, 6], [140, 150, 20, 6], [185, 150, 15, 6],
            [271, 150, 20, 6], [316, 150, 20, 6],
            [413, 135, 20, 6], [461, 145, 20, 6],
            [553, 115, 20, 6], [601, 125, 19, 6],
            [691, 98, 20, 6], [739, 108, 20, 6],
            [831, 150, 20, 6], [876, 150, 20, 6],
            // Tramo final añadido al alargar el nivel: mismo estilo del nivel (plataforma alta
            // + piedras de paso bajas para el salto simple).
            [1025, 150, 20, 6], [1070, 150, 20, 6],
            [1105, 140, 45, 6], [1175, 150, 100, 15]
        ],
        enemies: [[210, 133, 'ionwisp', 65], [350, 113, 'spiker'], [490, 93, 'ionwisp', 70], [630, 113, 'hoverbot', 60], [770, 133, 'ionwisp', 65], [1115, 128, 'ionwisp', 60]],
        capsules: [[645, 78]],
        goal: 1240
    },
    {
        name: 'Núcleo del Centinela', world: 2, variant: 'metal',
        platforms: [
            [0, 150, 90, 15], [150, 150, 60, 15], [260, 130, 45, 6],
            [355, 150, 60, 15], [460, 115, 45, 6], [560, 150, 60, 15],
            // Antesala añadida al alargar el nivel: la arena del Centinela se desplaza a la
            // derecha y estos dos tramos rellenan el camino.
            [685, 150, 55, 15], [770, 150, 55, 15], [850, 150, 290, 15],
            // Camino bajo con salto simple (ver Grietas de Hielo/Chatarral Magnético).
            [115, 150, 20, 6], [235, 150, 20, 6], [333, 140, 20, 6],
            [440, 150, 20, 6], [533, 125, 20, 6], [645, 150, 15, 6]
        ],
        enemies: [[160, 138, 'magnetite'], [270, 118, 'hoverbot', 40], [365, 138, 'ionwisp', 50], [700, 138, 'magnetite'], [790, 138, 'ionwisp', 45], [970, 130, 'sentinel']],
        goal: 1090, boss: 'sentinel'
    },

    // ===== MUNDO 3: ESTACIÓN COLAPSADA =====
    // Una estación abandonada donde encuentras la pieza que falta para reparar la nave.
    // Al tomarla, el núcleo despierta y empieza la cuenta atrás de autodestrucción.
    {
        name: 'Muelle de Carga', world: 3, variant: 'metal',
        platforms: [
            [0, 150, 80, 15], [140, 150, 55, 15], [230, 130, 45, 6],
            [320, 150, 55, 15], [410, 115, 45, 6], [500, 150, 55, 15],
            [590, 130, 45, 6], [680, 150, 150, 15],
            [245, 104, 25, 6], // plataforma secreta: un salto simple por encima de [230,130,45,6]
            // Camino bajo con salto simple (ver Grietas de Hielo).
            [105, 150, 20, 6], [220, 150, 20, 6], [298, 114, 20, 6],
            [400, 150, 20, 6], [580, 150, 20, 6], [663, 140, 20, 6],
            // Tramo final añadido al alargar el nivel (huecos ≤25 en llano, salto simple).
            [855, 150, 55, 15], [935, 150, 65, 15], [890, 118, 40, 6]
        ],
        enemies: [[150, 138, 'crawler'], [240, 118, 'hoverbot', 50], [330, 138, 'spiker'], [420, 103, 'ionwisp', 55], [600, 118, 'magnetite'], [865, 138, 'spiker'], [900, 106, 'hoverbot', 45]],
        capsules: [[254, 94]],
        goal: 965
    },
    {
        name: 'Túnel de Escape', world: 3, variant: 'metal',
        // Nivel de scroll forzado: la pared de energía del núcleo avanza sola.
        // Quedarte atrás del borde izquierdo de la cámara duele — hay que mantener el ritmo.
        forcedScroll: { speed: 0.55, startDelay: 300 },
        platforms: [
            [0, 150, 60, 15], [90, 150, 50, 15], [170, 140, 45, 6],
            [240, 150, 55, 15], [325, 135, 45, 6], [400, 150, 60, 15],
            [490, 125, 45, 6], [565, 150, 55, 15], [650, 140, 45, 6],
            [725, 150, 60, 15], [815, 125, 45, 6], [890, 150, 170, 15],
            // Dos huecos de este nivel (los de subir 25u con 30u de hueco) se quedaban CORTOS por
            // muy poco para un salto simple, pese a que el diseño original decía que este nivel no
            // exige doble salto — dos piedras mínimas para que sea cierto también con Scrap.
            [465, 124, 16, 6], [790, 124, 16, 6],
            // Tramo final añadido al alargar el nivel — mismas reglas que el resto del Túnel:
            // cruzable con salto simple (huecos ≤25, subida de 10 como el patrón ya existente).
            [1085, 150, 55, 15], [1165, 140, 45, 6], [1235, 150, 60, 15]
        ],
        enemies: [[100, 138, 'spiker'], [250, 138, 'magnetite'], [410, 138, 'crawler'], [575, 138, 'hoverbot', 40], [735, 138, 'spiker'], [900, 138, 'ionwisp', 50], [1095, 138, 'crawler'], [1180, 128, 'spiker']],
        goal: 1260
    },
    {
        name: 'Núcleo del Reactor', world: 3, variant: 'metal',
        platforms: [
            [0, 150, 70, 15], [130, 150, 55, 15], [235, 130, 45, 6],
            [330, 150, 55, 15], [420, 110, 45, 6], [510, 150, 55, 15],
            [600, 125, 45, 6], [690, 150, 55, 15],
            // Antesala añadida al alargar el nivel: la arena del Overlord se desplaza a la
            // derecha y estos dos tramos rellenan el camino.
            [770, 150, 55, 15], [850, 150, 70, 15], [950, 150, 320, 15],
            [140, 115, 25, 6], // plataforma secreta: exige doble salto desde [130,150,55,15], antes del jefe
            // Camino bajo con salto simple (ver Grietas de Hielo) — incluso el nivel del jefe final
            // de la zona 3 debe poder cruzarse sin doble salto.
            [95, 150, 20, 6], [193, 125, 20, 6], [308, 140, 20, 6],
            [410, 150, 20, 6], [590, 150, 20, 6], [673, 135, 20, 6]
        ],
        enemies: [[145, 138, 'magnetite'], [250, 118, 'ionwisp', 40], [340, 138, 'spiker'], [430, 98, 'hoverbot', 45], [520, 138, 'crawler'], [615, 113, 'ionwisp', 50], [785, 138, 'magnetite'], [860, 120, 'ionwisp', 45], [1070, 130, 'overlord']],
        energyCells: [[149, 105]],
        goal: 1220, boss: 'overlord'
    },

    // ===== MUNDO 4: NÚCLEO EXPUESTO =====
    // El Overlord no era la Red — era un fragmento local, un nodo, un avatar (LORE.md §2.2).
    // Ganar esa pelea no acaba la amenaza: la deja al descubierto. Detrás del Núcleo del Reactor
    // había una bóveda sellada con refuerzos que ningún piloto anterior podía cruzar — hasta ahora,
    // que Scrap (desbloqueado justo al vencer al Overlord) puede romperlos. Por eso esta zona
    // existe solo a partir de aquí, no antes: es literalmente el mundo que tu piloto nuevo abre.
    {
        name: 'Bóveda Sellada', world: 4, variant: 'metal',
        platforms: [
            [0, 150, 80, 15], [140, 150, 55, 15], [230, 130, 45, 6],
            [320, 150, 55, 15], [410, 115, 45, 6], [500, 150, 55, 15],
            [590, 130, 45, 6], [680, 150, 180, 15],
            // Camino bajo con salto simple (ver Grietas de Hielo, nivel 2) — el mundo que Scrap
            // abre debe poder cruzarse con Scrap, no solo con los otros tres pilotos.
            [105, 150, 20, 6], [220, 150, 20, 6], [303, 140, 20, 6],
            [400, 150, 20, 6], [580, 150, 20, 6], [663, 140, 20, 6],
            // Tramo final añadido al alargar el nivel (huecos ≤25 en llano, salto simple).
            [885, 150, 55, 15], [965, 150, 65, 15], [915, 118, 40, 6]
        ],
        // Parche reforzado que tapa una bóveda justo debajo, al ras del suelo — igual que el
        // primer secreto de Scrap en Cráter de Amerizaje (nivel 1): cualquiera camina encima sin
        // notarlo, solo Scrap puede romperlo y bajar a por la cápsula.
        reinforcedBlocks: [[700, 150, 20, 8]],
        enemies: [[150, 138, 'magnetite'], [240, 118, 'hoverbot', 50], [330, 138, 'spiker'], [420, 103, 'ionwisp', 55], [510, 138, 'magnetite'], [600, 118, 'hoverbot', 45], [895, 138, 'spiker'], [925, 106, 'hoverbot', 45]],
        capsules: [[707, 162]],
        goal: 995
    },
    {
        name: 'Galería de Ecos', world: 4, variant: 'metal',
        platforms: [
            [0, 150, 70, 15], [190, 145, 45, 6], [320, 125, 45, 6],
            [450, 105, 45, 6], [580, 125, 45, 6], [710, 145, 45, 6],
            [840, 150, 55, 15], [930, 150, 150, 15],
            // Camino bajo con salto simple — como Tormenta de Iones (nivel 5), del mismo estilo
            // "doble salto obligatorio" en la ruta alta, necesita varias piedras seguidas.
            [95, 150, 20, 6], [140, 150, 20, 6],
            [261, 150, 20, 6], [306, 150, 20, 6],
            [393, 135, 20, 6], [441, 145, 20, 6],
            [523, 115, 20, 6], [653, 135, 20, 6],
            [781, 150, 20, 6], [826, 150, 14, 6],
            // Tramo final añadido al alargar el nivel (huecos ≤25, subida suave de 5).
            [1105, 150, 55, 15], [1185, 145, 45, 6], [1255, 150, 70, 15]
        ],
        reinforcedBlocks: [[945, 150, 20, 8]],
        enemies: [[200, 133, 'ionwisp', 60], [330, 113, 'spiker'], [460, 93, 'ionwisp', 65], [590, 113, 'hoverbot', 55], [720, 133, 'magnetite'], [850, 138, 'spiker'], [1120, 138, 'magnetite'], [1195, 133, 'spiker']],
        energyCells: [[952, 162]],
        goal: 1290
    },
    {
        name: 'Nodo Cero', world: 4, variant: 'metal',
        platforms: [
            [0, 150, 80, 15], [150, 150, 55, 15], [255, 130, 45, 6],
            [350, 150, 55, 15], [440, 110, 45, 6], [530, 150, 55, 15],
            [620, 125, 45, 6], [710, 150, 55, 15],
            // Antesala añadida al alargar el nivel: la arena de Nodo Cero se desplaza a la
            // derecha y estos dos tramos rellenan el camino.
            [790, 150, 55, 15], [870, 150, 80, 15], [980, 150, 320, 15],
            // Camino bajo con salto simple (ver Grietas de Hielo) — hasta el nivel del jefe final
            // absoluto debe poder cruzarse con cualquier piloto, Scrap incluido.
            [105, 150, 20, 6], [230, 150, 20, 6], [328, 140, 20, 6],
            [430, 150, 20, 6], [610, 150, 20, 6], [693, 135, 20, 6]
        ],
        enemies: [[160, 138, 'magnetite'], [265, 118, 'ionwisp', 45], [360, 138, 'spiker'], [450, 98, 'hoverbot', 45], [540, 138, 'magnetite'], [630, 113, 'ionwisp', 50], [720, 138, 'spiker'], [805, 138, 'crawler'], [885, 138, 'magnetite'], [1130, 130, 'nodo_cero']],
        goal: 1260, boss: 'nodo_cero'
    }
];
