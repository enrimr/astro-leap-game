const LEVELS = [
    // ===== MUNDO 1: LUNA CENIZAL =====
    {
        name: 'Cráter de Amerizaje', world: 1, variant: 'normal',
        platforms: [
            [0, 150, 130, 15], [160, 150, 410, 15],
            [70, 120, 35, 6], [230, 110, 40, 6], [320, 95, 40, 6], [420, 115, 45, 6]
        ],
        enemies: [[100, 138, 'drone'], [260, 98, 'drone'], [360, 83, 'crawler']],
        goal: 520
    },
    {
        name: 'Grietas de Hielo', world: 1, variant: 'ice',
        platforms: [
            [0, 150, 100, 15], [130, 150, 60, 15],
            [70, 118, 30, 6], [250, 140, 70, 15], [355, 125, 40, 6],
            [430, 105, 40, 6], [510, 130, 60, 15], [610, 150, 80, 15]
        ],
        enemies: [[80, 106, 'drone'], [260, 128, 'spiker'], [440, 93, 'crawler'], [530, 118, 'spiker']],
        goal: 640
    },
    {
        name: 'Nido de la Reina Larva', world: 1, variant: 'normal',
        platforms: [
            [0, 150, 90, 15], [120, 150, 70, 15], [220, 140, 50, 6],
            [310, 150, 60, 15], [400, 135, 45, 6], [480, 150, 220, 15]
        ],
        enemies: [[135, 138, 'drone'], [230, 128, 'crawler'], [560, 138, 'queen_larva']],
        goal: 650, boss: 'queen_larva'
    },

    // ===== MUNDO 2: LUNA FERROSA =====
    {
        name: 'Chatarral Magnético', world: 2, variant: 'metal',
        platforms: [
            [0, 150, 80, 15], [140, 150, 55, 15], [235, 130, 45, 6],
            [325, 150, 55, 15], [420, 115, 45, 6], [510, 150, 55, 15],
            [605, 130, 45, 6], [695, 150, 130, 15]
        ],
        enemies: [[150, 138, 'magnetite'], [250, 118, 'hoverbot', 55], [340, 138, 'crawler'], [435, 103, 'hoverbot', 60], [615, 118, 'magnetite']],
        goal: 760
    },
    {
        name: 'Tormenta de Iones', world: 2, variant: 'metal',
        platforms: [
            [0, 150, 70, 15], [200, 145, 45, 6], [340, 125, 45, 6],
            [480, 105, 45, 6], [620, 125, 45, 6], [760, 145, 45, 6], [900, 150, 100, 15]
        ],
        enemies: [[210, 133, 'ionwisp', 65], [350, 113, 'spiker'], [490, 93, 'ionwisp', 70], [630, 113, 'hoverbot', 60], [770, 133, 'ionwisp', 65]],
        goal: 940
    },
    {
        name: 'Núcleo del Centinela', world: 2, variant: 'metal',
        platforms: [
            [0, 150, 90, 15], [150, 150, 60, 15], [260, 130, 45, 6],
            [355, 150, 60, 15], [460, 115, 45, 6], [560, 150, 60, 15],
            [660, 150, 290, 15]
        ],
        enemies: [[160, 138, 'magnetite'], [270, 118, 'hoverbot', 40], [365, 138, 'ionwisp', 50], [780, 138, 'sentinel']],
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
            [590, 130, 45, 6], [680, 150, 150, 15]
        ],
        enemies: [[150, 138, 'crawler'], [240, 118, 'hoverbot', 50], [330, 138, 'spiker'], [420, 103, 'ionwisp', 55], [600, 118, 'magnetite']],
        goal: 780
    },
    {
        name: 'Túnel de Escape', world: 3, variant: 'metal',
        // Nivel de scroll forzado: la pared de energía del núcleo avanza sola.
        // Quedarte atrás del borde izquierdo de la cámara duele — hay que mantener el ritmo.
        forcedScroll: { speed: 1.1, startDelay: 90 },
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
            [600, 125, 45, 6], [690, 150, 55, 15], [780, 150, 320, 15]
        ],
        enemies: [[145, 138, 'magnetite'], [250, 118, 'ionwisp', 40], [340, 138, 'spiker'], [430, 98, 'hoverbot', 45], [520, 138, 'crawler'], [615, 113, 'ionwisp', 50], [900, 138, 'overlord']],
        goal: 1050, boss: 'overlord'
    }
];
