'use client';

import { useState } from 'react';
import type { ImageAttachment } from '@/types';
import { ImageLightbox } from './ImageLightbox';

interface XentryImageGalleryProps {
  images: ImageAttachment[];
  onDeleteImage?: (imageId: string) => void;
}

export function XentryImageGallery({ images, onDeleteImage }: XentryImageGalleryProps) {
  const [activeImageId, setActiveImageId] = useState<string | null>(null);
  const activeImage = images.find((img) => img.id === activeImageId) || null;

  if (images.length === 0) return null;

  return (
    <>
      <div className="grid grid-cols-4 gap-2 mb-2">
        {images.map((img) => (
          <button
            key={img.id}
            type="button"
            onClick={() => setActiveImageId(img.id)}
            className="overflow-hidden rounded border border-[#38383a] focus:outline-none focus:ring-2 focus:ring-[#0a84ff]"
            aria-label={`View ${img.name}`}
          >
            <img src={img.url} className="h-16 w-full object-cover" alt={img.name} />
          </button>
        ))}
      </div>

      {activeImage && (
        <ImageLightbox
          image={activeImage}
          onClose={() => setActiveImageId(null)}
          onDelete={
            onDeleteImage
              ? () => {
                  onDeleteImage(activeImage.id);
                  setActiveImageId(null);
                }
              : undefined
          }
        />
      )}
    </>
  );
}