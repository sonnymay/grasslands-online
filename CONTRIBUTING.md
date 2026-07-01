# Contributing to Grasslands Online

Thanks for your interest in contributing to Grasslands Online! ⚔️🌾

## Getting Started

1. **Fork** the repo and clone it locally
2. 2. **Open with a local server** (required for ES modules):
   3.    ```bash
            npx serve .
            # or
            python -m http.server 8080
            ```
         3. Open `http://localhost:8080` in your browser
     
         4. No build step required — this is plain JavaScript.
     
         5. ## How to Contribute
     
         6. ### Bug Reports
         7. - Open a [GitHub Issue](https://github.com/sonnymay/grasslands-online/issues)
            - - Include browser/OS info, steps to reproduce, and what you expected
             
              - ### New Features
              - - Open an issue first to discuss gameplay changes before implementing
                - - Features should fit the idle/strategy + RPG tone
                 
                  - ### Pull Requests
                  - 1. Branch off `main`: `git checkout -b feat/your-feature`
                    2. 2. Keep JS vanilla — no frameworks or build tools
                       3. 3. Test across Chrome, Firefox, and Safari before submitting
                          4. 4. Describe the change and why in your PR description
                            
                             5. ## Code Style
                            
                             6. - **Vanilla JavaScript** — ES2020+, no TypeScript
                                - - Use `const`/`let`, arrow functions, and template literals
                                  - - Keep game logic modular — separate concerns into functions/files
                                    - - **Commits**: Conventional commits (`feat:`, `fix:`, `chore:`, `docs:`)
                                     
                                      - ## Game Design Guidelines
                                     
                                      - When contributing game content or mechanics:
                                      - - Maintain idle-friendly pacing — players shouldn't need to click constantly
                                        - - New encounters or buildings should be balanced with existing progression
                                          - - Keep the UI clean and readable on both desktop and mobile

---

_Updated: 2026-07-01 — docs reviewed for accuracy._
