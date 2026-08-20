import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pipinho | Assistente financeiro",
  description: "Dashboard e assistente financeiro sobre dados reais normalizados.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
