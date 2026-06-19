'use client';

import { useEffect } from 'react';
import { Trash2, X } from 'lucide-react';
import type { ImageAttachment } from '@/types';

interface ImageLightboxProps {
  image: ImageAttachment;
  onClose: () => void;
  onDelete?: () => void;
}

export function ImageLightbox({ image, onClose, onDelete }: ImageLightboxProps) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Image preview"
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 z-[101] flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-white"
        aria-label="Close image"
      >
        <X size={22} />
      </button>

      {onDelete && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="absolute top-4 left-4 z-[101] flex h-11 items-center gap-2 rounded-full bg-[#ff453a]/90 px-4 text-sm font-medium text-white"
          aria-label="Delete image"
        >
          <Trash2 size={18} />
          Delete
        </button>
      )}

      <img
        src={image.url}
        alt={image.name}
        className="max-h-[85vh] max-w-full rounded-lg object-contain shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />

      <div className="absolute bottom-5 left-1/2 max-w-[90vw] -translate-x-1/2 truncate rounded-full bg-black/60 px-4 py-2 text-xs text-white">
        {image.name}
      </div>
    </div>
  );
}