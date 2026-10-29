"use client";
import { useState } from "react";
import Image from "next/image";

export function Avatar({ src, name, size = 40, className = "" }: { src?: string; name: string; size?: number; className?: string }) {
  const [failed, setFailed] = useState(false);
  const initial = (name || "?").replace(/^@/, "").trim().charAt(0).toUpperCase() || "?";

  if (src && !failed) {
    return (
      <Image
        src={src}
        alt=""
        width={size}
        height={size}
        onError={() => setFailed(true)}
        className={`rounded-full object-cover bg-surface shrink-0 ${className}`}
      />
    );
  }
  return (
    <div
      style={{ width: size, height: size }}
      className={`rounded-full bg-primary/15 text-primary font-bold flex items-center justify-center shrink-0 ${className}`}
    >
      {initial}
    </div>
  );
}
