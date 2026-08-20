import { AppShell } from "@/components/app-shell";
import { requireUser } from "@/lib/auth";
import { logout } from "./actions";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return <AppShell email={user.email ?? "usuário autorizado"} logoutAction={logout}>{children}</AppShell>;
}
