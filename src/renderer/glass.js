// Drives the WebGL refraction/specular/edge-highlight overlay for the
// chrome bar. See shaders/glass.vert and shaders/glass.frag for the
// commented reference copies of the shaders inlined below (inlined because
// Chromium blocks fetch() of file:// resources from a file:// document).
(() => {
  const VERT_SRC = `
    attribute vec2 a_position;
    void main() {
      gl_Position = vec4(a_position, 0.0, 1.0);
    }
  `;

  const FRAG_SRC = `
    precision highp float;
    uniform sampler2D u_texture;
    uniform vec2 u_resolution;
    uniform vec4 u_cornerRadius;
    uniform float u_hasTexture;

    float sdRoundedBox(vec2 p, vec2 b, vec4 r) {
      r.xy = (p.x > 0.0) ? r.xy : r.zw;
      r.x = (p.y > 0.0) ? r.x : r.y;
      vec2 q = abs(p) - b + r.x;
      return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r.x;
    }

    void main() {
      vec2 p = vec2(gl_FragCoord.x, u_resolution.y - gl_FragCoord.y);
      vec2 center = u_resolution * 0.5;
      vec2 halfSize = u_resolution * 0.5;

      float d = sdRoundedBox(p - center, halfSize, u_cornerRadius);
      if (d > 0.5) {
        discard;
      }

      float edgeWidth = 26.0;
      float edgeFactor = 1.0 - smoothstep(-edgeWidth, 0.0, d);

      vec2 eps = vec2(1.0, 0.0);
      float dx = sdRoundedBox(p - center + eps.xy, halfSize, u_cornerRadius)
               - sdRoundedBox(p - center - eps.xy, halfSize, u_cornerRadius);
      float dy = sdRoundedBox(p - center + eps.yx, halfSize, u_cornerRadius)
               - sdRoundedBox(p - center - eps.yx, halfSize, u_cornerRadius);
      vec2 normal = normalize(vec2(dx, dy) + 1e-5);

      float maxDisplace = 10.0;
      vec2 displaced = p + normal * edgeFactor * maxDisplace;
      vec2 uv = clamp(displaced / u_resolution, 0.0, 1.0);
      uv.y = 1.0 - uv.y;

      vec4 refracted = u_hasTexture > 0.5 ? texture2D(u_texture, uv) : vec4(0.0);

      vec2 lightDir = normalize(vec2(-0.4, -1.0));
      float sheen = pow(max(0.0, dot(normalize(p - center), -lightDir) * 0.5 + 0.5), 6.0);
      vec3 specular = vec3(1.0) * sheen * 0.22;

      float edgeLine = 1.0 - smoothstep(0.0, 3.0, abs(d));
      vec3 edgeHighlight = vec3(1.0) * edgeLine * 0.35;

      vec3 color = refracted.rgb * 0.4 + specular + edgeHighlight;
      float alpha = clamp(refracted.a * 0.22 * edgeFactor + sheen * 0.12 + edgeLine * 0.4, 0.0, 1.0);

      gl_FragColor = vec4(color, alpha);
    }
  `;

  function compileShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('Refract glass shader compile error:', gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  function init() {
    const canvas = document.getElementById('glass-canvas');
    const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false });
    if (!gl) {
      console.warn('WebGL unavailable; falling back to CSS-only glass panels.');
      return;
    }

    const vertShader = compileShader(gl, gl.VERTEX_SHADER, VERT_SRC);
    const fragShader = compileShader(gl, gl.FRAGMENT_SHADER, FRAG_SRC);
    if (!vertShader || !fragShader) return;

    const program = gl.createProgram();
    gl.attachShader(program, vertShader);
    gl.attachShader(program, fragShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('Refract glass program link error:', gl.getProgramInfoLog(program));
      return;
    }
    gl.useProgram(program);

    const positionLoc = gl.getAttribLocation(program, 'a_position');
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW
    );
    gl.enableVertexAttribArray(positionLoc);
    gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);

    const resolutionLoc = gl.getUniformLocation(program, 'u_resolution');
    const cornerRadiusLoc = gl.getUniformLocation(program, 'u_cornerRadius');
    const hasTextureLoc = gl.getUniformLocation(program, 'u_hasTexture');
    const textureLoc = gl.getUniformLocation(program, 'u_texture');

    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    let hasTexture = false;
    const frameImage = new Image();
    frameImage.onload = () => {
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, frameImage);
      hasTexture = true;
    };

    if (window.refract?.glass?.onFrame) {
      window.refract.glass.onFrame((frame) => {
        frameImage.src = frame.dataUrl;
      });
    }

    function resize() {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
    }
    window.addEventListener('resize', resize);
    resize();

    // Only the bottom corners are rounded — the top and sides are flush
    // with the window edges, the bottom is the boundary against the page.
    const radius = 14 * (window.devicePixelRatio || 1);

    function frame() {
      resize();
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND);
      gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

      gl.useProgram(program);
      gl.uniform2f(resolutionLoc, canvas.width, canvas.height);
      gl.uniform4f(cornerRadiusLoc, 0, 0, radius, radius);
      gl.uniform1f(hasTextureLoc, hasTexture ? 1 : 0);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform1i(textureLoc, 0);

      gl.drawArrays(gl.TRIANGLES, 0, 6);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
