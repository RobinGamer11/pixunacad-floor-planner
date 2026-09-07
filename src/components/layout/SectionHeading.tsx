/**
 * Einheitlicher Seitenkopf.
 *
 * Alle Hauptbereiche (Netzwerk, Organisation projektübergreifend, die fünf
 * Projektreiter, Willkommensseite) verwenden denselben Aufbau:
 * großer Titel, darunter klar abgesetzter Untertitel.
 */
export type HeadingSize = "hero" | "page" | "tab";

const TITLE_CLS: Record<HeadingSize, string> = {
  hero: "text-4xl sm:text-5xl font-semibold tracking-tight",
  page: "text-3xl sm:text-4xl font-semibold tracking-tight",
  tab: "text-2xl sm:text-[28px] font-semibold tracking-tight",
};

export function SectionHeading({
  title,
  subtitle,
  size = "page",
  className = "",
  titleStyle,
  subtitleStyle,
  right,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  size?: HeadingSize;
  className?: string;
  titleStyle?: React.CSSProperties;
  subtitleStyle?: React.CSSProperties;
  right?: React.ReactNode;
}) {
  return (
    <div className={`flex flex-col gap-3 sm:flex-row sm:items-start ${className}`}>
      <div className="min-w-0">
        <h1 className={TITLE_CLS[size]} style={titleStyle}>{title}</h1>
        {subtitle && (
          <p className="mt-1.5 text-sm text-muted-foreground" style={subtitleStyle}>{subtitle}</p>
        )}
      </div>
      {right && <div className="flex flex-wrap items-center gap-2 sm:ml-auto">{right}</div>}
    </div>
  );
}

export default SectionHeading;
