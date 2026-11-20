# Contributing

Thanks for helping improve RipView.

## Setup

```bash
npm install
npm run dev
```

## Before opening a pull request

```bash
npm run lint
npm run format:check
npm run build
```

## Guidelines

- Keep modules small and focused. Each folder in `src/renderer/src` owns one concern.
- All communication between the renderer and the main process goes through the typed bridge in `src/preload` and the channels in `src/shared/ipc.ts`.
- New user-facing text goes in both `src/renderer/src/i18n/en.ts` and `fr.ts`.
- Write self-explanatory code: clear names over comments.
- Use [Conventional Commits](https://www.conventionalcommits.org/) for commit messages.

## Reporting a bug

Open an issue with your Windows version, your console and its video settings, how the Ripsaw HD is connected (USB port, hub or not) and the stats overlay values (`I` key).
