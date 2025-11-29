export interface TcpMessage {
  event: string; // Event type (e.g., 'message', 'ping', 'status')
  data: string;
  timestamp: number;
}

export interface TcpClientOptions {
  port: number;
  host?: string;
}
