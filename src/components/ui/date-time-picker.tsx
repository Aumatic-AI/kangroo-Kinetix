"use client";
import * as React from "react";
import { CalendarIcon, Clock } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/Button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface DateTimePickerProps {
  value?: Date;
  onChange: (date: Date | undefined) => void;
  minDate?: Date;
  placeholder?: string;
  className?: string;
}

export function DateTimePicker({ value, onChange, minDate, placeholder = "Pick a date & time", className }: DateTimePickerProps) {
  const [open, setOpen] = React.useState(false);
  const timeValue = value ? format(value, "HH:mm") : "";

  const handleDaySelect = (day: Date | undefined) => {
    if (!day) {
      onChange(undefined);
      return;
    }
    const next = new Date(day);
    if (value) next.setHours(value.getHours(), value.getMinutes(), 0, 0);
    else next.setHours(9, 0, 0, 0);
    onChange(next);
  };

  const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const [hours, minutes] = e.target.value.split(":").map(Number);
    const base = value ? new Date(value) : new Date();
    base.setHours(hours || 0, minutes || 0, 0, 0);
    onChange(base);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            className={cn("w-full justify-start bg-background border-default text-text font-medium focus-visible:ring-border", !value && "text-muted", className)}
            icon={<CalendarIcon className="w-4 h-4" />}
          />
        }
      >
        {value ? format(value, "EEE, MMM d, yyyy · h:mm a") : placeholder}
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 overflow-hidden" sideOffset={8}>
        <Calendar
          mode="single"
          selected={value}
          onSelect={handleDaySelect}
          disabled={minDate ? { before: minDate } : undefined}
          className="p-3"
        />
        <div className="border-t border-default px-4 py-3.5 flex items-center gap-3 bg-surface">
          <label className="flex items-center gap-1.5 text-xs font-bold text-muted uppercase tracking-wide shrink-0">
            <Clock className="w-3.5 h-3.5" /> Time
          </label>
          <input
            type="time"
            value={timeValue}
            onChange={handleTimeChange}
            disabled={!value}
            className="flex-1 h-9 px-3 rounded-lg border border-default bg-background text-text text-sm focus:outline-none disabled:opacity-50"
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
