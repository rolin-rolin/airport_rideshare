export function LogoutButton() {
  return (
    <form action="/logout" method="post">
      <button
        type="submit"
        className="shrink-0 rounded-full border border-border px-4 py-2 text-label font-display font-semibold text-foreground transition-colors hover:bg-foreground/5"
      >
        Log out
      </button>
    </form>
  );
}
