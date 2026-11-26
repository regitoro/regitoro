//letras
const splitFlap = document.querySelector(".split-flap");

const letras = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

// Anima cualquier elemento: letras al azar que se van "acomodando" hasta formar el texto final
function animarTexto(elemento, texto = elemento.dataset.texto || elemento.textContent) {
    elemento.dataset.texto = texto;
    let iteracion = 0;

    clearInterval(elemento._intervalo);

    elemento._intervalo = setInterval(() => {
        elemento.textContent = texto
            .split("")
            .map((letra, indice) => {
                // los espacios se quedan como espacios
                if (indice < iteracion || letra === " ") {
                    return letra;
                }

                const azar = letras[Math.floor(Math.random() * letras.length)];
                return letra === letra.toLowerCase() ? azar.toLowerCase() : azar;
            })
            .join("");

        if (iteracion >= texto.length) {
            clearInterval(elemento._intervalo);
        }

        iteracion += 0.3;
    }, 120);
}

if (splitFlap) animarTexto(splitFlap, "REGINA");

// Títulos de los apartados: cada letra aparece una tras otra (subiendo y desenfocada → nítida)
const titulosAnimados = document.querySelectorAll(".titulo-animado");

titulosAnimados.forEach((titulo) => {
    const texto = titulo.textContent.trim();
    let i = 0;

    titulo.setAttribute("aria-label", texto);
    titulo.innerHTML = texto
        .split(" ")
        .map((palabra) =>
            `<span class="ta-palabra" aria-hidden="true">` +
            [...palabra].map((letra) => `<span class="ta-letra" style="--i:${i++}">${letra}</span>`).join("") +
            `</span>`
        )
        .join(" ");
});

if ("IntersectionObserver" in window) {
    const observadorTitulos = new IntersectionObserver((entradas) => {
        entradas.forEach((entrada) => {
            if (entrada.isIntersecting) {
                entrada.target.classList.add("visible");
                observadorTitulos.unobserve(entrada.target);
            }
        });
    }, { threshold: 0.6 });

    titulosAnimados.forEach((titulo) => observadorTitulos.observe(titulo));
} else {
    titulosAnimados.forEach((titulo) => titulo.classList.add("visible"));
}




const config = {
  SIM_RESOLUTION: 128,
  DYE_RESOLUTION: 1440,
  CAPTURE_RESOLUTION: 512,
  DENSITY_DISSIPATION: 3.5,
  VELOCITY_DISSIPATION: 2,
  PRESSURE: 0.1,
  PRESSURE_ITERATIONS: 20,
  CURL: 3,
  SPLAT_RADIUS: 0.2,
  SPLAT_FORCE: 6000,
  SHADING: true,
  COLOR_UPDATE_SPEED: 10,
  PAUSED: false,
  BACK_COLOR: { r: 0.5, g: 0, b: 0 },
  TRANSPARENT: true
};

// Pointer interface
function pointerPrototype() {
  return {
    id: -1,
    texcoordX: 0,
    texcoordY: 0,
    prevTexcoordX: 0,
    prevTexcoordY: 0,
    deltaX: 0,
    deltaY: 0,
    down: false,
    moved: false,
    color: { r: 0, g: 0, b: 0 }
  };
}

// Global variables
let canvas, gl, ext;
let pointers = [pointerPrototype()];
let dye, velocity, divergence, curlFBO, pressureFBO;
let lastUpdateTime = Date.now();
let colorUpdateTimer = 0.0;

// Programs
let copyProgram, clearProgram, splatProgram, advectionProgram;
let divergenceProgram, curlProgram, vorticityProgram, pressureProgram;
let gradienSubtractProgram, displayMaterial;

function initializeWebGL() {
  canvas = document.getElementById("fluid");

  const params = {
    alpha: true,
    depth: false,
    stencil: false,
    antialias: false,
    preserveDrawingBuffer: false
  };

  gl =
    canvas.getContext("webgl2", params) ||
    canvas.getContext("webgl", params) ||
    canvas.getContext("experimental-webgl", params);

  if (!gl) {
    throw new Error("Unable to initialize WebGL.");
  }

  const isWebGL2 = "drawBuffers" in gl;
  let supportLinearFiltering = false;
  let halfFloat = null;

  if (isWebGL2) {
    gl.getExtension("EXT_color_buffer_float");
    supportLinearFiltering = !!gl.getExtension("OES_texture_float_linear");
  } else {
    halfFloat = gl.getExtension("OES_texture_half_float");
    supportLinearFiltering = !!gl.getExtension("OES_texture_half_float_linear");
  }

  gl.clearColor(0, 0, 0, 1);

  const halfFloatTexType = isWebGL2
    ? gl.HALF_FLOAT
    : (halfFloat && halfFloat.HALF_FLOAT_OES) || 0;

  let formatRGBA, formatRG, formatR;

  if (isWebGL2) {
    formatRGBA = getSupportedFormat(gl, gl.RGBA16F, gl.RGBA, halfFloatTexType);
    formatRG = getSupportedFormat(gl, gl.RG16F, gl.RG, halfFloatTexType);
    formatR = getSupportedFormat(gl, gl.R16F, gl.RED, halfFloatTexType);
  } else {
    formatRGBA = getSupportedFormat(gl, gl.RGBA, gl.RGBA, halfFloatTexType);
    formatRG = getSupportedFormat(gl, gl.RGBA, gl.RGBA, halfFloatTexType);
    formatR = getSupportedFormat(gl, gl.RGBA, gl.RGBA, halfFloatTexType);
  }

  ext = {
    formatRGBA,
    formatRG,
    formatR,
    halfFloatTexType,
    supportLinearFiltering
  };

  if (!ext.supportLinearFiltering) {
    config.DYE_RESOLUTION = 256;
    config.SHADING = false;
  }

  return true;
}

function getSupportedFormat(gl, internalFormat, format, type) {
  if (!supportRenderTextureFormat(gl, internalFormat, format, type)) {
    if ("drawBuffers" in gl) {
      switch (internalFormat) {
        case gl.R16F:
          return getSupportedFormat(gl, gl.RG16F, gl.RG, type);
        case gl.RG16F:
          return getSupportedFormat(gl, gl.RGBA16F, gl.RGBA, type);
        default:
          return null;
      }
    }
    return null;
  }
  return { internalFormat, format };
}

function supportRenderTextureFormat(gl, internalFormat, format, type) {
  const texture = gl.createTexture();
  if (!texture) return false;

  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, 4, 4, 0, format, type, null);

  const fbo = gl.createFramebuffer();
  if (!fbo) return false;

  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(
    gl.FRAMEBUFFER,
    gl.COLOR_ATTACHMENT0,
    gl.TEXTURE_2D,
    texture,
    0
  );
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  return status === gl.FRAMEBUFFER_COMPLETE;
}

function hashCode(s) {
  if (!s.length) return 0;
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = (hash << 5) - hash + s.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

function addKeywords(source, keywords) {
  if (!keywords) return source;
  let keywordsString = "";
  for (const keyword of keywords) {
    keywordsString += `#define ${keyword}\n`;
  }
  return keywordsString + source;
}

function compileShader(type, source, keywords = null) {
  const shaderSource = addKeywords(source, keywords);
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, shaderSource);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(shader));
  }
  return shader;
}

function createProgram(vertexShader, fragmentShader) {
  if (!vertexShader || !fragmentShader) return null;
  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error(gl.getProgramInfoLog(program));
  }
  return program;
}

function getUniforms(program) {
  let uniforms = {};
  const uniformCount = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < uniformCount; i++) {
    const uniformInfo = gl.getActiveUniform(program, i);
    if (uniformInfo) {
      uniforms[uniformInfo.name] = gl.getUniformLocation(
        program,
        uniformInfo.name
      );
    }
  }
  return uniforms;
}

