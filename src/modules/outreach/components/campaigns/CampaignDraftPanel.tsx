"use client";
import { useState } from "react";
import { RotateCcw, Check, Pencil } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/textarea";
import { EmailPreview } from "./EmailPreview";
import {
  useRegenerateOutreachCampaign,
  useEditOutreachCampaignContent,
  useApproveOutreachCampaign,
} from "../../hooks/useCampaigns";
import { OutreachCampaignDetail } from "../../types/outreach.types";

/** The right-hand column of the campaign detail page — the email itself,
 * plus whatever action it currently needs (edit/regenerate/approve while a
 * draft, a pointer to the Send button on the list once ready). Status
 * badge, campaign meta, and performance stats live in the page's left
 * column instead (see CampaignDetailPage) — this panel only ever branches
 * on the unified campaign.status, never a raw Instantly code. */
export function CampaignDraftPanel({ campaign }: { campaign: OutreachCampaignDetail }) {
  const [editing, setEditing] = useState(false);
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");
  const [feedback, setFeedback] = useState("");

  const regenerate = useRegenerateOutreachCampaign();
  const saveEdit = useEditOutreachCampaignContent();
  const approve = useApproveOutreachCampaign();

  const handleRegenerate = async () => {
    if (!feedback.trim()) return;
    await regenerate.mutateAsync({ campaignId: campaign.id, feedback: feedback.trim() });
    setFeedback("");
  };

  const startEditing = () => {
    if (!campaign.generatedBody) return;
    setEditSubject(campaign.generatedBody.subject);
    setEditBody(campaign.generatedBody.body);
    setEditing(true);
  };

  const saveEdits = async () => {
    await saveEdit.mutateAsync({ campaignId: campaign.id, subject: editSubject, body: editBody });
    setEditing(false);
  };

  return (
    <div className="space-y-4">
      {editing ? (
        <div className="space-y-2">
          <label className="text-xs font-bold text-muted uppercase tracking-wide">Subject</label>
          <Input value={editSubject} onChange={(e) => setEditSubject(e.target.value)} />
          <label className="text-xs font-bold text-muted uppercase tracking-wide">Body</label>
          <Textarea value={editBody} onChange={(e) => setEditBody(e.target.value)} rows={8} />
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setEditing(false)}>Discard changes</Button>
            <Button size="sm" onClick={saveEdits} loading={saveEdit.isPending} icon={<Check className="w-3.5 h-3.5" />}>Save edits</Button>
          </div>
        </div>
      ) : (
        campaign.generatedBody && (
          <EmailPreview
            subject={campaign.generatedBody.subject}
            body={campaign.generatedBody.body}
            ctaText={campaign.ctaText}
            ctaLink={campaign.ctaLink}
            headerAction={
              campaign.status === "draft" && (
                <Button size="sm" variant="outline" onClick={startEditing} icon={<Pencil className="w-3.5 h-3.5" />}>Edit</Button>
              )
            }
          />
        )
      )}

      {campaign.status === "draft" && !editing && (
        <div className="space-y-3">
          <Textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} rows={2} placeholder="Ask the AI for changes (optional)" />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={handleRegenerate} loading={regenerate.isPending} disabled={!feedback.trim()} icon={<RotateCcw className="w-3.5 h-3.5" />}>Regenerate</Button>
            <Button onClick={() => approve.mutate(campaign.id)} loading={approve.isPending} icon={<Check className="w-4 h-4" />}>Approve</Button>
          </div>
        </div>
      )}

      {campaign.status === "ready" && (
        <p className="text-sm text-muted">Approved — use the Send button above to send it.</p>
      )}

      {campaign.status === "no_recipients" && (
        <p className="text-sm text-muted">No eligible leads were found to send to — everyone in this list is suppressed, already contacted, or the list is empty.</p>
      )}
    </div>
  );
}
