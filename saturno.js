// =========================================================
// Saturno de partículas (portada)
// ---------------------------------------------------------
// El planeta y sus anillos se forman a partir de miles de puntos
// luminosos que vienen desde el espacio en espiral.
// - Planeta: puntos sobre una esfera achatada, coloreados por bandas
//   con la paleta rosa / violeta del sitio.
// - Anillos: puntos en órbitas circulares (anillos C, B, A y F, con la
//   división de Cassini), en tonos crema, dorado y blanco. Giran a
//   distinta velocidad según su distancia (como en la vida real).
// - Polvo de estrellas alrededor que parpadea.
// - Al pasar el mouse, las partículas cercanas se separan un poco.
// Todo el movimiento se calcula en la GPU (shaders), así que miles de
// partículas cuestan muy poco.
// Requiere three.js (r149, script clásico) cargado antes que este archivo.
// =========================================================
(function iniciarSaturno() {
    const contenedor = document.getElementById("saturno");
    if (!contenedor || !window.THREE) return;

    const reducirMovimiento = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const esCelular = window.innerWidth < 700;

    // ---------- Configuración (cambia aquí para ajustar el efecto) ----------
    const CONFIG = {
        particulasPlaneta: esCelular ? 7000 : 14000,
        particulasAnillos: esCelular ? 12000 : 24000,
        particulasPolvo: esCelular ? 350 : 700,
        radioPlaneta: 1,
        achatamiento: 0.9,           // Saturno es más ancho que alto
        duracionFormacion: 2.6,      // segundos que tarda cada partícula en llegar
        inclinacion: { x: 0.46, z: -0.4 }, // inclinación de planeta + anillos
        velocidadRotacion: 0.07,     // giro del planeta
        velocidadAnillos: 0.14,      // giro de los anillos
        radioMouse: 0.22,            // zona de influencia del mouse (en pantalla)
        empujeMouse: 0.28,           // cuánto se separan las partículas
    };

    // Bandas del planeta, de polo a polo (paleta del sitio)
    const BANDAS = [
        "#4c1d95", "#6d28d9", "#8b5cf6", "#a21caf", "#db2ac4", "#e76cd7",
        "#f472b6", "#f9a8d4", "#e76cd7", "#c026d3", "#db2ac4", "#9333ea",
        "#7c3aed", "#5b21b6", "#4c1d95",
    ];
    // Anillos: crema, dorado y blanco (con un toque rosado para combinar)
    const COLORES_ANILLO = ["#fff6e6", "#f6e3bd", "#ecd09a", "#e2bb7c", "#fff0f8", "#f7d9c4"];
    const COLORES_POLVO = ["#ffffff", "#fbe0f6", "#e76cd7", "#c4b5fd", "#f6e3bd"];

    // ---------- Utilidades ----------
    const azar = (min, max) => min + Math.random() * (max - min);
    const colorDe = (hex) => new THREE.Color(hex);

    // Punto al azar en el espacio, lejos del centro: de ahí sale cada partícula
    function puntoDisperso() {
        const v = new THREE.Vector3(azar(-1, 1), azar(-1, 1), azar(-1, 1)).normalize();
        return v.multiplyScalar(azar(4, 11));
    }

    // Color de la banda según la altura (y) del punto en el planeta
    const coloresBanda = BANDAS.map(colorDe);
    function colorBanda(y, angulo) {
        // ondulación suave para que las bandas no sean líneas perfectas
        let u = (y + 1) / 2 + 0.018 * Math.sin(angulo * 3 + y * 9) + 0.01 * Math.sin(angulo * 7);
        u = Math.min(0.999, Math.max(0, u)) * (coloresBanda.length - 1);
        const i = Math.floor(u);
        const c = coloresBanda[i].clone().lerp(coloresBanda[i + 1], u - i);
        // pequeña variación de brillo por partícula
        return c.multiplyScalar(azar(0.9, 1.25));
    }

    // Densidad de los anillos según el radio (0 = vacío, 1 = muy denso)
    function densidadAnillo(r) {
        if (r < 1.24) return 0;
        if (r < 1.52) return 0.25;                 // anillo C (tenue)
        if (r < 1.95) return 1;                    // anillo B (el más brillante)
        if (r < 2.03) return 0.03;                 // división de Cassini
        if (r < 2.2) return 0.7;                   // anillo A
        if (r < 2.215) return 0.05;                // hueco de Encke
        if (r < 2.28) return 0.6;
        if (r > 2.33 && r < 2.345) return 0.55;    // anillo F (muy delgado)
        return 0;
    }

    // ---------- Geometrías ----------
    // Cada partícula guarda: posición final, posición inicial (aInicio),
    // color, retraso de salida, tamaño y fase de parpadeo.
    function crearGeometria(cantidad, generar) {
        const final = new Float32Array(cantidad * 3);
        const inicio = new Float32Array(cantidad * 3);
        const color = new Float32Array(cantidad * 3);
        const retraso = new Float32Array(cantidad);
        const escala = new Float32Array(cantidad);
        const fase = new Float32Array(cantidad);

        for (let i = 0; i < cantidad; i++) {
            const p = generar(i);
            final.set([p.final.x, p.final.y, p.final.z], i * 3);
            inicio.set([p.inicio.x, p.inicio.y, p.inicio.z], i * 3);
            color.set([p.color.r, p.color.g, p.color.b], i * 3);
            retraso[i] = p.retraso;
            escala[i] = p.escala;
            fase[i] = Math.random() * Math.PI * 2;
        }

        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.BufferAttribute(final, 3));
        g.setAttribute("aInicio", new THREE.BufferAttribute(inicio, 3));
        g.setAttribute("aColor", new THREE.BufferAttribute(color, 3));
        g.setAttribute("aRetraso", new THREE.BufferAttribute(retraso, 1));
        g.setAttribute("aEscala", new THREE.BufferAttribute(escala, 1));
        g.setAttribute("aFase", new THREE.BufferAttribute(fase, 1));
        return g;
    }

    function geometriaPlaneta() {
        const n = CONFIG.particulasPlaneta;
        const R = CONFIG.radioPlaneta;
        const dorado = Math.PI * (3 - Math.sqrt(5)); // esfera de Fibonacci: reparto parejo
        return crearGeometria(n, (i) => {
            const y = 1 - (i / (n - 1)) * 2;
            const radio = Math.sqrt(1 - y * y);
            const angulo = dorado * i + azar(-0.02, 0.02);
            const final = new THREE.Vector3(
                Math.cos(angulo) * radio * R,
                y * R * CONFIG.achatamiento,
                Math.sin(angulo) * radio * R
            );
            return {
                final,
                inicio: puntoDisperso(),
                color: colorBanda(y, angulo),
                retraso: 0.15 + Math.random() * 1.3 + (1 - Math.abs(y)) * 0.25,
                escala: azar(0.6, 1.35),
            };
        });
    }

    function geometriaAnillos() {
        const colores = COLORES_ANILLO.map(colorDe);
        return crearGeometria(CONFIG.particulasAnillos, () => {
            // radio con más partículas donde el anillo es más denso
            let r;
            do { r = azar(1.24, 2.35); } while (Math.random() > densidadAnillo(r));

            const angulo = Math.random() * Math.PI * 2;
            const final = new THREE.Vector3(
                Math.cos(angulo) * r,
                azar(-0.012, 0.012),          // los anillos son muy delgados
                Math.sin(angulo) * r
            );
            const brillo = 0.55 + densidadAnillo(r) * 0.5;
            return {
                final,
                inicio: puntoDisperso(),
                color: colores[Math.floor(Math.random() * colores.length)].clone().multiplyScalar(brillo * azar(0.8, 1.1)),
                retraso: 1.0 + Math.random() * 1.3 + (r - 1.24) * 0.35,
                escala: azar(0.45, 1.1),
            };
        });
    }

    function geometriaPolvo() {
        const colores = COLORES_POLVO.map(colorDe);
        return crearGeometria(CONFIG.particulasPolvo, () => {
            const v = new THREE.Vector3(azar(-1, 1), azar(-1, 1), azar(-1, 1)).normalize();
            const final = v.multiplyScalar(azar(2.8, 7));
            return {
                final,
                inicio: final.clone().multiplyScalar(1.6),
                color: colores[Math.floor(Math.random() * colores.length)],
                retraso: Math.random() * 2.5,
                escala: azar(0.4, 1.4),
            };
        });
    }

    // ---------- Shaders ----------
    // Un solo par de shaders para todo; con #define se activa la parte
    // de PLANETA (luz y borde brillante) o de ANILLO (órbita y sombra).
    const vertexShader = /* glsl */ `
        uniform float uTiempo;
        uniform float uDuracion;
        uniform float uTamano;
        uniform float uPixelRatio;
        uniform float uAspecto;
        uniform vec2  uMouse;
        uniform float uFuerzaMouse;
        uniform float uRadioMouse;
        uniform float uEmpuje;
        uniform float uVelAnillos;
        uniform vec3  uLuz;

        attribute vec3  aInicio;
        attribute vec3  aColor;
        attribute float aRetraso;
        attribute float aEscala;
        attribute float aFase;

        varying vec3  vColor;
        varying float vAlfa;

        float suavizar(float t) {   // ease-in-out cúbico
            return t < 0.5 ? 4.0 * t * t * t : 1.0 - pow(-2.0 * t + 2.0, 3.0) / 2.0;
        }

        mat2 rotar(float a) {
            float c = cos(a), s = sin(a);
            return mat2(c, -s, s, c);
        }

        void main() {
            // 1. Formación: de la posición inicial a la final, en espiral
            float p = clamp((uTiempo - aRetraso) / uDuracion, 0.0, 1.0);
            float e = suavizar(p);

            vec3 destino = position;
            #ifdef ANILLO
                // órbita: los anillos interiores giran más rápido
                float r = length(destino.xz);
                destino.xz = rotar(uTiempo * uVelAnillos / pow(r, 1.5)) * destino.xz;
            #endif

            vec3 pos = mix(aInicio, destino, e);
            pos.xz = rotar((1.0 - e) * 2.8) * pos.xz;

            // 2. Mouse: se calcula en pantalla y se empuja la partícula hacia afuera
            vec4 mv = modelViewMatrix * vec4(pos, 1.0);
            vec4 clip = projectionMatrix * mv;
            vec2 d = clip.xy / clip.w - uMouse;
            d.x *= uAspecto;
            float dist = length(d);
            float fuerza = (1.0 - smoothstep(0.0, uRadioMouse, dist)) * uFuerzaMouse * e;
            mv.xy += normalize(d + vec2(1e-5)) * fuerza * uEmpuje;
            mv.z += fuerza * uEmpuje * 0.5;
            gl_Position = projectionMatrix * mv;

            // 3. Luz
            vec3 color = aColor;
            float luz = 1.0;

            #ifdef PLANETA
                vec3 normal = normalize(mat3(modelMatrix) * normalize(position));
                float difusa = max(dot(normal, normalize(uLuz)), 0.0);
                luz = 0.38 + 0.9 * difusa;
                // borde brillante (como una atmósfera)
                vec3 normalVista = normalize(normalMatrix * normalize(position));
                float borde = pow(1.0 - abs(normalVista.z), 3.0);
                color += borde * vec3(0.95, 0.3, 0.85) * 0.8;
                luz = mix(1.0, luz, e);
            #endif

            #ifdef ANILLO
                // sombra del planeta sobre los anillos
                vec3 mundo = (modelMatrix * vec4(destino, 1.0)).xyz;
                vec3 L = normalize(uLuz);
                float sobreLuz = dot(mundo, L);
                float distEje = length(mundo - sobreLuz * L);
                float sombra = sobreLuz < 0.0 ? smoothstep(0.92, 1.02, distEje) : 1.0;
                luz = mix(1.0, 0.25 + 0.75 * sombra, e);
            #endif

            // 4. Parpadeo suave y tamaño según la distancia a la cámara
            float parpadeo = 0.8 + 0.2 * sin(uTiempo * 2.2 + aFase);
            #ifdef POLVO
                parpadeo = 0.35 + 0.65 * pow(0.5 + 0.5 * sin(uTiempo * 1.6 + aFase), 3.0);
            #endif

            vColor = color * luz * parpadeo;
            vAlfa = 0.25 + 0.75 * e;
            gl_PointSize = uTamano * aEscala * uPixelRatio * (300.0 / -mv.z) * (0.9 + 0.2 * parpadeo);
        }
    `;

    // Cada punto es un círculo suave con el centro más brillante
    const fragmentShader = /* glsl */ `
        varying vec3  vColor;
        varying float vAlfa;

        void main() {
            float d = length(gl_PointCoord - 0.5);
            if (d > 0.5) discard;
            float a = pow(1.0 - d * 2.0, 1.7);
            gl_FragColor = vec4(vColor, a * vAlfa);
        }
    `;

    // Valores compartidos por todos los materiales
    const uniformes = {
        uTiempo: { value: 0 },
        uDuracion: { value: CONFIG.duracionFormacion },
        uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
        uAspecto: { value: 1 },
        uMouse: { value: new THREE.Vector2(10, 10) },
        uFuerzaMouse: { value: 0 },
        uRadioMouse: { value: CONFIG.radioMouse },
        uEmpuje: { value: CONFIG.empujeMouse },
        uVelAnillos: { value: CONFIG.velocidadAnillos },
        uLuz: { value: new THREE.Vector3(-1, 0.55, 0.9).normalize() },
    };

    function crearMaterial(tipo, tamano) {
        return new THREE.ShaderMaterial({
            defines: { [tipo]: "" },
            uniforms: { ...uniformes, uTamano: { value: tamano } },
            vertexShader,
            fragmentShader,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
        });
    }

    // Halo suave detrás del planeta (textura hecha con un canvas)
    function crearHalo() {
        const c = document.createElement("canvas");
        c.width = c.height = 256;
        const ctx = c.getContext("2d");
        const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
        g.addColorStop(0, "rgba(231,108,215,0.55)");
        g.addColorStop(0.35, "rgba(160,80,230,0.22)");
        g.addColorStop(1, "rgba(60,20,120,0)");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 256, 256);
        const material = new THREE.SpriteMaterial({
            map: new THREE.CanvasTexture(c),
            transparent: true,
            depthTest: false,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            opacity: 0,
        });
        const sprite = new THREE.Sprite(material);
        sprite.scale.set(5.2, 5.2, 1);
        sprite.renderOrder = -1;
        return sprite;
    }

    // ---------- Escena ----------
    let renderer;
    try {
        renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, powerPreference: "high-performance" });
    } catch (error) {
        contenedor.classList.add("sin-webgl");
        return;
    }
    renderer.setPixelRatio(uniformes.uPixelRatio.value);
    renderer.setClearColor(0x000000, 0);
    contenedor.appendChild(renderer.domElement);

    const escena = new THREE.Scene();
    const camara = new THREE.PerspectiveCamera(30, 1, 0.1, 100);

    // Grupo inclinado que contiene planeta y anillos
    const sistema = new THREE.Group();
    sistema.rotation.set(CONFIG.inclinacion.x, 0, CONFIG.inclinacion.z);
    escena.add(sistema);

    const halo = crearHalo();
    escena.add(halo);

    const planeta = new THREE.Points(geometriaPlaneta(), crearMaterial("PLANETA", 0.1));
    const anillos = new THREE.Points(geometriaAnillos(), crearMaterial("ANILLO", 0.07));
    const polvo = new THREE.Points(geometriaPolvo(), crearMaterial("POLVO", 0.09));

    // Esfera invisible un poco más chica que el planeta: solo oscurece el
    // interior y tapa las partículas que quedan detrás (la cara oculta y
    // la parte de los anillos que pasa por detrás). Lo que se ve son puntos.
    const tapa = new THREE.Mesh(
        new THREE.SphereGeometry(CONFIG.radioPlaneta * 0.975, 48, 32),
        new THREE.MeshBasicMaterial({ color: 0x0b0412, transparent: true, opacity: 0 })
    );
    tapa.scale.y = CONFIG.achatamiento;
    tapa.renderOrder = 0;
    planeta.renderOrder = 1;
    anillos.renderOrder = 1;

    sistema.add(tapa, planeta, anillos);
    escena.add(polvo);

    // ---------- Tamaño ----------
    function ajustarTamano() {
        const ancho = contenedor.clientWidth;
        const alto = contenedor.clientHeight;
        if (!ancho || !alto) return;
        renderer.setSize(ancho, alto, false);
        camara.aspect = ancho / alto;
        uniformes.uAspecto.value = camara.aspect;

        // aleja la cámara lo necesario para que quepan los anillos
        const t = Math.tan(THREE.MathUtils.degToRad(camara.fov / 2));
        camara.position.set(0, 0, Math.max(1.95 / t, 2.45 / (t * camara.aspect)));
        camara.lookAt(0, 0, 0);
        camara.updateProjectionMatrix();
    }
    new ResizeObserver(ajustarTamano).observe(contenedor);
    ajustarTamano();

    // ---------- Mouse ----------
    // Se escucha en toda la portada, no solo sobre el canvas
    const zonaMouse = contenedor.closest("section") || contenedor;
    let fuerzaObjetivo = 0;
    const inclinacionMouse = { x: 0, y: 0, xs: 0, ys: 0 };

    zonaMouse.addEventListener("pointermove", (e) => {
        const r = renderer.domElement.getBoundingClientRect();
        const x = ((e.clientX - r.left) / r.width) * 2 - 1;
        const y = -((e.clientY - r.top) / r.height) * 2 + 1;
        uniformes.uMouse.value.set(x, y);
        fuerzaObjetivo = 1;
        inclinacionMouse.x = Math.max(-1, Math.min(1, x));
        inclinacionMouse.y = Math.max(-1, Math.min(1, y));
    });
    zonaMouse.addEventListener("pointerleave", () => {
        fuerzaObjetivo = 0;
        inclinacionMouse.x = inclinacionMouse.y = 0;
    });

    // ---------- Animación ----------
    // Solo se dibuja cuando la portada está en pantalla
    let visible = true;
    new IntersectionObserver(([entrada]) => (visible = entrada.isIntersecting)).observe(contenedor);

    // Con "reducir movimiento" el planeta aparece ya formado
    let tiempo = reducirMovimiento ? 12 : 0;
    const velocidad = reducirMovimiento ? 0.25 : 1;
    let anterior = performance.now();

    function cuadro(ahora) {
        requestAnimationFrame(cuadro);
        const dt = Math.max(0, Math.min(0.05, (ahora - anterior) / 1000));
        anterior = ahora;
        if (!visible) return;

        tiempo += dt * velocidad;
        uniformes.uTiempo.value = tiempo;

        // fuerza del mouse que sube y baja suave
        uniformes.uFuerzaMouse.value += (fuerzaObjetivo - uniformes.uFuerzaMouse.value) * 0.08;

        // planeta girando + ligera inclinación siguiendo al mouse
        planeta.rotation.y += dt * CONFIG.velocidadRotacion * velocidad;
        inclinacionMouse.xs += (inclinacionMouse.x - inclinacionMouse.xs) * 0.04;
        inclinacionMouse.ys += (inclinacionMouse.y - inclinacionMouse.ys) * 0.04;
        sistema.rotation.x = CONFIG.inclinacion.x - inclinacionMouse.ys * 0.12;
        sistema.rotation.y = inclinacionMouse.xs * 0.18;
        polvo.rotation.y = tiempo * 0.015;

        // el halo y el interior oscuro aparecen cuando el planeta ya se formó
        const formado = THREE.MathUtils.smoothstep(tiempo, 1.2, 3.8);
        halo.material.opacity = 0.55 * formado;
        tapa.material.opacity = 0.6 * formado;
        tapa.scale.setScalar(Math.max(0.001, formado));
        tapa.scale.y *= CONFIG.achatamiento;

        renderer.render(escena, camara);
    }
    requestAnimationFrame(cuadro);
})();
