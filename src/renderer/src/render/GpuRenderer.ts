import type { ImageSettings } from '@shared/settings';
import { POST_SHADER, SCALE_SHADER, VERTEX_SHADER } from './shaders';

type Rect = [number, number, number, number];

interface Program<U extends string> {
  handle: WebGLProgram;
  uniforms: Record<U, WebGLUniformLocation | null>;
}

const SCALE_UNIFORMS = [
  'uRect',
  'uFlipY',
  'uFrame',
  'uInputSize',
  'uViewport',
  'uOffset',
  'uOutSize',
  'uMode',
] as const;
const POST_UNIFORMS = [
  'uRect',
  'uFlipY',
  'uSource',
  'uTexel',
  'uSharpness',
  'uLimitedRange',
  'uBrightness',
  'uContrast',
  'uSaturation',
  'uGamma',
] as const;

export type FrameListener = (now: number, metadata: VideoFrameCallbackMetadata) => void;

export class GpuRenderer {
  readonly canvas: HTMLCanvasElement;
  private readonly gl: WebGL2RenderingContext;
  private readonly scale: Program<(typeof SCALE_UNIFORMS)[number]>;
  private readonly post: Program<(typeof POST_UNIFORMS)[number]>;
  private readonly frameTexture: WebGLTexture;
  private readonly targetTexture: WebGLTexture;
  private readonly framebuffer: WebGLFramebuffer;
  private targetSize: [number, number] = [0, 0];
  private image: ImageSettings;
  private limitedRange = false;
  private video: HTMLVideoElement | null = null;
  private frameHandle: number | null = null;
  private hasFrame = false;
  private frameListener: FrameListener | null = null;
  private readonly resizeObserver: ResizeObserver;

