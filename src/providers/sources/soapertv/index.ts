import { load } from 'cheerio';
import { flags } from '@/entrypoint/utils/targets';
import { Caption, labelToLanguageCode } from '@/providers/captions';
import { compareMedia } from '@/utils/compare';
import { MovieScrapeContext, ShowScrapeContext } from '@/utils/context';
import { NotFoundError } from '@/utils/errors';
import { SourcererOutput, makeSourcerer } from '../../base';

// Define InfoResponse interface
interface InfoResponse {
  val?: string;
  link?: string;
  stream?: string;
  source?: string;
  url?: string;
  subs?: Array<{
    name: string;
    path: string;
  }>;
}

const baseUrl = 'https://soaper.live';

const universalScraper = async (ctx: MovieScrapeContext | ShowScrapeContext): Promise<SourcererOutput> => {
  console.log(`Searching for: ${ctx.media.title} (${ctx.media.year})`);

  // Search for the content
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

  console.log(`Found ${searchResults.length} search results`);

  let showLink = searchResults.find((x) => x && compareMedia(ctx.media, x.title, x.year))?.url;
  if (!showLink) throw new NotFoundError(`Content not found: ${ctx.media.title} (${ctx.media.year})`);

  console.log(`Found matching content at: ${showLink}`);

  // For TV shows, navigate to the specific episode
  if (ctx.media.type === 'show') {
    const seasonNumber = ctx.media.season.number;
    const episodeNumber = ctx.media.episode.number;

    console.log(`Looking for Season ${seasonNumber}, Episode ${episodeNumber}`);

    const showPage = await ctx.proxiedFetcher(showLink, { baseUrl });
    const showPage$ = load(showPage);

    // Look for the season header which could be in various formats
    const seasonBlocks = showPage$('h4').filter((_, el) => {
      const text = showPage$(el).text().trim();
      return (
        text.includes(`Season${seasonNumber}`) || text.includes(`Season ${seasonNumber}`) || text === `S${seasonNumber}`
      );
    });

    if (seasonBlocks.length === 0) {
      throw new NotFoundError(`Season ${seasonNumber} not found`);
    }

    const seasonBlock = seasonBlocks.first().parent();
    const episodes = seasonBlock.find('a').toArray();

    // Find the episode link by checking both formats (e.g., "1. Episode Name" or just "1")
    const episode = episodes.find((el) => {
      const text = showPage$(el).text().trim();
      return text.startsWith(`${episodeNumber}.`) || text === `${episodeNumber}`;
    });

    if (!episode) {
      throw new NotFoundError(`Episode ${episodeNumber} not found in Season ${seasonNumber}`);
    }

    showLink = showPage$(episode).attr('href');
    if (!showLink) {
      throw new NotFoundError(`Episode link not found for S${seasonNumber}E${episodeNumber}`);
    }

    console.log(`Found episode link: ${showLink}`);
  }

  // Fetch the content page to get the pass value
  const contentPage = await ctx.proxiedFetcher(showLink, { baseUrl });
  const contentPage$ = load(contentPage);

  const pass = contentPage$('#hId').attr('value');
  if (!pass) {
    throw new NotFoundError('Pass value not found on content page');
  }

  console.log(`Found pass value: ${pass}`);

  // Create form data for the stream request
  const formData = new URLSearchParams();
  formData.append('pass', pass);
  formData.append('e2', '0');
  formData.append('server', '0');

  // Select the right endpoint based on media type
  const infoEndpoint = ctx.media.type === 'show' ? '/home/index/getEInfoAjax' : '/home/index/getMInfoAjax';

  console.log(`Making request to: ${infoEndpoint}`);

  // Make the request for stream info
  const streamRes = await ctx.proxiedFetcher<string>(infoEndpoint, {
    baseUrl,
    method: 'POST',
    body: formData,
    headers: {
      Referer: `${baseUrl}${showLink}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-Requested-With': 'XMLHttpRequest',
    },
  });

  // Parse the JSON response
  let streamResJson: InfoResponse;
  try {
    streamResJson = JSON.parse(streamRes);
    console.log('Stream response:', JSON.stringify(streamResJson, null, 2));
  } catch (e) {
    console.error('Failed to parse stream response:', streamRes);
    throw new NotFoundError('Failed to parse stream response');
  }

  // Extract captions
  const captions: Caption[] = [];
  if (streamResJson.subs && Array.isArray(streamResJson.subs)) {
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
  }

  // Try different properties to find the stream URL
  let streamUrl = '';

  // Check each possible property where the URL might be stored
  if (streamResJson.val && streamResJson.val.includes('http')) {
    streamUrl = streamResJson.val;
  } else if (streamResJson.val) {
    // Fix double slashes in the URL when constructing with baseUrl
    if (streamResJson.val.startsWith('/')) {
      streamUrl = `${baseUrl}${streamResJson.val}`;
    } else {
      streamUrl = `${baseUrl}/${streamResJson.val}`;
    }
  } else if (streamResJson.link) {
    streamUrl = streamResJson.link;
  } else if (streamResJson.stream) {
    streamUrl = streamResJson.stream;
  } else if (streamResJson.source) {
    streamUrl = streamResJson.source;
  } else if (streamResJson.url) {
    streamUrl = streamResJson.url;
  }

  if (!streamUrl) {
    console.error('No stream URL found in response:', streamResJson);
    throw new NotFoundError('No stream URL found in response');
  }

  // Fix any double slashes in the URL (except after http: or https:)
  streamUrl = streamUrl.replace(/([^:])\/\//g, '$1/');

  console.log(`Found and fixed stream URL: ${streamUrl}`);

  // Ensure the streamUrl has a proper protocol
  if (!streamUrl.startsWith('http')) {
    if (streamUrl.startsWith('/')) {
      streamUrl = `${baseUrl}${streamUrl}`;
    } else {
      streamUrl = `${baseUrl}/${streamUrl}`;
    }
  }

  // Determine the stream type (m3u8 = HLS, mp4 = direct)
  const streamType = streamUrl.includes('.m3u8') ? 'hls' : 'file';

  return {
    embeds: [],
    stream: [
      {
        id: 'primary',
        playlist: streamType === 'hls' ? streamUrl : undefined,
        url: streamType === 'file' ? streamUrl : undefined,
        type: streamType,
        proxyDepth: 2,
        headers: {
          Referer: `${baseUrl}${showLink}`,
          Origin: baseUrl,
        },
        flags: [flags.CORS_ALLOWED],
        captions,
      },
    ],
  };
};

export const soaperTvScraper = makeSourcerer({
  id: 'soapertv',
  name: 'beta',
  rank: 357,
  flags: [flags.CORS_ALLOWED],
  scrapeMovie: universalScraper,
  scrapeShow: universalScraper,
});

// Function to extract the stream URL for use in react-native-video
export const getStreamUrl = async (title: string, year?: number, season?: number, episode?: number) => {
  // Create a minimal context for the scraper
  const ctx = {
    proxiedFetcher: async (path: string, options: any) => {
      const url = options.baseUrl ? `${options.baseUrl}${path}` : path;
      const response = await fetch(url, {
        method: options.method || 'GET',
        headers: options.headers || {},
        body: options.body,
      });
      return await response.text();
    },
    media: {
      type: season && episode ? 'show' : 'movie',
      title,
      year,
      ...(season && episode
        ? {
            season: { number: season },
            episode: { number: episode },
          }
        : {}),
    },
  };

  try {
    const result = await universalScraper(ctx as any);
    const stream = result.stream[0];
    return stream.playlist || stream.url || null;
  } catch (error) {
    console.error('Error getting stream URL:', error);
    return null;
  }
};
