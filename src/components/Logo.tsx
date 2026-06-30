export function Logo({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <HorseMark className="h-8 w-8 shrink-0" />
      <span className="text-[22px] font-semibold tracking-tight leading-none">
        <span className="text-text">Coordina</span>
        <span className="text-brand-500">OT</span>
      </span>
    </div>
  );
}

// Cabeza de caballo (estilo trebejo) en dorado de marca.
function HorseMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <path
        fill="var(--color-brand-500)"
        d="M40.5 6c-.9 1.6-1.4 3.3-1.5 5-4.6-1.4-9.6-.8-13.9 2.1-5 3.4-8.2 8.9-9.4 14.8l-3.6 4.2c-1.6 1.9-2 4.2-1.2 6.4.5 1.4 2.2 1.9 3.4 1l3.1-2.4c.4 2.2 1.4 4.2 2.9 5.9L17 49.3c-1.2 1.7-1.9 3.7-1.9 5.8V58h32v-2.9c0-2.6-.6-5.1-1.8-7.3 3.9-3.6 6.2-8.7 6.2-14.2 0-6.6-2.7-12.5-7.1-16.6.4-2.3.3-4.7-.6-6.9L42.6 5z"
      />
      <circle cx="38" cy="22.5" r="1.7" fill="var(--color-brand-900)" />
    </svg>
  );
}
