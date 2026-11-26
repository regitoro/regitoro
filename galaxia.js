// ---------- Fondo de galaxia ----------
// Vuelo tranquilo e infinito entre estrellas: cada estrella vive en 3D (x, y, z)
// y se acerca poco a poco a la cámara mientras parpadea.
(function iniciarGalaxia() {
    const canvas = document.getElementById("galaxia");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    const reducirMovimiento = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Paletas de estrellas (la primera combina con los rosas del sitio)
    const paletas = [
        ["#ffffff", "#fbe0f6", "#e76cd7", "#db2ac4", "#ffd6f5"], // rosa
        ["#ffffff", "#cfe3ff", "#8ab4ff", "#a78bfa", "#e0d4ff"], // azul / violeta
        ["#ffffff", "#fff3c4", "#ffc46b", "#ff8a65", "#ffe2d1"], // dorado
        ["#ffffff", "#c9fff4", "#5eead4", "#22d3ee", "#d6f6ff"], // turquesa
    ];
    let paleta = 0;

    const velocidad = reducirMovimiento ? 0.04 : 0.25; // unidades de profundidad por frame
    const PROFUNDIDAD = 1000;

    let ancho, alto, centroX, centroY, foco, estrellas;

    // Parallax suave con el mouse
    let mira = { x: 0, y: 0 };
    let miraSuave = { x: 0, y: 0 };

    function nuevaEstrella(estrella = {}, lejos = false) {
        const colores = paletas[paleta];
        estrella.x = (Math.random() - 0.5) * ancho * 2.2;
        estrella.y = (Math.random() - 0.5) * alto * 2.2;
        estrella.z = lejos ? PROFUNDIDAD : Math.random() * PROFUNDIDAD;
        estrella.tam = Math.random() * 1.3 + 0.3;
        estrella.color = colores[Math.floor(Math.random() * colores.length)];
        estrella.fase = Math.random() * Math.PI * 2;      // para el parpadeo
        estrella.ritmo = Math.random() * 0.04 + 0.01;
        return estrella;
    }

    function redimensionar() {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        ancho = window.innerWidth;
        alto = window.innerHeight;
        canvas.width = ancho * dpr;
        canvas.height = alto * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        centroX = ancho / 2;
        centroY = alto / 2;
        foco = Math.max(ancho, alto) * 0.6;

        const cantidad = Math.round(Math.min(900, (ancho * alto) / 1800));
        estrellas = Array.from({ length: cantidad }, () => nuevaEstrella());
    }

    let ultimo = performance.now();

    function dibujar(ahora) {
        const dt = Math.min(64, ahora - ultimo);
        ultimo = ahora;
        const pasos = dt / 16.67; // normaliza a 60 fps

        miraSuave.x += (mira.x - miraSuave.x) * 0.04;
        miraSuave.y += (mira.y - miraSuave.y) * 0.04;
        const cx = centroX + miraSuave.x;
        const cy = centroY + miraSuave.y;

        ctx.fillStyle = "#1e0a1b";
        ctx.fillRect(0, 0, ancho, alto);

        for (const e of estrellas) {
            e.z -= velocidad * pasos * 4;

            if (e.z <= 1) {
                nuevaEstrella(e, true);
                continue;
            }

            const sx = (e.x / e.z) * foco + cx;
            const sy = (e.y / e.z) * foco + cy;

            if (sx < -50 || sx > ancho + 50 || sy < -50 || sy > alto + 50) {
                nuevaEstrella(e, true);
                continue;
            }

            const cercania = 1 - e.z / PROFUNDIDAD;          // 0 lejos, 1 cerca
            e.fase += e.ritmo * pasos;
            const parpadeo = 0.65 + Math.sin(e.fase) * 0.35;
            const alfa = Math.min(1, cercania * 1.4) * parpadeo;
            const radio = e.tam * (0.4 + cercania * 2.2);

            ctx.globalAlpha = alfa;

            ctx.fillStyle = e.color;
            ctx.beginPath();
            ctx.arc(sx, sy, radio, 0, Math.PI * 2);
            ctx.fill();

            // Halo en las estrellas cercanas y brillantes
            if (cercania > 0.75) {
                ctx.globalAlpha = alfa * 0.15;
                ctx.beginPath();
                ctx.arc(sx, sy, radio * 3, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        ctx.globalAlpha = 1;

        requestAnimationFrame(dibujar);
    }

    window.addEventListener("resize", redimensionar);
    window.addEventListener("mousemove", (ev) => {
        mira.x = (ev.clientX - window.innerWidth / 2) * -0.06;
        mira.y = (ev.clientY - window.innerHeight / 2) * -0.06;
    });

    redimensionar();
    requestAnimationFrame(dibujar);
})();
