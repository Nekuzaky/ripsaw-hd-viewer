export interface AppActions {
  toggleFullscreen(): void;
  exitFullscreen(): void;
  toggleMute(): void;
  changeVolume(delta: number): void;
  setVolume(value: number): void;
  screenshot(): void;
  saveReplay(): void;
  toggleRecording(): void;
  toggleMiniPlayer(): void;
  toggleSettings(): void;
  cycleScaleMode(): void;
  toggleStats(): void;
  reconnect(): void;
}
