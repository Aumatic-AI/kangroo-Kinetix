import Image from "next/image";
import { MessageCircle, Repeat2, Heart, ChartNoAxesColumn, Share2 } from "lucide-react";
import { Avatar } from "./Avatar";
import { PlatformPreviewProps } from "./types";

export function XPreview({ account, caption, mediaUrl, mediaType }: PlatformPreviewProps) {
  return (
    <div className="bg-black text-white rounded-2xl border border-[#2f3336] w-full max-w-[420px] mx-auto p-3 shadow-sm">
      <div className="flex gap-2.5">
        <Avatar src={account.avatarUrl} name={account.displayName} size={40} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 text-[14px] leading-tight">
            <span className="font-bold truncate">{account.displayName}</span>
            <span className="text-[#71767b]">· 1m</span>
          </div>
          <p className="text-[14px] whitespace-pre-wrap mt-0.5 leading-snug">{caption}</p>
          {mediaUrl && (
            <div className="mt-2.5 rounded-2xl overflow-hidden border border-[#2f3336]">
              {mediaType === "video" ? (
                <video src={mediaUrl} className="w-full max-h-[420px] object-contain bg-black" controls />
              ) : (
                <Image src={mediaUrl} alt="" width={1080} height={1350} className="w-full h-auto max-h-[420px] object-cover" />
              )}
            </div>
          )}
          <div className="flex justify-between max-w-[80%] mt-2.5 text-[#71767b]">
            <MessageCircle className="w-[17px] h-[17px]" />
            <Repeat2 className="w-[17px] h-[17px]" />
            <Heart className="w-[17px] h-[17px]" />
            <ChartNoAxesColumn className="w-[17px] h-[17px]" />
            <Share2 className="w-[17px] h-[17px]" />
          </div>
        </div>
      </div>
    </div>
  );
}