class Program {
  constructor(vertexShader, fragmentShader) {
    this.program = createProgram(vertexShader, fragmentShader);
    this.uniforms = this.program ? getUniforms(this.program) : {};
  }

  bind() {
    if (this.program) gl.useProgram(this.program);
  }
}

class Material {
  constructor(vertexShader, fragmentShaderSource) {
    this.vertexShader = vertexShader;
    this.fragmentShaderSource = fragmentShaderSource;
    this.programs = {};
    this.activeProgram = null;
    this.uniforms = {};
  }

  setKeywords(keywords) {
    let hash = 0;
    for (const kw of keywords) {
      hash += hashCode(kw);
    }
    let program = this.programs[hash];
    if (program == null) {
      const fragmentShader = compileShader(
        gl.FRAGMENT_SHADER,
        this.fragmentShaderSource,
        keywords
      );
      program = createProgram(this.vertexShader, fragmentShader);
      this.programs[hash] = program;
    }
    if (program === this.activeProgram) return;
    if (program) {
      this.uniforms = getUniforms(program);
    }
    this.activeProgram = program;
  }

  bind() {
    if (this.activeProgram) {
      gl.useProgram(this.activeProgram);
    }
  }
}

function initializeShaders() {
  const baseVertexShader = compileShader(
    gl.VERTEX_SHADER,
    `
                precision highp float;
                attribute vec2 aPosition;
                varying vec2 vUv;
                varying vec2 vL;
                varying vec2 vR;
                varying vec2 vT;
                varying vec2 vB;
                uniform vec2 texelSize;

                void main () {
                    vUv = aPosition * 0.5 + 0.5;
                    vL = vUv - vec2(texelSize.x, 0.0);
                    vR = vUv + vec2(texelSize.x, 0.0);
                    vT = vUv + vec2(0.0, texelSize.y);
                    vB = vUv - vec2(0.0, texelSize.y);
                    gl_Position = vec4(aPosition, 0.0, 1.0);
                }
            `
  );

  const copyShader = compileShader(
    gl.FRAGMENT_SHADER,
    `
                precision mediump float;
                precision mediump sampler2D;
                varying highp vec2 vUv;
                uniform sampler2D uTexture;

                void main () {
                    gl_FragColor = texture2D(uTexture, vUv);
                }
            `
  );

  const clearShader = compileShader(
    gl.FRAGMENT_SHADER,
    `
                precision mediump float;
                precision mediump sampler2D;
                varying highp vec2 vUv;
                uniform sampler2D uTexture;
                uniform float value;

                void main () {
                    gl_FragColor = value * texture2D(uTexture, vUv);
                }
            `
  );

  const displayShaderSource = `
                precision highp float;
                precision highp sampler2D;
                varying vec2 vUv;
                varying vec2 vL;
                varying vec2 vR;
                varying vec2 vT;
                varying vec2 vB;
                uniform sampler2D uTexture;
                uniform sampler2D uDithering;
                uniform vec2 ditherScale;
                uniform vec2 texelSize;

                vec3 linearToGamma (vec3 color) {
                    color = max(color, vec3(0));
                    return max(1.055 * pow(color, vec3(0.416666667)) - 0.055, vec3(0));
                }

                void main () {
                    vec3 c = texture2D(uTexture, vUv).rgb;
                    #ifdef SHADING
                        vec3 lc = texture2D(uTexture, vL).rgb;
                        vec3 rc = texture2D(uTexture, vR).rgb;
                        vec3 tc = texture2D(uTexture, vT).rgb;
                        vec3 bc = texture2D(uTexture, vB).rgb;

                        float dx = length(rc) - length(lc);
                        float dy = length(tc) - length(bc);

                        vec3 n = normalize(vec3(dx, dy, length(texelSize)));
                        vec3 l = vec3(0.0, 0.0, 1.0);

                        float diffuse = clamp(dot(n, l) + 0.7, 0.7, 1.0);
                        c *= diffuse;
                    #endif

                    float a = max(c.r, max(c.g, c.b));
                    gl_FragColor = vec4(c, a);
                }
            `;

  const splatShader = compileShader(
    gl.FRAGMENT_SHADER,
    `
                precision highp float;
                precision highp sampler2D;
                varying vec2 vUv;
                uniform sampler2D uTarget;
                uniform float aspectRatio;
                uniform vec3 color;
                uniform vec2 point;
                uniform float radius;

                void main () {
                    vec2 p = vUv - point.xy;
                    p.x *= aspectRatio;
                    vec3 splat = exp(-dot(p, p) / radius) * color;
                    vec3 base = texture2D(uTarget, vUv).xyz;
                    gl_FragColor = vec4(base + splat, 1.0);
                }
            `
  );

  const advectionShader = compileShader(
    gl.FRAGMENT_SHADER,
    `
                precision highp float;
                precision highp sampler2D;
                varying vec2 vUv;
                uniform sampler2D uVelocity;
                uniform sampler2D uSource;
                uniform vec2 texelSize;
                uniform vec2 dyeTexelSize;
                uniform float dt;
                uniform float dissipation;

                vec4 bilerp (sampler2D sam, vec2 uv, vec2 tsize) {
                    vec2 st = uv / tsize - 0.5;
                    vec2 iuv = floor(st);
                    vec2 fuv = fract(st);

                    vec4 a = texture2D(sam, (iuv + vec2(0.5, 0.5)) * tsize);
                    vec4 b = texture2D(sam, (iuv + vec2(1.5, 0.5)) * tsize);
                    vec4 c = texture2D(sam, (iuv + vec2(0.5, 1.5)) * tsize);
                    vec4 d = texture2D(sam, (iuv + vec2(1.5, 1.5)) * tsize);

                    return mix(mix(a, b, fuv.x), mix(c, d, fuv.x), fuv.y);
                }

                void main () {
                    #ifdef MANUAL_FILTERING
                        vec2 coord = vUv - dt * bilerp(uVelocity, vUv, texelSize).xy * texelSize;
                        vec4 result = bilerp(uSource, coord, dyeTexelSize);
                    #else
                        vec2 coord = vUv - dt * texture2D(uVelocity, vUv).xy * texelSize;
                        vec4 result = texture2D(uSource, coord);
                    #endif
                    float decay = 1.0 + dissipation * dt;
                    gl_FragColor = result / decay;
                }
            `,
    ext.supportLinearFiltering ? null : ["MANUAL_FILTERING"]
  );

  const divergenceShader = compileShader(
    gl.FRAGMENT_SHADER,
    `
                precision mediump float;
                precision mediump sampler2D;
                varying highp vec2 vUv;
                varying highp vec2 vL;
                varying highp vec2 vR;
                varying highp vec2 vT;
                varying highp vec2 vB;
                uniform sampler2D uVelocity;

                void main () {
                    float L = texture2D(uVelocity, vL).x;
                    float R = texture2D(uVelocity, vR).x;
                    float T = texture2D(uVelocity, vT).y;
                    float B = texture2D(uVelocity, vB).y;

                    vec2 C = texture2D(uVelocity, vUv).xy;
                    if (vL.x < 0.0) { L = -C.x; }
                    if (vR.x > 1.0) { R = -C.x; }
                    if (vT.y > 1.0) { T = -C.y; }
                    if (vB.y < 0.0) { B = -C.y; }

                    float div = 0.5 * (R - L + T - B);
                    gl_FragColor = vec4(div, 0.0, 0.0, 1.0);
                }
            `
  );

  const curlShader = compileShader(
    gl.FRAGMENT_SHADER,
    `
                precision mediump float;
                precision mediump sampler2D;
                varying highp vec2 vUv;
                varying highp vec2 vL;
                varying highp vec2 vR;
                varying highp vec2 vT;
                varying highp vec2 vB;
                uniform sampler2D uVelocity;

                void main () {
                    float L = texture2D(uVelocity, vL).y;
                    float R = texture2D(uVelocity, vR).y;
                    float T = texture2D(uVelocity, vT).x;
                    float B = texture2D(uVelocity, vB).x;
                    float vorticity = R - L - T + B;
                    gl_FragColor = vec4(0.5 * vorticity, 0.0, 0.0, 1.0);
                }
            `
  );

  const vorticityShader = compileShader(
    gl.FRAGMENT_SHADER,
    `
                precision highp float;
                precision highp sampler2D;
                varying vec2 vUv;
                varying vec2 vL;
                varying vec2 vR;
                varying vec2 vT;
                varying vec2 vB;
                uniform sampler2D uVelocity;
                uniform sampler2D uCurl;
                uniform float curl;
                uniform float dt;

                void main () {
                    float L = texture2D(uCurl, vL).x;
                    float R = texture2D(uCurl, vR).x;
                    float T = texture2D(uCurl, vT).x;
                    float B = texture2D(uCurl, vB).x;
                    float C = texture2D(uCurl, vUv).x;

                    vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
                    force /= length(force) + 0.0001;
                    force *= curl * C;
                    force.y *= -1.0;

                    vec2 velocity = texture2D(uVelocity, vUv).xy;
                    velocity += force * dt;
                    velocity = min(max(velocity, -1000.0), 1000.0);
                    gl_FragColor = vec4(velocity, 0.0, 1.0);
                }
            `
  );

  const pressureShader = compileShader(
    gl.FRAGMENT_SHADER,
    `
                precision mediump float;
                precision mediump sampler2D;
                varying highp vec2 vUv;
                varying highp vec2 vL;
                varying highp vec2 vR;
                varying highp vec2 vT;
                varying highp vec2 vB;
                uniform sampler2D uPressure;
                uniform sampler2D uDivergence;

                void main () {
                    float L = texture2D(uPressure, vL).x;
                    float R = texture2D(uPressure, vR).x;
                    float T = texture2D(uPressure, vT).x;
                    float B = texture2D(uPressure, vB).x;
                    float C = texture2D(uPressure, vUv).x;
                    float divergence = texture2D(uDivergence, vUv).x;
                    float pressure = (L + R + B + T - divergence) * 0.25;
                    gl_FragColor = vec4(pressure, 0.0, 0.0, 1.0);
                }
            `
  );

  const gradientSubtractShader = compileShader(
    gl.FRAGMENT_SHADER,
    `
                precision mediump float;
                precision mediump sampler2D;
                varying highp vec2 vUv;
                varying highp vec2 vL;
                varying highp vec2 vR;
                varying highp vec2 vT;
                varying highp vec2 vB;
                uniform sampler2D uPressure;
                uniform sampler2D uVelocity;

                void main () {
                    float L = texture2D(uPressure, vL).x;
                    float R = texture2D(uPressure, vR).x;
                    float T = texture2D(uPressure, vT).x;
                    float B = texture2D(uPressure, vB).x;
                    vec2 velocity = texture2D(uVelocity, vUv).xy;
                    velocity.xy -= vec2(R - L, T - B);
                    gl_FragColor = vec4(velocity, 0.0, 1.0);
                }
            `
  );

  // Initialize programs
  copyProgram = new Program(baseVertexShader, copyShader);
  clearProgram = new Program(baseVertexShader, clearShader);
  splatProgram = new Program(baseVertexShader, splatShader);
  advectionProgram = new Program(baseVertexShader, advectionShader);
  divergenceProgram = new Program(baseVertexShader, divergenceShader);
  curlProgram = new Program(baseVertexShader, curlShader);
  vorticityProgram = new Program(baseVertexShader, vorticityShader);
  pressureProgram = new Program(baseVertexShader, pressureShader);
  gradienSubtractProgram = new Program(
    baseVertexShader,
    gradientSubtractShader
  );
  displayMaterial = new Material(baseVertexShader, displayShaderSource);
}

