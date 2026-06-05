/*
 * Type Chart tab — local addition for Unbound-Pokedex-Adv.
 *
 * The whole UI is injected at runtime from ydarissep/dex-core, so we cannot add
 * a tab in static HTML. Instead we hook into the core tab mechanism: a tab named
 * "X" only needs the elements #XTable / #XButton / #XInput / #XFilter and a global
 * window.XTracker, and core's tableButtonClick("X") takes care of the switching.
 *
 * This file just defines window.buildTypeChartTab(); src/global.js calls it once
 * the core HTML and scripts have been injected.
 */

window.buildTypeChartTab = async function () {
    // Idempotent — never build the tab twice.
    if (document.getElementById("typeChartButton")) return

    const tableButton = document.getElementById("tableButton")
    const tableInput = document.getElementById("tableInput")
    const tableFilter = document.getElementById("tableFilter")
    const table = document.getElementById("table")
    if (!tableButton || !tableInput || !tableFilter || !table) {
        console.warn("Type Chart tab: core layout not found, aborting")
        return
    }

    // Fetch the local matrix data (typeChart[ATTACKER][DEFENDER] = multiplier).
    let typeChart
    try {
        typeChart = await fetch("src/typeChart.json", { cache: "no-cache" }).then(r => r.json())
    } catch (e) {
        console.warn("Type Chart tab: could not load typeChart.json", e)
        return
    }
    const types = Object.keys(typeChart)

    // Empty tracker so core's tableButtonClick()/lazyLoading() no-op cleanly for us.
    window.typeChartTracker = []

    // --- tab button (sits next to Species / Moves / ...) ---
    const button = document.createElement("button")
    button.type = "button"
    button.id = "typeChartButton"
    button.innerText = "Type Chart"
    tableButton.append(button)

    // --- dummy search input + filter container, required by tableButtonClick ---
    const input = document.createElement("input")
    input.type = "search"
    input.id = "typeChartInput"
    input.classList.add("hide")
    tableInput.append(input)

    const filter = document.createElement("div")
    filter.id = "typeChartFilter"
    filter.classList.add("hide")
    tableFilter.append(filter)

    // --- the tab container ---
    // #typeChartTable is the element core's tableButtonClick toggles. We make it a
    // <div> (not a <table>) so the legend can wrap to the viewport and the wide
    // matrix can sit in its own horizontal-scroll box — important on mobile.
    const container = document.createElement("div")
    container.id = "typeChartTable"
    container.classList.add("hide", "typeChartTable")

    const caption = document.createElement("div")
    caption.className = "typeChartCaption"
    caption.innerHTML =
        '<div class="typeChartInfo">' +
            '<p class="typeChartInfoTitle">Type Effectiveness</p>' +
            '<p>How much damage an <b>attacking</b> type (rows) deals to a ' +
                '<b>defending</b> type (columns). Hover any cell for the exact multiplier.</p>' +
            '<p>Values are for a single defending type. For a dual-type Pokémon, ' +
                '<b>multiply</b> the two columns &mdash; e.g. ' +
                '<span class="typeChartCell mult2">2</span>&nbsp;&times;&nbsp;' +
                '<span class="typeChartCell mult2">2</span>&nbsp;=&nbsp;' +
                '<span class="typeChartCell mult4">4</span>, &nbsp; ' +
                '<span class="typeChartCell mult2">2</span>&nbsp;&times;&nbsp;' +
                '<span class="typeChartCell mult0_5">&frac12;</span>&nbsp;=&nbsp;1, &nbsp; ' +
                '<span class="typeChartCell mult2">2</span>&nbsp;&times;&nbsp;' +
                '<span class="typeChartCell mult0">0</span>&nbsp;=&nbsp;' +
                '<span class="typeChartCell mult0">0</span>.</p>' +
            '<div class="typeChartLegend">' +
                '<span><span class="typeChartCell mult4">4</span> double super effective</span>' +
                '<span><span class="typeChartCell mult2">2</span> super effective</span>' +
                '<span><span class="typeChartCell mult1 typeChartLegendNeutral">1</span> neutral</span>' +
                '<span><span class="typeChartCell mult0_5">&frac12;</span> not very effective</span>' +
                '<span><span class="typeChartCell mult0_25">&frac14;</span> double resisted</span>' +
                '<span><span class="typeChartCell mult0">0</span> no effect</span>' +
            '</div>' +
        '</div>'

    // The matrix itself is a real <table> inside a horizontal-scroll wrapper.
    const scroll = document.createElement("div")
    scroll.className = "typeChartScroll"
    const matrixTable = document.createElement("table")
    matrixTable.className = "typeChartMatrix"

    // Header row: corner + one column per defending type.
    const thead = document.createElement("thead")
    thead.id = "typeChartTableThead"
    const headRow = document.createElement("tr")

    const corner = document.createElement("th")
    corner.className = "typeChartCorner"
    corner.innerHTML = 'ATK&thinsp;\\&thinsp;DEF'
    headRow.append(corner)

    for (const def of types) {
        const th = document.createElement("th")
        th.className = `${def} typeChartHead typeChartColHead`
        th.title = sanitizeString(def)
        th.append(typeIcon(def, "typeChartHeadIcon"))
        headRow.append(th)
    }
    thead.append(headRow)

    // One row per attacking type. These live in <thead> on purpose: core's
    // tableButtonClick()/lazyLoading() wipe the active table's <tbody> on every
    // switch, so the static matrix must sit outside it to survive. The empty
    // <tbody> below only exists to satisfy the core's tab contract.
    for (const atk of types) {
        const tr = document.createElement("tr")

        const rowHead = document.createElement("th")
        rowHead.className = `${atk} typeChartHead typeChartRowHead`
        rowHead.append(typeIcon(atk, "typeChartRowIcon"), document.createTextNode(" " + sanitizeString(atk)))
        tr.append(rowHead)

        for (const def of types) {
            const mult = typeChart[atk][def]
            const td = document.createElement("td")
            td.className = `typeChartCell mult${String(mult).replace(".", "_")}`
            td.innerText = typeChartMultLabel(mult)
            td.title = `${sanitizeString(atk)} → ${sanitizeString(def)} = ${typeChartMultLabel(mult) || "1"}×`
            tr.append(td)
        }
        thead.append(tr)
    }
    matrixTable.append(thead)

    const tbody = document.createElement("tbody")
    tbody.id = "typeChartTableTbody"
    matrixTable.append(tbody)
    scroll.append(matrixTable)
    container.append(scroll)
    container.append(caption)
    table.append(container)

    injectTypeChartStyle()

    // Wire the button the same way core wires its own tabs.
    button.addEventListener("click", async () => {
        if (!button.classList.contains("activeButton")) {
            await tableButtonClick("typeChart")
        }
    })

    // Reorder the top tab bar. Re-appending an existing child moves it to the
    // end, so appending in this order yields the desired left-to-right layout.
    // Trainers/Items are kept (hidden when empty) just before our new tab.
    const tabOrder = ["species", "moves", "abilities", "locations", "trainers", "items", "typeChart"]
    for (const id of tabOrder) {
        const tabButton = document.getElementById(`${id}Button`)
        if (tabButton) tableButton.append(tabButton)
    }
}


