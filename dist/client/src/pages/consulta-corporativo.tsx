import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Search, ArrowLeft, UserCheck, Scale, Copy, Loader2, Building2, BadgeCheck, AlertCircle } from "lucide-react";

const UF_LIST = [
  "AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT",
  "PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO"
];

const TRIBUNAIS = [
  { sigla: "TJMG", label: "TJMG - Minas Gerais" },
  { sigla: "TJSP", label: "TJSP - São Paulo" },
  { sigla: "TJRJ", label: "TJRJ - Rio de Janeiro" },
  { sigla: "TJBA", label: "TJBA - Bahia" },
  { sigla: "TJPR", label: "TJPR - Paraná" },
  { sigla: "TJRS", label: "TJRS - Rio Grande do Sul" },
  { sigla: "TJSC", label: "TJSC - Santa Catarina" },
  { sigla: "TJGO", label: "TJGO - Goiás" },
  { sigla: "TJDFT", label: "TJDFT - Distrito Federal" },
  { sigla: "TJCE", label: "TJCE - Ceará" },
  { sigla: "TJPE", label: "TJPE - Pernambuco" },
  { sigla: "TJMA", label: "TJMA - Maranhão" },
  { sigla: "TJPA", label: "TJPA - Pará" },
  { sigla: "TJES", label: "TJES - Espírito Santo" },
  { sigla: "TJMT", label: "TJMT - Mato Grosso" },
  { sigla: "TJMS", label: "TJMS - Mato Grosso do Sul" },
  { sigla: "TJAC", label: "TJAC - Acre" },
  { sigla: "TJAL", label: "TJAL - Alagoas" },
  { sigla: "TJAM", label: "TJAM - Amazonas" },
  { sigla: "TJAP", label: "TJAP - Amapá" },
  { sigla: "TJPB", label: "TJPB - Paraíba" },
  { sigla: "TJPI", label: "TJPI - Piauí" },
  { sigla: "TJRN", label: "TJRN - Rio Grande do Norte" },
  { sigla: "TJRO", label: "TJRO - Rondônia" },
  { sigla: "TJRR", label: "TJRR - Roraima" },
  { sigla: "TJSE", label: "TJSE - Sergipe" },
  { sigla: "TJTO", label: "TJTO - Tocantins" },
  { sigla: "TRF1", label: "TRF1 - 1ª Região" },
  { sigla: "TRF2", label: "TRF2 - 2ª Região" },
  { sigla: "TRF3", label: "TRF3 - 3ª Região" },
  { sigla: "TRF4", label: "TRF4 - 4ª Região" },
  { sigla: "TRF5", label: "TRF5 - 5ª Região" },
  { sigla: "TRF6", label: "TRF6 - 6ª Região" },
  { sigla: "TRT1", label: "TRT1 - Rio de Janeiro" },
  { sigla: "TRT2", label: "TRT2 - São Paulo" },
  { sigla: "TRT3", label: "TRT3 - Minas Gerais" },
  { sigla: "TRT4", label: "TRT4 - Rio Grande do Sul" },
  { sigla: "TRT5", label: "TRT5 - Bahia" },
  { sigla: "STJ", label: "STJ - Superior Tribunal de Justiça" },
  { sigla: "TST", label: "TST - Tribunal Superior do Trabalho" },
  { sigla: "CNJ", label: "CNJ - Conselho Nacional de Justiça" },
];

interface AdvogadoPerfil {
  nome?: string;
  cpf?: string;
  uf?: string;
  inscricao?: string;
  tipo?: string;
  situacao?: string;
  [key: string]: unknown;
}

interface Magistrado {
  nome?: string;
  cpf?: string;
  tribunal?: string;
  lotacao?: string;
  cargo?: string;
  [key: string]: unknown;
}

