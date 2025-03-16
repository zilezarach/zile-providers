import webtor from '@webtor/platform-sdk-js';
import { SourcererOutput, makeSourcerer } from '@/providers/base';
import { MovieScrapeContext, ShowScrapeContext } from '@/utils/context';
import { flags } from '@/entrypoint/utils/targets';
import { TorrentFile, ParsedTorrent } from '@webtor/platform-sdk-js';

// Initialize the SDK with your configuration options
// Ensure the API URL doesn't have trailing slashes
const sdk = webtor({
  apiUrl: (process.env.WEBTOR_API_URL || 'https://streamzile.0xzile.sbs').replace(/\/$/, ''),
  apiKey: process.env.WEBTOR_API_KEY || '68db19f4-5f86-4fa3-ad94-9035673bbcaf',
  // Add a timeout if needed
  statsRetryInterval: 5000,
});

// Add a timeout utility
const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> => {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`Operation timed out after ${ms}ms`)), ms),
  );
  return Promise.race([promise, timeout]);
};

async function webtorScraper(ctx: MovieScrapeContext | ShowScrapeContext): Promise<SourcererOutput> {
  console.log('Starting Webtor scraper');

  try {
    // Log if magnetUrl exists in context
    if (ctx.magnetUrl) {
      console.log(`MagnetUrl found in context: ${ctx.magnetUrl.substring(0, 50)}...`);
    } else {
      console.log('No magnetUrl in context');
      throw new Error('No magnet URL provided');
    }

    // Fetch the torrent from the magnet URI with a timeout
    console.log('Fetching torrent from magnet URL...');
    const torrent = await withTimeout<ParsedTorrent>(
      sdk.magnet.fetchTorrent(ctx.magnetUrl),
      60000, // 60 second timeout
    );

    console.log(`Torrent fetched successfully. InfoHash: ${torrent.infoHash}`);
    console.log(`Torrent name: ${torrent.name}`);
    console.log(`Number of files: ${torrent.files.length}`);

    // Set expiration time for the torrent (in seconds)
    const expire = 60 * 60 * 24; // 24 hours
    console.log('Pushing torrent to webtor...');
    await sdk.torrent.push(torrent, expire);
    console.log('Torrent pushed successfully');

    // Get a seeder instance for the torrent
    const seeder = sdk.seeder.get(torrent.infoHash);

    // Select the appropriate file
    console.log('Selecting appropriate file from torrent...');
    const filePath = selectAppropriateFile(torrent.files, ctx.media);
    console.log(`Selected file path: ${filePath}`);

    // Get a streamable URL
    console.log('Getting stream URL...');
    const streamUrl = await withTimeout<string>(
      seeder.streamUrl(filePath),
      30000, // 30 second timeout
    );
    console.log(`Stream URL obtained: ${streamUrl.substring(0, 50)}...`);

    // Check if streamUrl exists
    if (!streamUrl) {
      throw new Error('Failed to get stream URL from webtor');
    }

    return {
      stream: [
        {
          id: `webtor-${torrent.infoHash}`,
          type: 'hls',
          playlist: streamUrl,
          captions: [],
          flags: [flags.CORS_ALLOWED],
          headers: {},
        },
      ],
      embeds: [],
    };
  } catch (error: any) {
    // Use any type for error to handle various error structures
    console.error('Error in Webtor provider:', error);
    // Include more details in the error message for better debugging
    if (error.response) {
      console.error('Error response:', error.response.status, error.response.data);
    }
    throw new Error(`Failed to fetch stream via Webtor: ${error.message}`);
  }
}

// Helper function to select the best file in the torrent
function selectAppropriateFile(files: TorrentFile[], media: any): string {
  if (!files || files.length === 0) {
    throw new Error('No files found in torrent');
  }

  // Log all files for debugging
  console.log('Available files in torrent:');
  files.forEach((file, index) => {
    console.log(`${index}: ${file.path} (${formatBytes(file.length)})`);
  });

  // Filter for video files
  const videoFiles = files.filter((file) => {
    const ext = file.path.split('.').pop()?.toLowerCase() || '';
    return ['mp4', 'mkv', 'avi', 'mov', 'webm', 'm4v'].includes(ext);
  });

  if (videoFiles.length === 0) {
    console.log('No video files found, using largest file instead');
    // Fall back to using the largest file
    files.sort((a, b) => b.length - a.length);
    return files[0].path;
  }

  console.log(`Found ${videoFiles.length} video files`);

  // Sort by size (largest first) - usually the highest quality
  videoFiles.sort((a, b) => b.length - a.length);

  // Log the selected file
  console.log(`Selected video file: ${videoFiles[0].path} (${formatBytes(videoFiles[0].length)})`);

  return videoFiles[0].path;
}

// Helper function to format bytes
function formatBytes(bytes: number, decimals: number = 2): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Create the provider using the makeSourcerer function
export const zilescraper = makeSourcerer({
  id: 'webtor',
  name: 'Webtor Streaming',
  rank: 100,
  disabled: false,
  externalSource: false,
  flags: [flags.CORS_ALLOWED],
  scrapeMovie: webtorScraper,
  scrapeShow: webtorScraper,
});
