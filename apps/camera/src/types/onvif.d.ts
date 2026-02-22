declare module 'onvif' {
  export interface CamOptions {
    hostname: string;
    port: number;
    username: string;
    password: string;
    timeout?: number;
  }

  export interface StreamUri {
    uri: string;
  }

  export class Cam {
    constructor(options: CamOptions, callback: (err: Error | null) => void);
    getStreamUri(
      options: { protocol: string; profileToken?: string },
      callback: (err: Error | null, stream: StreamUri) => void
    ): void;
    profiles: Array<{ $: { token: string }; name: string }>;
  }
}
