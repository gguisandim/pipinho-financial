"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ChatIcon, CloseIcon, HomeIcon, LinkIcon, LogOutIcon, MenuIcon, WalletIcon } from "./icons";

const nav = [
  { href: "/dashboard", label: "Visão geral", icon: HomeIcon },
  { href: "/gastos", label: "Gastos", icon: WalletIcon },
  { href: "/assistente", label: "Assistente", icon: ChatIcon },
  { href: "/conexoes", label: "Conexões", icon: LinkIcon },
];

export function AppShell({
  children,
  email,
  logoutAction,
}: {
  children: React.ReactNode;
  email: string;
  logoutAction: () => Promise<void>;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <div className="app-shell">
      <button className="mobile-menu-button" aria-label="Abrir menu" onClick={() => setOpen(true)}>
        <MenuIcon />
      </button>
      {open && <button className="sidebar-backdrop" aria-label="Fechar menu" onClick={() => setOpen(false)} />}
      <aside className={`sidebar ${open ? "sidebar-open" : ""}`}>
        <div className="sidebar-top">
          <div className="brand-row">
            <Image className="brand-avatar" src="/pipinho-icon.jpeg" alt="Pipinho" width={48} height={48} priority />
            <div><strong>Pipinho</strong><span>financeiro</span></div>
          </div>
          <button className="sidebar-close" aria-label="Fechar menu" onClick={() => setOpen(false)}><CloseIcon /></button>
        </div>
        <nav className="sidebar-nav" aria-label="Navegação principal">
          {nav.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} className={active ? "nav-item active" : "nav-item"} onClick={() => setOpen(false)}>
                <Icon />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="sidebar-footer">
          <div className="user-chip">
            <span className="user-dot" />
            <div><span>Conta protegida</span><strong>{email}</strong></div>
          </div>
          <form action={logoutAction}>
            <button className="logout-button" type="submit"><LogOutIcon /> Sair</button>
          </form>
        </div>
      </aside>
      <main className="main-content">{children}</main>
    </div>
  );
}
