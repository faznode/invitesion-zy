import { ImagePlus, Trash2 } from 'lucide-react';
import { removeGuestPhoto } from '@/app/i/[slug]/actions';
import type { GuestPageProps, GuestView } from '@/components/invitation/guest-view';

/**
 * I-21 (D-070): the post-event memory on a design family's page: the host's thank-you, the photos this audience may see
 * and, on a personal link, the guest's own photos with their review and removal, and the upload form while sharing is
 * open. Server-rendered from `props.memory` alone (null before the event, when switched off or on the legacy layout),
 * with plain forms (the upload posts multipart to its route, R-X8; a removal to a server action), so it works without
 * JavaScript and adds no client code to the page.
 */
export function PostEventMemory({ props, view, className = '' }: { props: GuestPageProps; view: GuestView; className?: string }) {
  const memory = props.memory;
  if (!memory) return null;
  const copy = view.copy.memory;
  const notice = memory.notice ? copy.notices[memory.notice] : null;
  const confirming = memory.notice === 'sent' || memory.notice === 'removed';

  return (
    <section id="kenangan" aria-labelledby="kenangan-heading" className={`flex flex-col gap-6 py-10 ${className}`}>
      <div className="flex flex-col gap-3 text-center">
        <h2 id="kenangan-heading" className="text-balance font-serif text-3xl leading-tight">
          {copy.heading}
        </h2>
        {memory.message ? <p className="whitespace-pre-line text-pretty leading-relaxed">{memory.message}</p> : null}
      </div>

      {notice ? (
        <p role={confirming ? 'status' : 'alert'} className="text-pretty text-center text-sm font-semibold leading-6">
          {notice}
        </p>
      ) : null}

      {memory.photosOn ? (
        <div className="flex flex-col gap-4">
          <h3 className="text-center text-lg font-semibold">{copy.photosHeading}</h3>
          {memory.photos.length === 0 ? (
            <p className="text-center text-sm leading-6">{copy.empty}</p>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {memory.photos.map((photo, index) => (
                <li key={photo.id} className="flex flex-col gap-2">
                  <img src={photo.src} alt={copy.photoAlt(index + 1)} loading="lazy" decoding="async" className="aspect-square w-full rounded-lg object-cover" />
                  {photo.mine ? (
                    <div className="flex flex-col gap-1 text-xs leading-5">
                      <span className="font-semibold">
                        {copy.yours}
                        {photo.review === 'pending' ? ` · ${copy.pending}` : photo.review === 'hidden' ? ` · ${copy.hidden}` : ''}
                      </span>
                      {memory.owner ? (
                        <form action={removeGuestPhoto}>
                          <input type="hidden" name="slug" value={memory.owner.slug} />
                          <input type="hidden" name="guestSlug" value={memory.owner.guestSlug} />
                          <input type="hidden" name="photoId" value={photo.id} />
                          <button type="submit" className="inline-flex min-h-11 items-center gap-1 font-semibold underline underline-offset-4">
                            <Trash2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                            {copy.remove}
                          </button>
                        </form>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {memory.upload ? (
        <form action={memory.upload.action} method="post" encType="multipart/form-data" className="flex flex-col gap-3 rounded-xl border border-current p-4">
          <h3 className="flex items-center gap-2 text-base font-semibold">
            <ImagePlus className="h-5 w-5 shrink-0" aria-hidden="true" />
            {copy.uploadHeading}
          </h3>
          <p id="kenangan-hint" className="text-pretty text-sm leading-6">
            {copy.uploadHint(memory.upload.remaining)}
          </p>
          <label className="flex flex-col gap-2 text-sm font-semibold">
            {copy.uploadLabel}
            <input
              name="photo"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              required
              disabled={memory.upload.remaining === 0}
              aria-describedby="kenangan-hint"
              className="min-h-11 text-sm"
            />
          </label>
          <button
            type="submit"
            disabled={memory.upload.remaining === 0}
            className="min-h-11 rounded-full border border-current px-5 text-sm font-semibold disabled:opacity-60"
          >
            {copy.submit}
          </button>
        </form>
      ) : null}
    </section>
  );
}
