import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/theme-toggle";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Key,
  Copy,
  Check,
  Loader2,
  ArrowLeft,
  Shield,
  Clock,
  AlertCircle,
  Mail,
} from "lucide-react";

const TRIBUNAIS = [
  { value: "TJMG", label: "TJMG - Minas Gerais" },
  { value: "TJSP", label: "TJSP - Sao Paulo" },
  { value: "TJRJ", label: "TJRJ - Rio de Janeiro" },
  { value: "TJRS", label: "TJRS - Rio Grande do Sul" },
  { value: "TJPR", label: "TJPR - Parana" },
  { value: "TJSC", label: "TJSC - Santa Catarina" },
  { value: "TJBA", label: "TJBA - Bahia" },
  { value: "TJPE", label: "TJPE - Pernambuco" },
  { value: "TJCE", label: "TJCE - Ceara" },
  { value: "TJGO", label: "TJGO - Goias" },
  { value: "TJDF", label: "TJDF - Distrito Federal" },
  { value: "TRT2", label: "TRT 2a Regiao" },
  { value: "TRT3", label: "TRT 3a Regiao" },
  { value: "TRF1", label: "TRF 1a Regiao" },
  { value: "TRF3", label: "TRF 3a Regiao" },
  { value: "CNJ", label: "CNJ Nacional" },
];

