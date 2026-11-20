import type { QualityProfileId } from '@shared/settings';

export interface QualityProfile {
  id: QualityProfileId;
  width: number;
  height: number;
  fps: number;
}

export const QUALITY_PROFILES: Record<QualityProfileId, QualityProfile> = {
  '1080p60': { id: '1080p60', width: 1920, height: 1080, fps: 60 },
  '1080p30': { id: '1080p30', width: 1920, height: 1080, fps: 30 },
  '720p60': { id: '720p60', width: 1280, height: 720, fps: 60 },
  '720p30': { id: '720p30', width: 1280, height: 720, fps: 30 },
};

export const FALLBACK_CHAIN: QualityProfileId[] = ['1080p60', '720p60', '1080p30', '720p30'];

export function nextLowerProfile(current: QualityProfileId): QualityProfileId | null {
  const index = FALLBACK_CHAIN.indexOf(current);
  return index >= 0 && index < FALLBACK_CHAIN.length - 1 ? FALLBACK_CHAIN[index + 1] : null;
}
