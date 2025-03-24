// zilestream.ts - Main WebTorrent scraper implementation
import WebTorrent from 'webtorrent';
import http from 'http';
import { flags } from '@/entrypoint/utils/targets';
import { makeSourcerer } from '@/providers/base';
import { MovieScrapeContext, ShowScrapeContext } from '@/utils/context';

// Timeout utility for promises
const withTimeout = <T>(promise: Promise<T>, ms: number, errorMsg?: string): Promise<T> => {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(errorMsg || `Operation timed out after ${ms}ms`)), ms),
  );
  return Promise.race([promise, timeout]);
};

// Store active resources for cleanup
const activeResources: {
  clients: WebTorrent.Instance[];
  servers: http.Server[];
} = {
  clients: [],
  servers: [],
};

// Interface for stream server
interface StreamServer {
  url: string;
  server: http.Server;
  cleanup: () => void;
}

// Get magnet URL from the context with improved deep property checking
function getMagnetUrl(ctx: MovieScrapeContext | ShowScrapeContext): string | null {
  console.log('Checking for magnet URL in context');

  // First check if magnetUrl is directly in the context
  if ('magnetUrl' in ctx && typeof ctx.magnetUrl === 'string' && ctx.magnetUrl) {
    console.log('Found magnetUrl directly in context');
    return ctx.magnetUrl;
  }

  // Check if it's in ctx.media
  if (ctx.media && typeof ctx.media === 'object') {
    const media = ctx.media as Record<string, any>;

    // Check if magnetUrl is in media
    if ('magnetUrl' in media && typeof media.magnetUrl === 'string' && media.magnetUrl) {
      console.log('Found magnetUrl in media object');
      return media.magnetUrl;
    }

    // Check if it's in torrents array
    if ('torrents' in media && Array.isArray(media.torrents) && media.torrents.length > 0) {
      const torrent = media.torrents[0];
      if (
        torrent &&
        typeof torrent === 'object' &&
        'magnetUrl' in torrent &&
        typeof torrent.magnetUrl === 'string' &&
        torrent.magnetUrl
      ) {
        console.log('Found magnetUrl in first torrent of media.torrents array');
        return torrent.magnetUrl;
      }
    }

    // Check if it's in episode object
    if ('episode' in media && media.episode && typeof media.episode === 'object') {
      const episode = media.episode as Record<string, any>;

      // Check for magnetUrl in episode
      if ('magnetUrl' in episode && typeof episode.magnetUrl === 'string' && episode.magnetUrl) {
        console.log('Found magnetUrl in episode object');
        return episode.magnetUrl;
      }

      // Check for torrents array in episode
      if ('torrents' in episode && Array.isArray(episode.torrents) && episode.torrents.length > 0) {
        const torrent = episode.torrents[0];
        if (
          torrent &&
          typeof torrent === 'object' &&
          'magnetUrl' in torrent &&
          typeof torrent.magnetUrl === 'string' &&
          torrent.magnetUrl
        ) {
          console.log('Found magnetUrl in first torrent of episode.torrents array');
          return torrent.magnetUrl;
        }
      }
    }
  }

  console.log('No magnet URL found in context');
  return null;
}

// Create WebTorrent client with appropriate configuration
function createClient(): WebTorrent.Instance {
  console.log('Creating WebTorrent client');
  const client = new WebTorrent({
    maxConns: 100,
  });

  // Log client events for debugging
  client.on('error', (err) => {
    console.error('WebTorrent client error:', err);
  });

  return client;
}

// Add torrent to client and wait for it to be ready
function addTorrent(client: WebTorrent.Instance, magnetUrl: string): Promise<WebTorrent.Torrent> {
  return new Promise((resolve, reject) => {
    console.log(`Adding torrent from magnet URL: ${magnetUrl.substring(0, 50)}...`);

    const torrent = client.add(magnetUrl, {
      announce: [
        'udp://tracker.opentrackr.org:1337/announce',
        'udp://tracker.leechers-paradise.org:6969/announce',
        'udp://tracker.coppersurfer.tk:6969/announce',
        'udp://9.rarbg.to:2710/announce',
        'udp://9.rarbg.me:2710/announce',
        'udp://tracker.internetwarriors.net:1337/announce',
      ],
    });

    // Handle torrent events
    let isResolved = false;

    torrent.on('ready', () => {
      if (!isResolved) {
        console.log(`Torrent ready: ${torrent.name}`);
        isResolved = true;
        resolve(torrent);
      }
    });

    torrent.on('error', (err) => {
      console.error('Torrent error:', err);
      if (!isResolved) {
        isResolved = true;
        reject(err);
      }
    });

    torrent.on('warning', (err) => {
      console.warn('Torrent warning:', err);
    });

    // Set timeout for the operation
    setTimeout(() => {
      if (!isResolved) {
        isResolved = true;
        reject(new Error('Torrent add operation timed out'));
      }
    }, 60000); // 1 minute timeout
  });
}

