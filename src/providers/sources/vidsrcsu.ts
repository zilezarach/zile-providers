import { flags } from '@/entrypoint/utils/targets';
import { SourcererOutput, makeSourcerer } from '@/providers/base';
import { MovieScrapeContext, ShowScrapeContext } from '@/utils/context';
import { NotFoundError } from '@/utils/errors';

async function comboScraper(ctx: ShowScrapeContext | MovieScrapeContext): Promise<SourcererOutput> {
  // Construct the embed URL based on media type
  const embedUrl = `https://vidsrc.su/embed/${ctx.media.type === 'movie' ? `movie/${ctx.media.tmdbId}` : `tv/${ctx.media.tmdbId}/${ctx.media.season.number}/${ctx.media.episode.number}`}`;

  // Fetch the embed page
  const embedPage = await ctx.proxiedFetcher(embedUrl);

  // Extract the fixedServers array content
  const fixedServersMatch = embedPage.match(/const fixedServers = \[([\s\S]*?)\];/);
  if (!fixedServersMatch) {
    throw new NotFoundError('Could not find server list');
  }

  const fixedServersContent = fixedServersMatch[1];

  // Extract all server entries with their labels and URLs
  const serverEntryRegex = /{\s*label:\s*'([^']+)',\s*url:\s*'([^']*?)'\s*}/g;
  const serverEntries = [...fixedServersContent.matchAll(serverEntryRegex)];

  // Create array of server objects with label and URL
  const servers = serverEntries
    .map((match) => ({
      label: match[1],
      url: match[2].trim(),
    }))
    .filter((server) => server.url && server.url !== ''); // Filter out empty URLs

  if (servers.length === 0) {
    throw new NotFoundError('No valid streaming servers found');
  }

  // Prioritize servers based on their label
  const serverRanks: Record<string, number> = {
    'Server 3': 90,
    'Server 7': 85,
    'Server 8': 80,
    'Server 12': 75,
    'Server 16': 70,
    'Server 19': 65,
    'Server 11': 60,
    'Server 10': 55,
    'Server 5': 50,
    'Server 1': 45,
    'Server 2': 40,
    'Server 6': 35,
    'Server 4': 30,
    'Server 9': 25,
    'Server 13': 20,
    'Server 15': 15,
    'Server 17': 10,
    'Server 18': 5,
  };

  // Sort servers by rank
  const rankedServers = servers.sort((a, b) => {
    const rankA = serverRanks[a.label] || 0;
    const rankB = serverRanks[b.label] || 0;
    return rankB - rankA;
  });

  // Try each server until one works
  for (const server of rankedServers) {
    if (!server.url) continue;
    console.log(`Trying ${server.label} with URL: ${server.url}`);

    try {
      // Standardize URL format
      let streamUrl = server.url;
      let headers: Record<string, string> = {
        Referer: embedUrl,
        Origin: 'https://vidsrc.su',
      };

      // Check if the URL contains orbitproxy.cc
      if (server.url.includes('orbitproxy.cc')) {
        try {
          // First fetch the raw HLS manifest from the proxy to verify it's valid
          const proxyResponse = await ctx.proxiedFetcher(server.url, { headers });

          // If we got a valid m3u8 response, use it directly
          if (proxyResponse.includes('#EXTM3U')) {
            // Make sure the URL doesn't have any malformed components
            streamUrl = cleanUrl(server.url);
            return {
              embeds: [],
              stream: [
                {
                  id: 'primary',
                  playlist: streamUrl,
                  type: 'hls',
                  headers,
                  flags: [flags.CORS_ALLOWED],
                  captions: [],
                  quality: 'unknown',
                  source: 'vidsrc.su (FlixHQ)',
                },
              ],
            };
          }

          // Extract the encoded part from the URL
          let originalUrl = null;
          let originHeader = 'https://vidsrc.su';
          let refererHeader = embedUrl;

          try {
            const urlParts = server.url.split('/');
            const lastPart = urlParts[urlParts.length - 1];
            const encodedPart = lastPart.split('.')[0]; // Remove .m3u8 if present

            // Try to decode the base64 data
            const decodedData = Buffer.from(encodedPart, 'base64').toString('utf-8');
            try {
              const jsonData = JSON.parse(decodedData);
              // Get the original source URL and headers
              originalUrl = jsonData.u;
              originHeader = jsonData.o || 'https://vidsrc.su';
              refererHeader = jsonData.r || jsonData.o || 'https://vidsrc.su';
            } catch (jsonError) {
              console.error('Failed to parse JSON from decoded data:', jsonError);
              // Continue with the proxy URL as fallback
            }
          } catch (decodeError) {
            console.error('Failed to decode base64 data:', decodeError);
            // Continue with the proxy URL as fallback
          }

          if (originalUrl) {
            // Set up headers for the original URL
            headers = {
              Referer: refererHeader,
              Origin: originHeader,
            };

            // Clean up the URL format
            streamUrl = cleanUrl(originalUrl);
          } else {
            // Use the proxy URL as fallback
            streamUrl = cleanUrl(server.url);
          }
        } catch (e) {
          console.error('Failed to process proxy data:', e);
          // Continue with the proxy URL as fallback
          streamUrl = cleanUrl(server.url);
        }
      } else {
        // For direct URLs, ensure they're properly formatted
        streamUrl = cleanUrl(server.url);
      }

      // If we've reached here, use the URL directly
      return {
        embeds: [],
        stream: [
          {
            id: 'primary',
            playlist: streamUrl,
            type: 'hls',
            headers,
            flags: [flags.CORS_ALLOWED],
            captions: [],
            quality: 'unknown',
            source: 'vidsrc.su (FlixHQ)',
          },
        ],
      };
    } catch (error) {
      console.error(`Error with ${server.label}:`, error);
      // Continue to the next server on error
    }
  }

  throw new NotFoundError('No working streaming server found');
}

// Helper function to clean and validate URLs
function cleanUrl(url: string): string {
  // Ensure the URL is properly formatted
  try {
    // Fix double slashes (except after http:/ or https:/)
    let cleanedUrl = url.replace(/([^:])\/\//g, '$1/');

    // Ensure the URL has a proper protocol
    if (!cleanedUrl.startsWith('http')) {
      cleanedUrl = `https://${cleanedUrl}`;
    }

    // Validate the URL format
    new URL(cleanedUrl);
    return cleanedUrl;
  } catch (e) {
    console.error('Invalid URL format:', url, e);
    return url; // Return original if cleaning fails
  }
}

export const vidsrcsuScraper = makeSourcerer({
  id: 'vidsrcsu',
  name: 'alpha',
  rank: 370,
  flags: [flags.CORS_ALLOWED],
  scrapeMovie: comboScraper,
  scrapeShow: comboScraper,
});
