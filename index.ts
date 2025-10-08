import OpenAI from "openai";
import { ElevenLabsClient } from "elevenlabs";

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const elevenlabs = new ElevenLabsClient({
    apiKey: process.env.ELEVENLABS_API_KEY,
});

const systemPrompt = `You are the narrator of a hero film. The name of the character is Affan. Narrate the characters as if you were narrating the main characters in an epic opening sequence in a lord of the rings movie. Be sure to call them by their names.
Make it really awesome, while really making the characters feel epic. Don't repeat yourself. Make it short, max one line 10-20 words. Build on top of the story as you tell it. Don't use the word image.
As you narrate, pretend there is an epic Hans Zimmer song playing in the background.
Use words that are simple but poetic, a 4th grader should be able to understand it perfectly.
Build a back story for each of the characters as the heroes of a world they're trying to save.`;

const server = Bun.serve({
    port: 8000,
    async fetch(req) {
        const url = new URL(req.url);

        if (url.pathname === "/" || url.pathname === "/index.html") {
            const file = Bun.file("public/index.html");
            return new Response(file, {
                headers: { "Content-Type": "text/html" },
            });
        }

        if (url.pathname === "/api/narrate" && req.method === "POST") {
            try {
                const { image, history } = await req.json();

                const messages: any[] = [
                    {
                        role: "system",
                        content: systemPrompt,
                    },
                    ...history,
                    {
                        role: "user",
                        content: [
                            {
                                type: "text",
                                text: "Describe this scene like you're a narrator in a movie",
                            },
                            {
                                type: "image_url",
                                image_url: {
                                    url: `data:image/jpeg;base64,${image}`,
                                },
                            },
                        ],
                    },
                ];

                const response = await openai.chat.completions.create({
                    model: "gpt-4o",
                    messages,
                    max_tokens: 300,
                });

                const narration = response.choices[0]!.message.content;

                return new Response(JSON.stringify({ narration }), {
                    headers: { "Content-Type": "application/json" },
                });
            } catch (error: any) {
                console.error("GPT-4 Vision error:", error);
                return new Response(
                    JSON.stringify({ error: error.message }),
                    {
                        status: 500,
                        headers: { "Content-Type": "application/json" },
                    }
                );
            }
        }

        if (url.pathname === "/api/speak" && req.method === "POST") {
            try {
                const { text } = await req.json();

                const audioStream = await elevenlabs.textToSpeech.convert(
                    process.env.ELEVENLABS_VOICE_ID as string,
                    {
                        text,
                        model_id: "eleven_monolingual_v1",
                    }
                );

                const chunks: Uint8Array[] = [];
                for await (const chunk of audioStream) {
                    chunks.push(chunk);
                }
                const audioBuffer = Buffer.concat(chunks);

                return new Response(audioBuffer, {
                    headers: { "Content-Type": "audio/mpeg" },
                });
            } catch (error: any) {
                console.error("ElevenLabs TTS error:", error);
                return new Response(
                    JSON.stringify({ error: error.message }),
                    {
                        status: 500,
                        headers: { "Content-Type": "application/json" },
                    }
                );
            }
        }

        if (url.pathname === "/hero.mp3") {
            const file = Bun.file("hero.mp3");
            if (await file.exists()) {
                return new Response(file, {
                    headers: { "Content-Type": "audio/mpeg" },
                });
            }
        }

        if (url.pathname.startsWith("/")) {
            const filePath = `public${url.pathname}`;
            const file = Bun.file(filePath);

            if (await file.exists()) {
                const ext = filePath.split(".").pop();
                const contentTypes: Record<string, string> = {
                    js: "application/javascript",
                    css: "text/css",
                    html: "text/html",
                };

                return new Response(file, {
                    headers: { "Content-Type": contentTypes[ext || ""] || "text/plain" },
                });
            }
        }

        return new Response("Not Found", { status: 404 });
    },
});

console.log(`🚀 Server running at http://localhost:${server.port}`);
