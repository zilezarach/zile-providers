import { load } from 'cheerio';

import { flags } from '@/entrypoint/utils/targets';
import { SourcererEmbed, SourcererOutput, makeSourcerer } from '@/providers/base';
import { compareMedia } from '@/utils/compare';
import { MovieScrapeContext, ShowScrapeContext } from '@/utils/context';
import { NotFoundError } from '@/utils/errors';
import { headers } from '../embeds/whvx';

const baseUrl = 'https://mp4hydra.org/';

async function comboScraper(ctx: ShowScrapeContext | MovieScrapeContext): Promise<SourcererOutput> {
  const searchPage = await ctx.proxiedFetcher('/search', {
    baseUrl,
    query: {
      q: ctx.media.title,
    },
  });

  ctx.progress(40);

  const $search = load(searchPage);
  const searchResults: { title: string; year?: number | undefined; url: string }[] = [];

  $search('.search-details').each((_, element) => {
    const [, title, year] =
      $search(element)
        .find('a')
        .first()
        .text()
        .trim()
        .match(/^(.*?)\s*(?:\(?\s*(\d{4})(?:\s*-\s*\d{0,4})?\s*\)?)?\s*$/) || [];
    const url = $search(element).find('a').attr('href')?.split('/')[4];

    if (!title || !url) return;

    searchResults.push({ title, year: year ? parseInt(year, 10) : undefined, url });
  });

  const s = searchResults.find((x) => x && compareMedia(ctx.media, x.title, x.year))?.url;
  if (!s) throw new NotFoundError('No watchable item found');

  ctx.progress(60);

  const data: { playlist: { src: string; label: string }[]; servers: { [key: string]: string; auto: string } } =
    await ctx.proxiedFetcher('/info2?v=8', {
      method: 'POST',
      body: new URLSearchParams({ z: JSON.stringify([{ s, t: 'movie' }]) }),
      baseUrl,
    });
  if (!data.playlist[0].src || !data.servers) throw new NotFoundError('No watchable item found');
  // Define quality mapping
  const qualityMap: { [key: string]: string[] } = {
    hd: ['1080p', '720p'],
    sd: ['480p', '360p'],
  };

  // Get the quality from context (assuming ctx.quality is "hd" or "sd")
  const quality = 'hd'; // Default to 'hd' if quality is not provided

  // Select the playlist source based on quality
  const selectedPlaylist = data.playlist.find((p) => qualityMap[quality]?.includes(p.label));
  if (!selectedPlaylist) throw new Error(`No playlist found for quality: ${quality}`);

  const src = selectedPlaylist.src;
  ctx.progress(80);

  const embeds: SourcererEmbed[] = [];
  // rank the server as suggested by the api
  [
    data.servers[data.servers.auto],
    ...Object.values(data.servers).filter((x) => x !== data.servers[data.servers.auto] && x !== data.servers.auto),
  ].forEach((server, index) =>
    embeds.push({
      embedId: `mp4hydra-${index + 1}`,
      url: `${server}${data.playlist[0].src}`,
      headers: {
        Referer: baseUrl,
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      },
    }),
  );

  ctx.progress(90);

  return {
    embeds,
  };
}

export const mp4hydraScraper = makeSourcerer({
  id: 'mp4hydra',
  name: 'omega',
  rank: 350,
  flags: [flags.CORS_ALLOWED],
  scrapeMovie: comboScraper,
  scrapeShow: comboScraper,
});
