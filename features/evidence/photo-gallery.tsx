/* eslint-disable @next/next/no-img-element -- Reauthorize private evidence instead of caching it through the image optimizer. */
import { photoUrl } from "./model";
export function PhotoGallery({
  visitId,
  photos,
  customerOnly = false,
  sources,
}: {
  visitId: string;
  photos: {
    id: string;
    caption: string;
    width?: number | null;
    height?: number | null;
  }[];
  customerOnly?: boolean;
  sources?: Record<string, string>;
}) {
  return (
    <div className="my-4 grid gap-4 sm:grid-cols-2">
      {photos.map((photo) => (
        <figure
          key={photo.id}
          className="break-inside-avoid rounded border p-3"
        >
          <img
            src={
              sources?.[photo.id] ?? photoUrl(visitId, photo.id, customerOnly)
            }
            alt={photo.caption}
            loading="lazy"
            width={photo.width ?? 640}
            height={photo.height ?? 480}
            className="block h-auto max-h-72 w-full object-contain"
          />
          <figcaption>{photo.caption}</figcaption>
        </figure>
      ))}
    </div>
  );
}
