/**
 * Pictures for the story pages (the prologue): files dropped into `src/assets/story/` by name —
 * `stop.jpg`, `kartatay.png`… — are picked up at build time; a page whose picture isn't there yet
 * shows a framed placeholder with the brief for it (see src/assets/story/README.md).
 */
const FILES = import.meta.glob('../assets/story/*.{jpg,jpeg,png,webp}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

/** The picture for a page id, or null while there is none. */
export function storyArt(id: string): string | null {
  for (const ext of ['webp', 'jpg', 'jpeg', 'png']) {
    const url = FILES[`../assets/story/${id}.${ext}`];
    if (url) return url;
  }
  return null;
}

/** A picture on a story page: which file, what it should show, and its shape. */
export interface StoryImage {
  id: string;
  /** What the picture shows: the brief for whoever draws it, and the placeholder's text meanwhile. */
  brief: string;
  /** A head-and-shoulders portrait (3:4) rather than a scene (4:3). */
  portrait?: boolean;
  /** The date a film camera printed into the corner of the photo, «’97 9 16». */
  date?: string;
}
