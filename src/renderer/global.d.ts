import type { LocomoMusicBridge } from "../shared/app-contract";

declare global {
  interface Window {
    readonly locomoMusic: Readonly<LocomoMusicBridge>;
  }
}

export {};
