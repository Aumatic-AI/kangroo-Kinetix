"use client";
import React, { useEffect, useState, useRef } from "react";
import { toast } from "sonner";
import { X, Video, Image as ImageIcon, Music, Mic, Sparkles, Send, Tag, Monitor, User, Mic2, UploadCloud, File, Trash2, CheckCircle2, Wand2, MessageSquare, Clock, Globe } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/Switch";
import { cn } from "@/lib/utils";
import VoiceExplorerModal from "@/components/global/VoiceExplorerModal";
import { createClient } from "@/lib/supabase/client";
import { useCreateMetaAdCreative } from "../../hooks/useAdLibrary";
import { useBusinessStore } from "@/store/business.store";

const DURATION_OPTIONS = ["20 seconds", "28 seconds", "32 seconds", "36 seconds", "40 seconds"].map((v) => ({ value: v, label: v }));
const AUDIO_STYLE_OPTIONS = ["No Voice", "Voiceover"].map((v) => ({ value: v, label: v }));
const CHARACTER_OPTIONS = [{ value: "male", label: "Male" }, { value: "female", label: "Female" }];
const VIDEO_STYLE_OPTIONS = ["Bold & Colorful", "Cinematic", "Minimal & Clean", "Dark & Moody", "Neon / Glow", "Hand-drawn / Sketch"].map((v) => ({ value: v, label: v }));
const VIDEO_MODE_OPTIONS = [
  { value: "live_action", label: "Real-life video" },
  { value: "animated_poster", label: "Animated design & text" },
];
const ASPECT_RATIO_OPTIONS = [
  { value: "9:16", label: "Portrait (9:16)" },
  { value: "16:9", label: "Landscape (16:9)" },
];
// Hebrew routes to a different ElevenLabs model under the hood
// (eleven_flash_v2_5, used for every other language here, doesn't support
// it at all — see src/services/ai/providers/elevenlabs.ts's modelIdFor).
const LANGUAGE_OPTIONS = ["English", "Spanish", "French", "Hebrew", "Turkish"].map((v) => ({ value: v, label: v }));

const VOICE_OPTIONS = {
  male: [
    { id: "KLoLpdGWK7agg0O2TJYg", label: "Charlie - Men" },
    { id: "eqz5FuihuZwmJPuvZ65E", label: "Jess - Men" }
  ],
  female: [
    { id: "wrxvN1LZJIfL3HHvffqe", label: "Bella - Lady" },
    { id: "odyUrTN5HMVKujvVAgWW", label: "Emily - Lady" },
    { id: "aD6riP1btT197c6dACmy", label: "Rachel - Lady" },
    { id: "KClAuq9Hs0wFY7oJmaGN", label: "Maayan - Lady" }
  ]
};

interface CreateAdModalInitialValues {
  type?: "video" | "image";
  duration?: string;
  idea?: string;
  service?: string;
}

