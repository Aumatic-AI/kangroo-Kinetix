import { ThumbsUp, ThumbsDown, MessageCircle, Share2 } from "lucide-react";
import { Avatar } from "./Avatar";
import { PlatformPreviewProps } from "./types";

export function YouTubePreview({ account, caption, title, mediaUrl }: PlatformPreviewProps) {
  return (
    <div className="relative bg-black rounded-2xl overflow-hidden w-full max-w-[280px] mx-auto aspect-[9/16] shadow-sm">
      <video src={mediaUrl} className="absolute inset-0 w-full h-full object-cover" muted loop autoPlay playsInline />
      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/5 to-transparent" />

      <div className="absolute right-2.5 bottom-16 flex flex-col items-center gap-4 text-white">
        <div className="flex flex-col items-center gap-0.5">
          <ThumbsUp className="w-7 h-7" />
          <span className="text-[11px] font-semibold">Like</span>
        </div>
        <ThumbsDown className="w-7 h-7" />
        <div className="flex flex-col items-center gap-0.5">
          <MessageCircle className="w-7 h-7" />
          <span className="text-[11px] font-semibold">Comments</span>
        </div>
        <div className="flex flex-col items-center gap-0.5">
          <Share2 className="w-6 h-6" />
          <span className="text-[11px] font-semibold">Share</span>
        </div>
      </div>

      <div className="absolute left-3 right-16 bottom-3.5 text-white">
        <div className="flex items-center gap-2 mb-2">
          <Avatar src={account.avatarUrl} name={account.displayName} size={28} className="ring-1 ring-white/60" />
          <span className="font-semibold text-[13px] truncate">{account.displayName}</span>
          <span className="text-[10px] border border-white/70 rounded-full px-2 py-0.5 shrink-0">Subscribe</span>
        </div>
        <p className="text-[13px] line-clamp-2 leading-snug">{title || caption}</p>
      </div>
    </div>
  );
}
