import { Info } from "lucide-react";

export default function InfoTip({ label, children }) {
  return (
    <span className="info-tip" tabIndex={0} role="note" aria-label={label}>
      <Info size={14} />
      <span className="info-tip-text">{children}</span>
    </span>
  );
}
