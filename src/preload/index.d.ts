import type { RipViewBridge } from '../shared/bridge';

declare global {
  interface Window {
    ripview: RipViewBridge;
  }
}

export {};
