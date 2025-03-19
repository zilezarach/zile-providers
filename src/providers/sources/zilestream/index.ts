import { Stream } from '@/providers/streams';
import { MovieScrapeContext, ShowScrapeContext } from '@/utils/context';
import { SourcererOutput, makeSourcerer } from '@/providers/base';
import { flags } from '@/entrypoint/utils/targets';
import { createWebtorClient, TorrentFile } from './webtorClient';

// Add a timeout utility
const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> => {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`Operation timed out after ${ms}ms`)), ms),
  );
  return Promise.race([promise, timeout]);
};

// Get magnet URL from the context
function getMagnetUrl(ctx: MovieScrapeContext | ShowScrapeContext): string | null {
  // Debug log to see the structure of the context
  console.log('Context structure:', JSON.stringify(ctx, null, 2));

  // Check if the magnet URL is directly in the context (based on the logs)
  if (ctx.magnetUrl) {
    console.log('Found magnet URL directly in context');
    return ctx.magnetUrl;
  }

  // Log what we're looking for to help with debugging
  console.log('Looking for magnet URL in context');

  // First, check if the context has a magnetUrl property directly
  if ('magnetUrl' in ctx && ctx.magnetUrl) {
    console.log('Found magnet URL in ctx.magnetUrl');
    return ctx.magnetUrl;
  }

  // Next, check if it's in the media object
  if (ctx.media && typeof ctx.media === 'object') {
    if ('magnetUrl' in ctx.media && ctx.media.magnetUrl) {
      console.log('Found magnet URL in ctx.media.magnetUrl');
      return ctx.media.magnetUrl;
    }

    // For torrents, check if there's a torrents property
    if ('torrents' in ctx.media && Array.isArray(ctx.media.torrents) && ctx.media.torrents.length > 0) {
      const torrent = ctx.media.torrents[0];
      if (torrent && 'magnetUrl' in torrent && torrent.magnetUrl) {
        console.log('Found magnet URL in ctx.media.torrents[0].magnetUrl');
        return torrent.magnetUrl;
      }
    }

    // For episodes, check if there's an episode property with torrents
    if ('episode' in ctx.media && ctx.media.episode && typeof ctx.media.episode === 'object') {
      const episode = ctx.media.episode;

      if ('magnetUrl' in episode && episode.magnetUrl) {
        console.log('Found magnet URL in ctx.media.episode.magnetUrl');
        return episode.magnetUrl;
      }

      if ('torrents' in episode && Array.isArray(episode.torrents) && episode.torrents.length > 0) {
        const torrent = episode.torrents[0];
        if (torrent && 'magnetUrl' in torrent && torrent.magnetUrl) {
          console.log('Found magnet URL in ctx.media.episode.torrents[0].magnetUrl');
          return torrent.magnetUrl;
        }
      }
    }
  }

  console.log('No magnet URL found in context');
  return null;
}

// Select the best file from the files list
function selectAppropriateFile(files: TorrentFile[], mediaTitle: string): TorrentFile {
  if (!files || files.length === 0) {
    throw new Error('No files found in torrent');
  }

  // Log all files for debugging
  console.log('Available files in torrent:');
  files.forEach((file, index) => {
    console.log(`${index + 1}. ${file.path} (${Math.round(file.length / 1024 / 1024)}MB)`);
  });

  // Filter out non-video files (based on common extensions)
  const videoExtensions = ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm', '.m4v'];
  const videoFiles = files.filter((file) => {
    const lowercasePath = file.path.toLowerCase();
    return videoExtensions.some((ext) => lowercasePath.endsWith(ext));
  });

  if (videoFiles.length === 0) {
    throw new Error('No video files found in torrent');
  }

  // Sort by size (descending) - usually the largest file is the main video
  videoFiles.sort((a, b) => b.length - a.length);

  // Return the largest video file
  return videoFiles[0];
}

