/** Placeholder until Google OAuth is configured for the application. */
export default function GoogleButton({ label = 'Continue with Google' }) {
  return (
    <div className="google-btn">
      <button className="btn btn-block google-placeholder" type="button" disabled aria-disabled="true">
        <span>{label}</span>
        <span className="google-placeholder__status">Coming soon</span>
      </button>
    </div>
  )
}
