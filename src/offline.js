/* Offline warm-up for the PWA.
 *
 * The service worker (sw.js) caches engine + data + sprites as they're fetched
 * during normal use. This file adds a "Download for offline" button that
 * proactively fetches the whole data set up front, so the dex works offline
 * right after the first visit without having to browse to every page.
 *
 * What it pulls:
 *   - the big decomp data tables (each holds ALL species/moves/etc.),
 *   - every Pokémon front sprite (parsed out of Front_Pic_Table.c),
 *   - the type chart.
 * The engine code, CSS and fonts are already cached by the SW during the very
 * session in which this button is clicked. Per-move TM/tutor compatibility
 * files are left to cache on demand (they're tiny and numerous). */

// Whole-table data sources. Uses the same global repo vars dex-core sets at
// runtime (repo, repo1, repo2, repoDex) so we never hardcode the wrong branch.
function offlineDataUrls() {
    const raw = (p) => `https://raw.githubusercontent.com/${p}`;
    const urls = [
        // species engine data (repo1 / repo2)
        raw(`${repo1}/include/constants/species.h`),
        raw(`${repo1}/include/constants/abilities.h`),
        raw(`${repo1}/assembly/data/move_tables.json`),
        raw(`${repo1}/src/Tables/battle_moves.c`),
        raw(`${repo1}/src/Tables/raid_encounters.h`),
        raw(`${repo1}/strings/ability_descriptions.string`),
        raw(`${repo1}/strings/ability_name_table.string`),
        raw(`${repo1}/strings/attack_descriptions.string`),
        raw(`${repo1}/strings/attack_name_table.string`),
        raw(`${repo2}/src/Base_Stats.c`),
        raw(`${repo2}/src/Learnsets.c`),
        raw(`${repo2}/src/TM_Tutor_Tables.c`),
        raw(`${repo2}/src/Evolution%20Table.c`),
        raw(`${repo2}/src/Egg_Moves.c`),
        raw(`${repo2}/src/Front_Pic_Table.c`),
        // descriptions / strings (fixed repos)
        raw(`ProfLeonDias/pokefirered/decapitalization/src/data/text/abilities.h`),
        raw(`ProfLeonDias/pokefirered/decapitalization/src/move_descriptions.c`),
        raw(`Skeli789/Complete-Fire-Red-Upgrade/master/include/constants/abilities.h`),
        // Unbound-Pokedex extras
        raw(`${repoDex}/main/src/abilities/duplicate_abilities.json`),
        raw(`${repoDex}/refs/heads/main/src/locations/encounters.json`),
        raw(`${repoDex}/refs/heads/main/src/moves/tutor_flags.json`),
        // type chart (engine repo)
        raw(`ydarissep/dex-core/main/src/typeChart.json`),
    ];

    // ROM-hack repo data (window.repo is set by dex-core's global.js at runtime).
    if (typeof repo !== 'undefined' && repo) {
        urls.push(
            raw(`${repo}/src/data/pokemon/form_species_tables.h`),
            raw(`${repo}/src/data/graphics/items.h`),
            raw(`${repo}/src/data/item_icon_table.h`),
            raw(`${repo}/src/data/items.h`),
            raw(`${repo}/src/data/text/item_descriptions.h`),
            raw(`${repo}/src/data/trade.h`),
            raw(`${repo}/src/data/trainer_parties.h`),
            raw(`${repo}/src/data/trainer_spreads.h`),
            raw(`${repo}/src/data/trainers.h`),
            raw(`${repo}/include/constants/flags.h`),
            raw(`${repo}/src/battle_setup.c`),
            raw(`${repo}/src/field_specials.c`),
            raw(`${repo}/data/event_scripts.s`),
            raw(`${repo}/data/scripts/item_ball_scripts.inc`),
        );
    }
    return urls;
}

// Every front-sprite URL, derived from Front_Pic_Table.c the same way
// regexSprite() does, so we cover the whole roster including special cases.
async function offlineSpriteUrls() {
    const base = `https://raw.githubusercontent.com/${repo2}/graphics/frontspr/`;
    const res = await fetch(`https://raw.githubusercontent.com/${repo2}/src/Front_Pic_Table.c`);
    const text = await res.text();
    const urls = new Set();
    text.split("\n").forEach((line) => {
        if (!/SPECIES_\w+/i.test(line)) return;
        if (/SPECIES_SHADOW_WARRIOR/.test(line)) {
            urls.add(base + "gSpriteShadowWarrior.png");
            return;
        }
        const m = line.match(/gFrontSprite\w+Tiles/i);
        if (m) urls.add(base + m[0].replace("Tiles", ".png"));
    });
    // Castform has a dedicated path in regexSprite().
    urls.add(`https://raw.githubusercontent.com/${repo2}/graphics/castform/gFrontSprite385Castform.png`);
    return [...urls];
}

// Fetch a list of URLs with bounded concurrency, reporting progress. Each fetch
// flows through the service worker, which is what actually caches the response.
async function fetchAll(urls, concurrency, onProgress) {
    let done = 0;
    let i = 0;
    const total = urls.length;
    async function worker() {
        while (i < total) {
            const url = urls[i++];
            try {
                await fetch(url, { credentials: "omit" });
            } catch (e) {
                /* offline/failed fetches just stay uncached; warm-up continues */
            }
            done++;
            if (onProgress) onProgress(done, total);
        }
    }
    const workers = [];
    for (let w = 0; w < Math.min(concurrency, total); w++) workers.push(worker());
    await Promise.all(workers);
}

async function warmOffline(onProgress) {
    const data = offlineDataUrls();
    let sprites = [];
    try {
        sprites = await offlineSpriteUrls();
    } catch (e) {
        console.warn("Sprite list fetch failed:", e);
    }
    const all = data.concat(sprites);
    await fetchAll(all, 8, onProgress);
    return all.length;
}

// Add the "Download for offline" button next to the Enhancements button.
function installOfflineButton() {
    const container = document.getElementById("footerButtonContainer");
    if (!container || document.getElementById("buttonOffline")) return;

    const btn = document.createElement("button");
    btn.id = "buttonOffline";
    btn.type = "button";
    btn.style.width = "140px";
    const idle = "Pobierz na offline";
    btn.textContent = idle;

    let running = false;
    btn.addEventListener("click", async () => {
        if (running) return;
        if (!("serviceWorker" in navigator)) {
            btn.textContent = "Brak wsparcia";
            return;
        }
        running = true;
        btn.disabled = true;
        try {
            const count = await warmOffline((done, total) => {
                btn.textContent = `Pobieranie… ${Math.round((done / total) * 100)}%`;
            });
            btn.textContent = `✓ Offline gotowe`;
            console.log(`Offline warm-up cached ${count} files.`);
        } catch (e) {
            console.warn("Offline warm-up failed:", e);
            btn.textContent = "Błąd — spróbuj ponownie";
        } finally {
            running = false;
            btn.disabled = false;
            setTimeout(() => { if (!running) btn.textContent = idle; }, 4000);
        }
    });

    container.append(btn);
}
