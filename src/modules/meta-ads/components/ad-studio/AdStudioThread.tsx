"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Bot, Check, Send as SendIcon, Sparkles } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Loader } from "@/components/ui/Loader";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/textarea";
import { Dropdown } from "@/components/ui/Dropdown";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { MediaPreview } from "@/components/global/MediaPreview";
import { ROUTES } from "@/config/routes";
import { useFinalizeStudioSession, useRequestStudioEdit, useStudioSession, useSubmitStudioAnswers } from "../../hooks/useAdStudio";
import { StudioAnswer, StudioAspectRatio, StudioImagePayload, StudioMessage, StudioQuestion } from "../../types/studio.types";

const ASPECT_BOX: Record<StudioAspectRatio, string> = {
  "1:1": "w-56 aspect-square",
  "4:5": "w-56 aspect-[4/5]",
  "9:16": "w-44 aspect-[9/16]",
  "16:9": "w-72 aspect-video",
};

const OTHER_OPTION = "__other__";

export function AdStudioThread({ sessionId }: { sessionId: string }) {
  const { data, isLoading } = useStudioSession(sessionId);
  const submitAnswers = useSubmitStudioAnswers(sessionId);
  const requestEdit = useRequestStudioEdit(sessionId);
  const finalize = useFinalizeStudioSession(sessionId);
  const [editText, setEditText] = useState("");
  const [pendingEdit, setPendingEdit] = useState<string | null>(null);
  const [pendingGenerate, setPendingGenerate] = useState(false);
  const [pendingFinalizeUrl, setPendingFinalizeUrl] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const messageCount = data?.messages.length ?? 0;
  const isGeneratingNow = data?.session.status === "generating";
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    // pendingEdit/pendingGenerate are the optimistic bubbles shown the
    // instant a message is sent — without them here, sending doesn't
    // scroll until the real data arrives a moment later.
  }, [messageCount, isGeneratingNow, pendingEdit, pendingGenerate]);

  if (isLoading || !data) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader />
      </div>
    );
  }

  const { session, messages, creative } = data;
  const hasImageAlready = messages.some((m) => m.kind === "image");
  const isGenerating = session.status === "generating";
  // Editing/chatting stays available for the life of the session, before or
  // after finalizing — only actively generating blocks a new request.
  const canEdit = hasImageAlready && !isGenerating;
  const currentLibraryImageUrl = creative?.media_urls?.[0] || null;

  const handleSubmitAnswers = async (answers: StudioAnswer[]) => {
    // Same instant-feedback pattern as the edit box — show the generating
    // state immediately instead of leaving a gap between "Submitted" and
    // the placeholder actually appearing.
    setPendingGenerate(true);
    try {
      await submitAnswers.mutateAsync(answers);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to submit answers — please try again.");
    } finally {
      setPendingGenerate(false);
    }
  };

  const handleFinalize = async () => {
    if (!pendingFinalizeUrl) return;
    try {
      await finalize.mutateAsync(pendingFinalizeUrl);
      toast.success("Ad added to your library");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to finalize");
    } finally {
      setPendingFinalizeUrl(null);
    }
  };

  const handleSendEdit = async () => {
    if (!editText.trim()) return;
    const instruction = editText;
    // Shows the message and the "updating" state right away instead of just
    // spinning the send button — by the time this resolves, the real
    // message + status are already in the cache (onSuccess awaits the
    // refetch), so clearing this hands off to the real data with no gap.
    setPendingEdit(instruction);
    setEditText("");
    try {
      await requestEdit.mutateAsync(instruction);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to submit the edit");
    } finally {
      setPendingEdit(null);
    }
  };

  return (
    <div className="relative h-full flex flex-col">
      <div className="shrink-0 border-b border-default px-6 py-3">
        <Link href={ROUTES.META_ADS.AD_LIBRARY} className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-text transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" /> Ad Library
        </Link>
      </div>
      <div className={`flex-1 overflow-y-auto px-6 py-6 space-y-5 ${canEdit ? "pb-28" : ""}`}>
        <div className="max-w-3xl mx-auto space-y-5">
          {messages.map((message) => (
            <MessageRow
              key={message.id}
              message={message}
              currentLibraryImageUrl={currentLibraryImageUrl}
              savedAnswers={session.qa_brief}
              onSubmitAnswers={handleSubmitAnswers}
              answersFailed={submitAnswers.isError}
              answersSubmitting={submitAnswers.isPending}
              onPreviewImage={setPreviewUrl}
              onFinalize={setPendingFinalizeUrl}
            />
          ))}
          {(isGenerating || pendingGenerate) && (
            <div className="flex items-start gap-3">
              <Avatar icon={Sparkles} />
              <div className={`bg-surface border border-default rounded-lg flex flex-col items-center justify-center gap-2 text-sm text-muted ${ASPECT_BOX[session.aspect_ratio]}`}>
                <Loader size="md" />
                {hasImageAlready ? "Updating your ad..." : "Generating your ad..."}
              </div>
            </div>
          )}
          {/* Shown the instant Send is clicked — the real message/status
              take over seamlessly once the mutation resolves, since it
              already awaits the refetch that brings them in. */}
          {pendingEdit && !isGenerating && (
            <>
              <div className="flex justify-end">
                <div className="max-w-[80%] bg-primary text-white rounded-lg px-4 py-2.5 text-sm whitespace-pre-wrap">{pendingEdit}</div>
              </div>
              <div className="flex items-start gap-3">
                <Avatar icon={Sparkles} />
                <div className={`bg-surface border border-default rounded-lg flex flex-col items-center justify-center gap-2 text-sm text-muted ${ASPECT_BOX[session.aspect_ratio]}`}>
                  <Loader size="md" />
                  Updating your ad...
                </div>
              </div>
            </>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {canEdit && (
        <div className="absolute bottom-0 left-0 right-0 px-4 pb-4 pointer-events-none">
          <div className="max-w-2xl mx-auto pointer-events-auto flex items-end gap-2 bg-background rounded-lg shadow-md border border-default p-2">
            <Textarea
              id="studio-edit-input"
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              placeholder="Describe what to change..."
              className="!border-none !ring-0 !shadow-none !bg-transparent !p-2 min-h-[44px] max-h-32 resize-none flex-1"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSendEdit();
                }
              }}
            />
            <Button
              onClick={handleSendEdit}
              disabled={!editText.trim() || requestEdit.isPending}
              loading={requestEdit.isPending}
              size="icon"
              className="h-8 w-8 shrink-0"
              icon={<SendIcon className="w-4 h-4" />}
              aria-label="Send"
            />
          </div>
        </div>
      )}

      <ConfirmModal
        open={!!pendingFinalizeUrl}
        onOpenChange={(open) => { if (!open) setPendingFinalizeUrl(null); }}
        title="Add this ad to your library?"
        description="This adds this image to your Ad Library. You can keep chatting here anytime to generate more versions or pick a different one later."
        confirmLabel="Finalize & Add to Library"
        loading={finalize.isPending}
        onConfirm={handleFinalize}
      />

      <MediaPreview
        open={!!previewUrl}
        onClose={() => setPreviewUrl(null)}
        mediaUrl={previewUrl}
        type="image"
        aspectRatio={session.aspect_ratio.replace(":", "/")}
      />
    </div>
  );
}

