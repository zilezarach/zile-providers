import { load } from 'cheerio';

import { flags } from '@/entrypoint/utils/targets';
import { Caption, labelToLanguageCode } from '@/providers/captions';
import { Stream } from '@/providers/streams';
import { compareMedia } from '@/utils/compare';
import { MovieScrapeContext, ShowScrapeContext } from '@/utils/context';
import { NotFoundError } from '@/utils/errors';
import { convertPlaylistsToDataUrls } from '@/utils/playlist';

import { InfoResponse } from './types';
import { SourcererOutput, makeSourcerer } from '../../base';

const baseUrl = 'https://soaper.live';

const universalScraper = async (ctx: MovieScrapeContext | ShowScrapeContext): Promise<SourcererOutput> => {
  const searchResult = await ctx.proxiedFetcher('/search.html', {
    baseUrl,
    query: {
      keyword: ctx.media.title,
    },
  });
  const search$ = load(searchResult);

  const searchResults: { title: string; year?: number | undefined; url: string }[] = [];

  search$('.thumbnail').each((_, element) => {
    const title = search$(element).find('h5').find('a').first().text().trim();
    const year = search$(element).find('.img-tip').first().text().trim();
    const url = search$(element).find('h5').find('a').first().attr('href');

    if (!title || !url) return;

    searchResults.push({ title, year: year ? parseInt(year, 10) : undefined, url });
  });

  let showLink = searchResults.find((x) => x && compareMedia(ctx.media, x.title, x.year))?.url;
  if (!showLink) throw new NotFoundError('Content not found');

  if (ctx.media.type === 'show') {
    const seasonNumber = ctx.media.season.number;
    const episodeNumber = ctx.media.episode.number;
    const showPage = await ctx.proxiedFetcher(showLink, { baseUrl });
    const showPage$ = load(showPage);
    const seasonBlock = showPage$('h4')
      .filter((_, el) => showPage$(el).text().trim().split(':')[0].trim() === `Season${seasonNumber}`)
      .parent();
    const episodes = seasonBlock.find('a').toArray();
    showLink = showPage$(
      episodes.find((el) => parseInt(showPage$(el).text().split('.')[0], 10) === episodeNumber),
    ).attr('href');
  }
  if (!showLink) throw new NotFoundError('Content not found');
  const contentPage = await ctx.proxiedFetcher(showLink, { baseUrl });
  const contentPage$ = load(contentPage);

  const pass = contentPage$('#hId').attr('value');

  if (!pass) throw new NotFoundError('Content not found');

  const formData = new URLSearchParams();
  formData.append('pass', pass);
  formData.append('e2', '0');
  formData.append('server', '0');

  const infoEndpoint = ctx.media.type === 'show' ? '/home/index/getEInfoAjax' : '/home/index/getMInfoAjax';
  const streamRes = await ctx.proxiedFetcher<string>(infoEndpoint, {
    baseUrl,
    method: 'POST',
    body: formData,
    headers: {
      referer: `${baseUrl}${showLink}`,
    },
  });

  const streamResJson: InfoResponse = JSON.parse(streamRes);

  const captions: Caption[] = [];
  for (const sub of streamResJson.subs) {
    // Some subtitles are named <Language>.srt, some are named <LanguageCode>:hi, or just <LanguageCode>
    let language: string | null = '';
    if (sub.name.includes('.srt')) {
      language = labelToLanguageCode(sub.name.split('.srt')[0]);
    } else if (sub.name.includes(':')) {
      language = sub.name.split(':')[0];
    } else {
      language = sub.name;
    }
    if (!language) continue;

    captions.push({
      id: sub.path,
      url: `${baseUrl}${sub.path}`,
      type: 'srt',
      hasCorsRestrictions: false,
      language,
    });
  }

  return {
    embeds: [],
    stream: [
      {
        id: 'primary',
        playlist: await convertPlaylistsToDataUrls(ctx.proxiedFetcher, `${baseUrl}/${streamResJson.val}`),
        type: 'hls',
        proxyDepth: 2,
        flags: [flags.CORS_ALLOWED],
        captions,
      },
      ...(streamResJson.val_bak
        ? [
            {
              id: 'backup',
              playlist: await convertPlaylistsToDataUrls(ctx.proxiedFetcher, `${baseUrl}/${streamResJson.val_bak}`),
              type: 'hls',
              flags: [flags.CORS_ALLOWED],
              proxyDepth: 2,
              captions,
            } as Stream,
          ]
        : []),
    ],
  };
};

export const soaperTvScraper = makeSourcerer({
  id: 'soapertv',
  name: 'SoaperTV',
  rank: 160,
  flags: [flags.CORS_ALLOWED],
  scrapeMovie: universalScraper,
  scrapeShow: universalScraper,
});
