export interface ResourceInfo {
  id: string;
  name: string;
  // Add other properties as needed
}

export interface TorrentFile {
  name: string;
  path: string;
  length: number;
}

export interface ContentList {
  files: TorrentFile[];
  // Add other properties as needed
}

export interface ExportInfo {
  url: string;
  // Add other properties as needed
}

export class WebtorClient {
  private baseUrl: string;
  private debug: boolean;

  /**
   * Creates an instance of WebtorClient.
   * @param baseUrl The base URL for the Webtor REST-API (e.g., http://localhost:8096)
   * @param debug Enable debug logging
   */
  constructor(baseUrl: string, debug: boolean = false) {
    this.baseUrl = baseUrl.replace(/\/+$/, ''); // Remove trailing slashes
    this.debug = debug;
  }

  private log(...args: any[]): void {
    if (this.debug) {
      console.log('[WebtorClient]', ...args);
    }
  }

  /**
   * Adds a new resource via magnet URI to Webtor.
   * @param magnetUri The magnet URI.
   * @returns A promise resolving to the created resource.
   */
  async addResourceFromMagnet(magnetUri: string): Promise<ResourceInfo> {
    this.log('Adding resource from magnet URI:', magnetUri.substring(0, 50) + '...');

    const url = `${this.baseUrl}/resource/`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ uri: magnetUri }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to add resource: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();
    this.log('Resource added successfully:', data);
    return data;
  }

  /**
   * Retrieves resource information.
   * @param resourceId The ID of the resource.
   * @returns A promise resolving to the resource info.
   */
  async getResourceInfo(resourceId: string): Promise<ResourceInfo> {
    this.log('Getting resource info for:', resourceId);

    const url = `${this.baseUrl}/resource/${resourceId}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to get resource info: ${response.statusText}`);
    }

    const data = await response.json();
    this.log('Resource info retrieved:', data);
    return data;
  }

  /**
   * Lists content for a resource.
   * @param resourceId The ID of the resource.
   * @returns A promise resolving to the content list.
   */
  async listResourceContent(resourceId: string): Promise<ContentList> {
    this.log('Listing content for resource:', resourceId);

    const url = `${this.baseUrl}/resource/${resourceId}/list`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to list resource content: ${response.statusText}`);
    }

    const data = await response.json();
    this.log('Content list retrieved:', data);
    return data;
  }

  /**
   * Gets export URL for a specific file in a resource.
   * @param resourceId The ID of the resource.
   * @param contentPath The path of the file to export.
   * @returns A promise resolving to the export information.
   */
  async getExportUrl(resourceId: string, contentPath: string): Promise<ExportInfo> {
    this.log('Getting export URL for:', resourceId, contentPath);

    const url = `${this.baseUrl}/resource/${resourceId}/export/${encodeURIComponent(contentPath)}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to get export URL: ${response.statusText}`);
    }

    const data = await response.json();
    this.log('Export URL retrieved:', data);
    return data;
  }
}

/**
 * Factory function to create a client instance
 */
export function createWebtorClient(options: { apiUrl: string; debug?: boolean }): WebtorClient {
  return new WebtorClient(options.apiUrl, options.debug);
}
