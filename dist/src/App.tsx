import { useState, useEffect, Component } from "react";
import { Switch, Route, Redirect, useLocation, Router as WouterRouter } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";

class ErrorBoundary extends Component<
  { children: React.ReactNode },
  { hasError: boolean; error: string }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: "" };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error: error?.message || "Erro desconhecido" };
  }

  componentDidCatch(error: any, info: any) {
    console.error("App crash:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: "100vh", display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          background: "#0f172a", color: "#f1f5f9", fontFamily: "system-ui",
          padding: "2rem", textAlign: "center"
        }}>
          <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>⚠️</div>
          <h2 style={{ fontSize: "1.5rem", fontWeight: "bold", marginBottom: "0.5rem" }}>
            Algo deu errado
          </h2>
          <p style={{ color: "#94a3b8", marginBottom: "0.25rem", fontSize: "0.875rem" }}>
            {this.state.error}
          </p>
          <p style={{ color: "#64748b", marginBottom: "1.5rem", fontSize: "0.75rem" }}>
            Seu trabalho foi salvo automaticamente — não se preocupe.
          </p>
          <button
            onClick={() => { this.setState({ hasError: false, error: "" }); }}
            style={{
              background: "#3b82f6", color: "white", border: "none",
              padding: "0.75rem 2rem", borderRadius: "0.5rem",
              fontSize: "1rem", cursor: "pointer", fontWeight: "bold",
              marginBottom: "0.5rem"
            }}
          >
            Tentar novamente
          </button>
          <button
            onClick={() => window.location.reload()}
            style={{
              background: "transparent", color: "#94a3b8", border: "1px solid #334155",
              padding: "0.5rem 1.5rem", borderRadius: "0.5rem",
              fontSize: "0.875rem", cursor: "pointer"
            }}
          >
            Recarregar página
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

import NotFound from "@/pages/not-found";
import Playground from "@/pages/playground";
import LegalAssistant from "@/pages/legal-assistant";
import TokenGenerator from "@/pages/token-generator";
import ComparadorJuridico from "@/pages/comparador-juridico";
import AuditoriaFinanceira from "@/pages/auditoria-financeira";
import ConsultaProcessual from "@/pages/consulta-processual";
import PainelProcessos from "@/pages/painel-processos";
import ConsultaCorporativo from "@/pages/consulta-corporativo";
import ConsultaPdpj from "@/pages/consulta-pdpj";
import TramitacaoPage from "@/pages/tramitacao";
import FiltradorJuridico from "@/pages/filtrador";
import PrevidenciarioPage from "@/pages/previdenciario";
import RoboDjenPage from "@/pages/robo-djen";
import LoginPage from "@/pages/login";
import Jurisprudencia from "@/pages/jurisprudencia";
import CodeAssistant from "@/pages/code-assistant";
import ComunicacoesCnj from "@/pages/comunicacoes-cnj";
import Configuracoes from "@/pages/configuracoes";

function Router() {
  return (
    <Switch>
      <Route path="/" component={LegalAssistant} />
      <Route path="/jurisprudencia" component={Jurisprudencia} />
      <Route path="/assistente">{() => <Redirect to="/" />}</Route>
      <Route path="/playground" component={Playground} />
      <Route path="/token" component={TokenGenerator} />
      <Route path="/comparador" component={ComparadorJuridico} />
      <Route path="/auditoria" component={AuditoriaFinanceira} />
      <Route path="/consulta" component={ConsultaProcessual} />
      <Route path="/painel" component={PainelProcessos} />
      <Route path="/corporativo" component={ConsultaCorporativo} />
      <Route path="/pdpj" component={ConsultaPdpj} />
      <Route path="/tramitacao" component={TramitacaoPage} />
      <Route path="/filtrador" component={FiltradorJuridico} />
      <Route path="/previdenciario" component={PrevidenciarioPage} />
      <Route path="/robo-djen" component={RoboDjenPage} />
      <Route path="/codigo" component={CodeAssistant} />
      <Route path="/comunicacoes" component={ComunicacoesCnj} />
      <Route path="/configuracoes" component={Configuracoes} />
      <Route component={NotFound} />
    </Switch>
  );
}

function LoginOrSettings({ onLogin }: { onLogin: () => void }) {
  const [location, setLocation] = useLocation();
  if (location === "/configuracoes") {
    return (
      <div className="min-h-screen bg-background">
        <Configuracoes />
      </div>
    );
  }
  return <LoginPage onLogin={onLogin} onGoToSettings={() => setLocation("/configuracoes")} />;
}

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <ErrorBoundary>
            <WouterRouter base={BASE}>
              <Router />
            </WouterRouter>
          </ErrorBoundary>
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
export default App;