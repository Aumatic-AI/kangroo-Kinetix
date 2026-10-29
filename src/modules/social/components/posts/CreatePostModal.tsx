"use client";
import React, { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { ImageIcon, Video, MessageSquareText, Sparkles, UploadCloud, Send, Mic2, File, Trash2, X, RectangleHorizontal, RectangleVertical } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/Switch";
import { cn } from "@/lib/utils";
import { ROUTES } from "@/config/routes";
import { PLATFORMS } from "../../lib/platforms";
import { useConnections } from "../../hooks/usePosts";
import VoiceExplorerModal from "@/components/global/VoiceExplorerModal";
import { useBusinessStore } from "@/store/business.store";

const VOICE_OPTIONS = {
  male: [
    { id: "KLoLpdGWK7agg0O2TJYg", label: "Charlie - Men" },
    { id: "eqz5FuihuZwmJPuvZ65E", label: "Jess - Men" },
  ],
  female: [
    { id: "wrxvN1LZJIfL3HHvffqe", label: "Bella - Lady" },
    { id: "odyUrTN5HMVKujvVAgWW", label: "Emily - Lady" },
    { id: "aD6riP1btT197c6dACmy", label: "Rachel - Lady" },
    { id: "KClAuq9Hs0wFY7oJmaGN", label: "Maayan - Lady" },
  ],
};

// Same option set as Meta Ads' CreateAdModal — kept identical on purpose so
// the two video-generation flows behave the same way for the same input.
const DURATION_OPTIONS = ["20 seconds", "28 seconds", "32 seconds", "36 seconds", "40 seconds"].map((v) => ({ value: v, label: v }));
const AUDIO_STYLE_OPTIONS = ["No Voice", "Voiceover"].map((v) => ({ value: v, label: v }));
const VIDEO_STYLE_OPTIONS = ["Bold & Colorful", "Cinematic", "Minimal & Clean", "Dark & Moody", "Neon / Glow", "Hand-drawn / Sketch"].map((v) => ({ value: v, label: v }));
const VIDEO_MODE_OPTIONS = [
  { value: "live_action", label: "Real-life video" },
  { value: "animated_poster", label: "Animated design & text" },
];
// Hebrew routes to a different ElevenLabs model under the hood
// (eleven_flash_v2_5, used for every other language here, doesn't support
// it at all — see src/services/ai/providers/elevenlabs.ts's modelIdFor).
const LANGUAGE_OPTIONS = ["English", "Spanish", "French", "Hebrew", "Turkish"].map((v) => ({ value: v, label: v }));
const CHARACTER_OPTIONS = [{ value: "male", label: "Male" }, { value: "female", label: "Female" }];

interface CreatePostModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function CreatePostModal({ isOpen, onClose, onSuccess }: CreatePostModalProps) {
  const router = useRouter();
  const { data: connections = [] } = useConnections(isOpen);
  const [mode, setMode] = useState<"generate" | "upload">("generate");
  const [format, setFormat] = useState<"image" | "video" | "text">("image");
  const [textPlatforms, setTextPlatforms] = useState<Set<string>>(new Set());
  const [idea, setIdea] = useState("");
  const [aspectRatio, setAspectRatio] = useState<"16:9" | "9:16">("9:16");
  const business = useBusinessStore((s) => s.business);
  const serviceOptions = (business?.services ?? []).map((s) => s.name);
  const [serviceOverride, setServiceOverride] = useState("");
  const service = serviceOverride || serviceOptions[0] || "";
  const [videoStyle, setVideoStyle] = useState(VIDEO_STYLE_OPTIONS[0].value);
  const [videoMode, setVideoMode] = useState<"live_action" | "animated_poster">("live_action");
  const [useReferencePhoto, setUseReferencePhoto] = useState(false);
  const [language, setLanguage] = useState(LANGUAGE_OPTIONS[0].value);
  const [duration, setDuration] = useState(DURATION_OPTIONS[1].value);
  const [audioStyle, setAudioStyle] = useState("Voiceover");
  const [character, setCharacter] = useState<"male" | "female">("male");
  const [voiceId, setVoiceId] = useState(VOICE_OPTIONS.male[0].id);
  const [voiceLabel, setVoiceLabel] = useState(VOICE_OPTIONS.male[0].label);
  const [isVoiceModalOpen, setIsVoiceModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Video only: script-review step, between the form and actually kicking
  // off generation — see handleGenerate/handleConfirmScript below. Mirrors
  // the same two-phase flow already proven in Meta Ads' CreateAdModal.
  const [step, setStep] = useState<"form" | "script">("form");
  const [scriptDraft, setScriptDraft] = useState<{ ad_mode: string; visual_mood: string; script: string[] } | null>(null);
  const isScriptReview = format === "video" && step === "script";

  const [isGeneratingIdeas, setIsGeneratingIdeas] = useState(false);
  const [generatedIdeas, setGeneratedIdeas] = useState<{ id: number; angle: string; idea: string }[] | null>(null);
  const [ideaError, setIdeaError] = useState("");

  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setIdea("");
    setUploadFile(null);
    setError("");
    setGeneratedIdeas(null);
    setIdeaError("");
    setTextPlatforms(new Set());
    setStep("form");
    setScriptDraft(null);
  };

  const toggleTextPlatform = (platform: string) => {
    setTextPlatforms((prev) => {
      const next = new Set(prev);
      next.has(platform) ? next.delete(platform) : next.add(platform);
      return next;
    });
  };

  const handleGenerateIdeas = async () => {
    if (!idea.trim() || isGeneratingIdeas) return;
    setIsGeneratingIdeas(true);
    setIdeaError("");
    try {
      const res = await fetch("/api/social/posts/generate-idea", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ideaPrompt: idea, format, service: format === "video" ? service : undefined }),
      });
      const data = await res.json();
      if (res.ok && Array.isArray(data.ideas) && data.ideas.length > 0) {
        setGeneratedIdeas(data.ideas);
      } else {
        setIdeaError(data.error || "No ideas returned. Try rephrasing your idea.");
      }
    } catch {
      setIdeaError("Failed to generate ideas. Please try again.");
    } finally {
      setIsGeneratingIdeas(false);
    }
  };

  // Video: generates just the script and shows it for review — the modal
  // stays open. Image: unchanged, submits directly (there's no script for a
  // single still image).
  const handleGenerate = async () => {
    if (!idea.trim()) return;
    setIsSubmitting(true);
    setError("");
    try {
      if (format === "video") {
        const res = await fetch("/api/social/posts/generate/video/script", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ideaPrompt: idea, duration, character, service, language }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.script) {
          setScriptDraft(data.script);
          setStep("script");
        } else {
          setError(data.error || "Failed to generate the script");
        }
        return;
      }

      const res = await fetch("/api/social/posts/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          format,
          ideaPrompt: idea,
          platforms: [],
          aspectRatio: format === "image" ? aspectRatio : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to start generation");
      onSuccess?.();
      onClose();
      reset();
    } catch (e: any) {
      setError(e.message || "Something went wrong");
    } finally {
      setIsSubmitting(false);
    }
  };

  // The user has reviewed (and possibly edited) the script — now actually
  // start generation, passing that exact script through so the background
  // job doesn't generate its own.
  const handleConfirmScript = async () => {
    if (!scriptDraft) return;
    setIsSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/social/posts/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          format: "video",
          ideaPrompt: idea,
          platforms: [],
          aspectRatio,
          duration,
          audioStyle,
          character,
          voiceId: audioStyle === "Voiceover" ? voiceId : undefined,
          service,
          videoStyle,
          videoMode,
          useReferencePhoto,
          language,
          script: scriptDraft,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to start generation");
      onSuccess?.();
      onClose();
      reset();
    } catch (e: any) {
      setError(e.message || "Something went wrong");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePublishText = async () => {
    if (!idea.trim() || !textPlatforms.size) return;
    setIsSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/social/posts/generate-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ideaPrompt: idea, platforms: [...textPlatforms] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate post");
      onSuccess?.();
      onClose();
      reset();
      router.push(`${ROUTES.SOCIAL.POSTS_PUBLISH}?socialPostIds=${data.socialPostIds.join(",")}&step=preview`);
    } catch (e: any) {
      setError(e.message || "Something went wrong");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpload = async () => {
    if (!uploadFile) return;
    setIsSubmitting(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", uploadFile);
      form.append("platforms", JSON.stringify([]));
      if (idea.trim()) form.append("captionIdea", idea);

      const res = await fetch("/api/social/posts/upload", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to upload");
      onSuccess?.();
      onClose();
      reset();
    } catch (e: any) {
      setError(e.message || "Something went wrong");
    } finally {
      setIsSubmitting(false);
    }
  };

  const canSubmit = isScriptReview
    ? !!scriptDraft
    : mode === "upload"
    ? !!uploadFile
    : format === "text"
    ? !!idea.trim() && textPlatforms.size > 0
    : !!idea.trim();
  const submitLabel = isScriptReview
    ? "Confirm & Generate"
    : mode === "upload"
    ? "Upload"
    : format === "text"
    ? "Publish"
    : format === "video"
    ? "Generate Script"
    : "Generate";
  const handleSubmit = isScriptReview
    ? handleConfirmScript
    : mode === "upload"
    ? handleUpload
    : format === "text"
    ? handlePublishText
    : handleGenerate;

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => { if (!open) { onClose(); reset(); } }}>
        <DialogContent className="max-w-3xl bg-background border-border text-text p-0 rounded-2xl gap-0 overflow-hidden outline-none flex flex-col max-h-[88vh]">
          <DialogHeader className="px-7 py-5 border-b border-border shrink-0 bg-surface flex flex-row items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-primary-subtle rounded-xl text-primary">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <DialogTitle className="text-xl font-bold text-text">{isScriptReview ? "Review the Script" : "Create Post"}</DialogTitle>
                <DialogDescription className="text-xs text-muted mt-0.5">
                  {isScriptReview ? "Each line becomes one scene in the video. Edit anything, then confirm." : "Create content first, decide where it goes whenever you're ready."}
                </DialogDescription>
              </div>
            </div>
            {!isScriptReview && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setMode(mode === "generate" ? "upload" : "generate")}
                className="rounded-lg font-semibold bg-background"
                icon={mode === "generate" ? <UploadCloud className="w-3.5 h-3.5" /> : <Sparkles className="w-3.5 h-3.5" />}
              >
                {mode === "generate" ? "Upload instead" : "Generate with AI"}
              </Button>
            )}
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-7 space-y-6">
            {isScriptReview && scriptDraft ? (
              <div className="space-y-4">
                <button
                  type="button"
                  onClick={() => setStep("form")}
                  className="text-sm font-semibold text-primary hover:underline"
                >
                  ← Edit details
                </button>
                {scriptDraft.script.map((line, i) => (
                  <div key={i}>
                    <p className="text-xs font-semibold text-muted mb-1.5">Scene {i + 1}</p>
                    <Textarea
                      value={line}
                      onChange={(e) => {
                        const next = [...scriptDraft.script];
                        next[i] = e.target.value;
                        setScriptDraft({ ...scriptDraft, script: next });
                      }}
                      className="!p-3 min-h-[64px] text-sm"
                    />
                  </div>
                ))}
              </div>
            ) : (
            <>
            {/* Format */}
            {mode === "generate" && (
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-muted mb-2">Format</p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setFormat("image")}
                    className={cn(
                      "flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-lg transition-all border",
                      format === "image" ? "bg-primary text-white border-primary shadow-sm" : "border-transparent text-muted hover:bg-surface"
                    )}
                  >
                    <ImageIcon className="w-4 h-4 shrink-0" /> Image
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormat("video")}
                    className={cn(
                      "flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-lg transition-all border",
                      format === "video" ? "bg-primary text-white border-primary shadow-sm" : "border-transparent text-muted hover:bg-surface"
                    )}
                  >
                    <Video className="w-4 h-4 shrink-0" /> Video
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormat("text")}
                    className={cn(
                      "flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-lg transition-all border",
                      format === "text" ? "bg-primary text-white border-primary shadow-sm" : "border-transparent text-muted hover:bg-surface"
                    )}
                  >
                    <MessageSquareText className="w-4 h-4 shrink-0" /> Text Post
                  </button>
                </div>
              </div>
            )}

            {mode === "generate" && format === "text" && (
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-muted mb-2">Platforms</p>
                <div className="flex items-center gap-2 flex-wrap">
                  {PLATFORMS.map((p) => {
                    const Icon = p.icon;
                    const isConnected = connections.some((c) => c.platform === p.platform);
                    const eligible = p.supportsTextOnly && isConnected;
                    const isSelected = textPlatforms.has(p.platform);
                    return (
                      <button
                        key={p.platform}
                        type="button"
                        disabled={!eligible}
                        onClick={() => toggleTextPlatform(p.platform)}
                        className={cn(
                          "flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-lg transition-all border",
                          !eligible
                            ? "opacity-40 cursor-not-allowed border-transparent text-muted"
                            : isSelected
                            ? "bg-secondary text-text border-secondary shadow-sm"
                            : "border-transparent text-muted hover:bg-surface"
                        )}
                      >
                        <Icon className="w-4 h-4 shrink-0" style={{ color: p.color }} />
                        {p.label}
                      </button>
                    );
                  })}
                </div>
                {!PLATFORMS.some((p) => p.supportsTextOnly && connections.some((c) => c.platform === p.platform)) && (
                  <p className="text-xs text-muted mt-2">None of your connected accounts support text-only posts (Facebook, X, and LinkedIn do).</p>
                )}
              </div>
            )}

            {mode === "generate" ? (
              <>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-bold uppercase tracking-wide text-muted">
                      {format === "video" ? "Story Description" : format === "text" ? "Post Content" : "Image Generation Prompt"}
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleGenerateIdeas}
                      disabled={!idea.trim() || isGeneratingIdeas}
                      className="h-7 px-3 rounded-md text-xs"
                      icon={isGeneratingIdeas ? <div className="w-3.5 h-3.5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                    >
                      {isGeneratingIdeas ? "Generating..." : "Generate Ideas"}
                    </Button>
                  </div>
                  <Textarea
                    value={idea}
                    onChange={(e) => { setIdea(e.target.value); if (generatedIdeas) setGeneratedIdeas(null); }}
                    placeholder={
                      format === "video"
                        ? "Describe the story you want told..."
                        : format === "text"
                        ? "What's this post about?"
                        : "Describe what the image should show and what it's about..."
                    }
                    className="!p-4 min-h-[110px]"
                  />
                  {ideaError && <p className="text-xs font-medium text-danger mt-2">{ideaError}</p>}
                  {generatedIdeas && generatedIdeas.length > 0 && (
                    <div className="mt-4 flex flex-col gap-2.5 p-4 rounded-xl border border-primary/20 bg-primary-subtle/40">
                      <div className="text-xs font-bold text-primary uppercase tracking-wide">✨ AI Generated Ideas — Click to use</div>
                      <div className="flex flex-col gap-2">
                        {generatedIdeas.map((ideaObj, i) => (
                          <button
                            type="button"
                            key={`${ideaObj.id}-${i}`}
                            onClick={() => { setIdea(ideaObj.idea); setGeneratedIdeas(null); }}
                            className="text-left p-3 rounded-lg border border-default bg-background hover:border-primary hover:bg-primary-subtle/60 transition-all text-sm text-text leading-relaxed"
                          >
                            <span className="block text-[10px] font-bold uppercase tracking-wide text-muted mb-1">{ideaObj.angle.replace(/_/g, " ")}</span>
                            {ideaObj.idea}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {(format === "image" || format === "video") && (
                  <div>
                    <p className="text-xs font-semibold text-muted mb-2">Aspect Ratio</p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setAspectRatio("16:9")}
                        className={cn(
                          "flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-lg transition-all border",
                          aspectRatio === "16:9" ? "bg-primary text-white border-primary shadow-sm" : "border-transparent text-muted hover:bg-surface"
                        )}
                      >
                        <RectangleHorizontal className="w-4 h-4 shrink-0" /> Landscape (16:9)
                      </button>
                      <button
                        type="button"
                        onClick={() => setAspectRatio("9:16")}
                        className={cn(
                          "flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-lg transition-all border",
                          aspectRatio === "9:16" ? "bg-primary text-white border-primary shadow-sm" : "border-transparent text-muted hover:bg-surface"
                        )}
                      >
                        <RectangleVertical className="w-4 h-4 shrink-0" /> Portrait (9:16)
                      </button>
                    </div>
                  </div>
                )}

                {format === "video" && (
                  <div className="bg-surface p-5 rounded-xl border border-default grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <p className="text-xs font-semibold text-muted mb-2">Category</p>
                      <Dropdown value={service} onValueChange={setServiceOverride} options={serviceOptions.map((s) => ({ value: s, label: s }))} />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-muted mb-2">Duration</p>
                      <Dropdown value={duration} onValueChange={setDuration} options={DURATION_OPTIONS} />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-muted mb-2">Audio Style</p>
                      <Dropdown value={audioStyle} onValueChange={setAudioStyle} options={AUDIO_STYLE_OPTIONS} />
                    </div>
                    {audioStyle === "Voiceover" && (
                      <div>
                        <p className="text-xs font-semibold text-muted mb-2">Voice</p>
                        <button
                          type="button"
                          onClick={() => setIsVoiceModalOpen(true)}
                          className="w-full h-9 px-3 flex items-center justify-center gap-2 bg-background border border-dashed border-primary/50 text-primary hover:bg-primary/5 rounded-lg text-xs font-semibold transition-all"
                        >
                          <Mic2 className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">{voiceLabel}</span>
                        </button>
                      </div>
                    )}
                    <div>
                      <p className="text-xs font-semibold text-muted mb-2">Character</p>
                      <Dropdown
                        value={character}
                        onValueChange={(val) => {
                          const c = val as "male" | "female";
                          setCharacter(c);
                          setVoiceId(VOICE_OPTIONS[c][0].id);
                          setVoiceLabel(VOICE_OPTIONS[c][0].label);
                        }}
                        options={CHARACTER_OPTIONS}
                      />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-muted mb-2">Visual Style</p>
                      <Dropdown value={videoStyle} onValueChange={setVideoStyle} options={VIDEO_STYLE_OPTIONS} />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-muted mb-2">Video type</p>
                      <Dropdown
                        value={videoMode}
                        onValueChange={(val) => setVideoMode(val as "live_action" | "animated_poster")}
                        options={VIDEO_MODE_OPTIONS}
                      />
                      <p className="mt-1 text-[11px] text-muted">Real people and places, or an animated design with text.</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-muted mb-2">Language</p>
                      <Dropdown value={language} onValueChange={setLanguage} options={LANGUAGE_OPTIONS} />
                    </div>
                  </div>
                )}

                {format === "video" && (
                  <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-default bg-surface">
                    <div>
                      <p className="text-sm font-semibold text-text">Use my reference photo</p>
                      <p className="text-xs text-muted">Only where it fits — off by default.</p>
                    </div>
                    <Switch checked={useReferencePhoto} onCheckedChange={setUseReferencePhoto} />
                  </div>
                )}
              </>
            ) : (
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-muted mb-2">Media File</p>
                <div
                  onClick={() => !uploadFile && fileInputRef.current?.click()}
                  className={cn(
                    "border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-center transition-all",
                    !uploadFile ? "border-border hover:border-primary hover:bg-surface cursor-pointer" : "border-border bg-surface"
                  )}
                >
                  <input
                    type="file"
                    accept="video/mp4,video/quicktime,image/jpeg,image/png,image/webp"
                    className="hidden"
                    ref={fileInputRef}
                    onChange={(e) => e.target.files?.[0] && setUploadFile(e.target.files[0])}
                  />
                  {uploadFile ? (
                    <div className="w-full max-w-sm bg-background border border-border rounded-lg p-3 flex items-center justify-between">
                      <div className="flex items-center gap-3 overflow-hidden">
                        <div className="p-2 bg-primary-subtle text-primary rounded-lg"><File className="w-5 h-5" /></div>
                        <p className="text-sm font-semibold text-text truncate">{uploadFile.name}</p>
                      </div>
                      <button type="button" onClick={(e) => { e.stopPropagation(); setUploadFile(null); }} className="p-1.5 text-muted hover:text-danger">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <UploadCloud className="w-8 h-8 text-muted mb-2" />
                      <p className="text-sm font-semibold text-text">Click to choose a file</p>
                      <p className="text-xs text-muted mt-1">MP4, MOV, JPG, PNG</p>
                    </>
                  )}
                </div>
                <Textarea
                  value={idea}
                  onChange={(e) => setIdea(e.target.value)}
                  placeholder="Optional — what's this about? (used to write the caption)"
                  className="!p-4 min-h-[70px] mt-4"
                />
              </div>
            )}
            </>
            )}

            {error && (
              <div className="flex items-start gap-2 text-sm text-danger bg-danger-bg border border-danger-border rounded-lg px-4 py-3">
                <X className="w-4 h-4 shrink-0 mt-0.5" />
                {error}
              </div>
            )}
          </div>

          <DialogFooter className="px-7 py-4 border-t border-border bg-surface flex flex-row justify-end gap-3 shrink-0">
            <Button variant="outline" onClick={() => { onClose(); reset(); }} className="rounded-lg font-semibold">Cancel</Button>
            <Button
              onClick={handleSubmit}
              disabled={!canSubmit || isSubmitting}
              className="px-6 rounded-lg font-bold"
              icon={isSubmitting ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Send className="w-4 h-4" />}
            >
              {isSubmitting ? (isScriptReview ? "Generating..." : format === "video" ? "Generating script..." : "Working...") : submitLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <VoiceExplorerModal
        isOpen={isVoiceModalOpen}
        onOpenChange={setIsVoiceModalOpen}
        selectedVoiceId={voiceId}
        onSelectVoice={(id, label) => {
          setVoiceId(id);
          setVoiceLabel(label);
          setIsVoiceModalOpen(false);
        }}
      />
    </>
  );
}
