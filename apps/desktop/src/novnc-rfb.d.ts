declare module "@novnc/novnc/lib/rfb.js" {
  /** noVNC RFB client (minimal typing for pane embed). */
  export default class RFB {
    constructor(
      target: HTMLElement,
      url: string | WebSocket | ArrayBuffer | Blob | RTCDataChannel,
      options?: { wsProtocols?: string[] },
    );
    disconnect(): void;
    addEventListener(type: string, listener: (ev: Event) => void): void;
    removeEventListener(type: string, listener: (ev: Event) => void): void;
    scaleViewport: boolean;
    resizeSession: boolean;
  }
}
