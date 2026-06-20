const crypto = require('crypto');

const RAPID_API_HOST = 'youtube-media-downloader.p.rapidapi.com';
const TOKEN_LIFETIME_MS = 15 * 60 * 1000;

class DownloaderError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function extractVideoId(input) {
  try {
    const parsed = new URL(input);
    const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
    if (host === 'youtu.be') return parsed.pathname.split('/').filter(Boolean)[0] || null;
    if (host !== 'youtube.com' && !host.endsWith('.youtube.com')) return null;
    if (parsed.searchParams.get('v')) return parsed.searchParams.get('v');
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (['shorts', 'embed', 'live'].includes(parts[0])) return parts[1] || null;
    return null;
  } catch {
    return null;
  }
}

function cleanFilename(value) {
  return String(value || 'youtube-download')
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || 'youtube-download';
}

function signingKey(rapidApiKey) {
  return crypto.createHash('sha256').update(`flash-downloader:${rapidApiKey}`).digest();
}

function signStream(stream, title, type, rapidApiKey) {
  const extension = String(stream.extension || (type === 'audio' ? 'm4a' : 'mp4')).replace(/[^a-z0-9]/gi, '') || 'bin';
  const payload = Buffer.from(JSON.stringify({
    url: stream.url,
    mimeType: stream.mimeType || (type === 'audio' ? 'audio/mp4' : 'video/mp4'),
    filename: `${cleanFilename(title)}.${extension}`,
    expiresAt: Date.now() + TOKEN_LIFETIME_MS
  })).toString('base64url');
  const signature = crypto.createHmac('sha256', signingKey(rapidApiKey)).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function verifyStreamToken(token, rapidApiKey) {
  if (!rapidApiKey) throw new DownloaderError(503, 'RapidAPI is not configured.');
  if (typeof token !== 'string' || token.length < 20 || token.length > 10000) {
    throw new DownloaderError(400, 'The download token is invalid.');
  }

  const separator = token.lastIndexOf('.');
  if (separator < 1) throw new DownloaderError(400, 'The download token is invalid.');
  const payload = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  const expected = crypto.createHmac('sha256', signingKey(rapidApiKey)).update(payload).digest('base64url');
  const suppliedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (suppliedBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(suppliedBuffer, expectedBuffer)) {
    throw new DownloaderError(403, 'The download token could not be verified.');
  }

  let item;
  try {
    item = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    throw new DownloaderError(400, 'The download token is invalid.');
  }
  if (!item.url || !item.filename || Number(item.expiresAt) <= Date.now()) {
    throw new DownloaderError(410, 'This download link expired. Analyze the video again.');
  }
  try {
    const streamUrl = new URL(item.url);
    if (streamUrl.protocol !== 'https:') throw new Error('Invalid protocol');
  } catch {
    throw new DownloaderError(400, 'The media URL is invalid.');
  }
  return item;
}

function formatStream(stream, title, type, rapidApiKey) {
  return {
    token: signStream(stream, title, type, rapidApiKey),
    type,
    extension: stream.extension || (type === 'audio' ? 'm4a' : 'mp4'),
    quality: type === 'audio' ? (stream.bitrate ? `${Math.round(stream.bitrate / 1000)} kbps` : 'Audio') : (stream.quality || `${stream.height || ''}p`),
    size: Number(stream.size || 0),
    sizeText: stream.sizeText || '',
    hasAudio: type === 'audio' || stream.hasAudio !== false,
    mimeType: stream.mimeType || ''
  };
}

async function getVideoInfo(submittedUrl, rapidApiKey) {
  if (!rapidApiKey) {
    throw new DownloaderError(503, 'RapidAPI is not configured. Add RAPIDAPI_KEY in Vercel Environment Variables.');
  }
  const videoId = extractVideoId(submittedUrl);
  if (!videoId || !/^[a-zA-Z0-9_-]{6,20}$/.test(videoId)) {
    throw new DownloaderError(400, 'Enter a valid YouTube video, Shorts, or live URL.');
  }

  const endpoint = new URL(`https://${RAPID_API_HOST}/v2/video/details`);
  endpoint.searchParams.set('videoId', videoId);
  endpoint.searchParams.set('urlAccess', 'normal');
  endpoint.searchParams.set('videos', 'auto');
  endpoint.searchParams.set('audios', 'auto');

  let apiResponse;
  try {
    apiResponse = await fetch(endpoint, {
      headers: {
        'Content-Type': 'application/json',
        'x-rapidapi-host': RAPID_API_HOST,
        'x-rapidapi-key': rapidApiKey
      },
      signal: AbortSignal.timeout(30000)
    });
  } catch (error) {
    throw new DownloaderError(502, error.name === 'TimeoutError' ? 'The downloader API timed out. Try again.' : 'Could not reach the downloader API.');
  }

  let data;
  try {
    data = await apiResponse.json();
  } catch {
    throw new DownloaderError(502, 'The downloader API returned an unreadable response.');
  }

  if (!apiResponse.ok || (data.errorId && data.errorId !== 'Success')) {
    const statusMessages = {
      401: 'The RapidAPI key is invalid.',
      403: 'RapidAPI rejected this video. It may be private, age-restricted, region-restricted, live, or unavailable.',
      429: 'The monthly RapidAPI quota has been reached.'
    };
    const upstreamMessage = data.message || data.error || (data.errorId && data.errorId !== 'Success' ? data.errorId : '');
    throw new DownloaderError(apiResponse.status >= 400 ? apiResponse.status : 502, upstreamMessage || statusMessages[apiResponse.status] || 'The video could not be processed.');
  }

  const videoStreams = Array.isArray(data.videos?.items) ? data.videos.items : [];
  const audioStreams = Array.isArray(data.audios?.items) ? data.audios.items : [];
  const formats = [
    ...videoStreams.filter((item) => item.url && item.hasAudio !== false).map((item) => formatStream(item, data.title, 'video', rapidApiKey)),
    ...audioStreams.filter((item) => item.url).map((item) => formatStream(item, data.title, 'audio', rapidApiKey))
  ];

  if (!formats.length) {
    throw new DownloaderError(422, 'No downloadable video-with-audio or audio streams were returned for this link.');
  }

  const thumbnails = Array.isArray(data.thumbnails) ? [...data.thumbnails] : [];
  const thumbnail = thumbnails.sort((a, b) => (b.width || 0) - (a.width || 0))[0]?.url || '';
  return {
    id: data.id || videoId,
    title: data.title || 'YouTube video',
    channel: data.channel?.name || data.channel?.handle || 'YouTube',
    channelVerified: Boolean(data.channel?.isVerified || data.channel?.isVerifiedArtist),
    durationSeconds: Number(data.lengthSeconds || 0),
    viewCount: Number(data.viewCount || 0),
    thumbnail,
    formats
  };
}

module.exports = {
  DownloaderError,
  getVideoInfo,
  verifyStreamToken
};
