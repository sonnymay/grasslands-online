# Deploying Grasslands Online

Grasslands Online is a static Phaser game. There is no build step and no npm
install required for the app itself.

## Live production

- Production URL: https://grasslands-online.vercel.app
- Vercel project: `grasslands-online`
- Vercel team/scope: `sonnys-projects-f5a1e40b`

## Recommended: Vercel Git integration

1. Go to Vercel and import `https://github.com/sonnymay/grasslands-online`.
2. Use these project settings:
   - Framework Preset: Other
   - Build Command: empty
   - Install Command: empty
   - Output Directory: `project-grasslands`
3. Deploy.

The repository also includes `vercel.json`, so Vercel should pick up the same
settings automatically when the project is imported from GitHub.

## GitHub Actions

`CI` runs on pushes and pull requests:

- parses `project-grasslands/game.js` with `node -c`;
- verifies required game files exist;
- starts a local static server and fetches the HTML, JS, tileset, and MooWaan
  sprite.

`Vercel Deploy` is a manual workflow. Use it only if you want GitHub Actions to
deploy instead of relying on Vercel's Git integration.

Required GitHub repository secrets for the manual deploy workflow:

- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`

You can get `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` after running:

```bash
vercel link
```

The local `.vercel/` folder is intentionally gitignored.

## Local deployment check

```bash
cd "/Users/santipapmay/Documents/Grasslands Online"
vercel deploy --prod
```

If the CLI asks to link the project, choose the existing GitHub repo/project if
one exists, or create a new Vercel project.