export default function ConsultaCorporativo() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("advogado");

  const [searchMode, setSearchMode] = useState<"cpf" | "oab">("oab");
  const [cpfInput, setCpfInput] = useState("");
  const [oabUf, setOabUf] = useState("MG");
  const [oabNumero, setOabNumero] = useState("");
  const [advLoading, setAdvLoading] = useState(false);
  const [advResults, setAdvResults] = useState<AdvogadoPerfil[]>([]);
  const [advSearched, setAdvSearched] = useState(false);

  const [magTribunal, setMagTribunal] = useState("TJMG");
  const [magLoading, setMagLoading] = useState(false);
  const [magResults, setMagResults] = useState<Magistrado[]>([]);
  const [magSearched, setMagSearched] = useState(false);
  const [magFilter, setMagFilter] = useState("");

  const formatCpf = (v: string) => {
    const d = v.replace(/\D/g, "").slice(0, 11);
    if (d.length <= 3) return d;
    if (d.length <= 6) return `${d.slice(0,3)}.${d.slice(3)}`;
    if (d.length <= 9) return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6)}`;
    return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`;
  };

  const searchAdvogado = async () => {
    if (searchMode === "cpf") {
      const cpfClean = cpfInput.replace(/\D/g, "");
      if (cpfClean.length !== 11) {
        toast({ title: "CPF inválido", description: "Digite um CPF com 11 dígitos", variant: "destructive" });
        return;
      }
      setAdvLoading(true);
      setAdvSearched(true);
      setAdvResults([]);
      try {
        const res = await fetch(`/api/corporativo/advogado/cpf/${cpfClean}`);
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.message || "Erro na consulta");
        }
        const json = await res.json();
        setAdvResults(json.data || []);
        if (!json.found || !json.data?.length) {
          toast({ title: "Nenhum resultado", description: "Nenhuma inscrição OAB encontrada para este CPF" });
        }
      } catch (e: any) {
        toast({ title: "Erro", description: e.message, variant: "destructive" });
      } finally {
        setAdvLoading(false);
      }
    } else {
      const num = oabNumero.replace(/\D/g, "");
      if (!num) {
        toast({ title: "Número OAB obrigatório", variant: "destructive" });
        return;
      }
      setAdvLoading(true);
      setAdvSearched(true);
      setAdvResults([]);
      try {
        const res = await fetch(`/api/corporativo/advogado/oab/${oabUf}/${num}`);
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.message || "Erro na consulta");
        }
        const json = await res.json();
        if (json.found && json.data) {
          setAdvResults(Array.isArray(json.data) ? json.data : [json.data]);
        } else {
          toast({ title: "Nenhum resultado", description: "Advogado não encontrado para esta OAB" });
        }
      } catch (e: any) {
        toast({ title: "Erro", description: e.message, variant: "destructive" });
      } finally {
        setAdvLoading(false);
      }
    }
  };

  const searchMagistrados = async () => {
    setMagLoading(true);
    setMagSearched(true);
    setMagResults([]);
    setMagFilter("");
    try {
      const res = await fetch(`/api/corporativo/magistrados/${magTribunal}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Erro na consulta");
      }
      const json = await res.json();
      setMagResults(json.data || []);
      if (!json.data?.length) {
        toast({ title: "Nenhum magistrado encontrado" });
      }
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setMagLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copiado!" });
  };

  const renderValue = (key: string, val: unknown): string => {
    if (val === null || val === undefined) return "-";
    if (typeof val === "object") return JSON.stringify(val);
    return String(val);
  };

  const filteredMag = magFilter
    ? magResults.filter(m => {
        const s = magFilter.toLowerCase();
        return Object.values(m).some(v => String(v).toLowerCase().includes(s));
      })
    : magResults;

  const formatAdvText = (adv: AdvogadoPerfil) => {
    return Object.entries(adv)
      .filter(([, v]) => v !== null && v !== undefined)
      .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`)
      .join("\n");
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto p-3 sm:p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Link href="/">
            <Button variant="ghost" size="sm" data-testid="button-back-home">
              <ArrowLeft className="w-4 h-4 mr-1" />
              Voltar
            </Button>
          </Link>
          <div className="flex-1">
            <h1 className="text-lg sm:text-xl font-bold flex items-center gap-2">
              <Building2 className="w-5 h-5 text-primary" />
              Consulta Corporativo PDPJ
            </h1>
            <p className="text-xs text-muted-foreground">Consulta de advogados e magistrados via API pública do PDPJ/CNJ</p>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="advogado" className="gap-1" data-testid="tab-advogado">
              <UserCheck className="w-4 h-4" />
              Advogado
            </TabsTrigger>
            <TabsTrigger value="magistrado" className="gap-1" data-testid="tab-magistrado">
              <Scale className="w-4 h-4" />
              Magistrado
            </TabsTrigger>
          </TabsList>

          <TabsContent value="advogado" className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <UserCheck className="w-4 h-4" />
                  Consultar Advogado
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-2">
                  <Button
                    variant={searchMode === "oab" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSearchMode("oab")}
                    data-testid="button-mode-oab"
                  >
                    Por OAB
                  </Button>
                  <Button
                    variant={searchMode === "cpf" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSearchMode("cpf")}
                    data-testid="button-mode-cpf"
                  >
                    Por CPF
                  </Button>
                </div>

                {searchMode === "cpf" ? (
                  <div className="flex gap-2">
                    <Input
                      placeholder="000.000.000-00"
                      value={cpfInput}
                      onChange={e => setCpfInput(formatCpf(e.target.value))}
                      onKeyDown={e => e.key === "Enter" && searchAdvogado()}
                      className="flex-1"
                      data-testid="input-cpf"
                    />
                    <Button onClick={searchAdvogado} disabled={advLoading} data-testid="button-search-advogado">
                      {advLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                    </Button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Select value={oabUf} onValueChange={setOabUf}>
                      <SelectTrigger className="w-20" data-testid="select-oab-uf">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {UF_LIST.map(uf => (
                          <SelectItem key={uf} value={uf}>{uf}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      placeholder="Número OAB"
                      value={oabNumero}
                      onChange={e => setOabNumero(e.target.value.replace(/\D/g, ""))}
                      onKeyDown={e => e.key === "Enter" && searchAdvogado()}
                      className="flex-1"
                      data-testid="input-oab-numero"
                    />
                    <Button onClick={searchAdvogado} disabled={advLoading} data-testid="button-search-advogado">
                      {advLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {advLoading && (
              <div className="flex items-center justify-center p-8 gap-2 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Consultando...</span>
              </div>
            )}

            {advSearched && !advLoading && advResults.length === 0 && (
              <Card className="border-yellow-500/30 bg-yellow-500/5">
                <CardContent className="p-4 flex items-center gap-2 text-sm">
                  <AlertCircle className="w-4 h-4 text-yellow-500" />
                  Nenhum resultado encontrado.
                </CardContent>
              </Card>
            )}

            {advResults.map((adv, i) => (
              <Card key={i} className="overflow-hidden">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      <BadgeCheck className="w-4 h-4 text-primary" />
                      {adv.nome || "Advogado"}
                    </CardTitle>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(formatAdvText(adv))}
                      data-testid={`button-copy-adv-${i}`}
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                    {Object.entries(adv).map(([key, val]) => (
                      <div key={key} className="flex gap-2">
                        <span className="font-medium text-muted-foreground capitalize min-w-[100px]">
                          {key.replace(/([A-Z])/g, " $1").replace(/_/g, " ")}:
                        </span>
                        <span className="break-all">{renderValue(key, val)}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="magistrado" className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Scale className="w-4 h-4" />
                  Consultar Magistrados
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-2">
                  <Select value={magTribunal} onValueChange={setMagTribunal}>
                    <SelectTrigger className="flex-1" data-testid="select-tribunal-mag">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TRIBUNAIS.map(t => (
                        <SelectItem key={t.sigla} value={t.sigla}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button onClick={searchMagistrados} disabled={magLoading} data-testid="button-search-magistrados">
                    {magLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {magLoading && (
              <div className="flex items-center justify-center p-8 gap-2 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Consultando magistrados...</span>
              </div>
            )}

            {magSearched && !magLoading && magResults.length === 0 && (
              <Card className="border-yellow-500/30 bg-yellow-500/5">
                <CardContent className="p-4 flex items-center gap-2 text-sm">
                  <AlertCircle className="w-4 h-4 text-yellow-500" />
                  Nenhum magistrado encontrado para este tribunal.
                </CardContent>
              </Card>
            )}

            {magResults.length > 0 && (
              <>
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="Filtrar magistrados por nome..."
                    value={magFilter}
                    onChange={e => setMagFilter(e.target.value)}
                    className="flex-1"
                    data-testid="input-filter-magistrados"
                  />
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {filteredMag.length} de {magResults.length}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      const text = filteredMag.map(m =>
                        Object.entries(m)
                          .filter(([, v]) => v !== null && v !== undefined)
                          .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`)
                          .join(" | ")
                      ).join("\n");
                      copyToClipboard(text);
                    }}
                    data-testid="button-copy-all-mag"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </Button>
                </div>

                <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                  {filteredMag.map((mag, i) => (
                    <Card key={i} className="overflow-hidden">
                      <CardContent className="p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm truncate">{mag.nome || "Magistrado"}</p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 mt-1 text-xs text-muted-foreground">
                              {Object.entries(mag)
                                .filter(([k]) => k !== "nome")
                                .filter(([, v]) => v !== null && v !== undefined)
                                .map(([key, val]) => (
                                  <span key={key}>
                                    <span className="font-medium capitalize">{key.replace(/([A-Z])/g, " $1").replace(/_/g, " ")}:</span>{" "}
                                    {renderValue(key, val)}
                                  </span>
                                ))}
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="shrink-0"
                            onClick={() => copyToClipboard(
                              Object.entries(mag)
                                .filter(([, v]) => v !== null && v !== undefined)
                                .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`)
                                .join("\n")
                            )}
                            data-testid={`button-copy-mag-${i}`}
                          >
                            <Copy className="w-3 h-3" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
