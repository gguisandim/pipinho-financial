import Image from "next/image";
import { leaveUnauthorizedSession } from "./actions";

export default function UnauthorizedPage() {
  return <main className="simple-auth-page"><Image src="/pipinho-icon.jpeg" alt="Pipinho" width={120} height={120}/><span className="eyebrow">ACESSO BLOQUEADO</span><h1>Esta conta não está na lista permitida.</h1><p>Revise <code>PIPINHO_ALLOWED_EMAILS</code> nas variáveis de ambiente da Vercel.</p><form action={leaveUnauthorizedSession}><button className="primary-button" type="submit">Sair e voltar ao login</button></form></main>;
}