// Fullscreen triangle setup
let blit;

function initializeBlit() {
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]),
    gl.STATIC_DRAW
  );
  const elemBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, elemBuffer);
  gl.bufferData(
    gl.ELEMENT_ARRAY_BUFFER,
    new Uint16Array([0, 1, 2, 0, 2, 3]),
    gl.STATIC_DRAW
  );
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(0);

  blit = (target, doClear = false) => {
    if (!gl) return;
    if (!target) {
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    } else {
      gl.viewport(0, 0, target.width, target.height);
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
    }
    if (doClear) {
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
  };
}

// FBO creation functions
function createFBO(w, h, internalFormat, format, type, param) {
  gl.activeTexture(gl.TEXTURE0);
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, param);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, param);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, format, type, null);
  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(
    gl.FRAMEBUFFER,
    gl.COLOR_ATTACHMENT0,
    gl.TEXTURE_2D,
    texture,
    0
  );
  gl.viewport(0, 0, w, h);
  gl.clear(gl.COLOR_BUFFER_BIT);

  const texelSizeX = 1 / w;
  const texelSizeY = 1 / h;

  return {
    texture,
    fbo,
    width: w,
    height: h,
    texelSizeX,
    texelSizeY,
    attach(id) {
      gl.activeTexture(gl.TEXTURE0 + id);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      return id;
    }
  };
}

function createDoubleFBO(w, h, internalFormat, format, type, param) {
  const fbo1 = createFBO(w, h, internalFormat, format, type, param);
  const fbo2 = createFBO(w, h, internalFormat, format, type, param);
  return {
    width: w,
    height: h,
    texelSizeX: fbo1.texelSizeX,
    texelSizeY: fbo1.texelSizeY,
    read: fbo1,
    write: fbo2,
    swap() {
      const tmp = this.read;
      this.read = this.write;
      this.write = tmp;
    }
  };
}

function getResolution(resolution) {
  const w = gl.drawingBufferWidth;
  const h = gl.drawingBufferHeight;
  const aspectRatio = w / h;
  let aspect = aspectRatio < 1 ? 1 / aspectRatio : aspectRatio;
  const min = Math.round(resolution);
  const max = Math.round(resolution * aspect);
  if (w > h) {
    return { width: max, height: min };
  }
  return { width: min, height: max };
}

function scaleByPixelRatio(input) {
  const pixelRatio = window.devicePixelRatio || 1;
  return Math.floor(input * pixelRatio);
}

function initFramebuffers() {
  const simRes = getResolution(config.SIM_RESOLUTION);
  const dyeRes = getResolution(config.DYE_RESOLUTION);

  const texType = ext.halfFloatTexType;
  const rgba = ext.formatRGBA;
  const rg = ext.formatRG;
  const r = ext.formatR;
  const filtering = ext.supportLinearFiltering ? gl.LINEAR : gl.NEAREST;
  gl.disable(gl.BLEND);

  if (!dye) {
    dye = createDoubleFBO(
      dyeRes.width,
      dyeRes.height,
      rgba.internalFormat,
      rgba.format,
      texType,
      filtering
    );
  }

  if (!velocity) {
    velocity = createDoubleFBO(
      simRes.width,
      simRes.height,
      rg.internalFormat,
      rg.format,
      texType,
      filtering
    );
  }

  divergence = createFBO(
    simRes.width,
    simRes.height,
    r.internalFormat,
    r.format,
    texType,
    gl.NEAREST
  );
  curlFBO = createFBO(
    simRes.width,
    simRes.height,
    r.internalFormat,
    r.format,
    texType,
    gl.NEAREST
  );
  pressureFBO = createDoubleFBO(
    simRes.width,
    simRes.height,
    r.internalFormat,
    r.format,
    texType,
    gl.NEAREST
  );
}