// The main scraper function for movies
async function scrapeMovie(ctx: MovieScrapeContext): Promise<SourcererOutput> {
  console.log('Starting Webtor movie scraper');

  // Get the magnet URL first
  const magnetUrl = getMagnetUrl(ctx);
  if (!magnetUrl) {
    console.log('No magnet URL found for movie');
    return { embeds: [] };
  }

  console.log(`Found magnet URL: ${magnetUrl.substring(0, 50)}...`);

  // Initialize the client
  const client = createWebtorClient({
    apiUrl: process.env.WEBTOR_API_URL || 'http://localhost:8096',
    debug: true,
  });

  try {
    console.log(`Processing magnet URL: ${magnetUrl.substring(0, 50)}...`);

    // Add the resource with a timeout
    const resource = await withTimeout(
      client.addResourceFromMagnet(magnetUrl),
      120000, // 2 minute timeout
    );

    console.log(`Resource added successfully. ID: ${resource.id}`);

    // List the content of the resource
    const contentList = await withTimeout(
      client.listResourceContent(resource.id),
      60000, // 1 minute timeout
    );

    console.log(`Content listed. Number of files: ${contentList.files.length}`);

    // Select the appropriate file
    const selectedFile = selectAppropriateFile(contentList.files, ctx.media.title);
    console.log(`Selected file path: ${selectedFile.path}`);

    // Get a streamable URL with a timeout
    const exportInfo = await withTimeout(
      client.getExportUrl(resource.id, selectedFile.path),
      60000, // 1 minute timeout
    );

    console.log(`Export URL obtained: ${exportInfo.url}`);

    // Return the stream information
    return {
      stream: [
        {
          id: `webtor-${resource.id}`,
          type: 'hls',
          playlist: exportInfo.url,
          captions: [],
          flags: [flags.CORS_ALLOWED],
          headers: {},
        },
      ],
      embeds: [],
    };
  } catch (error: any) {
    console.error('Error in Webtor movie provider:', error);
    if (error.response) {
      console.error('Error response:', error.response?.status, error.response?.data);
    }
    return { embeds: [] };
  }
}

// The main scraper function for shows
async function scrapeShow(ctx: ShowScrapeContext): Promise<SourcererOutput> {
  console.log('Starting Webtor show scraper');

  // Get the magnet URL first
  const magnetUrl = getMagnetUrl(ctx);
  if (!magnetUrl) {
    console.log('No magnet URL found for show episode');
    return { embeds: [] };
  }

  console.log(`Found magnet URL: ${magnetUrl.substring(0, 50)}...`);

  // Initialize the client
  const client = createWebtorClient({
    apiUrl: process.env.WEBTOR_API_URL || 'http://localhost:8080',
    debug: true,
  });

  try {
    console.log(`Processing magnet URL: ${magnetUrl.substring(0, 50)}...`);

    // Add the resource with a timeout
    const resource = await withTimeout(
      client.addResourceFromMagnet(magnetUrl),
      120000, // 2 minute timeout
    );

    console.log(`Resource added successfully. ID: ${resource.id}`);

    // List the content of the resource
    const contentList = await withTimeout(
      client.listResourceContent(resource.id),
      60000, // 1 minute timeout
    );

    console.log(`Content listed. Number of files: ${contentList.files.length}`);

    // Select the appropriate file
    const selectedFile = selectAppropriateFile(contentList.files, ctx.media.title);
    console.log(`Selected file path: ${selectedFile.path}`);

    // Get a streamable URL with a timeout
    const exportInfo = await withTimeout(
      client.getExportUrl(resource.id, selectedFile.path),
      60000, // 1 minute timeout
    );

    console.log(`Export URL obtained: ${exportInfo.url}`);

    // Return the stream information
    return {
      stream: [
        {
          id: `webtor-${resource.id}`,
          type: 'hls',
          playlist: exportInfo.url,
          captions: [],
          flags: [flags.CORS_ALLOWED],
          headers: {},
        },
      ],
      embeds: [],
    };
  } catch (error: any) {
    console.error('Error in Webtor show provider:', error);
    if (error.response) {
      console.error('Error response:', error.response?.status, error.response?.data);
    }
    return { embeds: [] };
  }
}

// Create and export the Sourcerer
export const webtorScraper = makeSourcerer({
  id: 'webtor',
  name: 'Webtor',
  rank: 100,
  flags: [flags.CORS_ALLOWED],
  scrapeMovie,
  scrapeShow,
});
