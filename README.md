# Main Character Narrator

Using mediapipe for face detection.

If you want to change the narration style and/or your name, do it in the `index.ts` where the system prompt is defined.

Set your env in the `.env` with the following keys:
```
OPENAI_API_KEY=
ELEVENLABS_API_KEY=
ELEVENLABS_VOICE_ID=
```

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run dev
```

This project was created using `bun init` in bun v1.2.21. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
