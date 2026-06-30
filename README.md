# maennerberatung-directory-builder
Builds a federated directory of German men's counselling services from three sources: [Männerberatungsnetz](https://maennerberatungsnetz.de), [Männergewaltschutz](https://www.maennergewaltschutz.de), and [Echte Männer reden](https://echte-maenner-reden.de).
It brings together what these sources publish - not a complete picture
of men's counselling in Germany.

This repo is a **use case** of [`@directory-builder/core`](https://github.com/foederierter-datenpool/directory-builder-core)
and holds no engine or webapp code - only what's specific to this federation:
`config/federation.ttl`, `config/match-knowledge.ttl`, and
per-source code under `sources/<name>/`.

The pipeline is fetch → lift (to RDF) → clean → map → match (cluster duplicates across
sources) → merge → resolve, each stage written to `data/`. Entities are organised in
three tiers: Träger (operating organisation), Beratungsstelle (counselling centre),
Angebot (service).

## Prerequisites
- Node.js
- Java (for [SPARQL Anything](https://github.com/SPARQL-Anything/sparql.anything), auto-downloaded on first run)

## Setup
```sh
npm install
npx playwright install firefox # browser binary for the scraper; npm install only pulls the library
```

## Run the pipeline
```sh
npm run pipeline   # ingest + federate (fetch → … → resolve)
npm run ingest     # fetch + lift only
npm run federate   # clean → map → match → merge → resolve only
npm run validate   # check the instance against the engine's SHACL shapes
```
Outputs → `data/`

## Run the webapp
The webapp ships with `@directory-builder/core`; this repo supplies only `config/` + `data/`.
```sh
npm run webapp         # dev server
npm run webapp:build   # production build → webapp/dist/
```

## Deployment
Pushes to `main` trigger `.github/workflows/deploy.yml`, which runs the pipeline, builds the webapp, and publishes it to the `gh-pages` branch served via GitHub Pages.
