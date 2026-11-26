/**
 * Rendered once in the root layout so every page gets the same blurred
 * blob-field + noise grain — fixed to the viewport (not tied to any one
 * page's content height), so it doesn't need per-page opt-in.
 */
export function AppBackground() {
  return (
    <div className="blob-field" aria-hidden="true">
      <div className="blob blob--1" />
      <div className="blob blob--2" />
      <div className="blob blob--3" />
      <div className="blob blob--4" />
    </div>
  );
}
