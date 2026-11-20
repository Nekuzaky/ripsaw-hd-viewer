import type { ImageSettings } from '@shared/settings';
import { FRAGMENT_SHADER, VERTEX_SHADER } from './shaders';

type UniformName =
  | 'uRect'
  | 'uUvRect'
  | 'uTexel'
  | 'uSharpness'
  | 'uLimitedRange'
  | 'uBrightness'
  | 'uContrast'
  | 'uSaturation'
  | 'uGamma';

const UNIFORMS: UniformName[] = [
  'uRect',
  'uUvRect',
  'uTexel',
  'uSharpness',
  'uLimitedRange',
  'uBrightness',
  'uContrast',
  'uSaturation',
  'uGamma',
];

export class GpuRenderer {
  readonly canvas: HTMLCanvasElement;
  private readonly gl: WebGL2RenderingContext;
  private readonly uniforms = {} as Record<UniformName, WebGLUniformLocation | null>;
  private readonly texture: WebGLTexture;
  private image: ImageSettings;
  private limitedRange = false;
  private video: HTMLVideoElement | null = null;
  private frameHandle: number | null = null;
  private hasFrame = false;
  private onFrameListener: ((now: number, metadata: VideoFrameCallbackMetadata) => void) | null = null;
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

    const program = this.createProgram();
    gl.useProgram(program);
    for (const name of UNIFORMS) this.uniforms[name] = gl.getUniformLocation(program, name);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    const location = gl.getAttribLocation(program, 'aPosition');
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0);

    this.texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

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

  onFrame(listener: (now: number, metadata: VideoFrameCallbackMetadata) => void): void {
    this.onFrameListener = listener;
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
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
    this.hasFrame = true;
    this.draw();
    this.onFrameListener?.(now, metadata);
    this.frameHandle = video.requestVideoFrameCallback(this.handleFrame);
  };

  private draw(): void {
    const gl = this.gl;
    const video = this.video;
    if (!video || !this.hasFrame || !video.videoWidth) return;

    const { width: cw, height: ch } = this.canvas;
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const canvasRatio = cw / ch;
    const videoRatio = vw / vh;
    let rect = [0, 0, 1, 1];
    let uvRect = [0, 0, 1, 1];

    if (this.image.scaleMode === 'fit') {
      if (videoRatio > canvasRatio) {
        const h = canvasRatio / videoRatio;
        rect = [0, (1 - h) / 2, 1, h];
      } else {
        const w = videoRatio / canvasRatio;
        rect = [(1 - w) / 2, 0, w, 1];
      }
    } else if (this.image.scaleMode === 'fill') {
      if (videoRatio > canvasRatio) {
        const w = canvasRatio / videoRatio;
        uvRect = [(1 - w) / 2, 0, w, 1];
      } else {
        const h = videoRatio / canvasRatio;
        uvRect = [0, (1 - h) / 2, 1, h];
      }
    }

    gl.viewport(0, 0, cw, ch);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform4fv(this.uniforms.uRect, rect);
    gl.uniform4fv(this.uniforms.uUvRect, uvRect);
    gl.uniform2f(this.uniforms.uTexel, 1 / vw, 1 / vh);
    gl.uniform1f(this.uniforms.uSharpness, this.image.sharpness);
    gl.uniform1f(this.uniforms.uLimitedRange, this.limitedRange ? 1 : 0);
    gl.uniform1f(this.uniforms.uBrightness, this.image.brightness);
    gl.uniform1f(this.uniforms.uContrast, this.image.contrast);
    gl.uniform1f(this.uniforms.uSaturation, this.image.saturation);
    gl.uniform1f(this.uniforms.uGamma, this.image.gamma);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  private clear(): void {
    const gl = this.gl;
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

  private createProgram(): WebGLProgram {
    const gl = this.gl;
    const program = gl.createProgram()!;
    gl.attachShader(program, this.compile(gl.VERTEX_SHADER, VERTEX_SHADER));
    gl.attachShader(program, this.compile(gl.FRAGMENT_SHADER, FRAGMENT_SHADER));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`Shader link failed: ${gl.getProgramInfoLog(program)}`);
    }
    return program;
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
