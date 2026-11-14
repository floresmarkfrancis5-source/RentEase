function Gear({ className, teeth }) {
  return (
    <g className={className}>
      {Array.from({ length: teeth }, (_, index) => (
        <rect key={index} x="-1.7" y="-10.5" width="3.4" height="4.5" rx=".8"
          transform={`rotate(${index * (360 / teeth)})`} />
      ))}
      <circle r="6.5" />
      <circle className="assistant-avatar__gear-hole" r="2.5" />
    </g>
  )
}

export default function AssistantAvatar({ className = '', thinking = false, gears = false, trackPointer = false }) {
  const showGears = thinking || gears

  return (
    <span
      className={`assistant-avatar ${thinking ? 'assistant-avatar--thinking' : gears ? 'assistant-avatar--geared' : 'assistant-avatar--idle'} ${trackPointer ? 'assistant-avatar--interactive' : ''} ${className}`}
      aria-hidden="true"
    >
      <svg viewBox="0 0 64 64" fill="none">
        {showGears && <circle className="assistant-avatar__backdrop" cx="32" cy="35" r="28" />}
        {showGears && (
          <>
            <g transform="translate(21.5 15)">
              <Gear className="assistant-avatar__gear assistant-avatar__gear--large" teeth={10} />
            </g>
            <g transform="translate(38.2 15.2) scale(.82)">
              <Gear className="assistant-avatar__gear assistant-avatar__gear--small" teeth={8} />
            </g>
          </>
        )}
        <g className={thinking || gears ? undefined : 'assistant-avatar__head'}>
          <g transform={thinking || gears ? undefined : 'translate(32 32) scale(1.3) translate(-32 -37)'}>
          <path className="assistant-avatar__antenna" d="M32 29v-3" />
          <circle className="assistant-avatar__antenna-light" cx="32" cy="23.5" r="2.5" />
          <rect className="assistant-avatar__ear" x="9" y="39" width="5" height="10" rx="2.5" />
          <rect className="assistant-avatar__ear" x="50" y="39" width="5" height="10" rx="2.5" />
          <rect className="assistant-avatar__shell" x="13" y="31" width="38" height="25" rx="12" />
          <rect className="assistant-avatar__face" x="18" y="36" width="28" height="15" rx="7.5" />
          {thinking ? (
            <>
              <ellipse className="assistant-avatar__eye" cx="26" cy="43.5" rx="2.2" ry="3" />
              <ellipse className="assistant-avatar__eye" cx="38" cy="43.5" rx="2.2" ry="3" />
            </>
          ) : (
            <>
              <g className="assistant-avatar__idle-eyes">
                <circle className="assistant-avatar__eye" cx="26" cy="43.5" r="2.7" />
                <circle className="assistant-avatar__eye" cx="38" cy="43.5" r="2.7" />
              </g>
              <path className="assistant-avatar__expression assistant-avatar__expression--blink" d="M23 43.5h6m6 0h6" />
              <path className="assistant-avatar__expression assistant-avatar__expression--smile" d="m23 45 3-4 3 4m6 0 3-4 3 4" />
              <path className="assistant-avatar__expression assistant-avatar__expression--sleep" d="M23 42q3 5 6 0m6 0q3 5 6 0" />
              <g className="assistant-avatar__expression assistant-avatar__expression--shock">
                <circle cx="26" cy="43.5" r="3.4" />
                <circle cx="38" cy="43.5" r="3.4" />
              </g>
            </>
          )}
          </g>
        </g>
      </svg>
    </span>
  )
}
