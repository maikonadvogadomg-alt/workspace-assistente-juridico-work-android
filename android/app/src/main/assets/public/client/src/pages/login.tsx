import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Lock, Eye, EyeOff, Settings } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface LoginPageProps {
  onLogin: () => void;
  onGoToSettings?: () => void;
}

export default function LoginPage({ onLogin, onGoToSettings }: LoginPageProps) {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!password.trim()) return;

    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: password.trim() }),
      });

      if (res.ok) {
        onLogin();
      } else {
        toast({
          title: "Senha incorreta",
          description: "Tente novamente ou acesse Configurações para redefinir.",
          variant: "destructive",
        });
        setPassword("");
      }
    } catch {
      toast({
        title: "Erro de conexao",
        description: "Verifique sua internet e tente novamente.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center gap-2">
          <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Lock className="w-6 h-6 text-primary" />
          </div>
          <CardTitle className="text-xl">Assistente Juridico</CardTitle>
          <p className="text-sm text-muted-foreground">
            Digite a senha para acessar
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative">
              <Input
                data-testid="input-password"
                type={showPassword ? "text" : "password"}
                placeholder="Senha de acesso"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
                className="pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                data-testid="button-toggle-password"
                className="absolute right-0 top-0 h-full"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </Button>
            </div>
            <Button
              type="submit"
              data-testid="button-login"
              className="w-full"
              disabled={loading || !password.trim()}
            >
              {loading ? "Entrando..." : "Entrar"}
            </Button>
          </form>

          {onGoToSettings && (
            <div className="mt-4 pt-4 border-t text-center">
              <p className="text-xs text-muted-foreground mb-2">
                Precisa configurar o banco de dados ou chaves de IA?
              </p>
              <Button
                variant="outline"
                size="sm"
                data-testid="button-go-settings"
                onClick={onGoToSettings}
                className="gap-2"
              >
                <Settings className="w-4 h-4" />
                Acessar Configurações
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
