export const VERTEX_SHADER = `#version 300 es
in vec2 aPosition;
uniform vec4 uRect;
uniform float uFlipY;
out vec2 vUv;
void main() {
  vUv = vec2(aPosition.x, mix(aPosition.y, 1.0 - aPosition.y, uFlipY));
  vec2 position = uRect.xy + aPosition * uRect.zw;
  gl_Position = vec4(position * 2.0 - 1.0, 0.0, 1.0);
}
`;

export const SCALE_SHADER = `#version 300 es
precision highp float;
uniform sampler2D uFrame;
uniform vec2 uInputSize;
uniform vec2 uViewport;
uniform vec2 uOffset;
uniform vec2 uOutSize;
uniform int uMode;
out vec4 outColor;

vec3 fetch(vec2 uv) {
  return texture(uFrame, uv).rgb;
}

float luma(vec3 c) {
  return c.g + 0.5 * (c.r + c.b);
}

void easuSet(inout vec2 dir, inout float len, float w, float lA, float lB, float lC, float lD, float lE) {
  float lenX = max(abs(lD - lC), abs(lC - lB));
  float dirX = lD - lB;
  dir.x += dirX * w;
  lenX = clamp(abs(dirX) / max(lenX, 1e-5), 0.0, 1.0);
  len += lenX * lenX * w;
  float lenY = max(abs(lE - lC), abs(lC - lA));
  float dirY = lE - lA;
  dir.y += dirY * w;
  lenY = clamp(abs(dirY) / max(lenY, 1e-5), 0.0, 1.0);
  len += lenY * lenY * w;
}

void easuTap(inout vec3 acc, inout float accW, vec2 off, vec2 dir, vec2 len, float lob, float clp, vec3 c) {
  vec2 v = vec2(dot(off, dir), dot(off, vec2(-dir.y, dir.x))) * len;
  float d2 = min(dot(v, v), clp);
  float wB = 0.4 * d2 - 1.0;
  float wA = lob * d2 - 1.0;
  wB *= wB;
  wA *= wA;
  wB = 1.5625 * wB - 0.5625;
  float w = wB * wA;
  acc += c * w;
  accW += w;
}

vec3 easu(vec2 ip) {
  vec2 scale = uViewport / uOutSize;
  vec2 pp = ip * scale + (0.5 * scale - 0.5);
  vec2 fp = floor(pp);
  pp -= fp;
  vec2 texel = 1.0 / uInputSize;
  vec2 p0 = uOffset + (fp + vec2(1.0, -1.0)) * texel;
  vec2 p1 = p0 + vec2(-1.0, 2.0) * texel;
  vec2 p2 = p0 + vec2(1.0, 2.0) * texel;
  vec2 p3 = p0 + vec2(0.0, 4.0) * texel;
  vec4 off = vec4(-0.5, 0.5, -0.5, 0.5) * texel.xxyy;

  vec3 bC = fetch(p0 + off.xw); float bL = luma(bC);
  vec3 cC = fetch(p0 + off.yw); float cL = luma(cC);
  vec3 iC = fetch(p1 + off.xw); float iL = luma(iC);
  vec3 jC = fetch(p1 + off.yw); float jL = luma(jC);
  vec3 fC = fetch(p1 + off.yz); float fL = luma(fC);
  vec3 eC = fetch(p1 + off.xz); float eL = luma(eC);
  vec3 kC = fetch(p2 + off.xw); float kL = luma(kC);
  vec3 lC = fetch(p2 + off.yw); float lL = luma(lC);
  vec3 hC = fetch(p2 + off.yz); float hL = luma(hC);
  vec3 gC = fetch(p2 + off.xz); float gL = luma(gC);
  vec3 oC = fetch(p3 + off.yz); float oL = luma(oC);
  vec3 nC = fetch(p3 + off.xz); float nL = luma(nC);

  vec2 dir = vec2(0.0);
  float len = 0.0;
  easuSet(dir, len, (1.0 - pp.x) * (1.0 - pp.y), bL, eL, fL, gL, jL);
  easuSet(dir, len, pp.x * (1.0 - pp.y), cL, fL, gL, hL, kL);
  easuSet(dir, len, (1.0 - pp.x) * pp.y, fL, iL, jL, kL, nL);
  easuSet(dir, len, pp.x * pp.y, gL, jL, kL, lL, oL);

  vec2 dir2 = dir * dir;
  float dirR = dir2.x + dir2.y;
  bool zero = dirR < 1.0 / 32768.0;
  dirR = zero ? 1.0 : inversesqrt(dirR);
  dir.x = zero ? 1.0 : dir.x;
  dir *= dirR;
  len *= 0.5;
  len *= len;
  float stretch = dot(dir, dir) / max(abs(dir.x), abs(dir.y));
  vec2 len2 = vec2(1.0 + (stretch - 1.0) * len, 1.0 - 0.5 * len);
  float lob = 0.5 - 0.29 * len;
  float clp = 1.0 / lob;

  vec3 min4 = min(min(fC, gC), min(jC, kC));
  vec3 max4 = max(max(fC, gC), max(jC, kC));
  vec3 acc = vec3(0.0);
  float accW = 0.0;
  easuTap(acc, accW, vec2(0.0, -1.0) - pp, dir, len2, lob, clp, bC);
  easuTap(acc, accW, vec2(1.0, -1.0) - pp, dir, len2, lob, clp, cC);
  easuTap(acc, accW, vec2(-1.0, 1.0) - pp, dir, len2, lob, clp, iC);
  easuTap(acc, accW, vec2(0.0, 1.0) - pp, dir, len2, lob, clp, jC);
  easuTap(acc, accW, vec2(0.0, 0.0) - pp, dir, len2, lob, clp, fC);
  easuTap(acc, accW, vec2(-1.0, 0.0) - pp, dir, len2, lob, clp, eC);
  easuTap(acc, accW, vec2(1.0, 1.0) - pp, dir, len2, lob, clp, kC);
  easuTap(acc, accW, vec2(2.0, 1.0) - pp, dir, len2, lob, clp, lC);
  easuTap(acc, accW, vec2(2.0, 0.0) - pp, dir, len2, lob, clp, hC);
  easuTap(acc, accW, vec2(1.0, 0.0) - pp, dir, len2, lob, clp, gC);
  easuTap(acc, accW, vec2(1.0, 2.0) - pp, dir, len2, lob, clp, oC);
  easuTap(acc, accW, vec2(0.0, 2.0) - pp, dir, len2, lob, clp, nC);
  return min(max4, max(min4, acc / accW));
}

void main() {
  vec2 ip = vec2(floor(gl_FragCoord.x), uOutSize.y - 1.0 - floor(gl_FragCoord.y));
  if (uMode == 1) {
    outColor = vec4(easu(ip), 1.0);
  } else {
    vec2 uv = uOffset + (ip + 0.5) / uOutSize * uViewport / uInputSize;
    outColor = vec4(fetch(uv), 1.0);
  }
}
`;

