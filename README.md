# Unbound Pokédex (Adv)

A skin/extension of the [ydarissep Pokédex](https://github.com/ydarissep/dex-core) for the
**Pokémon Unbound** ROM hack. The core UI and data engine are loaded at runtime from
[`ydarissep/dex-core`](https://github.com/ydarissep/dex-core); this repo adds Unbound-specific
configuration plus a few extra tools.

## 🔗 Live

**https://hexnen.github.io/Unbound-Pokedex-Adv/**

## Added on top of dex-core

- **Type Chart tab** — full 18×18 type-effectiveness matrix (from `src/typeChart.json`) with a
  legend and a dual-type explanation. Horizontally scrollable on mobile.
- **vs tab** — pick two Pokémon (from the history strip or the search box) and compare them:
  - type matchup with winner/loser arrows,
  - **attack coverage**: every damaging move-type each Pokémon can learn vs the opponent's typing,
    with STAB ×1.5 and a per-move **%HP / KO ×N** damage estimate,
  - click a type to list its actual moves (one per side); the highest-%HP type auto-opens,
  - editable **levels** (default = the minimum evolution level) with +/− and a reset,
  - **BASE** and **CURRENT** (level-scaled) stat comparison, computed live.
- **Species panel** — "good vs" / "sucks vs" columns (attack & defence) next to the base stats.
- Moved the **Enhancements** button into the footer and reordered the top tabs.

> The matchup/damage tools are pure type/STAB math at a neutral baseline (no EVs, items, abilities
> like Wonder Guard/Levitate, weather or move conditions) — a comparison aid, not an exact figure.

## How it works

`index.html` loads thin local scripts that fetch and `eval` the matching `dex-core` modules at
runtime, then the local additions (`src/typeChartTab.js`, `src/vsTab.js`) hook into the resulting
UI. Hosting is plain GitHub Pages from the `main` branch.

## Credits

- Pokédex engine & data tooling: **[ydarissep](https://github.com/ydarissep)** (`dex-core`).
- Unbound enhancements: DMan16, Aussi (randomized species), and the Unbound team.
