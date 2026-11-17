/* Ambient type shims for the standalone websocket example.
 * socket.io and socket.io-client are optional peer dependencies that are
 * not part of the application build; these declarations keep the example
 * typecheck-clean without requiring the packages to be installed. */

declare module 'socket.io-client' {
  export function io(url: string, opts?: unknown): SocketClient;
  export interface SocketClient {
    on(event: string, listener: (msg: Message) => void): void;
    emit(event: string, ...args: unknown[]): void;
    disconnect(): void;
  }
}

declare module 'socket.io' {
  import type { Server as HttpServer } from 'http';
  export interface Socket {
    id: string;
    on(event: string, listener: (...args: unknown[]) => void): void;
    on(event: 'join', listener: (data: { username: string }) => void): void;
    on(event: 'message', listener: (data: { content: string; username: string }) => void): void;
    emit(event: string, ...args: unknown[]): void;
  }
  export class Server {
    constructor(httpServer: HttpServer, opts?: unknown);
    on(event: string, listener: (socket: Socket) => void): void;
    on(event: string, listener: (socket: Socket, data: { username: string }) => void): void;
    on(event: string, listener: (socket: Socket, data: { content: string; username: string }) => void): void;
    emit(event: string, ...args: unknown[]): void;
    to(room: string): { emit(event: string, ...args: unknown[]): void };
  }
}