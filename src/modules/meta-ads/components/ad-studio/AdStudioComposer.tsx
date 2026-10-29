"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, ChevronDown, Image as ImageIcon, Send, Sparkles, X } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";
import { useBusinessStore } from "@/store/business.store";
import { useCreateStudioSession } from "../../hooks/useAdStudio";
import { StudioAspectRatio } from "../../types/studio.types";
import { ROUTES } from "@/config/routes";

const ASPECT_RATIOS: { value: StudioAspectRatio; label: string }[] = [
  { value: "1:1", label: "1:1 Square" },
  { value: "4:5", label: "4:5 Portrait" },
  { value: "9:16", label: "9:16 Vertical" },
  { value: "16:9", label: "16:9 Landscape" },
];

export function AdStudioComposer() {
  const router = useRouter();
  const business = useBusinessStore((s) => s.business);
  const serviceOptions = (business?.services ?? []).map((s) => s.name);
  const supabase = createClient();
  const createSession = useCreateStudioSession();

  const [service, setService] = useState("");
  const [aspectRatio, setAspectRatio] = useState<StudioAspectRatio>("4:5");
  const [idea, setIdea] = useState("");
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [referencePreviewUrl, setReferencePreviewUrl] = useState<string | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Single reference photo max — always replaces whatever was there before,
  // however it arrived (browse, drag-drop, or paste).
  const setReference = (file: File | null) => {
    setReferenceFile(file);
    setReferencePreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return file ? URL.createObjectURL(file) : null;
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setReference(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingOver(false);
    const file = Array.from(e.dataTransfer.files).find((f) => f.type.startsWith("image/"));
    if (file) setReference(file);
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) {
          setReference(file);
          e.preventDefault();
        }
        break;
      }
    }
  };

  const handleSend = async () => {
    if (!idea.trim() || !service) return;
    setIsUploading(true);
    try {
      let referenceImageUrl: string | undefined;
      if (referenceFile) {
        const { data: businessData } = await supabase.from("businesses").select("id").limit(1).single();
        const businessId = businessData?.id;
        if (!businessId) throw new Error("No business found");
        const fileName = `${businessId}/studio/uploads/${Date.now()}_${referenceFile.name.replace(/[^a-zA-Z0-9.\-_]/g, "")}`;
        const { error: storageError } = await supabase.storage.from("business_media").upload(fileName, referenceFile, {
          cacheControl: "3600",
          upsert: false,
        });
        if (storageError) throw new Error(storageError.message);
        referenceImageUrl = supabase.storage.from("business_media").getPublicUrl(fileName).data.publicUrl;
      }

      const { session } = await createSession.mutateAsync({ service, initialIdea: idea, aspectRatio, referenceImageUrl });
      router.push(ROUTES.META_ADS.AD_STUDIO_SESSION(session.id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to start the ad studio session");
    } finally {
      setIsUploading(false);
    }
  };

  const isSending = isUploading || createSession.isPending;
  const currentAspectLabel = ASPECT_RATIOS.find((r) => r.value === aspectRatio)?.label;

  return (
    <div className="relative h-full flex flex-col">
      <div className="shrink-0 border-b border-default px-6 py-3">
        <Link href={ROUTES.META_ADS.AD_LIBRARY} className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-text transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" /> Ad Library
        </Link>
      </div>
      <div className="flex-1 overflow-y-auto flex items-center justify-center px-6 pb-40">
        <div className="max-w-xl w-full text-center">
          <div className="w-12 h-12 rounded-lg bg-primary-subtle text-primary flex items-center justify-center mx-auto mb-4">
            <Sparkles className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold text-text mb-4">Describe the ad you want to create</h2>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {[
              "Who it's for — age, situation",
              "The exact problem or pain point",
              "The result they want to feel",
              "A specific offer, price, or promo",
              "Tone — emotional, confident, or urgent",
              "Bold text on the photo, or keep it clean",
              "Reference photo of your space, product, or a person",
            ].map((tag) => (
              <span key={tag} className="px-3 py-1.5 rounded-md bg-surface border border-default text-xs font-medium text-muted">
                {tag}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 px-4 pb-4 pointer-events-none">
        <div className="max-w-2xl mx-auto pointer-events-auto">
          <div
            className={`bg-background rounded-lg shadow-md border overflow-hidden transition-colors ${isDraggingOver ? "border-primary" : "border-default"}`}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDraggingOver(true);
            }}
            onDragLeave={() => setIsDraggingOver(false)}
            onDrop={handleDrop}
          >
            <Textarea
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
              onPaste={handlePaste}
              placeholder="Describe your ad idea... (you can also drag & drop or paste a reference photo)"
              className="!border-none !ring-0 !shadow-none !rounded-none !bg-transparent !px-3.5 !pt-3 !pb-1 min-h-[52px] max-h-60 resize-none"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
            />
            <div className="flex items-center justify-between gap-2 px-2.5 pb-2.5 pt-1">
              <div className="flex items-center gap-1.5 min-w-0">
                <DropdownMenu>
                  <DropdownMenuTrigger className="flex items-center gap-1 h-7 px-2 rounded-md border border-default bg-background text-xs font-medium text-text hover:bg-surface transition-colors shrink-0">
                    <span className="truncate max-w-[100px]">{service || "Service"}</span>
                    <ChevronDown className="w-3 h-3 text-muted shrink-0" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="min-w-[160px]">
                    {serviceOptions.map((opt) => (
                      <DropdownMenuItem key={opt} onClick={() => setService(opt)} className="text-sm">
                        {opt}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>

                <DropdownMenu>
                  <DropdownMenuTrigger className="flex items-center gap-1 h-7 px-2 rounded-md border border-default bg-background text-xs font-medium text-text hover:bg-surface transition-colors shrink-0">
                    <span>{currentAspectLabel}</span>
                    <ChevronDown className="w-3 h-3 text-muted shrink-0" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="min-w-[160px]">
                    {ASPECT_RATIOS.map((ratio) => (
                      <DropdownMenuItem key={ratio.value} onClick={() => setAspectRatio(ratio.value)} className="text-sm">
                        {ratio.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>

                <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleFileChange} />
                {referenceFile && referencePreviewUrl ? (
                  <div className="flex items-center gap-1.5 h-7 pl-1 pr-1.5 rounded-md border border-primary-border bg-primary-subtle shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={referencePreviewUrl} alt="Reference" className="h-5 w-5 rounded-sm object-cover shrink-0" />
                    <span className="truncate max-w-[80px] text-xs font-medium text-primary">{referenceFile.name}</span>
                    <button type="button" onClick={() => setReference(null)} aria-label="Remove reference photo" className="text-primary/70 hover:text-primary shrink-0">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-1.5 h-7 px-2 rounded-md border border-default bg-background text-xs font-medium text-muted hover:bg-surface hover:text-text transition-colors shrink-0"
                  >
                    <ImageIcon className="w-3.5 h-3.5" />
                    Add reference photo
                  </button>
                )}
              </div>

              <Button
                onClick={handleSend}
                disabled={!idea.trim() || !service || isSending}
                size="icon"
                className="h-8 w-8 shrink-0"
                loading={isSending}
                icon={<Send className="w-4 h-4" />}
                aria-label="Send"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
