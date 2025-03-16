import { MovieMedia, ShowMedia } from '@/entrypoint/utils/media';
import { UseableFetcher } from '@/fetchers/types';

export type ScrapeContext = {
  proxiedFetcher: UseableFetcher;
  fetcher: UseableFetcher;
  progress(val: number): void;
  magnetUrl?: string;
};

export type EmbedInput = {
  url: string;
};

export type EmbedScrapeContext = EmbedInput & ScrapeContext;

export type MovieScrapeContext = ScrapeContext & {
  media: MovieMedia;
  magnetUrl?: string;
};

export type ShowScrapeContext = ScrapeContext & {
  media: ShowMedia;
  magnetUrl?: string;
};