function updateKeywords() {
  const displayKeywords = [];
  if (config.SHADING) displayKeywords.push("SHADING");
  displayMaterial.setKeywords(displayKeywords);
}

// Color and utility functions
function HSVtoRGB(h, s, v) {
  let r = 0,
    g = 0,
    b = 0;
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);

  switch (i % 6) {
    case 0:
      r = v;
      g = t;
      b = p;
      break;
    case 1:
      r = q;
      g = v;
      b = p;
      break;
    case 2:
      r = p;
      g = v;
      b = t;
      break;
    case 3:
      r = p;
      g = q;
      b = v;
      break;
    case 4:
      r = t;
      g = p;
      b = v;
      break;
    case 5:
      r = v;
      g = p;
      b = q;
      break;
  }
  return { r, g, b };
}

function generateColor() {
  const c = HSVtoRGB(Math.random(), 1.0, 1.0);
  c.r *= 0.15;
  c.g *= 0.15;
  c.b *= 0.15;
  return c;
}

function wrap(value, min, max) {
  const range = max - min;
  if (range === 0) return min;
  return ((value - min) % range) + min;
}

// Simulation functions
function updateFrame() {
  const dt = calcDeltaTime();
  if (resizeCanvas()) initFramebuffers();
  updateColors(dt);
  applyInputs();
  step(dt);
  render(null);
  requestAnimationFrame(updateFrame);
}

function calcDeltaTime() {
  const now = Date.now();
  let dt = (now - lastUpdateTime) / 1000;
  dt = Math.min(dt, 0.016666);
  lastUpdateTime = now;
  return dt;
}

function resizeCanvas() {
  const width = scaleByPixelRatio(canvas.clientWidth);
  const height = scaleByPixelRatio(canvas.clientHeight);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
    return true;
  }
  return false;
}

function updateColors(dt) {
  colorUpdateTimer += dt * config.COLOR_UPDATE_SPEED;
  if (colorUpdateTimer >= 1) {
    colorUpdateTimer = wrap(colorUpdateTimer, 0, 1);
    pointers.forEach((p) => {
      p.color = generateColor();
    });
  }
}

function applyInputs() {
  for (const p of pointers) {
    if (p.moved) {
      p.moved = false;
      splatPointer(p);
    }
  }
}

function step(dt) {
  gl.disable(gl.BLEND);

  // Curl
  curlProgram.bind();
  if (curlProgram.uniforms.texelSize) {
    gl.uniform2f(
      curlProgram.uniforms.texelSize,
      velocity.texelSizeX,
      velocity.texelSizeY
    );
  }
  if (curlProgram.uniforms.uVelocity) {
    gl.uniform1i(curlProgram.uniforms.uVelocity, velocity.read.attach(0));
  }
  blit(curlFBO);

  // Vorticity
  vorticityProgram.bind();
  if (vorticityProgram.uniforms.texelSize) {
    gl.uniform2f(
      vorticityProgram.uniforms.texelSize,
      velocity.texelSizeX,
      velocity.texelSizeY
    );
  }
  if (vorticityProgram.uniforms.uVelocity) {
    gl.uniform1i(vorticityProgram.uniforms.uVelocity, velocity.read.attach(0));
  }
  if (vorticityProgram.uniforms.uCurl) {
    gl.uniform1i(vorticityProgram.uniforms.uCurl, curlFBO.attach(1));
  }
  if (vorticityProgram.uniforms.curl) {
    gl.uniform1f(vorticityProgram.uniforms.curl, config.CURL);
  }
  if (vorticityProgram.uniforms.dt) {
    gl.uniform1f(vorticityProgram.uniforms.dt, dt);
  }
  blit(velocity.write);
  velocity.swap();

  // Divergence
  divergenceProgram.bind();
  if (divergenceProgram.uniforms.texelSize) {
    gl.uniform2f(
      divergenceProgram.uniforms.texelSize,
      velocity.texelSizeX,
      velocity.texelSizeY
    );
  }
  if (divergenceProgram.uniforms.uVelocity) {
    gl.uniform1i(divergenceProgram.uniforms.uVelocity, velocity.read.attach(0));
  }
  blit(divergence);

  // Clear pressure
  clearProgram.bind();
  if (clearProgram.uniforms.uTexture) {
    gl.uniform1i(clearProgram.uniforms.uTexture, pressureFBO.read.attach(0));
  }
  if (clearProgram.uniforms.value) {
    gl.uniform1f(clearProgram.uniforms.value, config.PRESSURE);
  }
  blit(pressureFBO.write);
  pressureFBO.swap();

  // Pressure
  pressureProgram.bind();
  if (pressureProgram.uniforms.texelSize) {
    gl.uniform2f(
      pressureProgram.uniforms.texelSize,
      velocity.texelSizeX,
      velocity.texelSizeY
    );
  }
  if (pressureProgram.uniforms.uDivergence) {
    gl.uniform1i(pressureProgram.uniforms.uDivergence, divergence.attach(0));
  }
  for (let i = 0; i < config.PRESSURE_ITERATIONS; i++) {
    if (pressureProgram.uniforms.uPressure) {
      gl.uniform1i(
        pressureProgram.uniforms.uPressure,
        pressureFBO.read.attach(1)
      );
    }
    blit(pressureFBO.write);
    pressureFBO.swap();
  }

  // Gradient Subtract
  gradienSubtractProgram.bind();
  if (gradienSubtractProgram.uniforms.texelSize) {
    gl.uniform2f(
      gradienSubtractProgram.uniforms.texelSize,
      velocity.texelSizeX,
      velocity.texelSizeY
    );
  }
  if (gradienSubtractProgram.uniforms.uPressure) {
    gl.uniform1i(
      gradienSubtractProgram.uniforms.uPressure,
      pressureFBO.read.attach(0)
    );
  }
  if (gradienSubtractProgram.uniforms.uVelocity) {
    gl.uniform1i(
      gradienSubtractProgram.uniforms.uVelocity,
      velocity.read.attach(1)
    );
  }
  blit(velocity.write);
  velocity.swap();

  // Advection - velocity
  advectionProgram.bind();
  if (advectionProgram.uniforms.texelSize) {
    gl.uniform2f(
      advectionProgram.uniforms.texelSize,
      velocity.texelSizeX,
      velocity.texelSizeY
    );
  }
  if (!ext.supportLinearFiltering && advectionProgram.uniforms.dyeTexelSize) {
    gl.uniform2f(
      advectionProgram.uniforms.dyeTexelSize,
      velocity.texelSizeX,
      velocity.texelSizeY
    );
  }
  const velocityId = velocity.read.attach(0);
  if (advectionProgram.uniforms.uVelocity) {
    gl.uniform1i(advectionProgram.uniforms.uVelocity, velocityId);
  }
  if (advectionProgram.uniforms.uSource) {
    gl.uniform1i(advectionProgram.uniforms.uSource, velocityId);
  }
  if (advectionProgram.uniforms.dt) {
    gl.uniform1f(advectionProgram.uniforms.dt, dt);
  }
  if (advectionProgram.uniforms.dissipation) {
    gl.uniform1f(
      advectionProgram.uniforms.dissipation,
      config.VELOCITY_DISSIPATION
    );
  }
  blit(velocity.write);
  velocity.swap();

  // Advection - dye
  if (!ext.supportLinearFiltering && advectionProgram.uniforms.dyeTexelSize) {
    gl.uniform2f(
      advectionProgram.uniforms.dyeTexelSize,
      dye.texelSizeX,
      dye.texelSizeY
    );
  }
  if (advectionProgram.uniforms.uVelocity) {
    gl.uniform1i(advectionProgram.uniforms.uVelocity, velocity.read.attach(0));
  }
  if (advectionProgram.uniforms.uSource) {
    gl.uniform1i(advectionProgram.uniforms.uSource, dye.read.attach(1));
  }
  if (advectionProgram.uniforms.dissipation) {
    gl.uniform1f(
      advectionProgram.uniforms.dissipation,
      config.DENSITY_DISSIPATION
    );
  }
  blit(dye.write);
  dye.swap();
}

