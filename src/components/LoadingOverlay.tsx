export function LoadingOverlay() {
  return (
    <div className="loading-overlay" role="status" aria-live="polite">
      <div>
        <div className="spinner" aria-hidden="true" />
        <div className="text">Loading AI models...</div>
      </div>
    </div>
  );
}
