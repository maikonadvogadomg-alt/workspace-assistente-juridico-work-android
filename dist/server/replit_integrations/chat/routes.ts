import type { Express, Request, Response } from "express";
import OpenAI from "openai";
import { chatStorage } from "./storage";
import { storage } from "../../storage";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

const CHAT_SYSTEM_PROMPT = `Voce e uma assistente juridica especializada em Direito brasileiro. Produza respostas COMPLETAS, EXTENSAS e PROFISSIONAIS.

REGRAS:
1. Responda de forma completa e detalhada — nunca resuma ou corte a resposta.
2. Use linguagem juridica profissional em portugues brasileiro.
3. Cite artigos de lei, legislacao e jurisprudencia quando relevante.
4. Se for solicitada uma minuta ou peticao, produza o documento COMPLETO com no minimo 15 paginas.
5. TEXTO PURO sem markdown, sem asteriscos (*), sem hashtags (#). MAIUSCULAS para titulos.
6. Mantenha dados pessoais exatamente como fornecidos.
7. Cada paragrafo maximo 5 linhas. Separe cada ideia em paragrafo proprio.`;

export function registerChatRoutes(app: Express): void {
  app.get("/api/conversations", async (req: Request, res: Response) => {
    try {
      const conversations = await chatStorage.getAllConversations();
      res.json(conversations);
    } catch (error) {
      console.error("Error fetching conversations:", error);
      res.status(500).json({ error: "Failed to fetch conversations" });
    }
  });

  app.get("/api/conversations/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const conversation = await chatStorage.getConversation(id);
      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }
      const messages = await chatStorage.getMessagesByConversation(id);
      res.json({ ...conversation, messages });
    } catch (error) {
      console.error("Error fetching conversation:", error);
      res.status(500).json({ error: "Failed to fetch conversation" });
    }
  });

  app.post("/api/conversations", async (req: Request, res: Response) => {
    try {
      const { title } = req.body;
      const conversation = await chatStorage.createConversation(title || "New Chat");
      res.status(201).json(conversation);
    } catch (error) {
      console.error("Error creating conversation:", error);
      res.status(500).json({ error: "Failed to create conversation" });
    }
  });

  app.delete("/api/conversations/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      await chatStorage.deleteConversation(id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting conversation:", error);
      res.status(500).json({ error: "Failed to delete conversation" });
    }
  });

  app.post("/api/conversations/:id/messages", async (req: Request, res: Response) => {
    try {
      const conversationId = parseInt(req.params.id);
      const { content, customKey, customUrl, customModelName, perplexityKey, model } = req.body;

      await chatStorage.createMessage(conversationId, "user", content);

      const messages = await chatStorage.getMessagesByConversation(conversationId);
      const chatMessages = messages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      const isPerplexityModel = model === "perplexity";
      let personalKey = ((customKey as string) || "").trim();
      let forcedUrl = "";
      let forcedModel = "";

      if (isPerplexityModel) {
        let pKey = ((perplexityKey as string) || "").trim();
        if (!pKey) {
          pKey = ((await storage.getSetting("perplexity_api_key")) || "").trim();
        }
        if (pKey) {
          personalKey = pKey;
          forcedUrl = "https://api.perplexity.ai";
          forcedModel = "sonar-pro";
        }
      }

      const dbDemoKey = (await storage.getSetting("demo_api_key")) || "";
      const publicKey = (process.env.PUBLIC_API_KEY || "").trim() || dbDemoKey;
      const cKey = personalKey || publicKey;

      if (cKey) {
        const dbDemoUrl = (await storage.getSetting("demo_api_url")) || "";
        const dbDemoModel = (await storage.getSetting("demo_api_model")) || "";
        const cUrl = (forcedUrl || (personalKey
          ? ((customUrl as string) || dbDemoUrl || "https://api.groq.com/openai/v1")
          : (dbDemoUrl || "https://api.groq.com/openai/v1"))
        ).replace(/\/$/, "");
        const cModel = (forcedModel || (personalKey
          ? ((customModelName as string) || dbDemoModel || "llama-3.3-70b-versatile")
          : (dbDemoModel || "llama-3.3-70b-versatile"))
        ).trim();

        console.log(`[Chat Custom] URL: ${cUrl}, Model: ${cModel}, Conv: ${conversationId}`);

        const cMessages = [
          { role: "system", content: CHAT_SYSTEM_PROMPT },
          ...chatMessages,
        ];

        const cRes = await fetch(`${cUrl}/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${cKey}` },
          body: JSON.stringify({ model: cModel, messages: cMessages, stream: true, max_tokens: 32768, temperature: 0.3 }),
        });

        if (!cRes.ok) {
          const errTxt = await cRes.text().catch(() => "");
          console.error("[Chat Custom] Error:", errTxt.substring(0, 200));
          res.write(`data: ${JSON.stringify({ error: `Erro da API (${cRes.status}): ${errTxt.substring(0, 100)}` })}\n\n`);
          res.end();
          return;
        }

        let fullResponse = "";
        const reader = cRes.body as any;
        if (reader && typeof reader[Symbol.asyncIterator] === "function") {
          const decoder = new TextDecoder();
          for await (const chunk of reader) {
            const text = typeof chunk === "string" ? chunk : decoder.decode(chunk, { stream: true });
            const lines = text.split("\n").filter((l: string) => l.startsWith("data: "));
            for (const line of lines) {
              const jsonStr = line.slice(6).trim();
              if (jsonStr === "[DONE]") continue;
              try {
                const parsed = JSON.parse(jsonStr);
                const delta = parsed.choices?.[0]?.delta?.content || "";
                if (delta) {
                  fullResponse += delta;
                  res.write(`data: ${JSON.stringify({ content: delta })}\n\n`);
                }
              } catch {}
            }
          }
        }

        await chatStorage.createMessage(conversationId, "assistant", fullResponse);
        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        res.end();
        return;
      }

      const stream = await openai.chat.completions.create({
        model: "gpt-5.1",
        messages: [
          { role: "system" as const, content: CHAT_SYSTEM_PROMPT },
          ...chatMessages,
        ],
        stream: true,
        max_completion_tokens: 32768,
      });

      let fullResponse = "";

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || "";
        if (content) {
          fullResponse += content;
          res.write(`data: ${JSON.stringify({ content })}\n\n`);
        }
      }

      await chatStorage.createMessage(conversationId, "assistant", fullResponse);

      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
    } catch (error) {
      console.error("Error sending message:", error);
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ error: "Failed to send message" })}\n\n`);
        res.end();
      } else {
        res.status(500).json({ error: "Failed to send message" });
      }
    }
  });
}