function render(target) {
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.enable(gl.BLEND);
  drawDisplay(target);
}

function drawDisplay(target) {
  const width = target ? target.width : gl.drawingBufferWidth;
  const height = target ? target.height : gl.drawingBufferHeight;
  displayMaterial.bind();
  if (config.SHADING && displayMaterial.uniforms.texelSize) {
    gl.uniform2f(displayMaterial.uniforms.texelSize, 1 / width, 1 / height);
  }
  if (displayMaterial.uniforms.uTexture) {
    gl.uniform1i(displayMaterial.uniforms.uTexture, dye.read.attach(0));
  }
  blit(target, false);
}

// Interaction functions
function splatPointer(pointer) {
  const dx = pointer.deltaX * config.SPLAT_FORCE;
  const dy = pointer.deltaY * config.SPLAT_FORCE;
  splat(pointer.texcoordX, pointer.texcoordY, dx, dy, pointer.color);
}

function clickSplat(pointer) {
  const color = generateColor();
  color.r *= 10;
  color.g *= 10;
  color.b *= 10;
  const dx = 10 * (Math.random() - 0.5);
  const dy = 30 * (Math.random() - 0.5);
  splat(pointer.texcoordX, pointer.texcoordY, dx, dy, color);
}

function splat(x, y, dx, dy, color) {
  splatProgram.bind();
  if (splatProgram.uniforms.uTarget) {
    gl.uniform1i(splatProgram.uniforms.uTarget, velocity.read.attach(0));
  }
  if (splatProgram.uniforms.aspectRatio) {
    gl.uniform1f(
      splatProgram.uniforms.aspectRatio,
      canvas.width / canvas.height
    );
  }
  if (splatProgram.uniforms.point) {
    gl.uniform2f(splatProgram.uniforms.point, x, y);
  }
  if (splatProgram.uniforms.color) {
    gl.uniform3f(splatProgram.uniforms.color, dx, dy, 0);
  }
  if (splatProgram.uniforms.radius) {
    gl.uniform1f(
      splatProgram.uniforms.radius,
      correctRadius(config.SPLAT_RADIUS / 100)
    );
  }
  blit(velocity.write);
  velocity.swap();

  if (splatProgram.uniforms.uTarget) {
    gl.uniform1i(splatProgram.uniforms.uTarget, dye.read.attach(0));
  }
  if (splatProgram.uniforms.color) {
    gl.uniform3f(splatProgram.uniforms.color, color.r, color.g, color.b);
  }
  blit(dye.write);
  dye.swap();
}

function correctRadius(radius) {
  const aspectRatio = canvas.width / canvas.height;
  if (aspectRatio > 1) radius *= aspectRatio;
  return radius;
}

function updatePointerDownData(pointer, id, posX, posY) {
  pointer.id = id;
  pointer.down = true;
  pointer.moved = false;
  pointer.texcoordX = posX / canvas.width;
  pointer.texcoordY = 1 - posY / canvas.height;
  pointer.prevTexcoordX = pointer.texcoordX;
  pointer.prevTexcoordY = pointer.texcoordY;
  pointer.deltaX = 0;
  pointer.deltaY = 0;
  pointer.color = generateColor();
}

function updatePointerMoveData(pointer, posX, posY, color) {
  pointer.prevTexcoordX = pointer.texcoordX;
  pointer.prevTexcoordY = pointer.texcoordY;
  pointer.texcoordX = posX / canvas.width;
  pointer.texcoordY = 1 - posY / canvas.height;
  pointer.deltaX = correctDeltaX(pointer.texcoordX - pointer.prevTexcoordX);
  pointer.deltaY = correctDeltaY(pointer.texcoordY - pointer.prevTexcoordY);
  pointer.moved = Math.abs(pointer.deltaX) > 0 || Math.abs(pointer.deltaY) > 0;
  pointer.color = color;
}

function correctDeltaX(delta) {
  const aspectRatio = canvas.width / canvas.height;
  if (aspectRatio < 1) delta *= aspectRatio;
  return delta;
}

function correctDeltaY(delta) {
  const aspectRatio = canvas.width / canvas.height;
  if (aspectRatio > 1) delta /= aspectRatio;
  return delta;
}

// Event listeners
function setupEventListeners() {
  window.addEventListener("mousedown", (e) => {
    const pointer = pointers[0];
    const posX = scaleByPixelRatio(e.clientX);
    const posY = scaleByPixelRatio(e.clientY);
    updatePointerDownData(pointer, -1, posX, posY);
    clickSplat(pointer);
  });

  window.addEventListener("mousemove", (e) => {
    const pointer = pointers[0];
    const posX = scaleByPixelRatio(e.clientX);
    const posY = scaleByPixelRatio(e.clientY);
    const color = pointer.color;
    updatePointerMoveData(pointer, posX, posY, color);
  });

  window.addEventListener(
    "touchstart",
    (e) => {
      const touches = e.targetTouches;
      const pointer = pointers[0];
      for (let i = 0; i < touches.length; i++) {
        const posX = scaleByPixelRatio(touches[i].clientX);
        const posY = scaleByPixelRatio(touches[i].clientY);
        updatePointerDownData(pointer, touches[i].identifier, posX, posY);
      }
    },
    false
  );

  window.addEventListener(
    "touchmove",
    (e) => {
      const touches = e.targetTouches;
      const pointer = pointers[0];
      for (let i = 0; i < touches.length; i++) {
        const posX = scaleByPixelRatio(touches[i].clientX);
        const posY = scaleByPixelRatio(touches[i].clientY);
        updatePointerMoveData(pointer, posX, posY, pointer.color);
      }
    },
    false
  );

  window.addEventListener("touchend", (e) => {
    const pointer = pointers[0];
    pointer.down = false;
  });
}

// Control functions
function resetSimulation() {
  initFramebuffers();
}

function toggleShading() {
  config.SHADING = !config.SHADING;
  updateKeywords();
}

function increaseDensity() {
  config.DENSITY_DISSIPATION = Math.max(0.1, config.DENSITY_DISSIPATION - 0.5);
}

function decreaseDensity() {
  config.DENSITY_DISSIPATION = Math.min(10, config.DENSITY_DISSIPATION + 0.5);
}

// Initialize everything
function init() {
  try {
    initializeWebGL();
    initializeShaders();
    initializeBlit();
    updateKeywords();
    initFramebuffers();
    setupEventListeners();
    updateFrame();
  } catch (error) {
    console.error("Failed to initialize fluid simulation:", error);
    document.body.innerHTML =
      "<h1>WebGL not supported</h1><p>Your browser does not support WebGL.</p>";
  }
}

// Start when page loads
window.addEventListener("load", init);


// ---------- Tarjetas de habilidades ----------
// Lee data-nivel de cada .skill: cuando la tarjeta aparece en pantalla,
// la barra se llena y el porcentaje cuenta de 0 hasta el nivel.
const skills = document.querySelectorAll(".skill");
const sinMovimiento = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