// Select the best video file from torrent
function selectAppropriateFile(torrent: WebTorrent.Torrent, mediaTitle: string): WebTorrent.TorrentFile | null {
  if (!torrent.files || torrent.files.length === 0) {
    console.log('No files found in torrent');
    return null;
  }

  // Log all files for debugging
  console.log('Available files in torrent:');
  torrent.files.forEach((file, index) => {
    console.log(`${index + 1}. ${file.name} (${Math.round(file.length / 1024 / 1024)}MB)`);
  });

  // Filter video files by extension
  const videoExtensions = ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm', '.m4v'];
  let videoFiles = torrent.files.filter((file) => {
    const lowercaseName = file.name.toLowerCase();
    return videoExtensions.some((ext) => lowercaseName.endsWith(ext));
  });

  if (videoFiles.length === 0) {
    console.log('No video files found in torrent based on extension');
    // Fallback: try to find video files by size
    videoFiles = torrent.files
      .filter((file) => file.length > 50 * 1024 * 1024) // Files larger than 50MB
      .sort((a, b) => b.length - a.length);

    if (videoFiles.length === 0) {
      console.log('No large files found in torrent');
      return null;
    }
  }

  // Sort by size (descending)
  videoFiles.sort((a, b) => b.length - a.length);

  // Try to find a file that matches the media title
  const mediaWords = mediaTitle
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 3);
  const matchingFiles = videoFiles.filter((file) => {
    const filename = file.name.toLowerCase();
    return mediaWords.some((word) => filename.includes(word));
  });

  // Return matching file or largest video file
  const selectedFile = matchingFiles.length > 0 ? matchingFiles[0] : videoFiles[0];
  console.log(`Selected file: ${selectedFile.name} (${Math.round(selectedFile.length / 1024 / 1024)}MB)`);
  return selectedFile;
}

// Create HTTP server for streaming the file
function createServerForFile(file: WebTorrent.TorrentFile): Promise<StreamServer> {
  return new Promise((resolve, reject) => {
    try {
      // Determine content type based on file extension
      const getContentType = (filename: string) => {
        const ext = filename.toLowerCase().split('.').pop();
        switch (ext) {
          case 'mp4':
            return 'video/mp4';
          case 'webm':
            return 'video/webm';
          case 'mkv':
            return 'video/x-matroska';
          case 'avi':
            return 'video/x-msvideo';
          default:
            return 'video/mp4'; // Default to mp4
        }
      };

      // Create HTTP server
      const server = http.createServer((req, res) => {
        // Parse range header if present
        const range = req.headers.range;
        const fileSize = file.length;

        if (range) {
          // Handle range requests for seeking
          const parts = range.replace(/bytes=/, '').split('-');
          const start = parseInt(parts[0], 10);
          const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
          const chunkSize = end - start + 1;

          console.log(`Range request: ${start}-${end}/${fileSize}`);

          res.writeHead(206, {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunkSize,
            'Content-Type': getContentType(file.name),
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, HEAD',
          });

          const fileStream = file.createReadStream({ start, end });
          fileStream.pipe(res);

          fileStream.on('error', (error) => {
            console.error('Stream error:', error);
            res.end();
          });

          req.on('close', () => {
            fileStream.destroy();
          });
        } else {
          // Handle normal requests
          res.writeHead(200, {
            'Content-Length': fileSize,
            'Content-Type': getContentType(file.name),
            'Accept-Ranges': 'bytes',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, HEAD',
          });

          const fileStream = file.createReadStream();
          fileStream.pipe(res);

          fileStream.on('error', (error) => {
            console.error('Stream error:', error);
            res.end();
          });

          req.on('close', () => {
            fileStream.destroy();
          });
        }
      });

      // Start server on a random port
      server.listen(0, () => {
        const address = server.address();
        if (!address || typeof address === 'string') {
          reject(new Error('Failed to get server address'));
          return;
        }

        const port = address.port;
        const url = `http://localhost:${port}/${encodeURIComponent(file.name)}`;
        console.log(`HTTP server started at ${url}`);

        resolve({
          url,
          server,
          cleanup: () => {
            console.log('Closing HTTP server');
            server.close();
          },
        });
      });

      server.on('error', (error) => {
        console.error('Server error:', error);
        reject(error);
      });
    } catch (error) {
      reject(error);
    }
  });
}

// Register resources for cleanup
function registerForCleanup(client: WebTorrent.Instance, server: http.Server) {
  activeResources.clients.push(client);
  activeResources.servers.push(server);
}

// Cleanup function
export function cleanupResources() {
  console.log('Cleaning up WebTorrent resources');

  activeResources.servers.forEach((server) => {
    try {
      server.close();
    } catch (e) {
      // Ignore errors during cleanup
    }
  });

  activeResources.clients.forEach((client) => {
    try {
      client.destroy();
    } catch (e) {
      // Ignore errors during cleanup
    }
  });

  // Clear arrays
  activeResources.servers = [];
  activeResources.clients = [];
}