function MessageRow({
  message,
  currentLibraryImageUrl,
  savedAnswers,
  onSubmitAnswers,
  answersFailed,
  answersSubmitting,
  onPreviewImage,
  onFinalize,
}: {
  message: StudioMessage;
  currentLibraryImageUrl: string | null;
  savedAnswers: StudioAnswer[];
  onSubmitAnswers: (answers: StudioAnswer[]) => void;
  answersFailed: boolean;
  answersSubmitting: boolean;
  onPreviewImage: (url: string) => void;
  onFinalize: (imageUrl: string) => void;
}) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] bg-primary text-white rounded-lg px-4 py-2.5 text-sm whitespace-pre-wrap">{message.content}</div>
      </div>
    );
  }

  if (message.kind === "questions") {
    const payload = message.payload as { questions: StudioQuestion[] } | null;
    return (
      <div className="flex items-start gap-3">
        <Avatar icon={Bot} />
        <QuestionsCard
          questions={payload?.questions || []}
          savedAnswers={savedAnswers}
          onSubmit={onSubmitAnswers}
          submitFailed={answersFailed}
          submitting={answersSubmitting}
        />
      </div>
    );
  }

  if (message.kind === "image") {
    const payload = message.payload as StudioImagePayload | null;
    if (!payload) return null;
    const isCurrentLibraryImage = !!currentLibraryImageUrl && payload.imageUrl === currentLibraryImageUrl;
    return (
      <div className="flex items-start gap-3">
        <Avatar icon={Bot} />
        <div className="max-w-[70%] space-y-3">
          <button
            type="button"
            onClick={() => onPreviewImage(payload.imageUrl)}
            title="Click to view full size"
            className="block h-64 rounded-lg border border-default overflow-hidden bg-surface"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={payload.imageUrl} alt="Generated ad" className="h-full w-auto max-w-full object-contain mx-auto" />
          </button>
          <div className="flex gap-2">
            {isCurrentLibraryImage ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-success">
                <Check className="w-3.5 h-3.5" /> Currently in Library
              </span>
            ) : (
              <Button size="sm" onClick={() => onFinalize(payload.imageUrl)}>
                Finalize &amp; Add to Library
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3">
      <Avatar icon={Bot} />
      <div className="max-w-[80%] bg-surface border border-default rounded-lg px-4 py-2.5 text-sm text-text whitespace-pre-wrap">
        {message.content}
      </div>
    </div>
  );
}

function QuestionsCard({
  questions,
  savedAnswers,
  onSubmit,
  submitFailed,
  submitting,
}: {
  questions: StudioQuestion[];
  savedAnswers: StudioAnswer[];
  onSubmit: (answers: StudioAnswer[]) => void;
  submitFailed: boolean;
  submitting: boolean;
}) {
  const [selections, setSelections] = useState<Record<number, string>>({});
  const [customValues, setCustomValues] = useState<Record<number, string>>({});
  // Locks the instant the user clicks Send — doesn't wait for the server
  // round-trip, so there's no window where a second click can double-submit.
  // `savedAnswers` (from the session, durable across reloads) locks it too,
  // so a fresh page load shows the same submitted, read-only state.
  const [justSubmitted, setJustSubmitted] = useState(false);
  const locked = savedAnswers.length > 0 || justSubmitted;
  // Submission genuinely failed (e.g. the background job queue wasn't
  // reachable) and never made it into the session — the fields stay locked
  // (no re-editing), but this offers a way to resend the same answers
  // instead of leaving the card stuck looking "done" with nothing happening.
  const failed = justSubmitted && savedAnswers.length === 0 && submitFailed;

  const resolvedValue = (q: StudioQuestion) => {
    const selection = selections[q.id];
    return selection === OTHER_OPTION ? customValues[q.id] || "" : selection || "";
  };

  const answerFor = (q: StudioQuestion) => {
    const saved = savedAnswers.find((a) => a.id === q.id)?.answer;
    return saved !== undefined ? saved : resolvedValue(q);
  };

  const handleSubmit = () => {
    setJustSubmitted(true);
    onSubmit(questions.map((q) => ({ id: q.id, question: q.question, answer: resolvedValue(q) })));
  };

  return (
    <div className="max-w-[80%] w-full bg-background border border-default rounded-lg p-4 space-y-3">
      {questions.map((q) => {
        const options = [...(q.options || []).map((o) => ({ value: o, label: o })), { value: OTHER_OPTION, label: "Other (type your own)" }];
        return (
          <div key={q.id}>
            <label className="block text-sm font-medium text-text mb-1">{q.question}</label>
            {locked ? (
              <p className="text-sm text-text bg-surface border border-default rounded-lg px-3.5 py-2.5">
                {answerFor(q) || "No preference given"}
              </p>
            ) : (
              <div className="space-y-2">
                <Dropdown
                  value={selections[q.id] || ""}
                  onValueChange={(val) => setSelections((s) => ({ ...s, [q.id]: val }))}
                  options={options}
                  placeholder="Choose an answer"
                />
                {selections[q.id] === OTHER_OPTION && (
                  <Input
                    value={customValues[q.id] || ""}
                    onChange={(e) => setCustomValues((v) => ({ ...v, [q.id]: e.target.value }))}
                    placeholder={q.placeholder || "Type your own answer"}
                  />
                )}
              </div>
            )}
          </div>
        );
      })}
      {failed ? (
        <div className="space-y-2">
          <p className="text-xs font-medium text-danger">Couldn&apos;t send this — make sure the background job queue is running, then try again.</p>
          <Button size="sm" variant="outline" onClick={handleSubmit} loading={submitting} disabled={submitting}>
            Try again
          </Button>
        </div>
      ) : locked ? (
        <div className="flex items-center gap-1.5 text-xs font-semibold text-success">
          <Check className="w-3.5 h-3.5" /> Submitted
        </div>
      ) : (
        <Button size="sm" onClick={handleSubmit}>
          Send Answers
        </Button>
      )}
    </div>
  );
}