/*
 * Species panel — "good vs" / "sucks vs" offensive matchup columns.
 *
 * Wraps the core createSpeciesPanel(name) so two extra columns are (re)built to
 * the right of the stats every time a Pokémon is opened. They reuse the panel's
 * own type-effectiveness helpers and badge classes, so they match the look of
 * the existing Offensive/Defensive charts.
 */
window.installSpeciesMatchupColumns = function () {
    if (typeof createSpeciesPanel !== "function") {
        console.warn("Matchup columns: createSpeciesPanel not found")
        return
    }
    if (createSpeciesPanel.__matchupWrapped) return

    const original = createSpeciesPanel
    window.createSpeciesPanel = async function (name) {
        const result = await original.apply(this, arguments)
        try {
            buildSpeciesMatchupColumns(name)
        } catch (e) {
            console.warn("Matchup columns:", e)
        }
        return result
    }
    window.createSpeciesPanel.__matchupWrapped = true
    injectMatchupStyle()
}


function buildSpeciesMatchupColumns(name) {
    const statsContainer = document.getElementById("speciesBaseStatsGraphContainer")
    if (!statsContainer || typeof species === "undefined" || !species[name]) return

    const existing = document.getElementById("speciesMatchupContainer")
    if (existing) existing.remove()

    const mon = species[name]

    // Attack: best multiplier of the mon's type(s) hitting each type (0, .5, 1, 2).
    //   good vs = deals >1, sucks vs = deals <1.
    // Defence: damage the mon takes from each type (0 .. 4).
    //   good vs = takes <1 (resists), sucks vs = takes >1 (weak).
    const attackGood = [], attackBad = []
    const defenceGood = [], defenceBad = []

    Object.keys(typeChart).forEach(type => {
        const atk = getPokemonEffectivenessValueAgainstType(mon, type)
        if (atk > 1) attackGood.push([type, atk])
        else if (atk < 1) attackBad.push([type, atk])

        const def = getPokemonResistanceValueAgainstType(mon, type)
        if (def < 1) defenceGood.push([type, def])
        else if (def > 1) defenceBad.push([type, def])
    })
    attackGood.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    attackBad.sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))
    defenceGood.sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))
    defenceBad.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))

    const container = document.createElement("div")
    container.id = "speciesMatchupContainer"
    container.className = "flex flexColumn"
    container.append(makeMatchupGroup("attack", attackGood, attackBad, "typeChartOffensive"))
    container.append(makeMatchupGroup("defence", defenceGood, defenceBad, "typeChartDefensive"))
    statsContainer.append(container)
}


