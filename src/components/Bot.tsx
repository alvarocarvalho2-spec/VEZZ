export default function Bot({
  expression = "calm",
  className = "",
}: {
  expression?: string;
  className?: string;
}) {
  return (
    <svg
      className={`vezz-bot ${className}`}
      viewBox="0 0 200 200"
      aria-hidden="true"
      focusable="false"
    >
      <use href={`#bot-${expression}`} />
    </svg>
  );
}
