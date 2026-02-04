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
      setCertificatePromise(callback: () => Promise<string>): void;
      setSignatureAlgorithm(algorithm: string): void;
      setSignaturePromise(callback: (toSign: string) => Promise<string>): void;
    };
  }

  const qz: QZ;
  export default qz;
}
