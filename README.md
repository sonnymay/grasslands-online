# Grasslands Online

[![Live Demo](https://img.shields.io/badge/Live_Demo-black?style=for-the-badge&logo=vercel)](https://grasslands-online.vercel.app)
[![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![GitHub Actions](https://img.shields.io/badge/CI%2FCD-GitHub_Actions-2088FF?style=for-the-badge&logo=github-actions&logoColor=white)](https://github.com/sonnymay/grasslands-online/actions)
[![MIT License](https://img.shields.io/badge/license-MIT-green?style=for-the-badge)](LICENSE)

A browser-based idle/strategy game — build your settlement, level up your hero, and battle through dynamic encounters in a vibrant grasslands world. Inspired by **Ragnarok Online** and **Digimon**.

**[Play Now → grasslands-online.vercel.app](https://grasslands-online.vercel.app)**

---

## Screenshots

![Grasslands Online — main world view](https://raw.githubusercontent.com/sonnymay/grasslands-online/main/project-grasslands/assets/tiles/grass_tileset_v2.png)

| Gameplay | Build Mode | Trader Shop |
|:---:|:---:|:---:|
| Explore the grasslands world on foot, battle enemies, and collect zeny | Place and resize props with Sims-style build tools | Spend zeny on HP, ATK, DEF upgrades and heals |

---

## Biomes & World

The world is divided into distinct biomes, each with its own tileset, decorations, and enemies:

| Biome | Tileset | Landmark |
|:---:|:---:|:---:|
| ![Grasslands](https://raw.githubusercontent.com/sonnymay/grasslands-online/main/project-grasslands/assets/tiles/grass_tileset_v2.png) | ![Forest](https://raw.githubusercontent.com/sonnymay/grasslands-online/main/project-grasslands/assets/tiles/forest_tileset.png) | ![Riverside](https://raw.githubusercontent.com/sonnymay/grasslands-online/main/project-grasslands/assets/tiles/riverside_tileset.png) |
| Grasslands | Forest | Riverside |
| ![Ruins](https://raw.githubusercontent.com/sonnymay/grasslands-online/main/project-grasslands/assets/tiles/ruins_tileset.png) | ![Desert/Sand](https://raw.githubusercontent.com/sonnymay/grasslands-online/main/project-grasslands/assets/tiles/sand_tileset.png) | |
| Ruins | Desert | |

---

## Hero Classes

Choose your class at Lv.10 and specialize your playstyle:

| Knight | Archer | Mage | Hunter |
|:---:|:---:|:---:|:---:|
| ![Knight](https://raw.githubusercontent.com/sonnymay/grasslands-online/main/project-grasslands/assets/sprites/knight_idle_south.png) | ![Archer](https://raw.githubusercontent.com/sonnymay/grasslands-online/main/project-grasslands/assets/sprites/archer_idle_south.png) | ![Mage](https://raw.githubusercontent.com/sonnymay/grasslands-online/main/project-grasslands/assets/sprites/mage_idle_south.png) | ![Hunter](https://raw.githubusercontent.com/sonnymay/grasslands-online/main/project-grasslands/assets/sprites/hunter_idle_south.png) |
| Tanky melee fighter | Ranged DPS | Elemental caster | Balanced tracker |

---

## Monsters

Fight AI-generated monster sprites across all biomes:

| Blobling | Cactling | Bigfoot | Kaiju Titan |
|:---:|:---:|:---:|:---:|
| ![Blobling](https://raw.githubusercontent.com/sonnymay/grasslands-online/main/project-grasslands/assets/sprites/blobling_idle.png) | ![Cactling](https://raw.githubusercontent.com/sonnymay/grasslands-online/main/project-grasslands/assets/sprites/cactling_idle.png) | ![Bigfoot](https://raw.githubusercontent.com/sonnymay/grasslands-online/main/project-grasslands/assets/sprites/bigfoot_idle.png) | ![Kaiju Titan](https://raw.githubusercontent.com/sonnymay/grasslands-online/main/project-grasslands/assets/sprites/kaiju_titan_idle.png) |
| Common grasslands creature | Desert biome enemy | Rare forest boss | Legendary raid boss |

---

## World Decorations

The world is filled with hand-crafted decorations — trees, boulders, flowers, critters, and biome landmarks:

| | | | |
|:---:|:---:|:---:|:---:|
| ![Oak Tree](https://raw.githubusercontent.com/sonnymay/grasslands-online/main/project-grasslands/assets/decorations/tree_oak_01.png) | ![Pine Tree](https://raw.githubusercontent.com/sonnymay/grasslands-online/main/project-grasslands/assets/decorations/tree_pine_02.png) | ![Willow](https://raw.githubusercontent.com/sonnymay/grasslands-online/main/project-grasslands/assets/decorations/tree_willow_large_01.png) | ![Mossy Boulder](https://raw.githubusercontent.com/sonnymay/grasslands-online/main/project-grasslands/assets/decorations/boulder_mossy_01.png) |
| Oak Tree | Pine Tree | Willow | Mossy Boulder |
| ![Bunny](https://raw.githubusercontent.com/sonnymay/grasslands-online/main/project-grasslands/assets/decorations/critter_bunny_idle_01.png) | ![Chick](https://raw.githubusercontent.com/sonnymay/grasslands-online/main/project-grasslands/assets/decorations/critter_chick_idle_01.png) | ![Campfire](https://raw.githubusercontent.com/sonnymay/grasslands-online/main/project-grasslands/assets/decorations/campfire_01.png) | ![Flower Cluster](https://raw.githubusercontent.com/sonnymay/grasslands-online/main/project-grasslands/assets/decorations/deco_flower_cluster_01.png) |
| Bunny Critter | Chick Critter | Campfire | Flower Cluster |
| ![Mushroom Red](https://raw.githubusercontent.com/sonnymay/grasslands-online/main/project-grasslands/assets/decorations/mushroom_red_01.png) | ![Pond](https://raw.githubusercontent.com/sonnymay/grasslands-online/main/project-grasslands/assets/decorations/pond_01.png) | ![Ruins Arch](https://raw.githubusercontent.com/sonnymay/grasslands-online/main/project-grasslands/assets/decorations/ruins_arch_broken_01.png) | ![Desert Obelisk](https://raw.githubusercontent.com/sonnymay/grasslands-online/main/project-grasslands/assets/decorations/landmark_desert_obelisk.png) |
| Red Mushroom | Pond | Ruins Arch | Desert Obelisk |

---

## Features

- **Settlement building** — Sims-style build mode: place, move, resize, rotate, flip, and duplicate props
- - **Hero leveling** — XP, ATK, DEF, HP stats; choose a class at Lv.10 (Knight, Archer, Mage, Hunter)
  - - **Dynamic enemies** — AI-generated monster sprites; slay quests with zeny rewards
    - - **5 biomes** — Grasslands, Forest, Riverside, Ruins, Desert; each with unique tilesets and enemies
      - - **Idle progression** — Autopilot mode accumulates XP and zeny while away
        - - **Fast travel** — Discover landmark plazas to unlock warp points across the world
          - - **Trader shop** — Spend zeny on HP, ATK, DEF upgrades and heals; auto-buy mode
            - - **BGM system** — Background music switching with on/off toggle
              - - **Save state** — Local persistence keeps your progress across sessions
                - - **249+ commits** — Ongoing content and gameplay polish
                 
                  - ---

                  ## Tech Stack

                  | Layer | Technology |
                  |---|---|
                  | Language | Vanilla JavaScript (ES6+) |
                  | UI | HTML5 + CSS3 |
                  | Deployment | Vercel |
                  | CI/CD | GitHub Actions |
                  | Art | AI-generated monster sprites + hand-crafted decorations |

                  ---

                  ## What This Code Shows

                  - **Pure vanilla JS game architecture** — no framework, no bundler, no dependencies
                  - - **State machine design** — hero levels, settlement tiers, biome zones, encounter phases
                    - - **Tile-based world rendering** — DOM-based tilemap with layered decorations and sprites
                      - - **Build mode system** — Sims-style prop placement with move/resize/rotate/flip/duplicate/undo
                        - - **GitHub Actions CI/CD** — automated Vercel deployment pipeline
                          - - **Local persistence** — save state across sessions via localStorage
                           
                            - ---

                            ## Run Locally

                            ```bash
                            git clone https://github.com/sonnymay/grasslands-online.git
                            cd grasslands-online/project-grasslands
                            # Open index.html directly, or serve locally:
                            npx serve .
                            ```

                            Open [http://localhost:3000](http://localhost:3000) in your browser.

                            ---

                            ## License

                            MIT