// Main movie scraper function
async function scrapeMovie(ctx: MovieScrapeContext) {
  console.log('Starting ZileStream movie scraper');
  let client: WebTorrent.Instance | null = null;
  let streamServer: StreamServer | null = null;

  try {
    // Get the magnet URL
    const magnetUrl = getMagnetUrl(ctx);
    if (!magnetUrl) {
      console.log('No magnet URL found for movie');
      return { embeds: [] };
    }

    console.log(`Using magnet URL: ${magnetUrl.substring(0, 50)}...`);

    // Create client
    client = createClient();

    // Add the torrent with a timeout
    const torrent = await withTimeout(
      addTorrent(client, magnetUrl),
      120000, // 2 minute timeout
      'Torrent loading timed out after 2 minutes',
    );

    console.log(`Torrent added successfully. Name: ${torrent.name}`);

    // Select the appropriate file
    const mediaTitle = ctx.media?.title || 'unknown';
    const selectedFile = selectAppropriateFile(torrent, mediaTitle);

    if (!selectedFile) {
      throw new Error('No suitable video file found in torrent');
    }

    // Create a stream server for the file
    streamServer = await withTimeout(
      createServerForFile(selectedFile),
      60000, // 1 minute timeout
      'Server creation timed out after 1 minute',
    );

    // Register resources for cleanup
    if (client && streamServer.server) {
      registerForCleanup(client, streamServer.server);
    }

    // Determine appropriate stream type based on file extension
    const fileExt = selectedFile.name.toLowerCase().split('.').pop();
    const isHls = false; // Direct file streaming, not HLS

    // Return the stream information
    return {
      stream: [
        {
          id: `zilestream-${torrent.infoHash}`,
          type: isHls ? 'hls' : 'file',
          [isHls ? 'playlist' : 'url']: streamServer.url,
          captions: [],
          flags: [flags.CORS_ALLOWED],
          headers: {},
        },
      ],
      embeds: [],
    };
  } catch (error: any) {
    console.error('Error in ZileStream movie provider:', error);

    // Clean up resources on error
    if (streamServer) {
      streamServer.cleanup();
    }

    if (client) {
      client.destroy();
    }

    return { embeds: [] };
  }
}

// Show scraper function (similar to movie scraper)
async function scrapeShow(ctx: ShowScrapeContext) {
  console.log('Starting ZileStream show scraper');
  let client: WebTorrent.Instance | null = null;
  let streamServer: StreamServer | null = null;

  try {
    // Get the magnet URL
    const magnetUrl = getMagnetUrl(ctx);
    if (!magnetUrl) {
      console.log('No magnet URL found for show episode');
      return { embeds: [] };
    }

    console.log(`Using magnet URL: ${magnetUrl.substring(0, 50)}...`);

    // Create client
    client = createClient();

    // Add the torrent with a timeout
    const torrent = await withTimeout(
      addTorrent(client, magnetUrl),
      120000, // 2 minute timeout
      'Torrent loading timed out after 2 minutes',
    );

    console.log(`Torrent added successfully. Name: ${torrent.name}`);

    // Select the appropriate file
    const mediaTitle = ctx.media?.title || 'unknown';
    const selectedFile = selectAppropriateFile(torrent, mediaTitle);

    if (!selectedFile) {
      throw new Error('No suitable video file found in torrent');
    }

    // Create a stream server for the file
    streamServer = await withTimeout(
      createServerForFile(selectedFile),
      60000, // 1 minute timeout
      'Server creation timed out after 1 minute',
    );

    // Register resources for cleanup
    if (client && streamServer.server) {
      registerForCleanup(client, streamServer.server);
    }

    // Determine appropriate stream type based on file extension
    const fileExt = selectedFile.name.toLowerCase().split('.').pop();
    const isHls = false; // Direct file streaming, not HLS

    // Return the stream information
    return {
      stream: [
        {
          id: `zilestream-${torrent.infoHash}`,
          type: isHls ? 'hls' : 'file',
          [isHls ? 'playlist' : 'url']: streamServer.url,
          captions: [],
          flags: [flags.CORS_ALLOWED],
          headers: {},
        },
      ],
      embeds: [],
    };
  } catch (error: any) {
    console.error('Error in ZileStream show provider:', error);

    // Clean up resources on error
    if (streamServer) {
      streamServer.cleanup();
    }

    if (client) {
      client.destroy();
    }

    return { embeds: [] };
  }
}

// Create and export the Sourcerer
export const zileScraper = makeSourcerer({
  id: 'zilestream',
  name: 'ZileStream',
  rank: 250,
  disabled: true,
  flags: [flags.CORS_ALLOWED],
  scrapeMovie,
  scrapeShow,
});

// Register cleanup handlers
process.on('exit', cleanupResources);
process.on('SIGINT', () => {
  cleanupResources();
  process.exit();
});
