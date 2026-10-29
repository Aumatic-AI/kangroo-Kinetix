"use client";
import { useEffect } from "react";
import Image from "next/image";
import { X } from "lucide-react";
import { createPortal } from "react-dom";

interface LightboxProps {
  mediaUrl: string;
  mediaType: "image" | "video";
  onClose: () => void;
}

export function Lightbox({ mediaUrl, mediaType, onClose }: LightboxProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-6 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute top-5 right-5 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
        aria-label="Close"
      >
        <X className="w-5 h-5" />
      </button>
      <div className="max-w-[92vw] max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
        {mediaType === "video" ? (
          <video src={mediaUrl} className="max-w-[92vw] max-h-[90vh] rounded-lg" controls autoPlay />
        ) : (
          <Image
            src={mediaUrl}
            alt=""
            width={1600}
            height={1600}
            className="w-auto h-auto max-w-[92vw] max-h-[90vh] rounded-lg object-contain"
          />
        )}
      </div>
    </div>,
    document.body
  );
}