function makeMatchupGroup(title, good, bad, valuePrefix) {
    const group = document.createElement("div")
    group.className = "speciesMatchupGroup flex flexColumn flexCenter"

    const groupTitle = document.createElement("div")
    groupTitle.className = "speciesMatchupGroupTitle bold"
    groupTitle.innerText = title
    group.append(groupTitle)

    const cols = document.createElement("div")
    cols.className = "speciesMatchupCols flex"
    cols.append(makeMatchupColumn("good vs", good, valuePrefix))
    cols.append(makeMatchupColumn("sucks vs", bad, valuePrefix))
    group.append(cols)
    return group
}


function makeMatchupColumn(title, entries, valuePrefix) {
    const column = document.createElement("div")
    column.className = "speciesMatchupColumn flex flexColumn"

    const header = document.createElement("div")
    header.className = "speciesMatchupHeader bold"
    header.innerText = title
    column.append(header)

    if (entries.length === 0) {
        const none = document.createElement("div")
        none.className = "speciesMatchupNone"
        none.innerText = "—"
        column.append(none)
        return column
    }

    for (const [type, value] of entries) {
        const row = document.createElement("div")
        row.className = "speciesMatchupRow flex flexCenter"

        const typeBadge = document.createElement("span")
        let label = sanitizeString(type)
        if (label.length > 6) label = label.substring(0, 6)
        typeBadge.innerText = label
        typeBadge.className = `backgroundSmall ${type}`

        const valueBadge = document.createElement("span")
        valueBadge.innerText = value
        valueBadge.className = `${valuePrefix}${value} backgroundSmall`

        row.append(typeBadge)
        row.append(valueBadge)
        column.append(row)
    }
    return column
}


function injectMatchupStyle() {
    if (document.getElementById("speciesMatchupStyle")) return
    const style = document.createElement("style")
    style.id = "speciesMatchupStyle"
    style.textContent = `
        #speciesBaseStatsGraphContainer {
            flex-wrap: wrap;
            justify-content: center;
            align-items: flex-start;
        }
        #speciesMatchupContainer {
            gap: 18px;
            margin-left: 26px;
            align-items: center;
            padding-top: 6px;
        }
        .speciesMatchupGroupTitle {
            font-size: 17px;
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-bottom: 6px;
        }
        .speciesMatchupCols { gap: 18px; align-items: flex-start; }
        /* Fixed width (= one row of two badges) so an empty column keeps its
           width and the two columns / both groups stay aligned. */
        .speciesMatchupColumn { gap: 4px; min-width: 102px; align-items: center; }
        .speciesMatchupHeader {
            margin-bottom: 4px;
            font-size: 14px;
            white-space: nowrap;
            opacity: 0.85;
            text-align: center;
        }
        .speciesMatchupRow { gap: 4px; justify-content: center; }
        .speciesMatchupNone { opacity: 0.5; padding: 4px 0; text-align: center; }
    `
    document.head.append(style)
}


// 3-letter abbreviation for the narrow column headers, e.g. TYPE_FIGHTING -> FIG.
function typeChartAbbr(type) {
    return sanitizeString(type).slice(0, 3).toUpperCase()
}


// A type symbol icon (white silhouette via CSS mask, tinted by currentColor).
// Files live in sprites/types/<name>.svg.
window.typeIcon = function (type, extraClass) {
    const span = document.createElement("span")
    span.className = "typeIcon" + (extraClass ? " " + extraClass : "")
    const url = `url("sprites/types/${sanitizeString(type).toLowerCase()}.svg")`
    span.style.webkitMaskImage = url
    span.style.maskImage = url
    span.title = sanitizeString(type)
    return span
}


