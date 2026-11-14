"use client";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerFooter } from "@/components/ui/drawer";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { MAX_LISTING_IMAGES } from "../lib/listings";
import { useCreateListing } from "../hooks/useListings";

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

function FieldLabel({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return <label htmlFor={htmlFor} className="text-sm font-medium text-text">{children}</label>;
}

/** Thumbnails of the picked photos, in upload order (photo 1 is the listing's thumbnail). */
function PhotoGrid({ photos, onRemove }: { photos: File[]; onRemove: (index: number) => void }) {
  const urls = useMemo(() => photos.map((f) => URL.createObjectURL(f)), [photos]);
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);
  return (
    <div className="grid grid-cols-5 gap-2">
      {urls.map((url, i) => (
        <div key={url} className="relative aspect-square rounded-lg border border-default bg-surface overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" />
          <button
            type="button"
            title="Remove photo"
            aria-label={`Remove photo ${i + 1}`}
            onClick={() => onRemove(i)}
            className="absolute top-1 right-1 p-1 rounded-md bg-background border border-default text-muted hover:text-text"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}

/**
 * Manual "Add listing" form. Most of the inventory still arrives via the
 * import; this covers one-off additions. A new listing is active and, never
 * having been promoted, is picked ahead of listings that already have been.
 */
export function AddListingDrawer({
  open,
  onOpenChange,
  categories,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: string[];
  onCreated?: (listing: { id: string; title: string }) => void;
}) {
  const ids = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [spaceCategory, setSpaceCategory] = useState("");
  const [city, setCity] = useState("");
  const [eventTypes, setEventTypes] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const create = useCreateListing();

  const reset = () => {
    setTitle(""); setSpaceCategory(""); setCity(""); setEventTypes(""); setPhotos([]); setFormError(null); create.reset();
  };

  const handleOpenChange = (next: boolean) => {
    if (!next && create.isPending) return; // don't drop an in-flight upload
    onOpenChange(next);
    if (!next) reset();
  };

  const addPhotos = (files: FileList | null) => {
    if (!files) return;
    const picked = Array.from(files);
    const bad = picked.find((f) => !ACCEPTED_TYPES.includes(f.type));
    if (bad) return setFormError(`${bad.name} isn't a JPEG, PNG or WebP image.`);
    const big = picked.find((f) => f.size > MAX_PHOTO_BYTES);
    if (big) return setFormError(`${big.name} is larger than 10 MB.`);
    const next = [...photos, ...picked];
    if (next.length > MAX_LISTING_IMAGES) return setFormError(`A listing can have at most ${MAX_LISTING_IMAGES} photos.`);
    setFormError(null);
    setPhotos(next);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return setFormError("Name is required.");
    if (photos.length === 0) return setFormError("Add at least one photo — listings without photos can't be promoted.");
    setFormError(null);
    try {
      const created = await create.mutateAsync({ title, spaceCategory, city, eventTypes, photos });
      onOpenChange(false);
      reset();
      onCreated?.({ id: created.id, title: created.title });
    } catch {
      // shown below via create.error
    }
  };

  const error = formError ?? create.error?.message ?? null;

  return (
    <Drawer open={open} onOpenChange={handleOpenChange} swipeDirection="right">
      <DrawerContent className="data-[swipe-axis=x]:sm:[--drawer-content-width:560px]">
        <form onSubmit={submit} className="flex flex-1 flex-col min-h-0">
          <DrawerHeader>
            <DrawerTitle>Add listing</DrawerTitle>
            <DrawerDescription>New listings are active and enter the content rotation right away.</DrawerDescription>
          </DrawerHeader>

          <div className="flex-1 overflow-y-auto px-6 pt-5 pb-6 space-y-5">
            <div className="space-y-1.5">
              <FieldLabel htmlFor={`${ids}-title`}>Name</FieldLabel>
              <Input id={`${ids}-title`} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Sunlit Loft Studio" maxLength={200} autoFocus />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <FieldLabel htmlFor={`${ids}-category`}>Category</FieldLabel>
                <Input id={`${ids}-category`} value={spaceCategory} onChange={(e) => setSpaceCategory(e.target.value)} list={`${ids}-categories`} placeholder="e.g. Event Space" maxLength={100} />
                <datalist id={`${ids}-categories`}>
                  {categories.map((c) => <option key={c} value={c} />)}
                </datalist>
              </div>
              <div className="space-y-1.5">
                <FieldLabel htmlFor={`${ids}-city`}>City</FieldLabel>
                <Input id={`${ids}-city`} value={city} onChange={(e) => setCity(e.target.value)} placeholder="e.g. Toronto" maxLength={100} />
              </div>
            </div>

            <div className="space-y-1.5">
              <FieldLabel htmlFor={`${ids}-events`}>Supported events</FieldLabel>
              <Input id={`${ids}-events`} value={eventTypes} onChange={(e) => setEventTypes(e.target.value)} placeholder="Birthday party, Workshop, Photo shoot" />
              <p className="text-xs text-muted">Separate with commas.</p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-text">Photos</span>
                <span className="text-xs text-muted">{photos.length} / {MAX_LISTING_IMAGES}</span>
              </div>
              {photos.length > 0 && <PhotoGrid photos={photos} onRemove={(i) => setPhotos((p) => p.filter((_, j) => j !== i))} />}
              <input
                ref={fileInput}
                type="file"
                accept={ACCEPTED_TYPES.join(",")}
                multiple
                className="hidden"
                onChange={(e) => { addPhotos(e.target.files); e.target.value = ""; }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                icon={<ImagePlus />}
                disabled={photos.length >= MAX_LISTING_IMAGES || create.isPending}
                onClick={() => fileInput.current?.click()}
              >
                Add photos
              </Button>
              <p className="text-xs text-muted">JPEG, PNG or WebP, up to 10 MB each. The first photo is the thumbnail.</p>
            </div>

            {error && <p className="text-sm text-danger font-medium">{error}</p>}
          </div>

          <DrawerFooter className="flex-row justify-end gap-2 border-t border-default pt-4">
            <Button type="button" variant="outline" disabled={create.isPending} onClick={() => handleOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={create.isPending}>Add listing</Button>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
