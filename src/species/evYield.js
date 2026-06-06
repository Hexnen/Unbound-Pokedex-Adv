/*
 * Local addition — "EV Yield" section in the species panel.
 *
 * The amount of effort values a Pokémon gives when defeated is parsed from the
 * same Base_Stats.c the dex already fetches (see regexBaseStats in
 * regexSpecies.js, fields evYield_HP / evYield_Attack / ...). This file wraps
 * the core createSpeciesPanel(name) so a compact "EV Yield" row is (re)built
 * every time a Pokémon is opened, slotted right under the base-stats graph to
 * match the look of the panel's other vertical sections (Abilities, Changes…).
 */

// Field -> short label, in the same order the stats graph uses.
const EV_YIELD_FIELDS = [
    ["evYield_HP", "HP"],
    ["evYield_Attack", "Atk"],
    ["evYield_Defense", "Def"],
    ["evYield_SpAttack", "SpA"],
    ["evYield_SpDefense", "SpD"],
    ["evYield_Speed", "Spe"],
]


window.installSpeciesEVYield = function () {
    if (typeof createSpeciesPanel !== "function") {
        console.warn("EV Yield: createSpeciesPanel not found")
        return
    }
    if (createSpeciesPanel.__evYieldWrapped) return

    const original = createSpeciesPanel
    window.createSpeciesPanel = async function (name) {
        const result = await original.apply(this, arguments)
        try {
            buildSpeciesEVYield(name)
        } catch (e) {
            console.warn("EV Yield:", e)
        }
        return result
    }
    window.createSpeciesPanel.__evYieldWrapped = true
    injectEVYieldStyle()
}


function buildSpeciesEVYield(name) {
    const graphContainer = document.getElementById("speciesBaseStatsGraphContainer")
    if (!graphContainer || typeof species === "undefined" || !species[name]) return

    const existing = document.getElementById("speciesEvYieldContainer")
    if (existing) existing.remove()

    const mon = species[name]

    const container = document.createElement("div")
    container.id = "speciesEvYieldContainer"
    container.className = "speciesPanelTextPadding"

    const label = document.createElement("span")
    label.className = "speciesPanelText"
    label.innerText = "EV Yield:"
    container.append(label)

    const list = document.createElement("span")
    list.id = "speciesEvYield"
    list.className = "speciesPanelTextPadding"

    let total = 0
    EV_YIELD_FIELDS.forEach(([field, shortLabel]) => {
        const value = mon[field] || 0
        if (value > 0) {
            total += value
            const badge = document.createElement("span")
            badge.className = "evYieldBadge " + field
            badge.innerText = `+${value} ${shortLabel}`
            list.append(badge)
        }
    })

    if (total === 0) {
        // Falls back gracefully for cached data built before EV parsing existed,
        // or the rare mon that yields nothing.
        const none = document.createElement("span")
        none.className = "evYieldNone"
        none.innerText = "—"
        list.append(none)
    }

    container.append(list)

    // Slot the row right after the base-stats graph, ahead of "Changes".
    graphContainer.parentNode.insertBefore(container, graphContainer.nextSibling)
}


function injectEVYieldStyle() {
    if (document.getElementById("speciesEvYieldStyle")) return
    const style = document.createElement("style")
    style.id = "speciesEvYieldStyle"
    style.textContent = `
        #speciesEvYieldContainer { text-align: center; }
        #speciesEvYield {
            display: inline-flex;
            flex-wrap: wrap;
            gap: 6px;
            justify-content: center;
            vertical-align: middle;
        }
        .evYieldBadge {
            display: inline-block;
            padding: 2px 8px;
            border-radius: 10px;
            font-weight: 700;
            font-size: 0.9em;
            color: #fff;
            background: hsl(210, 12%, 38%);
            white-space: nowrap;
        }
        .evYieldBadge.evYield_HP        { background: hsl(0,   65%, 45%); }
        .evYieldBadge.evYield_Attack    { background: hsl(28,  70%, 45%); }
        .evYieldBadge.evYield_Defense   { background: hsl(48,  70%, 42%); }
        .evYieldBadge.evYield_SpAttack  { background: hsl(205, 65%, 45%); }
        .evYieldBadge.evYield_SpDefense { background: hsl(140, 55%, 38%); }
        .evYieldBadge.evYield_Speed     { background: hsl(300, 45%, 48%); }
        .evYieldNone { opacity: 0.5; }
    `
    document.head.append(style)
}
