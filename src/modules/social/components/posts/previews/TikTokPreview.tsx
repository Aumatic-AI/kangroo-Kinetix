import { Heart, MessageCircle, Share2, Music2, Plus } from "lucide-react";
import { Avatar } from "./Avatar";
import { PlatformPreviewProps } from "./types";

export function TikTokPreview({ account, caption, mediaUrl }: PlatformPreviewProps) {
  return (
    <div className="relative bg-black rounded-2xl overflow-hidden w-full max-w-[280px] mx-auto aspect-[9/16] shadow-sm">
      <video src={mediaUrl} className="absolute inset-0 w-full h-full object-cover" muted loop autoPlay playsInline />
      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/5 to-transparent" />

      <div className="absolute right-2.5 bottom-16 flex flex-col items-center gap-4 text-white">
        <div className="relative">
          <Avatar src={account.avatarUrl} name={account.displayName} size={38} className="ring-2 ring-white" />
          <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 bg-[#fe2c55] rounded-full w-4 h-4 flex items-center justify-center">
            <Plus className="w-2.5 h-2.5" strokeWidth={3} />
          </div>
        </div>
        <div className="flex flex-col items-center gap-0.5">
          <Heart className="w-7 h-7 fill-white" />
          <span className="text-[11px] font-semibold">12.4K</span>
        </div>
        <div className="flex flex-col items-center gap-0.5">
          <MessageCircle className="w-7 h-7 fill-white" />
          <span className="text-[11px] font-semibold">284</span>
        </div>
        <div className="flex flex-col items-center gap-0.5">
          <Share2 className="w-6 h-6" />
          <span className="text-[11px] font-semibold">Share</span>
        </div>
      </div>

      <div className="absolute left-3 right-16 bottom-3.5 text-white">
        <p className="font-semibold text-[13px]">{account.displayName}</p>
        <p className="text-[13px] mt-1 line-clamp-2 leading-snug">{caption}</p>
        <p className="text-[11px] flex items-center gap-1 mt-1.5">
          <Music2 className="w-3 h-3" /> original sound
        </p>
      </div>
    </div>
  );
}
