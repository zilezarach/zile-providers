// src/types/webtor.d.ts

declare module '@webtor/platform-sdk-js' {
  export interface WebTorOptions {
    apiUrl: string; // API url (required)
    apiKey?: string; // API key
    downloadUrl?: string; // All download urls will contain this location
    tokenUrl?: string; // API will get access-token from this location
    tokenRenewInterval?: number; // Renews access-token after specific period in ms
    grpcDebug?: boolean; // If enabled shows grpc-web debug output
    statsRetryInterval?: number; // If stats not available for this file it will retry after specific period in ms (default=3000)
    getToken?: () => Promise<string>; // If defined custom token-function will be used
  }

  export interface TorrentFile {
    path: string;
    name: string;
    length: number;
    offset: number;
  }

  export interface ParsedTorrent {
    infoHash: string;
    name: string;
    announce?: string[];
    urlList?: string[];
    files: TorrentFile[];
    length: number;
    pieceLength: number;
    lastPieceLength: number;
    pieces: string[];
    created?: Date;
    createdBy?: string;
    comment?: string;
  }

  export interface ViewSettings {
    a?: number; // Selected audio channel
    s?: number; // Selected subtitle channel
  }

  export interface StatusData {
    total: number; // Number of total bytes
    completed: number; // Number of completed bytes
    peers: number; // Total number of peers
    piecesList: any[]; // Array of pieces
  }

  export interface StatClient {
    close(): void;
  }

  export interface OpenSubtitlesResult {
    [key: string]: {
      url: string;
      name: string;
      lang: string;
    };
  }

  export interface Seeder {
    url(path: string): Promise<string>;
    streamUrl(path: string, viewSettings?: ViewSettings): Promise<string>;
    streamSubtitleUrl(path: string, viewSettings?: ViewSettings): Promise<string>;
    mediaInfo(path: string): Promise<any>;
    downloadUrl(path: string): Promise<string>;
    zipUrl(path: string): Promise<string>;
    openSubtitles(path: string): Promise<OpenSubtitlesResult>;
    stats(path: string, callback: (path: string, data: StatusData) => void): StatClient;
  }

  export interface MagnetAPI {
    fetchTorrent(magnetUri: string): Promise<ParsedTorrent>;
  }

  export interface TorrentAPI {
    fromUrl(url: string): Promise<ParsedTorrent>;
    pull(infoHash: string): Promise<ParsedTorrent>;
    push(torrent: ParsedTorrent, expire: number): Promise<void>;
    touch(torrent: ParsedTorrent, expire: number): Promise<void>;
  }

  export interface SeederAPI {
    get(infoHash: string): Seeder;
  }

  export interface ExtAPI {
    url(url: string): Promise<string>;
    streamUrl(url: string, viewSettings?: ViewSettings): Promise<string>;
    streamSubtitleUrl(url: string, viewSettings?: ViewSettings): Promise<string>;
    mediaInfo(url: string): Promise<any>;
    openSubtitles(url: string): Promise<OpenSubtitlesResult>;
  }

  export interface WebTorSDK {
    torrent: TorrentAPI;
    magnet: MagnetAPI;
    seeder: SeederAPI;
    ext: ExtAPI;
  }

  export default function webtor(options: WebTorOptions): WebTorSDK;
}
