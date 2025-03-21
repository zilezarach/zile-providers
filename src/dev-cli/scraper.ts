import { existsSync } from 'fs';
import { join } from 'path';
import puppeteer, { Browser } from 'puppeteer';
import Spinnies from 'spinnies';
import { PreviewServer, build, preview } from 'vite';
import { getConfig } from '@/dev-cli/config';
import { logDeepObject } from '@/dev-cli/logging';
import { getMovieMediaDetails, getShowMediaDetails } from '@/dev-cli/tmdb';
import { CommandLineArguments } from '@/dev-cli/validate';
import { MetaOutput, ProviderMakerOptions, makeProviders } from '..';

async function runBrowserScraping(
  providerOptions: ProviderMakerOptions,
  source: MetaOutput,
  options: CommandLineArguments,
  logger: any,
  magnetUrl?: string, // Add magnetUrl parameter
) {
  if (!existsSync(join(__dirname, '../../lib/index.js')))
    throw new Error('Please compile before running cli in browser mode');

  const config = getConfig();
  if (!config.proxyUrl)
    throw new Error('Simple proxy url must be set in the environment (MOVIE_WEB_PROXY_URL) for browser mode to work');

  const root = join(__dirname, 'browser');
  let server: PreviewServer | undefined;
  let browser: Browser | undefined;

  try {
    // setup browser
    await build({
      root,
    });
    server = await preview({
      root,
    });
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const page = await browser.newPage();
    // This is the dev cli, so we can use console.log
    // eslint-disable-next-line no-console
    page.on('console', (message) => console.log(`${message.type().slice(0, 3).toUpperCase()} ${message.text()}`));

    if (!server.resolvedUrls?.local.length) throw new Error('Server did not start');
    await page.goto(server.resolvedUrls.local[0]);
    await page.waitForFunction('!!window.scrape', { timeout: 5000 });

    // get input media
    let input: any;
    if (source.type === 'embed') {
      input = {
        url: options.url,
        id: source.id,
      };
    } else if (source.type === 'source') {
      let media;
      if (options.type === 'movie') {
        media = await getMovieMediaDetails(options.tmdbId);
      } else {
        media = await getShowMediaDetails(options.tmdbId, options.season, options.episode);
      }
      input = {
        media,
        id: source.id,
        // Add magnetUrl to the input if it exists and the source is webtor
        ...(source.id === 'webtor' && magnetUrl ? { magnetUrl } : {}),
      };
    } else {
      throw new Error('Wrong source input type');
    }

    return await page.evaluate(
      async (proxy, type, inp) => {
        return (window as any).scrape(proxy, type, inp);
      },
      config.proxyUrl,
      source.type,
      input,
    );
  } finally {
    server?.httpServer.close();
    await browser?.close();
  }
}

async function runActualScraping(
  providerOptions: ProviderMakerOptions,
  source: MetaOutput,
  options: CommandLineArguments,
  logger: any,
  magnetUrl?: string, // Add magnetUrl parameter
): Promise<any> {
  if (options.fetcher === 'browser') return runBrowserScraping(providerOptions, source, options, logger, magnetUrl);

  const providers = makeProviders(providerOptions);

  if (source.type === 'embed') {
    return providers.runEmbedScraper({
      disableOpensubtitles: true,
      url: options.url,
      id: source.id,
    });
  }

  if (source.type === 'source') {
    let media;
    if (options.type === 'movie') {
      media = await getMovieMediaDetails(options.tmdbId);
    } else {
      media = await getShowMediaDetails(options.tmdbId, options.season, options.episode);
    }

    // Add magnetUrl to the context if it exists and the source is webtor
    const extraContext = source.id === 'webtor' && magnetUrl ? { magnetUrl } : {};

    return providers.runSourceScraper({
      disableOpensubtitles: true,
      media,
      id: source.id,
      ...extraContext,
    });
  }

  throw new Error('Invalid source type');
}

export async function runScraper(
  providerOptions: ProviderMakerOptions,
  source: MetaOutput,
  options: CommandLineArguments,
  logger: any,
  magnetUrl?: string,
) {
  const spinnies = new Spinnies();

  spinnies.add('scrape', { text: `Running ${source.name} scraper` });

  try {
    const result = await runActualScraping(providerOptions, source, options, logger, magnetUrl);
    spinnies.succeed('scrape', { text: 'Done!' });
    logger.info(result); // Use the custom logger
  } catch (error) {
    let message = 'Unknown error';
    if (error instanceof Error) {
      message = error.message;
    }
    spinnies.fail('scrape', { text: `ERROR: ${message}` });
    logger.error(error); // Log error with the custom logger
  }
}