skills.forEach((skill) => {
    const valor = Math.max(0, Math.min(100, Number(skill.dataset.nivel) || 0));
    const nombre = skill.querySelector(".skill-nombre")?.textContent.trim() || "";
    const barra = skill.querySelector(".skill-barra");

    skill.style.setProperty("--nivel", valor);
    if (barra) {
        barra.setAttribute("role", "meter");
        barra.setAttribute("aria-valuemin", "0");
        barra.setAttribute("aria-valuemax", "100");
        barra.setAttribute("aria-valuenow", valor);
        barra.setAttribute("aria-label", `${nombre}: ${valor}%`);
    }
});

function llenarSkill(skill) {
    const valor = Number(skill.style.getPropertyValue("--nivel")) || 0;
    const texto = skill.querySelector(".skill-porcentaje");
    skill.classList.add("lleno");
    if (!texto) return;

    if (sinMovimiento) {
        texto.textContent = valor + "%";
        return;
    }

    const dur = 1400;
    const t0 = performance.now();
    const paso = (t) => {
        const p = Math.min(1, (t - t0) / dur);
        const suave = 1 - Math.pow(1 - p, 3);
        texto.textContent = Math.round(valor * suave) + "%";
        if (p < 1) requestAnimationFrame(paso);
    };
    requestAnimationFrame(paso);
}

if ("IntersectionObserver" in window) {
    const observadorSkills = new IntersectionObserver((entradas) => {
        entradas.forEach((entrada) => {
            if (entrada.isIntersecting) {
                llenarSkill(entrada.target);
                observadorSkills.unobserve(entrada.target);
            }
        });
    }, { threshold: 0.4 });

    skills.forEach((skill) => observadorSkills.observe(skill));
} else {
    skills.forEach(llenarSkill);
}


// ---------- Recuadro "Imagen pendiente" (datos curiosos y proyectos) ----------
// Si una imagen todavía no existe en img/datos-curiosos/ o img/proyectos/, se muestra un recuadro en su lugar.
document.querySelectorAll(".dato-imagen img, .proyecto-imagen img").forEach((img) => {
    const marcarPendiente = () => img.parentElement.classList.add("sin-imagen");

    if (img.complete && img.naturalWidth === 0) {
        marcarPendiente();
    } else {
        img.addEventListener("error", marcarPendiente);
    }
});


// ---------- Mapa interactivo de México ----------
// Los trazos de los estados vienen de mapa-mexico.js.
// Rueda del mouse o pellizco = zoom, arrastrar = mover, botones = acercar / alejar / ir a Morelia / ver todo.
(function iniciarMapa() {
    const datos = window.MAPA_MEXICO;
    const figura = document.getElementById("mapa");
    if (!datos || !figura) return;

    const NS = "http://www.w3.org/2000/svg";
    const svg = figura.querySelector(".mapa-svg");
    const capaZoom = svg.querySelector(".mapa-zoom");
    const punto = svg.querySelector(".mapa-punto");
    const tooltip = figura.querySelector(".mapa-tooltip");
    const W = datos.ancho;
    const H = datos.alto;
    const [moreliaX, moreliaY] = datos.morelia;
    const ZOOM_MIN = 1;
    const ZOOM_MAX = 8; // más cerca ya no se acerca (evita que el mapa falle)
    const PASO_ZOOM = 1.8;
    const botonAcercar = figura.querySelector('[data-zoom="in"]');
    const botonAlejar = figura.querySelector('[data-zoom="out"]');

    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);

    // Dibujar los estados
    datos.estados.forEach((estado) => {
        const path = document.createElementNS(NS, "path");
        path.setAttribute("d", estado.d);
        path.setAttribute("class", "mapa-estado" + (estado.id === "MX-MIC" ? " es-casa" : ""));
        path.dataset.nombre = estado.nombre;
        capaZoom.appendChild(path);
    });

    // Estado actual de la vista: escala k y desplazamiento (x, y)
    let vista = { k: 1, x: 0, y: 0 };

    const limitar = (v) => {
        const k = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, v.k));
        const x = Math.min(0, Math.max(W - W * k, v.x));
        const y = Math.min(0, Math.max(H - H * k, v.y));
        return { k, x, y };
    };

    const pintar = () => {
        capaZoom.setAttribute("transform", `translate(${vista.x} ${vista.y}) scale(${vista.k})`);
        // El punto se queda del mismo tamaño, solo cambia de lugar
        punto.setAttribute("transform", `translate(${moreliaX * vista.k + vista.x} ${moreliaY * vista.k + vista.y})`);
        // Desactivar los botones cuando ya no se puede acercar / alejar más
        if (botonAcercar) botonAcercar.disabled = vista.k >= ZOOM_MAX - 0.01;
        if (botonAlejar) botonAlejar.disabled = vista.k <= ZOOM_MIN + 0.01;
    };

    // Zoom manteniendo fijo el punto (cx, cy) del mapa
    const zoomEn = (factor, cx, cy) => {
        const k = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, vista.k * factor));
        const f = k / vista.k;
        vista = limitar({ k, x: cx - (cx - vista.x) * f, y: cy - (cy - vista.y) * f });
        pintar();
    };

    // Animación suave hacia una vista destino (para los botones)
    let animacion = null;
    const animarA = (destino) => {
        destino = limitar(destino);
        cancelAnimationFrame(animacion);
        const inicio = { ...vista };
        const t0 = performance.now();
        const dur = 600;
        const paso = (t) => {
            const p = Math.min(1, (t - t0) / dur);
            const e = 1 - Math.pow(1 - p, 3);
            vista = {
                k: inicio.k + (destino.k - inicio.k) * e,
                x: inicio.x + (destino.x - inicio.x) * e,
                y: inicio.y + (destino.y - inicio.y) * e,
            };
            pintar();
            if (p < 1) animacion = requestAnimationFrame(paso);
        };
        animacion = requestAnimationFrame(paso);
    };

    // Primero se limita el zoom y luego se calcula la posición con ese zoom,
    // así el destino no "brinca" al corregirse
    const centrarEn = (px, py, k) => {
        k = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, k));
        return { k, x: W / 2 - px * k, y: H / 2 - py * k };
    };

    // Pasar coordenadas de pantalla a coordenadas del SVG
    const aSvg = (clientX, clientY) => {
        const r = svg.getBoundingClientRect();
        return [(clientX - r.left) * (W / r.width), (clientY - r.top) * (H / r.height)];
    };

    // Rueda del mouse
    svg.addEventListener("wheel", (e) => {
        e.preventDefault();
        cancelAnimationFrame(animacion);
        const [cx, cy] = aSvg(e.clientX, e.clientY);
        zoomEn(Math.exp(-e.deltaY * 0.0015), cx, cy);
    }, { passive: false });

    // Doble clic = acercar
    svg.addEventListener("dblclick", (e) => {
        const [cx, cy] = aSvg(e.clientX, e.clientY);
        const k = Math.min(ZOOM_MAX, vista.k * 2);
        const f = k / vista.k;
        animarA({ k, x: cx - (cx - vista.x) * f, y: cy - (cy - vista.y) * f });
    });

    // Arrastrar y pellizcar (mouse y touch)
    const punteros = new Map();
    let pellizcoPrevio = null;

    svg.addEventListener("pointerdown", (e) => {
        cancelAnimationFrame(animacion);
        svg.setPointerCapture(e.pointerId);
        punteros.set(e.pointerId, aSvg(e.clientX, e.clientY));
        svg.classList.add("arrastrando");
        pellizcoPrevio = null;
    });

    svg.addEventListener("pointermove", (e) => {
        if (!punteros.has(e.pointerId)) return;
        const ahora = aSvg(e.clientX, e.clientY);
        const antes = punteros.get(e.pointerId);
        punteros.set(e.pointerId, ahora);

        if (punteros.size === 1) {
            vista = limitar({ k: vista.k, x: vista.x + ahora[0] - antes[0], y: vista.y + ahora[1] - antes[1] });
            pintar();
        } else if (punteros.size === 2) {
            const [a, b] = [...punteros.values()];
            const dist = Math.hypot(a[0] - b[0], a[1] - b[1]);
            const centro = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
            if (pellizcoPrevio) {
                vista.x += centro[0] - pellizcoPrevio.centro[0];
                vista.y += centro[1] - pellizcoPrevio.centro[1];
                zoomEn(dist / pellizcoPrevio.dist, centro[0], centro[1]);
            }
            pellizcoPrevio = { dist, centro };
        }
    });

    const soltar = (e) => {
        punteros.delete(e.pointerId);
        pellizcoPrevio = null;
        if (punteros.size === 0) svg.classList.remove("arrastrando");
    };
    svg.addEventListener("pointerup", soltar);
    svg.addEventListener("pointercancel", soltar);

    // Nombre del estado al pasar el mouse
    capaZoom.addEventListener("pointermove", (e) => {
        const estado = e.target.closest(".mapa-estado");
        if (!estado || punteros.size > 0) {
            tooltip.classList.remove("visible");
            return;
        }
        const r = figura.getBoundingClientRect();
        tooltip.textContent = estado.dataset.nombre;
        tooltip.style.left = e.clientX - r.left + "px";
        tooltip.style.top = e.clientY - r.top + "px";
        tooltip.classList.add("visible");
    });
    svg.addEventListener("pointerleave", () => tooltip.classList.remove("visible"));

    // Botones
    figura.querySelectorAll(".mapa-controles button").forEach((boton) => {
        boton.addEventListener("click", () => {
            const accion = boton.dataset.zoom;
            const c = [(W / 2 - vista.x) / vista.k, (H / 2 - vista.y) / vista.k]; // centro visible
            // Acercar siempre va hacia el puntito de Morelia
            if (accion === "in") animarA(centrarEn(moreliaX, moreliaY, vista.k * PASO_ZOOM));
            if (accion === "out") animarA(centrarEn(c[0], c[1], vista.k / PASO_ZOOM));
            if (accion === "morelia") animarA(centrarEn(moreliaX, moreliaY, 6));
            if (accion === "reset") animarA({ k: 1, x: 0, y: 0 });
        });
    });

    pintar();
})();

