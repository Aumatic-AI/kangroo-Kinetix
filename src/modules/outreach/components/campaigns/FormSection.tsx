export function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-background border border-default rounded-xl p-5 space-y-4">
      <h3 className="text-sm font-bold text-text uppercase tracking-wide">{title}</h3>
      {children}
    </div>
  );
}