export default function TokenGenerator() {
  const { toast } = useToast();
  const [cpf, setCpf] = useState(() => localStorage.getItem("pdpj_cpf") || "");
  const [nome, setNome] = useState(() => localStorage.getItem("pdpj_nome") || "");
  const [tribunal, setTribunal] = useState(() => localStorage.getItem("pdpj_tribunal") || "TJMG");
  const [expiresIn, setExpiresIn] = useState("5");
  const [modo, setModo] = useState<"pdpj" | "pjud">("pdpj");
  const [isGenerating, setIsGenerating] = useState(false);
  const [tokenResult, setTokenResult] = useState<any>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [pemConfigured, setPemConfigured] = useState<boolean | null>(null);
  const [showEmailTemplate, setShowEmailTemplate] = useState(false);

  useEffect(() => {
    fetch("/api/jwt/status")
      .then(r => r.json())
      .then(d => setPemConfigured(d.configured))
      .catch(() => setPemConfigured(false));
  }, []);

  useEffect(() => {
    if (cpf) localStorage.setItem("pdpj_cpf", cpf);
    if (nome) localStorage.setItem("pdpj_nome", nome);
    if (tribunal) localStorage.setItem("pdpj_tribunal", tribunal);
  }, [cpf, nome, tribunal]);

  const formatCpf = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 11);
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
    if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
  };

  const generateToken = async () => {
    const cleanCpf = cpf.replace(/\D/g, "");
    if (cleanCpf.length !== 11) {
      toast({ title: "CPF deve ter 11 digitos", variant: "destructive" });
      return;
    }

    setIsGenerating(true);
    setTokenResult(null);

    try {
      const res = await fetch("/api/jwt/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cpf: cleanCpf,
          nome: nome.trim() || undefined,
          tribunal,
          expiresInMinutes: parseInt(expiresIn),
          modo,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: data.message || "Erro ao gerar token", variant: "destructive" });
        return;
      }
      setTokenResult(data);
      toast({ title: "Token JWT gerado com sucesso!" });
    } catch (err: any) {
      toast({ title: "Erro de conexao. Tente novamente.", variant: "destructive" });
    } finally {
      setIsGenerating(false);
    }
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      toast({ title: `${label} copiado!` });
      setTimeout(() => setCopied(null), 2000);
    } catch {
      toast({ title: "Erro ao copiar", variant: "destructive" });
    }
  };

  const emailTemplate = `Assunto: Registro de chave publica e informacoes SSO para integracao

Prezados,

Solicitamos o registro da chave publica anexa para integracao com o Portal de Servicos da PDPJ.

- Nome do responsavel: ${nome || "[Seu nome]"}
- CPF: ${formatCpf(cpf) || "[Seu CPF]"}
- Contato tecnico: [seu e-mail, telefone]
- Finalidade: Autenticacao via JWT assinada (RS256) usada como client_assertion no fluxo OAuth2 (client_credentials / jwt-bearer) para chamadas a API do Portal de Servicos.
- Arquivo anexo: chave_publica.pem (chave publica RSA)

Requisicoes:
- Por favor registrem a chave publica e associem-na ao client_id que sera utilizado pela nossa integracao.
- Informar o token_endpoint (URL) do SSO da PDPJ.
- Informar os escopos recomendados para uso com a API.
- Se houver requisitos especificos de claims no client_assertion (iss, aud, sub), por favor indicar o formato esperado.

Observacoes de seguranca:
A chave privada correspondente nao sera compartilhada. Usaremos client_assertion assinada localmente com RS256. Solicitamos apenas o registro publico para validacao das assinaturas no servidor.

Aguardo confirmacao do registro e as informacoes solicitadas.

Atenciosamente,
${nome || "[Seu nome]"}
OAB: [Seu numero]`;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur">
        <div className="flex items-center justify-between gap-2 p-3 max-w-3xl mx-auto">
          <div className="flex items-center gap-2 flex-wrap">
            <Link href="/">
              <Button variant="ghost" size="sm" data-testid="link-back-home">
                <ArrowLeft className="w-4 h-4 mr-1" />
                Voltar
              </Button>
            </Link>
            <div className="flex items-center gap-2">
              <Key className="w-5 h-5 text-primary" />
              <h1 className="text-lg font-bold">Gerador de Token JWT</h1>
            </div>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-4 space-y-4">
        {pemConfigured === false && (
          <Card className="p-4 border-destructive">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-destructive">Chave PEM nao configurada</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Para gerar tokens JWT, voce precisa adicionar sua chave privada PEM nas configuracoes
                  de segredo do projeto com o nome PDPJ_PEM_PRIVATE_KEY.
                </p>
              </div>
            </div>
          </Card>
        )}

        {pemConfigured === true && (
          <Card className="p-4 border-green-500/30">
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-green-600" />
              <span className="text-sm font-medium">Chave PEM configurada e segura</span>
            </div>
          </Card>
        )}

        <Card className="p-5 space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Modo do Token</label>
            <div className="flex gap-2">
              <Button
                data-testid="button-modo-pdpj"
                variant={modo === "pdpj" ? "default" : "outline"}
                size="sm"
                className="flex-1"
                onClick={() => setModo("pdpj")}
              >
                PDPJ (Swagger)
              </Button>
              <Button
                data-testid="button-modo-pjud"
                variant={modo === "pjud" ? "default" : "outline"}
                size="sm"
                className="flex-1"
                onClick={() => setModo("pjud")}
              >
                PJUD (API)
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {modo === "pdpj"
                ? "Token para usar no Swagger do PDPJ (consultas gerais)"
                : "Token para chamadas diretas a API do PJUD (client_assertion)"}
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Nome completo</label>
            <Input
              data-testid="input-nome"
              placeholder="Seu nome completo"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className="text-lg"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">CPF (11 digitos)</label>
            <Input
              data-testid="input-cpf"
              placeholder="000.000.000-00"
              value={formatCpf(cpf)}
              onChange={(e) => setCpf(e.target.value.replace(/\D/g, ""))}
              maxLength={14}
              className="text-lg"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Tribunal</label>
            <Select value={tribunal} onValueChange={setTribunal}>
              <SelectTrigger data-testid="select-tribunal">
                <SelectValue placeholder="Selecione o tribunal" />
              </SelectTrigger>
              <SelectContent>
                {TRIBUNAIS.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Validade do token (minutos)</label>
            <Select value={expiresIn} onValueChange={setExpiresIn}>
              <SelectTrigger data-testid="select-expires">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 minuto</SelectItem>
                <SelectItem value="2">2 minutos</SelectItem>
                <SelectItem value="5">5 minutos</SelectItem>
                <SelectItem value="10">10 minutos</SelectItem>
                <SelectItem value="15">15 minutos</SelectItem>
                <SelectItem value="30">30 minutos</SelectItem>
                <SelectItem value="60">60 minutos</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button
            data-testid="button-generate-token"
            onClick={generateToken}
            disabled={isGenerating || pemConfigured === false}
            className="w-full text-lg py-6"
            size="lg"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Gerando Token...
              </>
            ) : (
              <>
                <Key className="w-5 h-5 mr-2" />
                Gerar Token JWT
              </>
            )}
          </Button>
        </Card>

        {tokenResult && (
          <div className="space-y-3">
            <Card className="p-4 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h3 className="font-bold flex items-center gap-2">
                  <Check className="w-5 h-5 text-green-600" />
                  Token Gerado
                </h3>
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    Expira: {tokenResult.expiresAt}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between flex-wrap gap-1">
                  <label className="text-sm font-medium">Bearer Token (para o Swagger)</label>
                  <Button
                    data-testid="button-copy-bearer"
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard(`Bearer ${tokenResult.token}`, "Bearer")}
                  >
                    {copied === "Bearer" ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    <span className="ml-1">{copied === "Bearer" ? "Copiado!" : "Copiar"}</span>
                  </Button>
                </div>
                <div className="bg-muted p-3 rounded-md font-mono text-xs break-all max-h-24 overflow-y-auto" data-testid="text-bearer-token">
                  Bearer {tokenResult.token}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between flex-wrap gap-1">
                  <label className="text-sm font-medium">Token JWT (somente o token)</label>
                  <Button
                    data-testid="button-copy-token"
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard(tokenResult.token, "Token")}
                  >
                    {copied === "Token" ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    <span className="ml-1">{copied === "Token" ? "Copiado!" : "Copiar"}</span>
                  </Button>
                </div>
                <div className="bg-muted p-3 rounded-md font-mono text-xs break-all max-h-32 overflow-y-auto" data-testid="text-jwt-token">
                  {tokenResult.token}
                </div>
              </div>
            </Card>

            <Card className="p-4 space-y-2">
              <h4 className="text-sm font-medium">Dados do Token (Payload)</h4>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">sub</Badge>
                  <span className="text-muted-foreground">{tokenResult.payload.sub}</span>
                </div>
                {tokenResult.payload.name && (
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">name</Badge>
                    <span className="text-muted-foreground">{tokenResult.payload.name}</span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">tribunal</Badge>
                  <span className="text-muted-foreground">{tokenResult.payload.tribunal}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">iss</Badge>
                  <span className="text-muted-foreground truncate">{tokenResult.payload.iss}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">aud</Badge>
                  <span className="text-muted-foreground truncate">{tokenResult.payload.aud}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">jti</Badge>
                  <span className="text-muted-foreground truncate">{tokenResult.payload.jti}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">validade</Badge>
                  <span className="text-muted-foreground">{expiresIn} min</span>
                </div>
              </div>
            </Card>

            <Card className="p-4 space-y-2">
              <h4 className="text-sm font-medium">Como usar no Swagger</h4>
              <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                <li>Abra o Swagger do PDPJ/PJUD</li>
                <li>Clique no botao "Authorize" no topo da pagina</li>
                <li>Cole o Bearer Token completo no campo</li>
                <li>Clique em "Authorize" para confirmar</li>
                <li>Agora voce pode usar todas as APIs autenticadas</li>
              </ol>
            </Card>
          </div>
        )}

        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium flex items-center gap-2">
              <Mail className="w-4 h-4" />
              Registro de Chave Publica no PDPJ
            </h4>
            <Button
              data-testid="button-toggle-email"
              variant="ghost"
              size="sm"
              onClick={() => setShowEmailTemplate(!showEmailTemplate)}
            >
              {showEmailTemplate ? "Ocultar" : "Ver modelo de email"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Para acesso completo ao PJe (peticionar, consultar documentos), voce precisa registrar sua chave publica no PDPJ enviando um email.
          </p>
          {showEmailTemplate && (
            <div className="space-y-2">
              <div className="bg-muted p-3 rounded-md text-xs whitespace-pre-wrap max-h-64 overflow-y-auto" data-testid="text-email-template">
                {emailTemplate}
              </div>
              <Button
                data-testid="button-copy-email"
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => copyToClipboard(emailTemplate, "Email")}
              >
                {copied === "Email" ? <Check className="w-4 h-4 mr-1" /> : <Copy className="w-4 h-4 mr-1" />}
                {copied === "Email" ? "Email copiado!" : "Copiar modelo de email"}
              </Button>
            </div>
          )}
        </Card>
      </main>
    </div>
  );
}
