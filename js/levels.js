const LEVELS = [
    // ===== MUNDO 1: LUNA CENIZAL =====
    {
        name: 'Cráter de Amerizaje', world: 1, variant: 'normal',
        platforms: [
            [0, 150, 130, 15], [160, 150, 150, 15], [330, 150, 240, 15],
            [70, 120, 35, 6], [230, 110, 40, 6], [320, 95, 40, 6], [420, 115, 45, 6],
            // bóveda oculta bajo el refuerzo [310,150,20,8]: solo se ve/alcanza si Scrap lo rompe
            [305, 172, 30, 6]
        ],
        // Parche reforzado que tapa la bóveda de abajo — cualquiera camina por encima sin notarlo
        // (mismo nivel de suelo y=150 que sus vecinos, solo más fino), solo Scrap puede romperlo
        // (ver Game.update()) y caer a por la cápsula.
        reinforcedBlocks: [[310, 150, 20, 8]],
        enemies: [[100, 138, 'drone'], [260, 98, 'drone'], [360, 83, 'crawler']],
        // Célula de energía sobre la plataforma flotante más alta [320,95,40,6], puramente decorativa/opcional
        energyCells: [[335, 85]],
        capsules: [[312, 162]],
        goal: 520
    },
    {
        name: 'Grietas de Hielo', world: 1, variant: 'ice',
        platforms: [
            [0, 150, 100, 15], [130, 150, 60, 15],
            [70, 118, 30, 6], [250, 140, 70, 15], [355, 125, 40, 6],
            [430, 105, 40, 6], [510, 130, 60, 15], [610, 150, 80, 15],
            // plataforma secreta muy alta sobre [430,105,40,6]: fuera del alcance de un doble salto
            // normal, solo se llega manteniendo pulsado el salto de Bolt (vuelo)
            [440, 40, 24, 6]
        ],
        enemies: [[80, 106, 'drone'], [260, 128, 'spiker'], [440, 93, 'crawler'], [530, 118, 'spiker']],
        // Cápsula escondida sobre la plataforma flotante [70,118,30,6], que no hace falta pisar para avanzar
        capsules: [[82, 108]],
        energyCells: [[447, 27]],
        goal: 640
    },
    {
        name: 'Nido de la Reina Larva', world: 1, variant: 'normal',
        platforms: [
            [0, 150, 90, 15], [120, 150, 70, 15], [220, 140, 50, 6],
            [310, 150, 60, 15], [400, 135, 45, 6], [480, 150, 220, 15],
            // hueco ancho a propósito: un salto normal no llega al otro lado (aterriza en la red
            // de seguridad de abajo, sin perder nada); solo el impulso lateral de Shade cruza del
            // todo hasta la plataforma ancha con la cápsula.
            [330, 108, 18, 6], [390, 100, 70, 8], [330, 160, 150, 6]
        ],
        enemies: [[135, 138, 'drone'], [230, 128, 'crawler'], [560, 130, 'queen_larva']],
        capsules: [[420, 86]],
        goal: 650, boss: 'queen_larva'
    },

    // ===== MUNDO 2: LUNA FERROSA =====
    {
        name: 'Chatarral Magnético', world: 2, variant: 'metal',
        platforms: [
            [0, 150, 80, 15], [140, 150, 55, 15], [235, 130, 45, 6],
            [325, 150, 55, 15], [420, 115, 45, 6], [510, 150, 55, 15],
            [605, 130, 45, 6], [695, 150, 130, 15],
            [335, 110, 25, 6] // plataforma secreta: exige doble salto desde [325,150,55,15]
        ],
        enemies: [[150, 138, 'magnetite'], [250, 118, 'hoverbot', 55], [340, 138, 'crawler'], [435, 103, 'hoverbot', 60], [615, 118, 'magnetite']],
        energyCells: [[345, 100]],
        goal: 760
    },
    {
        name: 'Tormenta de Iones', world: 2, variant: 'metal',
        platforms: [
            [0, 150, 70, 15], [200, 145, 45, 6], [340, 125, 45, 6],
            [480, 105, 45, 6], [620, 125, 45, 6], [760, 145, 45, 6], [900, 150, 100, 15],
            [635, 88, 28, 6] // plataforma secreta: solo se alcanza con doble salto desde [620,125,45,6]
        ],
        enemies: [[210, 133, 'ionwisp', 65], [350, 113, 'spiker'], [490, 93, 'ionwisp', 70], [630, 113, 'hoverbot', 60], [770, 133, 'ionwisp', 65]],
        capsules: [[645, 78]],
        goal: 940
    },
    {
        name: 'Núcleo del Centinela', world: 2, variant: 'metal',
        platforms: [
            [0, 150, 90, 15], [150, 150, 60, 15], [260, 130, 45, 6],
            [355, 150, 60, 15], [460, 115, 45, 6], [560, 150, 60, 15],
            [660, 150, 290, 15]
        ],
        enemies: [[160, 138, 'magnetite'], [270, 118, 'hoverbot', 40], [365, 138, 'ionwisp', 50], [780, 130, 'sentinel']],
        goal: 900, boss: 'sentinel'
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
            [245, 104, 25, 6] // plataforma secreta: un salto simple por encima de [230,130,45,6]
        ],
        enemies: [[150, 138, 'crawler'], [240, 118, 'hoverbot', 50], [330, 138, 'spiker'], [420, 103, 'ionwisp', 55], [600, 118, 'magnetite']],
        capsules: [[254, 94]],
        goal: 780
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
            [725, 150, 60, 15], [815, 125, 45, 6], [890, 150, 170, 15]
        ],
        enemies: [[100, 138, 'spiker'], [250, 138, 'magnetite'], [410, 138, 'crawler'], [575, 138, 'hoverbot', 40], [735, 138, 'spiker'], [900, 138, 'ionwisp', 50]],
        goal: 1000
    },
    {
        name: 'Núcleo del Reactor', world: 3, variant: 'metal',
        platforms: [
            [0, 150, 70, 15], [130, 150, 55, 15], [235, 130, 45, 6],
            [330, 150, 55, 15], [420, 110, 45, 6], [510, 150, 55, 15],
            [600, 125, 45, 6], [690, 150, 55, 15], [780, 150, 320, 15],
            [140, 115, 25, 6] // plataforma secreta: exige doble salto desde [130,150,55,15], antes del jefe
        ],
        enemies: [[145, 138, 'magnetite'], [250, 118, 'ionwisp', 40], [340, 138, 'spiker'], [430, 98, 'hoverbot', 45], [520, 138, 'crawler'], [615, 113, 'ionwisp', 50], [900, 130, 'overlord']],
        energyCells: [[149, 105]],
        goal: 1050, boss: 'overlord'
    }
];
