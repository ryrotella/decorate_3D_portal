export type ParsedVideoUrl =
  | { type: 'youtube'; videoId: string }
  | { type: 'video'; url: string };

export function parseVideoUrl(url: string): ParsedVideoUrl | null {
  // YouTube: youtu.be/ID
  const shortMatch = url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
  if (shortMatch) return { type: 'youtube', videoId: shortMatch[1] };

  // YouTube: youtube.com/watch?v=ID
  const watchMatch = url.match(/youtube\.com\/watch\?.*v=([a-zA-Z0-9_-]{11})/);
  if (watchMatch) return { type: 'youtube', videoId: watchMatch[1] };

  // YouTube: youtube.com/embed/ID
  const embedMatch = url.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/);
  if (embedMatch) return { type: 'youtube', videoId: embedMatch[1] };

  // Direct video URL — check common extensions or just treat any http(s) URL as video
  const videoExtensions = /\.(mp4|webm|ogg|mov|m4v)(\?|$)/i;
  if (videoExtensions.test(url)) {
    return { type: 'video', url };
  }

  // If it's a valid URL but not YouTube or known video extension, still try as video
  try {
    new URL(url);
    return { type: 'video', url };
  } catch {
    return null;
  }
}