/* ---------- Álbum de fotos apiladas (Sobre mí) ---------- */
(() => {
    const album = document.querySelector(".album");
    if (!album) return;

    const fotos = [...album.querySelectorAll(".album-foto")];
    const n = fotos.length;
    let actual = 0;
    let animando = false;

    // Cómo se ve cada lugar de la pila (0 = la de enfrente)
    const lugares = [
        "rotate(-2deg)",
        "translate(14px, -10px) rotate(5deg) scale(0.97)",
        "translate(-16px, -16px) rotate(-8deg) scale(0.94)",
        "translate(10px, -22px) rotate(10deg) scale(0.91)",
    ];
    const lugar = (p) => lugares[Math.min(p, lugares.length - 1)];

    // Si una imagen no existe, se muestra un recuadro de color
    fotos.forEach((f) => {
        const img = f.querySelector("img");
        const marcar = () => f.classList.add("sin-foto");
        img.addEventListener("error", marcar);
        if (img.complete && img.naturalWidth === 0) marcar();
    });

    function acomodar() {
        fotos.forEach((f, i) => {
            const p = (i - actual + n) % n;
            f.style.setProperty("--t", lugar(p));
            f.style.zIndex = n - p;
            f.setAttribute("aria-hidden", p !== 0);
        });
    }

    function mover(dir) {
        if (animando || n < 2) return;
        animando = true;

        // siguiente: la de enfrente se va al fondo | anterior: la del fondo pasa al frente
        const foto = dir > 0 ? fotos[actual] : fotos[(actual - 1 + n) % n];
        const clase = dir > 0 ? "al-fondo" : "al-frente";
        foto.style.setProperty("--t-desde", foto.style.getPropertyValue("--t"));

        actual = (actual + dir + n) % n;
        acomodar();

        foto.classList.add(clase);
        const terminar = () => {
            foto.classList.remove(clase);
            animando = false;
        };
        foto.addEventListener("animationend", terminar, { once: true });
        // por si las animaciones están desactivadas
        if (getComputedStyle(foto).animationName === "none") terminar();
    }

    album.querySelectorAll(".album-flecha").forEach((b) =>
        b.addEventListener("click", () => mover(Number(b.dataset.dir)))
    );

    // Flechas del teclado cuando el foco está en el álbum
    album.addEventListener("keydown", (e) => {
        if (e.key === "ArrowRight") mover(1);
        if (e.key === "ArrowLeft") mover(-1);
    });

    // Deslizar con el dedo en celular
    let inicioX = null;
    const pila = album.querySelector(".album-pila");
    pila.addEventListener("touchstart", (e) => (inicioX = e.touches[0].clientX), { passive: true });
    pila.addEventListener("touchend", (e) => {
        if (inicioX === null) return;
        const dx = e.changedTouches[0].clientX - inicioX;
        if (Math.abs(dx) > 40) mover(dx < 0 ? 1 : -1);
        inicioX = null;
    });

    acomodar();
})();

