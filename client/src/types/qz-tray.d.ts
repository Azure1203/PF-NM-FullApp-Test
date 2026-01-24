declare module 'qz-tray' {
  interface QZ {
    websocket: {
      connect(): Promise<void>;
      disconnect(): Promise<void>;
      isActive(): boolean;
    };
    printers: {
      find(query?: string): Promise<string | string[]>;
      getDefault(): Promise<string>;
    };
    configs: {
      create(printer: string, options?: object): object;
    };
    print(config: object, data: Array<string | object>): Promise<void>;
    security: {
      setCertificatePromise(callback: (resolve: (cert: string) => void) => void): void;
      setSignatureAlgorithm(algorithm: string): void;
      setSignaturePromise(callback: (toSign: (signature: string) => void) => (request: string) => Promise<void>): void;
    };
  }

  const qz: QZ;
  export default qz;
}