export const POST_SHADER = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uSource;
uniform vec2 uTexel;
uniform float uSharpness;
uniform float uLimitedRange;
uniform float uBrightness;
uniform float uContrast;
uniform float uSaturation;
uniform float uGamma;
out vec4 outColor;

vec3 rcas(vec2 uv) {
  vec3 e = texture(uSource, uv).rgb;
  if (uSharpness <= 0.0) return e;
  vec3 b = texture(uSource, uv + vec2(0.0, uTexel.y)).rgb;
  vec3 d = texture(uSource, uv - vec2(uTexel.x, 0.0)).rgb;
  vec3 f = texture(uSource, uv + vec2(uTexel.x, 0.0)).rgb;
  vec3 h = texture(uSource, uv - vec2(0.0, uTexel.y)).rgb;
  vec3 mn4 = min(min(b, d), min(f, h));
  vec3 mx4 = max(max(b, d), max(f, h));
  vec3 hitMin = mn4 / max(4.0 * mx4, vec3(1e-5));
  vec3 hitMax = (1.0 - mx4) / min(4.0 * mn4 - 4.0, vec3(-1e-5));
  vec3 lobeRGB = max(-hitMin, hitMax);
  float stops = (1.0 - uSharpness) * 2.0;
  float lobe = max(-0.1875, min(max(lobeRGB.r, max(lobeRGB.g, lobeRGB.b)), 0.0)) * exp2(-stops);
  return clamp((lobe * (b + d + f + h) + e) / (4.0 * lobe + 1.0), 0.0, 1.0);
}

void main() {
  vec3 color = rcas(vUv);
  color = mix(color, (color - 16.0 / 255.0) * (255.0 / 219.0), uLimitedRange);
  color = (color - 0.5) * uContrast + 0.5 + uBrightness;
  float l = dot(color, vec3(0.2126, 0.7152, 0.0722));
  color = mix(vec3(l), color, uSaturation);
  color = pow(clamp(color, 0.0, 1.0), vec3(1.0 / uGamma));
  outColor = vec4(color, 1.0);
}
`;
