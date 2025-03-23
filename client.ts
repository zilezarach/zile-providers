import WebTorrent from 'webtorrent';

const client = new WebTorrent();

const torrentId: string =
  'magnet:?xt=urn:btih:08ada5a7a6183aae1e09d831df6748d566095a10&dn=Sintel&tr=udp%3A%2F%2Fexplodie.org%3A6969&tr=udp%3A%2F%2Ftracker.coppersurfer.tk%3A6969&tr=udp%3A%2F%2Ftracker.empire-js.us%3A1337&tr=udp%3A%2F%2Ftracker.leechers-paradise.org%3A6969&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337&tr=wss%3A%2F%2Ftracker.btorrent.xyz&tr=wss%3A%2F%2Ftracker.fastcast.nz&tr=wss%3A%2F%2Ftracker.openwebtorrent.com&ws=https%3A%2F%2Fwebtorrent.io%2Ftorrents%2F&xs=https%3A%2F%2Fwebtorrent.io%2Ftorrents%2Fsintel.torrent';

client.add(torrentId, (torrent) => {
  console.log('Torrent metadata received. Info hash:', torrent.infoHash);

  // Find the first .mp4 file in the torrent's file list.
  const file = torrent.files.find((file) => file.name.endsWith('.mp4'));

  if (!file) {
    console.error('No .mp4 file found in this torrent.');
    return;
  }

  // Append the file to the DOM.
  // This will automatically create an appropriate element (e.g., a <video> tag)
  // and stream the content into it.
  file.appendTo('body', (err: Error | null, elem?: HTMLElement) => {
    if (err) {
      console.error('Error appending the file:', err);
    } else {
      console.log('File appended to the DOM successfully!');
    }
  });
});