/* ---------- Tarjetas estilo bento (Sobre mí y Datos curiosos) ---------- */
(() => {
    const tarjetas = [...document.querySelectorAll(".bento-card")];
    if (!tarjetas.length) return;

    // Brillo que sigue al cursor dentro de cada tarjeta
    tarjetas.forEach((t) => {
        t.addEventListener("pointermove", (e) => {
            const r = t.getBoundingClientRect();
            t.style.setProperty("--mx", `${e.clientX - r.left}px`);
            t.style.setProperty("--my", `${e.clientY - r.top}px`);
        });
    });

    // Aparición escalonada cuando las tarjetas entran en pantalla
    if (!("IntersectionObserver" in window) || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const obs = new IntersectionObserver((entradas) => {
        entradas.forEach((e) => {
            if (e.isIntersecting) {
                e.target.classList.add("visible");
                obs.unobserve(e.target);
            }
        });
    }, { threshold: 0.15 });

    document.querySelectorAll(".bento, .datos, .proyectos").forEach((grupo) => {
        grupo.classList.add("bento-anim");
        [...grupo.querySelectorAll(".bento-card")].forEach((t, i) => {
            t.style.setProperty("--d", `${(i % 4) * 80}ms`);
            obs.observe(t);
        });
    });
})();

/* ---------- Pila de fotos (Datos curiosos) ---------- */
// Toma la foto de enfrente con el cursor (o el dedo) y aviéntala hacia cualquier lado:
// se va al fondo de la pila y aparece la que estaba detrás.
// Un clic (o Enter / flecha derecha) también pasa a la siguiente; flecha izquierda regresa.
document.querySelectorAll(".pila").forEach((pila) => {
    const tarjeta = pila.closest(".dato");
    const contador = tarjeta?.querySelector(".pila-contador");
    const todas = [...pila.querySelectorAll(".pila-foto")];
    let orden = [...todas]; // orden[0] = la foto de enfrente

    const UMBRAL = 80;   // px que hay que arrastrar para mandarla al fondo
    const VISIBLES = 4;  // cuántas fotos se alcanzan a ver en la pila

    // Cómo se ve cada lugar de la pila (0 = enfrente). Las de atrás asoman por los lados.
    const lugares = [
        "translate(0, 0) rotate(0deg)",
        "translate(22px, -14px) rotate(7deg) scale(0.96)",
        "translate(-24px, -22px) rotate(-8deg) scale(0.92)",
        "translate(12px, -32px) rotate(12deg) scale(0.88)",
    ];

    function acomodar() {
        const n = orden.length;
        orden.forEach((f, p) => {
            f.style.setProperty("--t", lugares[Math.min(p, VISIBLES - 1)]);
            f.style.zIndex = n - p;
            f.classList.toggle("atras", p > 0);
            f.classList.toggle("oculta", p >= VISIBLES);
            f.setAttribute("aria-hidden", p !== 0);
        });
        if (contador && orden[0]) {
            contador.textContent = `${todas.indexOf(orden[0]) + 1} / ${todas.length}`;
        }
    }

    function siguiente() {
        if (orden.length < 2) return;
        orden.push(orden.shift());
        acomodar();
    }

    function anterior() {
        if (orden.length < 2) return;
        orden.unshift(orden.pop());
        acomodar();
    }

    // Si una imagen no existe, se quita de la pila
    todas.forEach((f) => {
        const img = f.querySelector("img");
        const quitar = () => {
            f.remove();
            todas.splice(todas.indexOf(f), 1);
            orden = orden.filter((x) => x !== f);
            acomodar();
        };
        img.addEventListener("error", quitar, { once: true });
        if (img.complete && img.naturalWidth === 0) quitar();
    });

    // ----- Arrastrar -----
    let tomada = null;
    let x0 = 0, y0 = 0, dx = 0, dy = 0;

    pila.addEventListener("pointerdown", (e) => {
        if (e.button !== 0 || !orden[0] || !orden[0].contains(e.target)) return;
        tomada = orden[0];
        x0 = e.clientX;
        y0 = e.clientY;
        dx = dy = 0;
        try { pila.setPointerCapture(e.pointerId); } catch {}
        tomada.classList.add("tomada");
        tarjeta?.classList.add("arrastrando");
    });

    pila.addEventListener("pointermove", (e) => {
        if (!tomada) return;
        dx = e.clientX - x0;
        dy = e.clientY - y0;
        tomada.style.transform = `translate(${dx}px, ${dy}px) rotate(${dx * 0.06}deg)`;
    });

    function soltar(cancelado) {
        if (!tomada) return;
        const foto = tomada;
        tomada = null;
        foto.classList.remove("tomada");
        foto.style.transform = ""; // vuelve a usar --t (con animación)

        const distancia = Math.hypot(dx, dy);
        if (!cancelado && (distancia > UMBRAL || distancia < 5)) {
            siguiente(); // arrastre largo o clic → al fondo de la pila
        }
        // Quita el "por encima" cuando termine de acomodarse
        setTimeout(() => tarjeta?.classList.remove("arrastrando"), 550);
    }

    pila.addEventListener("pointerup", () => soltar(false));
    pila.addEventListener("pointercancel", () => soltar(true));

    // ----- Teclado -----
    pila.addEventListener("keydown", (e) => {
        if (["ArrowRight", "Enter", " "].includes(e.key)) {
            e.preventDefault();
            siguiente();
        } else if (e.key === "ArrowLeft") {
            e.preventDefault();
            anterior();
        }
    });

    acomodar();
});

/* ---------- Proyectos: masonry ---------- */
// Columnas del mismo ancho; cada tarjeta mide lo que necesita su descripción.
// Para que todas las columnas terminen a la misma altura (sin huecos), las
// imágenes de las columnas más cortas se estiran un poco (se recortan con object-fit).
(() => {
    const cont = document.querySelector(".proyectos");
    if (!cont) return;
    const tarjetas = [...cont.querySelectorAll(".proyecto")];
    const GAP = 18;
    let columnas = [];
    let anchoAnterior = 0;

    const numColumnas = () => {
        const w = cont.clientWidth;
        return w >= 640 ? 2 : 1; // 2 columnas (1 en celular)
    };

    const alto = (el) => el.getBoundingClientRect().height;

    function soltarImagenes() {
        tarjetas.forEach((t) => {
            const f = t.querySelector(".proyecto-imagen");
            f.style.height = "";
            f.style.aspectRatio = "";
        });
    }

    // Reparte las tarjetas en columnas buscando la combinación en la que las
    // imágenes se tengan que estirar lo menos posible (el orden se respeta dentro de cada columna)
    function repartir(n) {
        tarjetas.forEach((t) => cont.appendChild(t));
        columnas.forEach((c) => c.remove());
        columnas = Array.from({ length: n }, () => {
            const c = document.createElement("div");
            c.className = "proyectos-col";
            cont.appendChild(c);
            return c;
        });
        cont.classList.add("masonry");

        // Todas las columnas miden lo mismo de ancho: se mide cada tarjeta una vez
        tarjetas.forEach((t) => columnas[0].appendChild(t));
        const h = tarjetas.map((t) => alto(t) + GAP);

        let mejor = null;
        let mejorCosto = Infinity;
        const k = tarjetas.length;

        if (n > 1 && Math.pow(n, k) <= 250000) {
            // Prueba todas las combinaciones
            const asignacion = new Array(k).fill(0);
            const total = Math.pow(n, k);
            for (let combo = 0; combo < total; combo++) {
                let x = combo;
                const sum = new Array(n).fill(0);
                const cuenta = new Array(n).fill(0);
                for (let i = 0; i < k; i++) {
                    const c = x % n;
                    x = (x - c) / n;
                    asignacion[i] = c;
                    sum[c] += h[i];
                    cuenta[c]++;
                }
                if (cuenta.includes(0)) continue;
                const max = Math.max(...sum);
                // Costo: lo más que se estira una imagen + un poquito por el total estirado
                let peor = 0;
                let totalEstirado = 0;
                for (let c = 0; c < n; c++) {
                    const porImagen = (max - sum[c]) / cuenta[c];
                    peor = Math.max(peor, porImagen);
                    totalEstirado += max - sum[c];
                }
                const costo = peor + totalEstirado * 0.01;
                if (costo < mejorCosto) {
                    mejorCosto = costo;
                    mejor = [...asignacion];
                }
            }
        }

        if (!mejor) {
            // Demasiados proyectos para probar todo: a la columna más corta
            const alturas = new Array(n).fill(0);
            mejor = h.map((hi) => {
                const c = alturas.indexOf(Math.min(...alturas));
                alturas[c] += hi;
                return c;
            });
        }

        tarjetas.forEach((t, i) => columnas[mejor[i]].appendChild(t));
    }

    // Estira las imágenes de las columnas cortas hasta igualar la más alta
    function emparejar() {
        if (columnas.length < 2) return;
        const alturas = columnas.map(alto);
        const max = Math.max(...alturas);
        columnas.forEach((c, i) => {
            const faltan = max - alturas[i];
            if (faltan < 1) return;
            const figuras = [...c.querySelectorAll(".proyecto-imagen")];
            const extra = faltan / figuras.length;
            figuras.forEach((f) => {
                const h = alto(f);
                f.style.aspectRatio = "auto";
                f.style.height = `${h + extra}px`;
            });
        });
    }

    function acomodar() {
        anchoAnterior = cont.clientWidth;
        soltarImagenes();
        const n = numColumnas();
        if (n !== columnas.length) repartir(n);
        emparejar();
    }

    acomodar();
    document.fonts?.ready.then(acomodar);
    window.addEventListener("load", acomodar);

    // Solo se vuelve a acomodar si cambia el ancho (no por los cambios de alto que hacemos aquí)
    let pendiente = 0;
    new ResizeObserver(() => {
        if (cont.clientWidth === anchoAnterior) return;
        cancelAnimationFrame(pendiente);
        pendiente = requestAnimationFrame(acomodar);
    }).observe(cont);
})();
