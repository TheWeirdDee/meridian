import Link from "next/link";

function Nav() {
  return (
    <header className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-6 py-6 sm:px-10">
      <Link href="/" className="flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-black text-xs font-sans not-italic text-white dark:bg-white dark:text-black">
          M
        </span>
        <span className="font-display text-xl tracking-tight italic">
          Meridian
        </span>
      </Link>
      <nav className="flex items-center gap-8 text-sm text-zinc-600 dark:text-zinc-400">
        <Link href="/#flow" className="hidden transition-colors hover:text-black sm:inline dark:hover:text-white">
          How it works
        </Link>
        <Link href="/dashboard" className="hidden transition-colors hover:text-black sm:inline dark:hover:text-white">
          Dashboard
        </Link>
        <Link href="/docs" className="hidden transition-colors hover:text-black sm:inline dark:hover:text-white">
          Docs
        </Link>
        <Link
          href="/pay"
          className="flex items-center gap-1.5 rounded-full bg-black px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
        >
          Try a payment
          <span aria-hidden>→</span>
        </Link>
      </nav>
    </header>
  );
}

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Nav />
      <div className="flex flex-1 flex-col">{children}</div>
    </>
  );
}