  constructor(container: HTMLElement, image: ImageSettings) {
    this.image = image;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'stage-canvas';
    container.appendChild(this.canvas);

    const gl = this.canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      desynchronized: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
    });
    if (!gl) throw new Error('WebGL2 is not available');
    this.gl = gl;

    this.scale = this.createProgram(SCALE_SHADER, SCALE_UNIFORMS);
    this.post = this.createProgram(POST_SHADER, POST_UNIFORMS);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    for (const program of [this.scale.handle, this.post.handle]) {
      const location = gl.getAttribLocation(program, 'aPosition');
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0);
    }

    this.frameTexture = this.createTexture(gl.LINEAR);
    this.targetTexture = this.createTexture(gl.NEAREST);
    this.framebuffer = gl.createFramebuffer()!;

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
  }

  attach(video: HTMLVideoElement | null): void {
    if (this.video && this.frameHandle !== null) this.video.cancelVideoFrameCallback(this.frameHandle);
    this.video = video;
    this.frameHandle = null;
    this.hasFrame = false;
    this.clear();
    if (video) this.frameHandle = video.requestVideoFrameCallback(this.handleFrame);
  }

  onFrame(listener: FrameListener): void {
    this.frameListener = listener;
  }

  setImage(image: ImageSettings): void {
    this.image = image;
    this.draw();
  }

  setLimitedRange(value: boolean): void {
    this.limitedRange = value;
    this.draw();
  }

  async snapshot(): Promise<Blob | null> {
    if (!this.hasFrame) return null;
    this.draw();
    return new Promise((resolve) => this.canvas.toBlob(resolve, 'image/png'));
  }

  private readonly handleFrame = (now: number, metadata: VideoFrameCallbackMetadata): void => {
    const video = this.video;
    if (!video) return;
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.frameTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
    this.hasFrame = true;
    this.draw();
    this.frameListener?.(now, metadata);
    this.frameHandle = video.requestVideoFrameCallback(this.handleFrame);
  };

  private layout(vw: number, vh: number): { rect: Rect; uv: Rect } {
    const canvasRatio = this.canvas.width / this.canvas.height;
    const videoRatio = vw / vh;
    if (this.image.scaleMode === 'fit') {
      if (videoRatio > canvasRatio) {
        const h = canvasRatio / videoRatio;
        return { rect: [0, (1 - h) / 2, 1, h], uv: [0, 0, 1, 1] };
      }
      const w = videoRatio / canvasRatio;
      return { rect: [(1 - w) / 2, 0, w, 1], uv: [0, 0, 1, 1] };
    }
    if (this.image.scaleMode === 'fill') {
      if (videoRatio > canvasRatio) {
        const w = canvasRatio / videoRatio;
        return { rect: [0, 0, 1, 1], uv: [(1 - w) / 2, 0, w, 1] };
      }
      const h = videoRatio / canvasRatio;
      return { rect: [0, 0, 1, 1], uv: [0, (1 - h) / 2, 1, h] };
    }
    return { rect: [0, 0, 1, 1], uv: [0, 0, 1, 1] };
  }

  private draw(): void {
    const gl = this.gl;
    const video = this.video;
    if (!video || !this.hasFrame || !video.videoWidth) return;

    const cw = this.canvas.width;
    const ch = this.canvas.height;
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const { rect, uv } = this.layout(vw, vh);
    const outW = Math.max(1, Math.round(rect[2] * cw));
    const outH = Math.max(1, Math.round(rect[3] * ch));
    const viewW = uv[2] * vw;
    const viewH = uv[3] * vh;
    const upscale = this.image.upscaler === 'fsr' && outW > viewW * 1.01 && outH > viewH * 1.01;
    this.ensureTarget(outW, outH);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    gl.viewport(0, 0, outW, outH);
    gl.useProgram(this.scale.handle);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.frameTexture);
    const s = this.scale.uniforms;
    gl.uniform4f(s.uRect, 0, 0, 1, 1);
    gl.uniform1f(s.uFlipY, 1);
    gl.uniform1i(s.uFrame, 0);
    gl.uniform2f(s.uInputSize, vw, vh);
    gl.uniform2f(s.uViewport, viewW, viewH);
    gl.uniform2f(s.uOffset, uv[0], uv[1]);
    gl.uniform2f(s.uOutSize, outW, outH);
    gl.uniform1i(s.uMode, upscale ? 1 : 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, cw, ch);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.post.handle);
    gl.bindTexture(gl.TEXTURE_2D, this.targetTexture);
    const p = this.post.uniforms;
    gl.uniform4f(p.uRect, Math.round(rect[0] * cw) / cw, Math.round(rect[1] * ch) / ch, outW / cw, outH / ch);
    gl.uniform1f(p.uFlipY, 0);
    gl.uniform1i(p.uSource, 0);
    gl.uniform2f(p.uTexel, 1 / outW, 1 / outH);
    gl.uniform1f(p.uSharpness, this.image.sharpness);
    gl.uniform1f(p.uLimitedRange, this.limitedRange ? 1 : 0);
    gl.uniform1f(p.uBrightness, this.image.brightness);
    gl.uniform1f(p.uContrast, this.image.contrast);
    gl.uniform1f(p.uSaturation, this.image.saturation);
    gl.uniform1f(p.uGamma, this.image.gamma);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  private ensureTarget(width: number, height: number): void {
    if (this.targetSize[0] === width && this.targetSize[1] === height) return;
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.targetTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.targetTexture, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.targetSize = [width, height];
  }

  private clear(): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  private resize(): void {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.round(this.canvas.clientWidth * ratio));
    const height = Math.max(1, Math.round(this.canvas.clientHeight * ratio));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
      this.draw();
    }
  }

  private createTexture(filter: number): WebGLTexture {
    const gl = this.gl;
    const texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return texture;
  }

  private createProgram<U extends string>(fragment: string, names: readonly U[]): Program<U> {
    const gl = this.gl;
    const handle = gl.createProgram()!;
    gl.attachShader(handle, this.compile(gl.VERTEX_SHADER, VERTEX_SHADER));
    gl.attachShader(handle, this.compile(gl.FRAGMENT_SHADER, fragment));
    gl.bindAttribLocation(handle, 0, 'aPosition');
    gl.linkProgram(handle);
    if (!gl.getProgramParameter(handle, gl.LINK_STATUS)) {
      throw new Error(`Shader link failed: ${gl.getProgramInfoLog(handle)}`);
    }
    const uniforms = {} as Record<U, WebGLUniformLocation | null>;
    for (const name of names) uniforms[name] = gl.getUniformLocation(handle, name);
    return { handle, uniforms };
  }

  private compile(type: number, source: string): WebGLShader {
    const gl = this.gl;
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(`Shader compile failed: ${gl.getShaderInfoLog(shader)}`);
    }
    return shader;
  }
}
