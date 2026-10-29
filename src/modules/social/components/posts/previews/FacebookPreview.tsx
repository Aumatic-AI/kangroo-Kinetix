import Image from "next/image";
import { ThumbsUp, MessageCircle, Share2, Globe, Ellipsis } from "lucide-react";
import { Avatar } from "./Avatar";
import { PlatformPreviewProps } from "./types";

export function FacebookPreview({ account, caption, mediaUrl, mediaType }: PlatformPreviewProps) {
  return (
    <div className="bg-white rounded-lg border border-[#dadde1] w-full max-w-[420px] mx-auto shadow-sm">
      <div className="flex items-center gap-2.5 p-3">
        <Avatar src={account.avatarUrl} name={account.displayName} size={40} />
        <div className="leading-tight min-w-0">
          <p className="font-semibold text-[14px] text-[#050505] truncate">{account.displayName}</p>
          <p className="text-[12px] text-[#65676b] flex items-center gap-1">
            Just now <Globe className="w-3 h-3" />
          </p>
        </div>
        <Ellipsis className="w-5 h-5 text-[#65676b] ml-auto shrink-0" />
      </div>
      <p className="px-3 pb-3 text-[14px] leading-snug text-[#050505] whitespace-pre-wrap">{caption}</p>
      {mediaUrl && (
        <div className="bg-black/5">
          {mediaType === "video" ? (
            <video src={mediaUrl} className="w-full max-h-[420px] object-contain bg-black" controls />
          ) : (
            <Image src={mediaUrl} alt="" width={1080} height={1350} className="w-full h-auto max-h-[420px] object-cover" />
          )}
        </div>
      )}
      <div className="flex items-center justify-between px-3 py-2 text-[#65676b] text-[13px] font-medium border-t border-[#e4e6eb] mt-1">
        <span className="flex items-center gap-1.5"><ThumbsUp className="w-4 h-4" />Like</span>
        <span className="flex items-center gap-1.5"><MessageCircle className="w-4 h-4" />Comment</span>
        <span className="flex items-center gap-1.5"><Share2 className="w-4 h-4" />Share</span>
      </div>
    </div>
  );
}
