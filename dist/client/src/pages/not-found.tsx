import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background">
      <Card className="w-full max-w-md mx-4">
        <CardContent className="pt-6">
          <div className="flex mb-4 gap-2">
            <AlertCircle className="h-8 w-8 text-red-500" />
            <h1 className="text-2xl font-bold">Pagina nao encontrada</h1>
          </div>

          <p className="mt-4 text-sm text-muted-foreground">
            A pagina que voce procura nao existe.
          </p>

          <div className="flex gap-2 mt-4">
            <Link href="/">
              <Button variant="outline" data-testid="link-home">Playground</Button>
            </Link>
            <Link href="/assistente">
              <Button data-testid="link-assistente">Assistente Juridico</Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
