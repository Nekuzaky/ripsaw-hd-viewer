export const VERTEX_SHADER = `#version 300 es
in vec2 aPosition;
uniform vec4 uRect;
out vec2 vUv;
void main() {
  vUv = vec2(aPosition.x, 1.0 - aPosition.y);
  vec2 position = uRect.xy + aPosition * uRect.zw;
  gl_Position = vec4(position * 2.0 - 1.0, 0.0, 1.0);
}
`;

export const FRAGMENT_SHADER = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uFrame;
uniform vec2 uTexel;
uniform vec4 uUvRect;
uniform float uSharpness;
uniform float uLimitedRange;
uniform float uBrightness;
uniform float uContrast;
uniform float uSaturation;
uniform float uGamma;
out vec4 outColor;

vec3 sampleAt(vec2 uv) {
  return texture(uFrame, uv).rgb;
}

vec3 sharpen(vec2 uv) {
  vec3 c = sampleAt(uv);
  if (uSharpness <= 0.0) return c;
  vec3 n = sampleAt(uv + vec2(0.0, -uTexel.y));
  vec3 s = sampleAt(uv + vec2(0.0, uTexel.y));
  vec3 e = sampleAt(uv + vec2(uTexel.x, 0.0));
  vec3 w = sampleAt(uv + vec2(-uTexel.x, 0.0));
  vec3 lo = min(c, min(min(n, s), min(e, w)));
  vec3 hi = max(c, max(max(n, s), max(e, w)));
  vec3 amp = sqrt(clamp(min(lo, 1.0 - hi) / max(hi, vec3(1e-4)), 0.0, 1.0));
  vec3 weight = amp * -mix(0.125, 0.2, uSharpness) * uSharpness;
  return clamp((c + (n + s + e + w) * weight) / (1.0 + 4.0 * weight), 0.0, 1.0);
}

void main() {
  vec2 uv = uUvRect.xy + vUv * uUvRect.zw;
  vec3 color = sharpen(uv);
  color = mix(color, (color - 16.0 / 255.0) * (255.0 / 219.0), uLimitedRange);
  color = (color - 0.5) * uContrast + 0.5 + uBrightness;
  float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
  color = mix(vec3(luma), color, uSaturation);
  color = pow(clamp(color, 0.0, 1.0), vec3(1.0 / uGamma));
  outColor = vec4(color, 1.0);
}
`;
