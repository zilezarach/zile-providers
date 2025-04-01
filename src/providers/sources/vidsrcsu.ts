import { flags } from '@/entrypoint/utils/targets';
import { SourcererOutput, makeSourcerer } from '@/providers/base';
import { MovieScrapeContext, ShowScrapeContext } from '@/utils/context';
import { NotFoundError } from '@/utils/errors';

async function comboScraper(ctx: ShowScrapeContext | MovieScrapeContext): Promise<SourcererOutput> {
  const embedPage = await ctx.proxiedFetcher(
    `https://vidsrc.su/embed/${ctx.media.type === 'movie' ? `movie/${ctx.media.tmdbId}` : `tv/${ctx.media.tmdbId}/${ctx.media.season.number}/${ctx.media.episode.number}`}`,
  );

  const servers = [...embedPage.matchAll(/label: 'Server (1|2|3|4|5|16|19)', url: '(https.*)'/g)] // only server 1,2 and 3 are flixhq
    .sort((a, b) => {
      // ranking for servers
      const ranks: Record<string, number> = {
        '1': 10,
        '5': 20,
        '4': 30,
        '3': 40,
        '2': 60,
        '19': 70,
        '16': 90,
      }; // server 8 > 5 > 2 ...
      return ranks[b[1]] - ranks[a[1]];
    })
    .map((x) => x[2]);

  if (!servers[0]) throw new NotFoundError('No flixhq playlist found');

  return {
    embeds: [],
    stream: [
      {
        id: 'primary',
        playlist: servers[0],
        type: 'hls',
        flags: [flags.CORS_ALLOWED],
        captions: [],
      },
    ],
  };
}
export const vidsrcsuScraper = makeSourcerer({
  id: 'vidsrcsu',
  name: 'vidsrc.su (FlixHQ)',
  rank: 229,
  disabled: true,
  flags: [flags.CORS_ALLOWED],
  scrapeMovie: comboScraper,
  scrapeShow: comboScraper,
});
