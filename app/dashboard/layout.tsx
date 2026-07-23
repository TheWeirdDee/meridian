import Link from "next/link";

const SIGNOZ_URL = process.env.NEXT_PUBLIC_SIGNOZ_URL ?? "http://localhost:8080";
const EXPLORER_URL = process.env.NEXT_PUBLIC_CELO_EXPLORER_URL ?? "https://celo-sepolia.blockscout.com";
const CONTRACT = process.env.NEXT_PUBLIC_SETTLEMENT_CONTRACT ?? "";

function NavGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="px-3 text-[10px] font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-600">
        {label}
      </p>
      {children}
    </div>
  );
}

function NavItem({
  href,
  label,
  active,
  external,
}: {
  href: string;
  label: string;
  active?: boolean;
  external?: boolean;
}) {
  const cls = `rounded-lg px-3 py-2 text-sm transition-colors ${
    active
      ? "bg-white text-black dark:bg-zinc-800 dark:text-white"
      : "text-zinc-400 hover:bg-zinc-900/5 hover:text-black dark:text-zinc-500 dark:hover:bg-white/5 dark:hover:text-white"
  }`;
  if (external) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={`flex items-center justify-between ${cls}`}>
        {label}
        <span className="text-xs text-zinc-500">↗</span>
      </a>
    );
  }
  return (
    <Link href={href} className={cls}>
      {label}
    </Link>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 bg-zinc-50 dark:bg-black">
      <aside className="hidden w-56 shrink-0 flex-col gap-6 border-r border-zinc-200 bg-zinc-50 p-4 sm:flex dark:border-zinc-900 dark:bg-black">
        <Link href="/" className="flex items-center gap-2 px-2 text-sm font-semibold">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-black text-xs text-white dark:bg-white dark:text-black">
            M
          </span>
          <span>
            Meridian
            <span className="block text-[10px] font-normal text-zinc-400 dark:text-zinc-600">
              Settlement Console
            </span>
          </span>
        </Link>

        <NavGroup label="Monitor">
          <NavItem href="/dashboard" label="Overview" active />
        </NavGroup>

        <NavGroup label="Infrastructure">
          <NavItem href={SIGNOZ_URL} label="Trace explorer" external />
          <NavItem href={`${EXPLORER_URL}/address/${CONTRACT}`} label="Settlement contract" external />
        </NavGroup>

        <NavGroup label="Testnet">
          <NavItem href="https://faucet.celo.org" label="Celo Sepolia faucet" external />
        </NavGroup>

        <div className="mt-auto">
          <NavItem href="/" label="← Back to site" />
        </div>
      </aside>

      <div className="flex flex-1 flex-col">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 bg-white px-6 py-4 dark:border-zinc-900 dark:bg-zinc-950">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Dashboard <span className="mx-1 text-zinc-300 dark:text-zinc-700">/</span>{" "}
            <span className="font-medium text-black dark:text-white">Settlement Overview</span>
          </p>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-2.5 py-1 font-medium text-green-700 dark:bg-green-950 dark:text-green-400">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
              Celo Sepolia · live
            </span>
            <span className="rounded-full bg-zinc-100 px-2.5 py-1 font-mono text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
              {CONTRACT.slice(0, 6)}…{CONTRACT.slice(-4)}
            </span>
          </div>
        </div>
        <div className="flex-1">{children}</div>
      </div>
    </div>
  );
}
