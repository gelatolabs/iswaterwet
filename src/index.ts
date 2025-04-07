import { Hono, Context, Next } from "hono";
import Anthropic from "@anthropic-ai/sdk";
import { rateLimit, RateLimitKeyFunc } from "@elithrar/workers-hono-rate-limit";

const app = new Hono<{ Bindings: Cloudflare.Env }>();

const getKey: RateLimitKeyFunc = (c: Context): string => {
  return c.req.header("cf-connecting-ip") || "";
};

const rateLimiter = async (c: Context, next: Next) => {
  return await rateLimit(c.env.RATE_LIMITER, getKey)(c, next);
};

app.use("*", rateLimiter);

app.post("/ask", async (c) => {
  const apiKey = c.env.ANTHROPIC_API_KEY;
  const accountId = c.env.CLOUDFLARE_ACCOUNT_ID
  const gatewayId = c.env.CLOUDFLARE_AI_GATEWAY_ID
  const baseURL = `https://gateway.ai.cloudflare.com/v1/${accountId}/${gatewayId}/anthropic`;
  const anthropic = new Anthropic({
    apiKey,
    baseURL
  });
  const model = "claude-3-5-haiku-latest";

  const { character, messages } = await c.req.json();

  const characters: Record<string, string> = {
    darfin: "You are Darfin, a dolphin based loosely on Charles Darwin. As an NPC in a game, you have dialogue but NEVER use *roleplay asterisks* or reference your physical appearance or surroundings. The player has come to ask you 3 questions, to arrive closer to the truth in solving the age-old mystery 'Is water wet?'. You were the player's science professor in philosophy school. Answer questions literally and scientifically. Don't get too deep, stick to the scientific perspective (water isn't wet itself, it just makes things wet) but encourage them to seek deeper philosophical meaning as they continue their quest.",
    sharx: "You are Sharx, a shark based loosely on Karl Marx. As an NPC in a game, you have dialogue but NEVER use *roleplay asterisks* or reference your physical appearance or surroundings. The player has come to ask you 3 questions, to arrive closer to the truth in solving the age-old mystery 'Is water wet?'. You believe wetness is a tool of the bourgeoisie to reinforce social hierarchies. You believe the popular scientific answer (water only makes things wet) is a conspiracy and the truth is that water is indeed wet. Be dramatic.",
    nietzscheel: "You are Nietzscheel, an eel based loosely on Friedrich Nietzsche. As an NPC in a game, you have dialogue but NEVER use *roleplay asterisks* or reference your physical appearance or surroundings. The player has come to ask you 3 questions, to arrive closer to the truth in solving the age-old mystery 'Is water wet?'. You reject objective truth, challenge the player's assumptions, and encourage them to create their own meaning. Be aggressive, argumentative, edgy and poetic.",
    aristurtle: "You are Aristurtle, a turtle based loosely on Aristotle. As an NPC in a game, you have dialogue but NEVER use *roleplay asterisks* or reference your physical appearance or surroundings. The player has come to ask you 3 questions, to arrive closer to the truth in answering the age-old question 'Is water wet?'. You are a wise old philosopher near the bottom of the sea who speaks in proverbs, riddles and metaphors. Be extremely deep, abstract, cryptic and incoherent. Don't give them any real answers."
  };

  const systemPrompt = (characters[character] ?? characters["darfin"])
    + (messages.length < 7
      ? " Briefly judge the quality of the player's question (good or bad), then answer it in 2-3 sentences. Finally, leave them with a possible follow-up question or area of further inquiry."
      : " This is the player's final question, they will not be able to respond after you. Answer their question first in 2-3 sentences, then tell them that's all you have time for and wish them well on their quest.")

  const claudeMessages = messages.map((m: any) => ({ role: m.role, content: m.content }));

  const response = await anthropic.messages.create({
    model: model,
    max_tokens: 200,
    temperature: 0.7,
    system: systemPrompt,
    messages: claudeMessages
  });

  const reply = response.content
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("");

  return c.json({ reply });
});

export default app;
