// webtorClient.ts

export interface Resource {
  id: string;
  // Additional properties returned by your API can be defined here
  name?: string;
  // etc.
}

export interface ExportUrls {
  download: string;
  stream: string;
  // You can add more fields if the API returns additional URLs
}

export class WebtorClient {
  private baseUrl: string;

  /**
   * Creates an instance of WebtorClient.
   * @param baseUrl The base URL for the Webtor REST-API (e.g., http://localhost:8097)
   */
  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, ''); // Remove trailing slashes
  }

  /**
   * Adds a new resource (torrent or magnet URI) to Webtor.
   * @param torrentOrMagnet The torrent file URL or magnet URI.
   * @returns A promise resolving to the created resource.
   */
  async addResource(torrentOrMagnet: string): Promise<Resource> {
    const url = `${this.baseUrl}/resources`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ resource: torrentOrMagnet }),
    });

    if (!response.ok) {
      throw new Error(`Failed to add resource: ${response.statusText}`);
    }

    const data = await response.json();
    return data as Resource;
  }

  /**
   * Retrieves content information for a given resource.
   * @param resourceId The ID of the resource.
   * @returns A promise resolving to the resource content data.
   */
  async getResourceContent(resourceId: string): Promise<any> {
    const url = `${this.baseUrl}/resources/${resourceId}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to get resource content: ${response.statusText}`);
    }

    return await response.json();
  }

  /**
   * Gets export URLs for downloading and streaming the content.
   * @param resourceId The ID of the resource.
   * @returns A promise resolving to the export URLs.
   */
  async getExportUrls(resourceId: string): Promise<ExportUrls> {
    const url = `${this.baseUrl}/resources/${resourceId}/export`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to get export URLs: ${response.statusText}`);
    }

    return await response.json();
  }
}
