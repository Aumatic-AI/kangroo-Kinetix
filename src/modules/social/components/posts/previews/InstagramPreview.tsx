import Image from "next/image";
import { Heart, MessageCircle, Send, Bookmark, Ellipsis } from "lucide-react";
import { Avatar } from "./Avatar";
import { PlatformPreviewProps } from "./types";

export function InstagramPreview({ account, caption, mediaUrl, mediaType }: PlatformPreviewProps) {
  const handle = account.displayName.replace(/^@/, "");
  return (
    <div className="bg-white border border-[#dbdbdb] rounded-sm w-full max-w-[380px] mx-auto shadow-sm">
      <div className="flex items-center gap-2.5 p-3">
        <Avatar src={account.avatarUrl} name={account.displayName} size={30} className="ring-1 ring-[#dbdbdb] ring-offset-1" />
        <p className="font-semibold text-[13px] text-[#262626] truncate">{handle}</p>
        <Ellipsis className="w-4 h-4 ml-auto text-[#262626] shrink-0" />
      </div>
      <div className="relative bg-black/5 aspect-square">
        {mediaType === "video" ? (
          <video src={mediaUrl} className="w-full h-full object-cover bg-black" controls />
        ) : (
          <Image src={mediaUrl || ""} alt="" fill sizes="380px" className="object-cover" />
        )}
      </div>
      <div className="flex items-center gap-3.5 px-3 pt-2.5">
        <Heart className="w-6 h-6 text-[#262626]" />
        <MessageCircle className="w-6 h-6 text-[#262626] -scale-x-100" />
        <Send className="w-[22px] h-[22px] text-[#262626]" />
        <Bookmark className="w-6 h-6 text-[#262626] ml-auto" />
      </div>
      <div className="px-3 pt-1.5 pb-3">
        <p className="text-[13px] font-semibold text-[#262626]">1,204 likes</p>
        <p className="text-[13px] text-[#262626] whitespace-pre-wrap mt-0.5">
          <span className="font-semibold mr-1.5">{handle}</span>
          {caption}
        </p>
        <p className="text-[10px] text-[#8e8e8e] uppercase mt-1.5 tracking-wide">2 hours ago</p>
      </div>
    </div>
  );
}
