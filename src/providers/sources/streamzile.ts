// src/providers/webtor.ts
import webtor from '@webtor/platform-sdk-js';
import { SourcererOutput, makeSourcerer, SourcererEmbed } from '@/providers/base';
import { MovieScrapeContext, ShowScrapeContext } from '@/utils/context';
import { flags } from '@/entrypoint/utils/targets';

// Initialize the SDK with your configuration options
const sdk = webtor({
  apiUrl: process.env.WEBTOR_API_URL || 'https://streamzile.0xzile.sbs',
  apiKey: process.env.WEBTOR_API_KEY || 'your-api-key',
});

export type WebtorStreamResult = {
  streamUrl: string;
  provider: string;
  type: string;
};

// Modified scraper function to handle both context-based and direct magnet URLs
async function webtorScraper(ctx: MovieScrapeContext | ShowScrapeContext): Promise<SourcererOutput> {
  try {
    // Check if a magnet URL was directly provided in the context
    const magnetUri = ctx.magnetUrl || (await findTorrentForMedia(ctx.media));

    if (!magnetUri) {
      throw new Error('No magnet URL provided or found');
    }

    // Fetch the torrent from the magnet URI
    const torrent = await sdk.magnet.fetchTorrent(magnetUri);

    // Set expiration time for the torrent (in seconds)
    const expire = 60 * 60 * 24; // 24 hours
    await sdk.torrent.push(torrent, expire);

    // Get a seeder instance for the torrent
    const seeder = sdk.seeder.get(torrent.infoHash);

    // Select the appropriate file
    const filePath = selectAppropriateFile(torrent.files, ctx.media);

    const embeds: SourcererEmbed[] = [];

    // Get a streamable URL
    const streamUrl = await seeder.streamUrl(filePath);

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
      embeds,
    };
  } catch (error) {
    console.error('Error in Webtor provider:', error);
    throw new Error('Failed to fetch stream via Webtor');
  }
}

// Helper function to select the best file in the torrent
function selectAppropriateFile(files: any[], media: any): string {
  // Filter for video files
  const videoFiles = files.filter((file) => {
    const ext = file.path.split('.').pop().toLowerCase();
    return ['mp4', 'mkv', 'avi', 'mov', 'webm'].includes(ext);
  });

  if (videoFiles.length === 0) {
    throw new Error('No video files found in torrent');
  }

  // Sort by size (largest first) - usually the highest quality
  videoFiles.sort((a, b) => b.length - a.length);

  // Return the largest video file (or implement more sophisticated selection)
  return videoFiles[0].path;
}

// This would need to be implemented to find torrents based on media info
async function findTorrentForMedia(media: any): Promise<string | null> {
  // Placeholder - implement your torrent search logic here
  return null;
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
