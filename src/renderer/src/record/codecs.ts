export interface RecordingFormat {
  mimeType: string;
  extension: 'mp4' | 'webm';
}

const CANDIDATES: RecordingFormat[] = [
  { mimeType: 'video/mp4;codecs=avc1.640033,mp4a.40.2', extension: 'mp4' },
  { mimeType: 'video/mp4;codecs=avc1.640028,mp4a.40.2', extension: 'mp4' },
  { mimeType: 'video/mp4;codecs=avc1.640028,opus', extension: 'mp4' },
  { mimeType: 'video/mp4', extension: 'mp4' },
  { mimeType: 'video/webm;codecs=h264,opus', extension: 'webm' },
  { mimeType: 'video/webm;codecs=vp9,opus', extension: 'webm' },
  { mimeType: 'video/webm', extension: 'webm' },
];

let cached: RecordingFormat | null = null;

export function bestRecordingFormat(): RecordingFormat {
  cached ??=
    CANDIDATES.find((format) => MediaRecorder.isTypeSupported(format.mimeType)) ?? CANDIDATES.at(-1)!;
  return cached;
}

export function recorderOptions(bitrateMbps: number): MediaRecorderOptions {
  return {
    mimeType: bestRecordingFormat().mimeType,
    videoBitsPerSecond: Math.round(bitrateMbps * 1_000_000),
    audioBitsPerSecond: 192_000,
  };
}

export function composeStream(video: MediaStream, audio: MediaStream): MediaStream {
  return new MediaStream([...video.getVideoTracks(), ...audio.getAudioTracks()]);
}
