export function KeyboardHint({ shortcut }: { shortcut: string }) {
  return (
    <kbd className="ml-1.5 hidden sm:inline-flex items-center justify-center px-1.5 py-0.5 text-[10px] font-medium rounded bg-muted text-muted-foreground border border-muted-foreground/20">
      {shortcut}
    </kbd>
  );
}