export function CreateAdModal({ isOpen, onClose, onSuccess, initialValues }: { isOpen: boolean; onClose: () => void; onSuccess?: () => void; initialValues?: CreateAdModalInitialValues }) {
  // Tabs state
  const [activeTab, setActiveTab] = useState("generate");

  // AI Generate state
  const [type, setType] = useState("video");
  const [service, setService] = useState("");
  const [duration, setDuration] = useState("28 seconds");
  const [audioStyle, setAudioStyle] = useState("Voiceover");
  const [character, setCharacter] = useState<"male"|"female">("male");
  const [voiceId, setVoiceId] = useState(VOICE_OPTIONS.male[0].id);
  const [voiceLabel, setVoiceLabel] = useState(VOICE_OPTIONS.male[0].label);
  const [videoStyle, setVideoStyle] = useState("Bold & Colorful");
  const [videoMode, setVideoMode] = useState<"live_action" | "animated_poster">("live_action");
  const [aspectRatio, setAspectRatio] = useState<"9:16" | "16:9">("9:16");
  const [useReferencePhoto, setUseReferencePhoto] = useState(false);
  const [language, setLanguage] = useState("English");
  const [idea, setIdea] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isVoiceModalOpen, setIsVoiceModalOpen] = useState(false);

  // Video only: script-review step, between the form and actually kicking
  // off generation — see handleGenerateSubmit/handleConfirmScript below.
  const [step, setStep] = useState<"form" | "script">("form");
  const [scriptDraft, setScriptDraft] = useState<{ ad_mode: string; visual_mood: string; script: string[] } | null>(null);

  // Pre-fill from an external source (e.g. a ready-to-launch script handed
  // in via a retry/duplicate action) when the modal opens with initialValues set.
  useEffect(() => {
    if (isOpen && initialValues) {
      if (initialValues.type) setType(initialValues.type);
      if (initialValues.duration) setDuration(initialValues.duration);
      if (initialValues.idea) setIdea(initialValues.idea);
      if (initialValues.service) setService(initialValues.service);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialValues]);

  // AI idea generation state
  const [isGeneratingIdea, setIsGeneratingIdea] = useState(false);
  const [generatedIdeas, setGeneratedIdeas] = useState<{ id: number; type: string; angle: string; idea: string }[] | null>(null);
  const [ideaError, setIdeaError] = useState("");

  // Upload state
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();
  const createMutation = useCreateMetaAdCreative();
  const business = useBusinessStore((s) => s.business);
  const serviceOptions = (business?.services ?? []).map((s) => s.name);

  // Handlers
  const resetAndClose = () => {
    setIdea("");
    setService("");
    setGeneratedIdeas(null);
    setIdeaError("");
    setStep("form");
    setScriptDraft(null);
    onClose();
  };

  // Video: generates just the script and shows it for review — the modal
  // stays open. Image: unchanged, submits directly (there's no script for
  // a single still image).
  const handleGenerateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      if (type === "video") {
        const response = await fetch("/api/meta-ads/generate/video/script", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ duration, audioStyle, videoStyle, character, service, language, ideaPrompt: idea }),
        });
        const data = await response.json().catch(() => ({}));
        if (response.ok && data.script) {
          setScriptDraft(data.script);
          setStep("script");
        } else {
          toast.error(data.error || "Failed to generate the script");
        }
        return;
      }

      const response = await fetch("/api/meta-ads/generate/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ideaPrompt: idea, service }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        if (onSuccess) onSuccess();
        resetAndClose();
      } else {
        toast.error(data.error || "Failed to start generation");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to start generation");
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
    try {
      const response = await fetch("/api/meta-ads/generate/video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          duration, audioStyle, character, voiceId, videoStyle, videoMode, useReferencePhoto, language, aspectRatio,
          ideaPrompt: idea, service, script: scriptDraft,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        if (onSuccess) onSuccess();
        resetAndClose();
      } else {
        toast.error(data.error || "Failed to start generation");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to start generation");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGenerateIdeas = async () => {
    if (!idea.trim() || isGeneratingIdea) return;
    setIsGeneratingIdea(true);
    setIdeaError("");
    try {
      const response = await fetch("/api/meta-ads/generate-idea", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea, type, duration, audioStyle, videoStyle, character, service }),
      });
      const data = await response.json();
      if (response.ok && Array.isArray(data.ideas) && data.ideas.length > 0) {
        setGeneratedIdeas(data.ideas);
      } else {
        setIdeaError(data.error || "No ideas returned. Try rephrasing your idea.");
      }
    } catch (e) {
      setIdeaError("Failed to generate ideas. Please try again.");
    } finally {
      setIsGeneratingIdea(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setUploadFile(e.target.files[0]);
      setUploadError("");
      setUploadSuccess(false);
    }
  };

  const handleUploadSubmit = async () => {
    if (!uploadFile) return;
    setIsUploading(true);
    setUploadError("");
    try {
      const { data: businessData } = await supabase.from("businesses").select("id").limit(1).single();
      const businessId = businessData?.id;
      if (!businessId) throw new Error("No business found");

      const fileName = `${businessId}/meta-ads/uploads/${Date.now()}_${uploadFile.name.replace(/[^a-zA-Z0-9.\-_]/g, '')}`;

      const { data: storageData, error: storageError } = await supabase.storage
        .from("business_media")
        .upload(fileName, uploadFile, {
          cacheControl: '3600',
          upsert: false
        });

      if (storageError) throw new Error(storageError.message);

      const { data: publicUrlData } = supabase.storage
        .from("business_media")
        .getPublicUrl(fileName);

      const isVideo = uploadFile.type.startsWith("video/");

      await createMutation.mutateAsync({
        business_id: businessId,
        type: isVideo ? "video" : "image",
        media_urls: [publicUrlData.publicUrl],
        status: "approved", // Automatically approve direct uploads
        duration: isVideo ? "Custom" : undefined,
        idea_prompt: "Custom Upload",
      });

      setUploadSuccess(true);
      if (onSuccess) onSuccess();
      setTimeout(() => {
        onClose();
        setUploadFile(null);
        setUploadSuccess(false);
      }, 1500);
    } catch (err: any) {
      console.error(err);
      setUploadError(err.message || "Failed to upload file.");
    } finally {
      setIsUploading(false);
    }
  };

  const Label = ({ children, icon: Icon }: any) => (
    <label className="flex items-center gap-1.5 text-sm font-bold text-text mb-2">
      {Icon && <Icon className="w-4 h-4 text-muted" />}
      {children}
    </label>
  );

  return (
    <>
      <Dialog
        open={isOpen}
        onOpenChange={(open) => {
          if (!open) resetAndClose();
        }}
      >
        <DialogContent 
          className="max-w-5xl sm:max-w-5xl md:max-w-5xl bg-background border-border text-text p-0 sm:rounded-xl gap-0 overflow-hidden outline-none flex flex-col h-[85vh] shadow-lg"
        >
          
          <DialogHeader className="pl-8 pr-20 py-6 border-b border-border shrink-0 bg-surface flex flex-row items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-primary-subtle rounded-lg text-primary">
                {activeTab === "generate" ? <Sparkles className="w-6 h-6" /> : <UploadCloud className="w-6 h-6" />}
              </div>
              <div>
                <DialogTitle className="text-2xl font-bold text-text tracking-tight">
                  {activeTab === "generate" ? (step === "script" ? "Review the Script" : "Create New Ad") : "Upload Media"}
                </DialogTitle>
                <DialogDescription className="text-sm text-muted mt-1">
                  {activeTab === "generate"
                    ? (step === "script" ? "Each line becomes one scene in the video. Edit anything, then confirm." : "Generate highly engaging ads with AI.")
                    : "Upload your finalized video or image assets directly."}
                </DialogDescription>
              </div>
            </div>
            {step === "form" && (
              <Button
                variant="outline"
                onClick={() => setActiveTab(activeTab === "generate" ? "upload" : "generate")}
                className="rounded-lg font-semibold bg-background shadow-sm hover:bg-surface shrink-0"
                icon={activeTab === "generate" ? <UploadCloud className="w-4 h-4" /> : <Wand2 className="w-4 h-4" />}
              >
                {activeTab === "generate" ? "Direct Upload" : "AI Generation"}
              </Button>
            )}
          </DialogHeader>

          <div className="flex-1 overflow-y-auto bg-background">
            {activeTab === "generate" ? (
              step === "script" && scriptDraft ? (
                <div className="p-8 space-y-5 outline-none">
                  <button
                    type="button"
                    onClick={() => setStep("form")}
                    className="text-sm font-semibold text-primary hover:underline"
                  >
                    ← Edit details
                  </button>
                  <div className="space-y-4">
                    {scriptDraft.script.map((line, i) => (
                      <div key={i}>
                        <Label className="mb-1.5 block text-xs font-semibold text-muted">Scene {i + 1}</Label>
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
                </div>
              ) : (
              <div className="p-8 space-y-6 outline-none">

              {/* Format Selection */}
              <section>
                <Label className="mb-2 block text-sm font-semibold">Format</Label>
                <div className="flex items-center gap-2">
                  <button 
                    type="button"
                    onClick={() => setType("video")}
                    className={cn(
                      "flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-lg transition-all border",
                      type === "video" 
                        ? "bg-primary text-white border-primary shadow-sm" 
                        : "border-transparent text-muted hover:bg-surface"
                    )}
                  >
                    <Video className="w-4 h-4 shrink-0" /> Video Ad
                  </button>
                  <button 
                    type="button"
                    onClick={() => setType("image")}
                    className={cn(
                      "flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-lg transition-all border",
                      type === "image" 
                        ? "bg-primary text-white border-primary shadow-sm" 
                        : "border-transparent text-muted hover:bg-surface"
                    )}
                  >
                    <ImageIcon className="w-4 h-4 shrink-0" /> Static Image
                  </button>
                </div>
              </section>

              {/* Story Description */}
              <section>
                <div className="flex items-center justify-between mb-2">
                  <Label className="mb-0 block text-sm font-semibold">SCRIPT<span className="text-red-500">*</span></Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleGenerateIdeas}
                    disabled={!idea.trim() || isGeneratingIdea}
                    className="h-7 px-3 rounded-md text-xs"
                    icon={isGeneratingIdea ? <div className="w-3.5 h-3.5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  >
                    {isGeneratingIdea ? "Generating..." : "Generate Ideas"}
                  </Button>
                </div>
                <Textarea
                  value={idea}
                  onChange={(e) => { setIdea(e.target.value); if (generatedIdeas) setGeneratedIdeas(null); }}
                  placeholder={type === "video" ? "Describe your video concept, offer, or story angle..." : "Describe your image concept, offer, or visual angle..."}
                  className="!p-4 min-h-[120px]"
                />
                {ideaError && (
                  <p className="text-xs font-medium text-danger mt-2">{ideaError}</p>
                )}
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
              </section>

              {/* Service Selection */}
              <section>
                <Label className="mb-2 block text-sm font-semibold">SERVICE<span className="text-red-500">*</span></Label>
                <Dropdown
                  value={service}
                  onValueChange={setService}
                  placeholder="Select a service"
                  options={serviceOptions.map((s) => ({ value: s, label: s }))}
                />
              </section>

              {type === "video" && (
                <div className="bg-surface p-6 rounded-xl border border-default grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label className="mb-2 block text-sm font-semibold">Duration</Label>
                    <Dropdown value={duration} onValueChange={setDuration} options={DURATION_OPTIONS} />
                  </div>

                  <div>
                    <Label className="mb-2 block text-sm font-semibold">Audio Style</Label>
                    <Dropdown value={audioStyle} onValueChange={setAudioStyle} options={AUDIO_STYLE_OPTIONS} />
                  </div>

                  {audioStyle === "Voiceover" && (
                    <div>
                      <Label className="mb-2 block text-sm font-semibold">Voice</Label>
                      <button
                        type="button"
                        onClick={() => setIsVoiceModalOpen(true)}
                        className="w-full h-9 px-4 flex items-center justify-center gap-2 bg-background border border-dashed border-primary/50 text-primary hover:bg-primary/5 rounded-lg text-sm font-semibold transition-all focus:ring-1 focus:ring-primary/20"
                      >
                        <Mic2 className="w-4 h-4 shrink-0" />
                        <span className="truncate">{voiceLabel !== VOICE_OPTIONS.male[0].label ? voiceLabel : "Select Voice *"}</span>
                      </button>
                    </div>
                  )}

                  <div>
                    <Label className="mb-2 block text-sm font-semibold">Character</Label>
                    <Dropdown
                      value={character}
                      onValueChange={(val) => {
                        const newChar = val as "male" | "female";
                        setCharacter(newChar);
                        setVoiceId(VOICE_OPTIONS[newChar][0].id);
                        setVoiceLabel(VOICE_OPTIONS[newChar][0].label);
                      }}
                      options={CHARACTER_OPTIONS}
                    />
                  </div>

                  <div>
                    <Label className="mb-2 block text-sm font-semibold">Visual Style</Label>
                    <Dropdown value={videoStyle} onValueChange={setVideoStyle} options={VIDEO_STYLE_OPTIONS} />
                  </div>

                  <div>
                    <Label className="mb-2 block text-sm font-semibold">Video type</Label>
                    <Dropdown
                      value={videoMode}
                      onValueChange={(val) => setVideoMode(val as "live_action" | "animated_poster")}
                      options={VIDEO_MODE_OPTIONS}
                    />
                    <p className="mt-1 text-xs text-muted">Real people and places, or an animated design with text.</p>
                  </div>

                  <div>
                    <Label className="mb-2 block text-sm font-semibold">Language</Label>
                    <Dropdown value={language} onValueChange={setLanguage} options={LANGUAGE_OPTIONS} />
                  </div>

                  <div>
                    <Label className="mb-2 block text-sm font-semibold">Aspect Ratio</Label>
                    <Dropdown
                      value={aspectRatio}
                      onValueChange={(val) => setAspectRatio(val as "9:16" | "16:9")}
                      options={ASPECT_RATIO_OPTIONS}
                    />
                  </div>
                </div>
              )}

              {type === "video" && (
                <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-default bg-surface">
                  <div>
                    <p className="text-sm font-semibold text-text">Use my reference photo</p>
                    <p className="text-xs text-muted">Only where it fits — off by default.</p>
                  </div>
                  <Switch checked={useReferencePhoto} onCheckedChange={setUseReferencePhoto} />
                </div>
              )}
              </div>
              )
            ) : (
              <div className="flex-1 p-8 m-0 bg-background flex flex-col justify-center min-h-full">
              <div className="max-w-2xl mx-auto w-full">
                <div 
                  onClick={() => !uploadFile && fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-12 flex flex-col items-center justify-center text-center transition-all ${
                    !uploadFile ? "border-border hover:border-primary hover:bg-surface cursor-pointer bg-background" : "border-border bg-surface"
                  }`}
                >
                  <div className="w-20 h-20 bg-primary-subtle rounded-full flex items-center justify-center mb-6 text-primary">
                    <UploadCloud className="w-10 h-10" />
                  </div>
                  <h3 className="text-xl font-bold text-text mb-2">Upload Your Media</h3>
                  <p className="text-sm text-muted mb-8 max-w-md">Bypass AI generation and directly upload your finalized video or image assets into the Approved library.</p>
                  
                  {uploadFile ? (
                    <div className="w-full max-w-sm bg-background border border-border shadow-sm rounded-lg p-4 flex items-center justify-between">
                      <div className="flex items-center gap-4 overflow-hidden">
                        <div className="p-2 bg-primary-subtle text-primary rounded-lg">
                          <File className="w-6 h-6 shrink-0" />
                        </div>
                        <div className="text-left overflow-hidden">
                          <p className="text-sm font-semibold text-text truncate w-[180px]">{uploadFile.name}</p>
                          <p className="text-xs text-muted font-medium">{(uploadFile.size / 1024 / 1024).toFixed(2)} MB</p>
                        </div>
                      </div>
                      <button 
                        type="button" 
                        onClick={(e) => { e.stopPropagation(); setUploadFile(null); }}
                        disabled={isUploading}
                        className="p-2 text-muted hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3 w-full max-w-xs">
                      <input 
                        type="file" 
                        accept="video/mp4,video/quicktime,image/jpeg,image/png,image/webp"
                        className="hidden" 
                        ref={fileInputRef}
                        onChange={handleFileChange}
                      />
                      <Button onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }} className="w-full rounded-lg py-3 font-semibold">
                        Choose File
                      </Button>
                      <span className="text-xs font-semibold text-muted tracking-wide uppercase mt-1">MP4, MOV, JPG, PNG (Max 50MB)</span>
                    </div>
                  )}

                  {uploadError && (
                    <div className="w-full max-w-sm mt-6 p-4 bg-danger-bg border border-danger-border text-danger text-sm font-medium rounded-lg text-left flex items-start gap-3">
                      <X className="w-5 h-5 shrink-0" />
                      {uploadError}
                    </div>
                  )}
                  {uploadSuccess && (
                    <div className="w-full max-w-sm mt-6 p-4 bg-success-bg border border-success-border text-success text-sm font-medium rounded-lg text-left flex items-center gap-3">
                      <CheckCircle2 className="w-5 h-5 shrink-0" /> 
                      Media uploaded successfully!
                    </div>
                  )}
                </div>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="px-8 py-5 border-t border-border bg-surface flex flex-row justify-end gap-4 shrink-0">
            <Button variant="outline" onClick={resetAndClose} className="px-6 rounded-lg font-semibold">
              Cancel
            </Button>
            {activeTab === "generate" ? (
              step === "script" ? (
                <Button
                  onClick={handleConfirmScript}
                  disabled={isSubmitting}
                  className="px-8 rounded-lg font-bold shadow-md"
                  icon={isSubmitting ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Send className="w-5 h-5" />}
                >
                  {isSubmitting ? "Generating..." : "Confirm & Generate Video"}
                </Button>
              ) : (
                <Button
                  onClick={handleGenerateSubmit}
                  disabled={isSubmitting || !idea.trim() || !service}
                  className="px-8 rounded-lg font-bold shadow-md"
                  icon={isSubmitting ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Send className="w-5 h-5" />}
                >
                  {isSubmitting ? (type === "video" ? "Generating script..." : "Generating...") : (type === "video" ? "Generate Script" : "Generate Creative")}
                </Button>
              )
            ) : (
              <Button
                onClick={handleUploadSubmit}
                disabled={!uploadFile || isUploading}
                className="px-8 rounded-lg font-bold shadow-md"
                icon={isUploading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <UploadCloud className="w-5 h-5" />}
              >
                {isUploading ? "Uploading..." : "Upload Media"}
              </Button>
            )}
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
