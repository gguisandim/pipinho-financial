import Image from "next/image";
import { ShieldIcon } from "@/components/icons";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="login-page">
      <section className="login-art">
        <div className="login-art-copy">
          <span className="login-brand">Pipinho</span>
          <h1>Seu dinheiro,<br />sem virar uma planilha fria.</h1>
          <p>Dashboard financeiro e assistente com evidência, usando a arquitetura que já existe no backend.</p>
        </div>
        <div className="login-mascot-wrap">
          <div className="login-circle" />
          <Image src="/pipinho-icon.jpeg" alt="Ilustração do Pipinho" width={520} height={520} priority />
        </div>
      </section>
      <section className="login-panel">
        <div className="login-box">
          <div className="login-mobile-brand"><Image src="/pipinho-icon.jpeg" alt="" width={52} height={52}/><strong>Pipinho</strong></div>
          <span className="eyebrow">ACESSO PROTEGIDO</span>
          <h2>Entre para ver seus dados.</h2>
          <p>O login usa Supabase Auth. O token da API financeira fica somente no servidor da Vercel.</p>
          <LoginForm />
          <div className="login-security"><ShieldIcon/><span><strong>Sem cadastro público nesta V1.</strong> Crie a conta autorizada no painel do Supabase e use-a aqui.</span></div>
        </div>
      </section>
    </main>
  );
}