// Human label for a multiplier; neutral (1) is left blank to keep the grid readable.
function typeChartMultLabel(mult) {
    if (mult === 1) return ""
    if (mult === 0.5) return "½"   // ½
    if (mult === 0.25) return "¼"  // ¼
    return String(mult)
}


function injectTypeChartStyle() {
    if (document.getElementById("typeChartStyle")) return
    const style = document.createElement("style")
    style.id = "typeChartStyle"
    style.textContent = `
        .typeChartTable {
            margin: 0 auto;
            max-width: 100%;
            font-family: "Roboto Condensed", sans-serif;
        }
        .typeChartScroll {
            overflow-x: auto;
            max-width: 100%;
            -webkit-overflow-scrolling: touch;
        }
        .typeChartMatrix {
            border-collapse: separate;
            border-spacing: 2px;
            margin: 0 auto;
        }
        .typeChartCaption {
            padding: 14px 8px 6px;
        }
        .typeChartInfo {
            max-width: 640px;
            margin: 0 auto;
            text-align: left;
            font-size: 0.92em;
            line-height: 1.55;
            opacity: 0.9;
        }
        .typeChartInfo p { margin: 0 0 8px; }
        .typeChartInfoTitle {
            font-size: 1.25em;
            font-weight: 700;
            text-align: center;
            margin-bottom: 10px !important;
            opacity: 1;
        }
        .typeChartInfo b { font-weight: 700; }
        .typeChartLegend {
            display: flex; flex-wrap: wrap; gap: 6px 16px;
            justify-content: center;
            margin-top: 12px;
        }
        .typeChartLegend > span {
            display: inline-flex; align-items: center; gap: 6px;
            white-space: nowrap;
        }
        .typeChartInfo .typeChartCell {
            display: inline-flex; align-items: center; justify-content: center;
            width: 1.6em; min-width: 1.6em; height: 1.5em;
            border-radius: 3px; vertical-align: middle;
            font-size: 0.85em;
        }
        .typeChartLegendNeutral {
            color: #cfcfcf !important; text-shadow: none !important;
            border: 1px solid rgba(255,255,255,0.18);
        }
        .typeChartHead {
            color: #fff;
            text-shadow: 0 1px 2px rgba(0,0,0,0.6);
            font-weight: 700;
            border-radius: 4px;
            padding: 4px 6px;
            white-space: nowrap;
        }
        .typeChartColHead {
            position: sticky; top: 0; z-index: 2;
            font-size: 0.78em; letter-spacing: 0.5px;
            text-align: center;
        }
        .typeChartRowHead {
            position: sticky; left: 0; z-index: 1;
            text-align: right; padding-right: 8px;
        }
        .typeChartCorner {
            position: sticky; top: 0; left: 0; z-index: 3;
            font-size: 0.72em; opacity: 0.7; white-space: nowrap;
            text-align: center; padding: 4px;
        }
        .typeChartCell {
            width: 2.1em; min-width: 2.1em; height: 2.1em;
            text-align: center; font-weight: 700; font-size: 0.95em;
            border-radius: 3px;
            color: #fff; text-shadow: 0 1px 1px rgba(0,0,0,0.5);
        }
        .typeIcon {
            display: inline-block; width: 1em; height: 1em;
            background-color: currentColor; vertical-align: -0.12em;
            -webkit-mask-size: contain; mask-size: contain;
            -webkit-mask-repeat: no-repeat; mask-repeat: no-repeat;
            -webkit-mask-position: center; mask-position: center;
        }
        .typeChartHeadIcon { width: 18px; height: 18px; vertical-align: middle; }
        .typeChartRowIcon { width: 14px; height: 14px; vertical-align: -0.18em; }
        /* multiplier colours */
        .mult0    { background: #2b2b2b; }
        .mult0_25 { background: #7a1d1d; }
        .mult0_5  { background: #c0504d; }
        .mult1    { background: rgba(127,127,127,0.12); color: transparent; text-shadow: none; }
        .mult2    { background: #4f9d4f; }
        .mult4    { background: #2e7d32; }
        /* mobile: shrink cells so more of the matrix fits; the rest scrolls. */
        @media (max-width: 600px) {
            .typeChartMatrix { border-spacing: 1px; }
            .typeChartCell { width: 1.7em; min-width: 1.7em; height: 1.7em; font-size: 0.8em; }
            .typeChartColHead { font-size: 0.66em; padding: 3px 2px; }
            .typeChartRowHead { font-size: 0.78em; padding: 2px 5px 2px 4px; }
            .typeChartCorner { font-size: 0.62em; padding: 3px; }
        }
    `
    document.head.append(style)
}
