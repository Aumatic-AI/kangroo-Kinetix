"use client";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useCreateLead } from "@/modules/outreach/hooks/useLeads";

/** Parent remounts this (via a `key` that changes on open) each time it's
 * opened — keeps the form fresh with no effect needed to reset it between
 * uses. Not currently wired to any button (leads are Meta Ads-derived now,
 * see LeadsPage) — kept in case manual add-a-lead is wanted again later. */
export function AddLeadModal({ listId, open, onClose }: { listId?: string; open: boolean; onClose: () => void }) {
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [error, setError] = useState("");
  const createLead = useCreateLead();

  const handleSubmit = async () => {
    if (!email.trim() || !listId) return;
    setError("");
    try {
      await createLead.mutateAsync({ email: email.trim(), firstName: firstName.trim() || undefined, listId });
      onClose();
    } catch (e: any) {
      setError(e.message || "Failed to add the lead");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Add lead</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-muted uppercase tracking-wide">Email</label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" autoFocus />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-muted uppercase tracking-wide">First name (optional)</label>
            <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="e.g. Sarah" />
          </div>
          {error && <p className="text-sm text-danger font-medium">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} loading={createLead.isPending} disabled={!email.trim()}>Add</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
