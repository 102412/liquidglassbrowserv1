// Refraction/lensing layer for the chrome bar.
//
// Reference copy — see the note in glass.vert about why glass.js inlines its
// own copy of this source instead of fetching this file at runtime.
precision highp float;

uniform sampler2D u_texture;   // periodic screenshot of the page strip hidden behind the chrome
uniform vec2 u_resolution;     // chrome canvas size, px
uniform vec4 u_cornerRadius;   // top-left, top-right, bottom-right, bottom-left, px
uniform float u_time;
uniform float u_hasTexture;

// Signed distance to a box with independently rounded corners.
// p is relative to the box center. b is the half-size.
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

  // Edge lensing: displace the sampled UV outward, strongest right at the
  // boundary and fading to nothing a short distance into the panel.
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

  // Static-angle specular sheen, brightest along the top-left.
  vec2 lightDir = normalize(vec2(-0.4, -1.0));
  float sheen = pow(max(0.0, dot(normalize(p - center), -lightDir) * 0.5 + 0.5), 6.0);
  vec3 specular = vec3(1.0) * sheen * 0.22;

  // Bright 1px-ish edge highlight, strongest near the boundary.
  float edgeLine = 1.0 - smoothstep(0.0, 3.0, abs(d));
  vec3 edgeHighlight = vec3(1.0) * edgeLine * 0.35;

  vec3 color = refracted.rgb * 0.4 + specular + edgeHighlight;
  float alpha = clamp(refracted.a * 0.22 * edgeFactor + sheen * 0.12 + edgeLine * 0.4, 0.0, 1.0);

  gl_FragColor = vec4(color, alpha);
}
