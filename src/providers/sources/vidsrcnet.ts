import { load } from 'cheerio';
import { flags } from '@/entrypoint/utils/targets';
import { SourcererEmbed, SourcererOutput, makeSourcerer } from '@/providers/base';
import { compareMedia } from '@/utils/compare';
import { MovieScrapeContext, ShowScrapeContext } from '@/utils/context';
import { NotFoundError } from '@/utils/errors';
import { decrypt } from '@/utils/decoder'; // Assuming the decoder is moved to utils

const baseUrl = 'https://whisperingauroras.com';

async function comboScraper(ctx: ShowScrapeContext | MovieScrapeContext): Promise<SourcererOutput> {
  // First determine if we're searching for a movie or TV show
  const mediaType = 'media' in ctx && 'season' in ctx.media ? 'tv' : 'movie';

  // We'll use TMDB ID if available, otherwise search by title
  let embedUrl = '';
  let tmdbId = '';

  if ('tmdbId' in ctx.media && ctx.media.tmdbId) {
    tmdbId = ctx.media.tmdbId.toString();
    embedUrl = `https://vidsrc.net/embed/${mediaType}?tmdb=${tmdbId}`;

    if (mediaType === 'tv' && 'season' in ctx.media && 'episode' in ctx.media) {
      embedUrl += `&season=${ctx.media.season}&episode=${ctx.media.episode}`;
    }
  } else {
    // If no TMDB ID, would need to implement a search functionality here
    // For now, throw error since original code uses TMDB ID
    throw new NotFoundError('TMDB ID required for this source');
  }

  ctx.progress(30);

  // Fetch the embed page
  const embedPage = await ctx.proxiedFetcher(embedUrl, {
    baseUrl: '',
  });

  ctx.progress(50);

  // Load the HTML using cheerio
  const $ = load(embedPage);

  // Extract the servers list
  const servers: { name: string | null; dataHash: string | null }[] = [];
  const title = $('title').text() || '';

  // Update baseUrl if needed based on iframe src
  const iframeSrc = $('iframe').attr('src') || '';
  const actualBaseUrl = iframeSrc.startsWith('//')
    ? new URL('https:' + iframeSrc).origin
    : iframeSrc
      ? new URL(iframeSrc).origin
      : baseUrl;

  $('.serversList .server').each((_, element) => {
    const server = $(element);
    servers.push({
      name: server.text().trim(),
      dataHash: server.attr('data-hash') || null,
    });
  });

  ctx.progress(70);

  // No servers found
  if (servers.length === 0) {
    throw new NotFoundError('No servers found');
  }

  // Fetch RCP data for each server
  const rcpFetchPromises = servers.map((server) => {
    if (!server.dataHash) return null;
    return ctx.proxiedFetcher(`/rcp/${server.dataHash}`, {
      baseUrl: actualBaseUrl,
    });
  });

  const rcpResponses = await Promise.all(rcpFetchPromises.filter((p) => p !== null) as Promise<string>[]);

  ctx.progress(80);

  // Process RCP data
  const embeds: SourcererEmbed[] = [];
  let embedCounter = 1;

  for (const rcpResponse of rcpResponses) {
    const regex = /src:\s*'([^']*)'/;
    const match = rcpResponse.match(regex);

    if (!match || !match[1]) continue;

    const rcpData = match[1];

    // Process ProRCP data if needed
    if (rcpData.startsWith('/prorcp/')) {
      const prorcp = rcpData.replace('/prorcp/', '');

      const prorcpResponse = await ctx.proxiedFetcher(`/prorcp/${prorcp}`, {
        baseUrl: actualBaseUrl,
      });

      // Extract the decrypt function details
      const scripts = prorcpResponse.match(/<script\s+src="\/([^"]*\.js)\?\_=([^"]*)"><\/script>/gm);
      const scriptSrc = scripts?.[scripts.length - 1]?.includes('cpt.js')
        ? scripts?.[scripts.length - 2]?.replace(/.*src="\/([^"]*\.js)\?\_=([^"]*)".*/, '$1?_=$2')
        : scripts?.[scripts.length - 1]?.replace(/.*src="\/([^"]*\.js)\?\_=([^"]*)".*/, '$1?_=$2');

      if (scriptSrc) {
        const jsCode = await ctx.proxiedFetcher(`/${scriptSrc}`, {
          baseUrl: actualBaseUrl,
        });

        // Extract the decrypt function name and param
        const decryptRegex = /{}\}window\[([^"]+)\("([^"]+)"\)/;
        const decryptMatches = jsCode.match(decryptRegex);

        if (decryptMatches && decryptMatches.length >= 3) {
          const decryptFn = decryptMatches[1].toString().trim();
          const decryptParam = decryptMatches[2].toString().trim();
          const id = decrypt(decryptParam, decryptFn);

          // Extract the encrypted data
          const $prorcp = load(prorcpResponse);
          const data = $prorcp('#' + id);

          if (data.length > 0) {
            const result = await decrypt(data.text(), decryptParam);

            if (result) {
              embeds.push({
                embedId: `whisperingauroras-${embedCounter}`,
                url: result,
              });

              embedCounter++;
            }
          }
        }
      }
    }
  }

  ctx.progress(90);

  if (embeds.length === 0) {
    throw new NotFoundError('No watchable streams found');
  }

  return {
    embeds,
  };
}

export const embedSuScraper = makeSourcerer({
  id: 'whisperingauroras',
  name: 'WhisperingAuroras',
  rank: 40,
  disabled: true,
  flags: [flags.CORS_ALLOWED],
  scrapeMovie: comboScraper,
  scrapeShow: comboScraper,
});
