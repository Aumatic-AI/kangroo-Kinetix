import Image from "next/image";
import { ThumbsUp, MessageCircle, Repeat2, Send, Globe } from "lucide-react";
import { Avatar } from "./Avatar";
import { PlatformPreviewProps } from "./types";

export function LinkedInPreview({ account, caption, mediaUrl, mediaType }: PlatformPreviewProps) {
  return (
    <div className="bg-white border border-[#dce6f1] rounded-lg w-full max-w-[460px] mx-auto p-4 shadow-sm">
      <div className="flex gap-2.5">
        <Avatar src={account.avatarUrl} name={account.displayName} size={48} />
        <div className="min-w-0">
          <p className="font-semibold text-[14px] text-[#000000de] truncate">{account.displayName}</p>
          <p className="text-[12px] text-[#00000099] flex items-center gap-1">
            1h · <Globe className="w-3 h-3" />
          </p>
        </div>
      </div>
      <p className="text-[14px] text-[#000000de] whitespace-pre-wrap leading-snug mt-3">{caption}</p>
      {mediaUrl && (
        <div className="mt-3 rounded-lg overflow-hidden border border-[#dce6f1] -mx-4">
          {mediaType === "video" ? (
            <video src={mediaUrl} className="w-full max-h-[420px] object-contain bg-black" controls />
          ) : (
            <Image src={mediaUrl} alt="" width={1080} height={1350} className="w-full h-auto max-h-[420px] object-cover" />
          )}
        </div>
      )}
      <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-[#dce6f1] text-[#00000099] text-[13px] font-medium">
        <span className="flex items-center gap-1.5"><ThumbsUp className="w-4 h-4" />Like</span>
        <span className="flex items-center gap-1.5"><MessageCircle className="w-4 h-4" />Comment</span>
        <span className="flex items-center gap-1.5"><Repeat2 className="w-4 h-4" />Repost</span>
        <span className="flex items-center gap-1.5"><Send className="w-4 h-4" />Send</span>
      </div>
    </div>
  );
}
