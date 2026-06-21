# Grasslands Online

[![Live Demo](https://img.shields.io/badge/Live_Demo-black?style=for-the-badge&logo=vercel)](https://grasslands-online.vercel.app)
[![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![GitHub Actions](https://img.shields.io/badge/CI%2FCD-GitHub_Actions-2088FF?style=for-the-badge&logo=github-actions&logoColor=white)](https://github.com/sonnymay/grasslands-online/actions)

A browser-based idle/strategy game — build your settlement, level up your hero, and battle through dynamic encounters in a vibrant grasslands world. Inspired by Ragnarok Online and Digimon.

## Live Demo

[grasslands-online.vercel.app](https://grasslands-online.vercel.app)

## Features

- Settlement building system with resource management
- Hero leveling with XP, stats, and unlockable abilities
- Dynamic enemy encounters with AI-generated monster art
- Idle progression — resources accumulate while away
- Background music system with BGM switching
- HTML loading bar with animated transitions
- 248+ commits of ongoing content and gameplay polish

## Tech Stack

| Layer | Technology |
|---|---|
| Language | Vanilla JavaScript (ES6+) |
| UI | HTML5 + CSS3 |
| Deployment | Vercel |
| CI/CD | GitHub Actions |
| Art | AI-generated monster sprites |

## What This Code Shows

- Pure vanilla JS game architecture — no framework, no bundler
- State machine for hero levels, settlement tiers, and encounter phases
- GitHub Actions CI/CD pipeline for automated Vercel deployment
- DOM-based animation and transition system
- Local persistence for save state across sessions

## Run Locally

```bash
git clone https://github.com/sonnymay/grasslands-online.git
cd grasslands-online
# Open index.html directly, or serve locally:
npx serve .
```

## License

MIT
