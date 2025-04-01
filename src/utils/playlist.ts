import { parse, stringify } from 'hls-parser';
import { MasterPlaylist } from 'hls-parser/types';
import { UseableFetcher } from '@/fetchers/types';

export async function convertPlaylistsToDataUrls(
  fetcher: UseableFetcher,
  playlistUrl: string,
  headers?: Record<string, string>,
) {
  let playlistData: string;
  try {
    playlistData = await fetcher(playlistUrl, { headers });
  } catch (err) {
    throw new Error(`Failed to fetch playlist from ${playlistUrl}: ${err}`);
  }

  let playlist;
  try {
    playlist = parse(playlistData);
  } catch (err) {
    throw new Error(`Failed to parse playlist data: ${err}`);
  }

  // If the playlist is a master playlist, try to convert each variant.
  if (playlist.isMasterPlaylist) {
    const masterPlaylist = playlist as MasterPlaylist;
    await Promise.all(
      masterPlaylist.variants.map(async (variant) => {
        // Ensure the variant has a URI.
        if (!variant.uri) {
          console.warn('Skipping variant without URI.');
          return;
        }
        let variantPlaylistData: string;
        try {
          variantPlaylistData = await fetcher(variant.uri, { headers });
        } catch (err) {
          console.error(`Failed to fetch variant playlist from ${variant.uri}: ${err}`);
          return;
        }
        let variantPlaylist;
        try {
          variantPlaylist = parse(variantPlaylistData);
        } catch (err) {
          console.error(`Failed to parse variant playlist from ${variant.uri}: ${err}`);
          return;
        }
        // Convert the variant playlist to a base64 data URL.
        try {
          const base64Variant = Buffer.from(stringify(variantPlaylist)).toString('base64');
          variant.uri = `data:application/vnd.apple.mpegurl;base64,${base64Variant}`;
        } catch (err) {
          console.error(`Failed to encode variant playlist: ${err}`);
        }
      }),
    );
  }

  // Convert the main playlist to a data URL.
  let dataUrl: string;
  try {
    const base64Playlist = Buffer.from(stringify(playlist)).toString('base64');
    dataUrl = `data:application/vnd.apple.mpegurl;base64,${base64Playlist}`;
  } catch (err) {
    throw new Error(`Failed to convert playlist to data URL: ${err}`);
  }
  return dataUrl;
}
