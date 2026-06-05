/*
 * "vs" tab — local addition for Unbound-Pokedex-Adv.
 *
 * Shows the species panel history as a picker; the user selects two Pokémon and
 * the tab shows the type matchup between them (who hits harder on the type/STAB
 * level) plus a base-stat comparison. Hooks into the core tab mechanism the same
 * way the Type Chart tab does (#vsButton / #vsTable / #vsInput / #vsFilter +
 * window.vsTracker, driven by core's tableButtonClick).
 *
 * Note: this is pure type/STAB math — it ignores the actual moveset and
 * abilities (Levitate, Wonder Guard, ...). Move types are a possible follow-up.
 */

const VS_STATS = [
    ["baseHP", "HP"],
    ["baseAttack", "Atk"],
    ["baseDefense", "Def"],
    ["baseSpAttack", "SpA"],
    ["baseSpDefense", "SpD"],
    ["baseSpeed", "Spe"],
    ["BST", "BST"],
]

window.buildVsTab = function () {
    if (document.getElementById("vsButton")) return

    const tableButton = document.getElementById("tableButton")
    const tableInput = document.getElementById("tableInput")
    const tableFilter = document.getElementById("tableFilter")
    const table = document.getElementById("table")
    if (!tableButton || !tableInput || !tableFilter || !table) {
        console.warn("vs tab: core layout not found, aborting")
        return
    }

    // Restore a previous selection if any.
    try {
        window.vsSelection = JSON.parse(localStorage.getItem("vsSelection")) || []
    } catch (e) {
        window.vsSelection = []
    }
    if (!Array.isArray(window.vsSelection)) window.vsSelection = []

    // Empty tracker so core's tableButtonClick()/lazyLoading() no-op cleanly.
    window.vsTracker = []

    const button = document.createElement("button")
    button.type = "button"
    button.id = "vsButton"
    button.innerText = "vs"
    tableButton.append(button)

    const input = document.createElement("input")
    input.type = "search"
    input.id = "vsInput"
    input.placeholder = "Add a Pokémon to compare…"
    input.classList.add("hide")
    input.setAttribute("list", "vsInputDataList")
    tableInput.append(input)

    // Empty datalist now; it's filled lazily once species data has loaded (see
    // vsEnsureNameList). Picking an option adds the Pokémon to the comparison.
    const datalist = document.createElement("datalist")
    datalist.id = "vsInputDataList"
    window.vsNameMap = window.vsNameMap || {}
    tableInput.append(datalist)

    // Load the Unbound roster + catch hints (scraped from unboundwiki) once.
    if (!window.vsUnboundDex) {
        fetch("src/unboundDex.json", { cache: "no-cache" })
            .then(r => r.json())
            .then(data => {
                window.vsUnboundDex = data
                window.vsUnboundRoster = new Set(Object.keys(data).map(vsNormName))
                window.vsUnboundByNorm = {}
                for (const k of Object.keys(data)) window.vsUnboundByNorm[vsNormName(k)] = data[k]
                vsEnsureNameList(true)
                renderVsTab()
            })
            .catch(e => console.warn("unboundDex.json", e))
    }

    input.addEventListener("change", () => {
        const token = window.vsNameMap[input.value.trim().toLowerCase()]
        if (token) {
            vsAddSelection(token)
            input.value = ""
            renderVsTab()
        }
    })

    const filter = document.createElement("div")
    filter.id = "vsFilter"
    filter.classList.add("hide")
    tableFilter.append(filter)

    // The matchup UI lives in <thead> (survives core's tbody clearing); the empty
    // <tbody> only satisfies the tab contract. We re-render on every open anyway.
    const vsTable = document.createElement("table")
    vsTable.id = "vsTable"
    vsTable.classList.add("hide", "vsTable")
    const thead = document.createElement("thead")
    const tr = document.createElement("tr")
    const th = document.createElement("th")
    th.className = "vsTableCell"
    const content = document.createElement("div")
    content.id = "vsContent"
    th.append(content)
    tr.append(th)
    thead.append(tr)
    vsTable.append(thead)
    const tbody = document.createElement("tbody")
    tbody.id = "vsTableTbody"
    vsTable.append(tbody)
    table.append(vsTable)

    injectVsStyle()

    button.addEventListener("click", async () => {
        if (!button.classList.contains("activeButton")) {
            await tableButtonClick("vs")
            renderVsTab()
        }
    })
}


function vsNormName(s) {
    return String(s).toLowerCase().replace(/[^a-z0-9]/g, "")
}


// True if the species is in the Unbound roster (from src/unboundDex.json, scraped
// from unboundwiki). Until that data has loaded, don't filter anything.
function vsIsObtainable(name) {
    const roster = window.vsUnboundRoster
    if (!roster) return true
    return roster.has(vsNormName(sanitizeString(name)))
}


// Unbound dex entry { nat, bor, catch } for a species, if known.
function vsCatchInfo(name) {
    if (!window.vsUnboundByNorm) return null
    return window.vsUnboundByNorm[vsNormName(sanitizeString(name))] || null
}


// Populate the search datalist + name→token map. `force` rebuilds it (e.g. when
// the "obtainable only" toggle changes).
function vsEnsureNameList(force) {
    if (typeof species === "undefined") return
    const datalist = document.getElementById("vsInputDataList")
    if (!datalist) return
    if (!force && datalist.options.length > 0) return

    while (datalist.firstChild) datalist.removeChild(datalist.firstChild)
    window.vsNameMap = {}
    const obtainableOnly = window.vsObtainableOnly !== false
    const names = Object.keys(species)
        .filter(n => n !== "SPECIES_NONE" && species[n] && species[n]["baseSpeed"] != 0)
        .filter(n => !obtainableOnly || vsIsObtainable(n))
        .map(n => [n, sanitizeString(n)])
        .sort((x, y) => x[1].localeCompare(y[1]))
    for (const [token, disp] of names) {
        const key = disp.toLowerCase()
        if (key in window.vsNameMap) continue
        window.vsNameMap[key] = token
        const opt = document.createElement("option")
        opt.value = disp
        datalist.append(opt)
    }
}


function renderVsTab() {
    const content = document.getElementById("vsContent")
    if (!content) return
    vsEnsureNameList()
    while (content.firstChild) content.removeChild(content.firstChild)

    // Drop selections that are no longer valid species.
    window.vsSelection = window.vsSelection
        .filter(name => typeof species !== "undefined" && species[name] && species[name]["baseSpeed"] != 0)
        .slice(0, 2)

    // Forget an open move-list (per side) if its Pokémon is no longer picked.
    if (window.vsCovDetail) {
        for (const side of ["left", "right"]) {
            const d = window.vsCovDetail[side]
            if (d && !window.vsSelection.includes(d.attacker)) {
                window.vsCovDetail[side] = null
            }
        }
    }

    // When the pair changes, auto-open the highest-%HP type on each side. Manual
    // clicks and level changes (same pair) don't re-trigger this.
    if (window.vsSelection.length === 2) {
        const sig = window.vsSelection.join("|")
        if (sig !== window.vsCovAutoKey) {
            const [a, b] = window.vsSelection
            const lt = vsBestCoverageType(a, b)
            const rt = vsBestCoverageType(b, a)
            window.vsCovDetail = {
                left: lt ? { attacker: a, defender: b, type: lt } : null,
                right: rt ? { attacker: b, defender: a, type: rt } : null,
            }
            window.vsCovAutoKey = sig
        }
    }

    content.append(buildVsHistory())
    content.append(buildVsComparison())
}


function vsValidHistory() {
    const hist = (typeof speciesPanelHistory !== "undefined" ? speciesPanelHistory : [])
    const seen = new Set()
    const out = []
    for (const entry of hist) {
        const name = entry[0]
        if (seen.has(name)) continue
        if (typeof species === "undefined" || !species[name] || species[name]["baseSpeed"] == 0) continue
        seen.add(name)
        out.push(name)
    }
    return out
}


function buildVsHistory() {
    const wrap = document.createElement("div")
    wrap.className = "vsSection"

    const label = document.createElement("div")
    label.className = "vsSectionLabel"
    label.innerText = "History — click two Pokémon to compare (or search above)"
    wrap.append(label)

    const searchToggle = document.createElement("div")
    searchToggle.className = "vsCovToggles"
    searchToggle.append(vsMakeToggle(
        "search: Unbound dex only",
        window.vsObtainableOnly !== false,
        v => { window.vsObtainableOnly = v; vsEnsureNameList(true) },
        "Limit the search box to Pokémon in the Unbound dex (roster from unboundwiki).",
    ))
    wrap.append(searchToggle)

    const hist = vsValidHistory()
    if (hist.length === 0) {
        const none = document.createElement("div")
        none.className = "vsNote"
        none.innerText = "No history yet — open some Pokémon first and they'll show up here."
        wrap.append(none)
        return wrap
    }

    const strip = document.createElement("div")
    strip.className = "vsHistoryStrip"
    for (const name of hist) {
        const item = document.createElement("span")
        item.className = "vsHistoryItem"
        item.title = sanitizeString(name)

        const idx = window.vsSelection.indexOf(name)
        if (idx >= 0) item.classList.add("vsSelected")

        const img = document.createElement("img")
        img.src = getSpeciesSpriteSrc(name)
        img.alt = sanitizeString(name)
        item.append(img)

        if (idx >= 0) {
            const badge = document.createElement("span")
            badge.className = "vsSlotBadge"
            badge.innerText = idx === 0 ? "A" : "B"
            item.append(badge)
        }

        item.addEventListener("click", () => {
            toggleVsSelection(name)
            renderVsTab()
        })
        strip.append(item)
    }
    wrap.append(strip)
    return wrap
}


function toggleVsSelection(name) {
    const sel = window.vsSelection
    const idx = sel.indexOf(name)
    if (idx >= 0) {
        sel.splice(idx, 1)
    } else if (sel.length < 2) {
        sel.push(name)
    } else {
        sel.shift()
        sel.push(name)
    }
    localStorage.setItem("vsSelection", JSON.stringify(sel))
}


// Add a Pokémon to the comparison (from the search box). Replaces the oldest
// pick when both slots are full; ignores duplicates.
function vsAddSelection(name) {
    const sel = window.vsSelection
    if (sel.includes(name)) return
    if (sel.length < 2) sel.push(name)
    else {
        sel.shift()
        sel.push(name)
    }
    localStorage.setItem("vsSelection", JSON.stringify(sel))
}


function buildVsComparison() {
    const wrap = document.createElement("div")
    wrap.className = "vsSection vsComparison"

    const a = window.vsSelection[0]
    const b = window.vsSelection[1]

    if (!a || !b) {
        const note = document.createElement("div")
        note.className = "vsNote"
        note.innerText = a
            ? "Pick one more Pokémon to compare."
            : "Pick two Pokémon from the history above."
        wrap.append(note)
        return wrap
    }

    // Decide winner/loser from the type matchup so the headers can show arrows.
    const aToB = vsOffensiveBetween(a, b)
    const bToA = vsOffensiveBetween(b, a)
    let resultA = "even"
    let resultB = "even"
    if (aToB > bToA) {
        resultA = "win"
        resultB = "lose"
    } else if (bToA > aToB) {
        resultA = "lose"
        resultB = "win"
    }

    // Header: A vs B with sprite, name, types, abilities. The win/lose arrow is
    // pinned to the outer top corner of each Pokémon's sprite.
    const head = document.createElement("div")
    head.className = "vsHead"
    head.append(buildVsMonHeader(a, resultA, "left"))
    const vsLabel = document.createElement("div")
    vsLabel.className = "vsHeadVs bold"
    vsLabel.innerText = "vs"
    head.append(vsLabel)
    head.append(buildVsMonHeader(b, resultB, "right"))
    wrap.append(head)

    wrap.append(buildVsMatchup(a, b))
    wrap.append(buildVsCoverage(a, b))
    wrap.append(buildVsStats(a, b))

    const buttons = document.createElement("div")
    buttons.className = "vsButtons"

    const resetLv = document.createElement("button")
    resetLv.type = "button"
    resetLv.className = "vsClearButton"
    resetLv.innerText = "Reset Lv"
    resetLv.title = "Restore default (minimum) levels"
    resetLv.addEventListener("click", () => {
        if (!window.vsLevels) window.vsLevels = {}
        delete window.vsLevels[a]
        delete window.vsLevels[b]
        renderVsTab()
    })

    const clear = document.createElement("button")
    clear.type = "button"
    clear.className = "vsClearButton"
    clear.innerText = "Clear"
    clear.addEventListener("click", () => {
        window.vsSelection = []
        localStorage.setItem("vsSelection", "[]")
        renderVsTab()
    })

    buttons.append(resetLv, clear)
    wrap.append(buttons)

    return wrap
}


function vsMonTypes(name) {
    const obj = species[name]
    const list = [obj["type1"]]
    if (obj["type2"] !== obj["type1"]) list.push(obj["type2"])
    if (obj["type3"] && obj["type3"] !== obj["type1"] && obj["type3"] !== obj["type2"]) {
        list.push(obj["type3"])
    }
    return list
}


// Best STAB multiplier of the attacker's type(s) against the defender's full
// typing — i.e. how hard the attacker can hit on the type level (0 .. 4).
function vsOffensiveBetween(attacker, defender) {
    const atkTypes = vsMonTypes(attacker)
    const defTypes = vsMonTypes(defender)
    let best = 0
    for (const t of atkTypes) {
        let mult = 1
        for (const d of defTypes) mult *= typeChart[t][d]
        if (mult > best) best = mult
    }
    return best
}


function makeVsArrow(result, side) {
    if (result !== "win" && result !== "lose") return null
    const arrow = document.createElement("div")
    arrow.className = `vsResultArrow vsResult-${result} vsResultArrow-${side}`
    arrow.innerText = result === "win" ? "▲" : "▼"
    arrow.title = result === "win" ? "Type advantage" : "Type disadvantage"
    return arrow
}


function buildVsMonHeader(name, result, side) {
    const col = document.createElement("div")
    col.className = "vsMon"

    // Sprite in a relative wrapper so the win/lose arrow can be pinned to its
    // outer top corner (stays put on resize).
    const spriteWrap = document.createElement("div")
    spriteWrap.className = "vsMonSpriteWrap"
    const img = document.createElement("img")
    img.className = "vsMonSprite"
    img.src = getSpeciesSpriteSrc(name)
    spriteWrap.append(img)
    const arrow = makeVsArrow(result, side)
    if (arrow) spriteWrap.append(arrow)
    col.append(spriteWrap)

    const nm = document.createElement("div")
    nm.className = "vsMonName bold"
    nm.innerText = sanitizeString(name)
    col.append(nm)

    const lvlRow = document.createElement("div")
    lvlRow.className = "vsMonLevel"
    const lvlLabel = document.createElement("span")
    lvlLabel.className = "vsMonLevelLabel"
    lvlLabel.innerText = "Lv"

    const setLevel = v => {
        v = Math.max(1, Math.min(100, v))
        if (!window.vsLevels) window.vsLevels = {}
        window.vsLevels[name] = v
        renderVsTab()
    }

    const minus = document.createElement("span")
    minus.className = "vsLvlBtn"
    minus.innerText = "−"
    minus.title = "−1"
    minus.addEventListener("click", () => setLevel(vsLevelOf(name) - 1))

    const lvlInput = document.createElement("input")
    lvlInput.type = "number"
    lvlInput.min = "1"
    lvlInput.max = "100"
    lvlInput.className = "vsMonLevelInput"
    lvlInput.value = vsLevelOf(name)
    lvlInput.addEventListener("change", () => {
        let v = parseInt(lvlInput.value, 10)
        if (isNaN(v)) v = vsMinLevel(name)
        setLevel(v)
    })

    const plus = document.createElement("span")
    plus.className = "vsLvlBtn"
    plus.innerText = "+"
    plus.title = "+1"
    plus.addEventListener("click", () => setLevel(vsLevelOf(name) + 1))

    lvlRow.append(lvlLabel, minus, lvlInput, plus)
    col.append(lvlRow)

    const types = document.createElement("div")
    types.className = "vsMonTypes"
    for (const t of vsMonTypes(name)) {
        const badge = document.createElement("span")
        badge.className = `${t} background`
        badge.innerText = sanitizeString(t)
        types.append(badge)
    }
    col.append(types)

    const abilitiesEl = document.createElement("div")
    abilitiesEl.className = "vsMonAbilities"
    const seen = new Set()
    for (const tok of species[name]["abilities"]) {
        if (tok === "ABILITY_NONE" || seen.has(tok)) continue
        if (typeof abilities === "undefined" || !abilities[tok]) continue
        seen.add(tok)
        const ab = document.createElement("div")
        ab.className = "vsMonAbility"
        ab.innerText = abilities[tok]["ingameName"]
        abilitiesEl.append(ab)
    }
    col.append(abilitiesEl)

    // Unbound dex numbers + how to catch (from unboundwiki).
    const info = vsCatchInfo(name)
    if (info) {
        if (info.nat || info.bor) {
            const dex = document.createElement("div")
            dex.className = "vsMonDex"
            const parts = []
            if (info.nat) parts.push(`Nat #${info.nat}`)
            if (info.bor) parts.push(`Borrius #${info.bor}`)
            dex.innerText = parts.join(" · ")
            col.append(dex)
        }
        if (info.catch) {
            const c = document.createElement("div")
            c.className = "vsMonCatch"
            c.innerText = info.catch
            c.title = info.catch
            col.append(c)
        }
    }

    return col
}


function buildVsMatchup(a, b) {
    const box = document.createElement("div")
    box.className = "vsMatchup"

    const heading = document.createElement("div")
    heading.className = "vsMatchupHeading bold"
    heading.innerText = "Type matchup"
    box.append(heading)

    const aToB = vsOffensiveBetween(a, b)
    const bToA = vsOffensiveBetween(b, a)

    box.append(buildVsMatchupLine(a, b, aToB))
    box.append(buildVsMatchupLine(b, a, bToA))

    const verdict = document.createElement("div")
    verdict.className = "vsVerdict bold"
    if (aToB > bToA) {
        verdict.classList.add("vsVerdictWin")
        verdict.innerText = `✔ Type advantage: ${sanitizeString(a)}`
    } else if (bToA > aToB) {
        verdict.classList.add("vsVerdictWin")
        verdict.innerText = `✔ Type advantage: ${sanitizeString(b)}`
    } else {
        verdict.classList.add("vsVerdictEven")
        verdict.innerText = "Even matchup"
    }
    box.append(verdict)

    return box
}


function buildVsMatchupLine(attacker, defender, mult) {
    const line = document.createElement("div")
    line.className = "vsMatchupLine"

    const text = document.createElement("span")
    text.className = "vsMatchupText"
    text.innerText = `${sanitizeString(attacker)} → ${sanitizeString(defender)}`
    line.append(text)

    const badge = document.createElement("span")
    badge.className = `vsMultBadge ${vsMultClass(mult)} backgroundSmall`
    badge.innerText = `${vsMultLabel(mult)}×`
    line.append(badge)

    const word = document.createElement("span")
    word.className = "vsMatchupWord"
    word.innerText = mult > 1 ? "good" : mult < 1 ? "weak" : "neutral"
    line.append(word)

    return line
}


// Unique types of the mon's damaging moves across every learnset (Physical /
// Special with power > 0). Aggregated, so each type appears once.
function vsAttackingMoveTypes(name) {
    const obj = species[name]
    const learnsets = ["levelUpLearnsets", "TMHMLearnsets", "eggMovesLearnsets", "tutorLearnsets"]
    const types = new Set()
    for (const ls of learnsets) {
        const arr = obj[ls]
        if (!Array.isArray(arr)) continue
        for (const entry of arr) {
            const moveName = Array.isArray(entry) ? entry[0] : entry
            const mv = typeof moves !== "undefined" ? moves[moveName] : null
            if (!mv) continue
            if (mv["split"] === "SPLIT_STATUS") continue
            if (!(Number(mv["power"]) > 0)) continue
            if (!(mv["type"] in typeChart)) continue
            types.add(mv["type"])
        }
    }
    return [...types]
}


// Each of the attacker's move-types with its effective multiplier against the
// defender's full typing, best first. STAB move-types (matching the attacker's
// own typing) get the ×1.5 bonus and are flagged.
function vsCoverageAgainst(attacker, defender) {
    const defTypes = vsMonTypes(defender)
    const ownTypes = new Set(vsMonTypes(attacker))
    const out = vsAttackingMoveTypes(attacker).map(t => {
        let mult = 1
        for (const d of defTypes) mult *= typeChart[t][d]
        const stab = ownTypes.has(t)
        const effective = stab ? mult * 1.5 : mult
        return { type: t, effective, stab }
    })
    out.sort((a, b) => b.effective - a.effective || a.type.localeCompare(b.type))
    return out
}


// The attacker's move-type that deals the highest %HP to the defender (by the
// strongest single move of each type). Used to auto-open the best matchup.
function vsBestCoverageType(attacker, defender) {
    const level = vsLevelOf(attacker)
    const opts = vsSourceOpts()
    let best = null
    let bestPct = -1
    for (const t of vsAttackingMoveTypes(attacker)) {
        let typeMax = 0
        for (const mv of vsMovesOfType(attacker, t)) {
            const a = vsMoveAvail(mv, opts)
            if (!a.obtainable || a.availLevel > level) continue // usable now only
            const d = vsEstimateDamage(attacker, defender, mv.power, mv.split, t)
            if (d.maxPct > typeMax) typeMax = d.maxPct
        }
        if (typeMax > bestPct) {
            bestPct = typeMax
            best = t
        }
    }
    return best
}


function vsMakeToggle(labelText, checked, onChange, title) {
    const label = document.createElement("label")
    label.className = "vsCovToggle"
    if (title) label.title = title
    const cb = document.createElement("input")
    cb.type = "checkbox"
    cb.checked = checked
    cb.addEventListener("change", () => {
        onChange(cb.checked)
        renderVsTab()
    })
    label.append(cb, document.createTextNode(" " + labelText))
    return label
}


function buildVsCoverage(a, b) {
    const box = document.createElement("div")
    box.className = "vsCoverageBox"

    const heading = document.createElement("div")
    heading.className = "vsMatchupHeading bold"
    heading.innerText = "Attack coverage"
    box.append(heading)

    const note = document.createElement("div")
    note.className = "vsCoverageNote"
    note.innerHTML =
        "Every damaging move-type each Pokémon can learn, vs the opponent's typing." +
        '<br><span class="vsCovStar">★</span> = STAB — same-type attack bonus, ' +
        "a move matching the user's own type deals ×1.5"
    box.append(note)

    const toggles = document.createElement("div")
    toggles.className = "vsCovToggles"
    toggles.append(
        vsMakeToggle("locked", !!window.vsShowUnavailable, v => { window.vsShowUnavailable = v }, "Show moves not learnable at this level (greyed out)"),
        vsMakeToggle("TM/HM", window.vsIncludeTM !== false, v => { window.vsIncludeTM = v }),
        vsMakeToggle("Tutor", window.vsIncludeTutor !== false, v => { window.vsIncludeTutor = v }),
        vsMakeToggle("Egg", window.vsIncludeEgg !== false, v => { window.vsIncludeEgg = v }),
    )
    box.append(toggles)

    const cols = document.createElement("div")
    cols.className = "vsCoverageCols"
    const detail = window.vsCovDetail || {}

    // Fixed-width slots are always reserved on both sides so the two coverage
    // columns never shift when a move list opens. Each side keeps its own open
    // type independently — one move list can be open per side.
    const leftSlot = document.createElement("div")
    leftSlot.className = "vsCovSlot"
    const rightSlot = document.createElement("div")
    rightSlot.className = "vsCovSlot"
    if (detail.left) leftSlot.append(buildVsMoveList(detail.left))
    if (detail.right) rightSlot.append(buildVsMoveList(detail.right))

    cols.append(leftSlot)
    cols.append(buildVsCoverageRow(a, b, "left"))
    cols.append(buildVsCoverageRow(b, a, "right"))
    cols.append(rightSlot)

    box.append(cols)
    return box
}


function buildVsCoverageRow(attacker, defender, side) {
    const row = document.createElement("div")
    row.className = "vsCoverageRow"

    const label = document.createElement("div")
    label.className = "vsCoverageLabel"
    const strong = document.createElement("b")
    strong.innerText = sanitizeString(attacker)
    label.append(strong, document.createTextNode(` → ${sanitizeString(defender)}`))
    row.append(label)

    const list = document.createElement("div")
    list.className = "vsCoverageList"

    const coverage = vsCoverageAgainst(attacker, defender)
    if (coverage.length === 0) {
        const none = document.createElement("span")
        none.className = "vsNote"
        none.innerText = "no damaging moves"
        list.append(none)
        row.append(list)
        return row
    }

    const sideDetail = (window.vsCovDetail || {})[side]
    for (const { type, effective, stab } of coverage) {
        const chip = document.createElement("span")
        chip.className = stab ? "vsCovChip vsCovStab" : "vsCovChip"
        chip.classList.add("vsCovClickable")
        const isActive = sideDetail && sideDetail.type === type
        if (isActive) {
            chip.classList.add("vsCovChipActive")
            // Chevron points from the open chip toward its move list (outer side).
            const chevron = document.createElement("span")
            chevron.className = `vsCovChevron vsCovChevron${side === "left" ? "Left" : "Right"}`
            chevron.innerText = side === "left" ? "◀" : "▶"
            chip.append(chevron)
        }
        chip.title = `${sanitizeString(type)} moves of ${sanitizeString(attacker)} (click)`
        chip.addEventListener("click", () => {
            if (!window.vsCovDetail) window.vsCovDetail = { left: null, right: null }
            const cur = window.vsCovDetail[side]
            if (cur && cur.attacker === attacker && cur.type === type) {
                window.vsCovDetail[side] = null
            } else {
                window.vsCovDetail[side] = { attacker, defender, type }
            }
            renderVsTab()
        })

        const typeBadge = document.createElement("span")
        typeBadge.className = `${type} vsCovType`
        typeBadge.innerText = typeChartAbbr(type)
        typeBadge.title = sanitizeString(type) + (stab ? " (STAB ×1.5)" : "")

        const multEl = document.createElement("span")
        multEl.className = `vsCovMult ${vsCovMultClass(effective)}`
        multEl.innerText = `${vsCovLabel(effective)}×`

        const right = document.createElement("span")
        right.className = "vsCovRight"
        if (stab) {
            const star = document.createElement("span")
            star.className = "vsCovStar"
            star.innerText = "★"
            star.title = "STAB ×1.5"
            right.append(star)
        }
        right.append(multEl)

        chip.append(typeBadge, right)
        list.append(chip)
    }
    row.append(list)
    return row
}


// All damaging moves of a given type the Pokémon can learn, deduped across
// learnsets (keeping every source tag), strongest first.
function vsMovesOfType(name, type) {
    const obj = species[name]
    const learnsets = [
        ["levelUpLearnsets", "LV"],
        ["TMHMLearnsets", "TM"],
        ["eggMovesLearnsets", "Egg"],
        ["tutorLearnsets", "Tutor"],
    ]
    const byName = new Map()
    for (const [ls, tag] of learnsets) {
        const arr = obj[ls]
        if (!Array.isArray(arr)) continue
        for (const entry of arr) {
            const moveName = Array.isArray(entry) ? entry[0] : entry
            const mv = typeof moves !== "undefined" ? moves[moveName] : null
            if (!mv) continue
            if (mv["split"] === "SPLIT_STATUS") continue
            if (!(Number(mv["power"]) > 0)) continue
            if (mv["type"] !== type) continue
            // Track sources and, separately, the lowest level-up level (Infinity
            // if the move has no level-up source). Availability is derived later
            // from the enabled sources (see vsMoveAvail).
            const isLevelUp = ls === "levelUpLearnsets"
            const lvl = isLevelUp ? Number(entry[1]) : Infinity
            if (!byName.has(moveName)) {
                byName.set(moveName, {
                    name: mv["ingameName"],
                    power: Number(mv["power"]),
                    split: mv["split"],
                    sources: new Set([tag]),
                    levelUpLevel: lvl,
                })
            } else {
                const m = byName.get(moveName)
                m.sources.add(tag)
                m.levelUpLevel = Math.min(m.levelUpLevel, lvl)
            }
        }
    }
    const list = [...byName.values()]
    list.sort((x, y) => y.power - x.power || x.name.localeCompare(y.name))
    return list
}


// Whether the move can be obtained at all (given the TM/HM toggle) and the level
// at which it becomes available. Egg/Tutor/TM are level-independent (level 0);
// otherwise it's the level-up level. A TM-only move with TM disabled is not
// obtainable at all.
// Which move sources are enabled by the toggles (level-up is always on).
function vsSourceOpts() {
    return {
        tm: window.vsIncludeTM !== false,
        egg: window.vsIncludeEgg !== false,
        tutor: window.vsIncludeTutor !== false,
    }
}


function vsMoveAvail(mv, opts) {
    const nonLevel =
        (opts.egg && mv.sources.has("Egg")) ||
        (opts.tutor && mv.sources.has("Tutor")) ||
        (opts.tm && mv.sources.has("TM"))
    const obtainable = nonLevel || mv.levelUpLevel !== Infinity
    const availLevel = nonLevel ? 0 : mv.levelUpLevel
    return { obtainable, availLevel }
}


// "When does it learn this move" label: the level for level-up moves, otherwise
// the enabled source (TM/Tutor/Egg). Uses the already-resolved availLevel.
function vsLearnLabel(mv, opts) {
    if (mv.availLevel > 0 && mv.availLevel !== Infinity) return `Lv${mv.availLevel}`
    if (opts.tm && mv.sources.has("TM")) return "TM"
    if (opts.tutor && mv.sources.has("Tutor")) return "Tutor"
    if (opts.egg && mv.sources.has("Egg")) return "Egg"
    return "—"
}


// The species whose evolution produces `name` (its immediate pre-evolution).
function vsFindPreEvo(name) {
    for (const s in species) {
        const evo = species[s]["evolution"]
        if (!Array.isArray(evo)) continue
        for (const e of evo) {
            if (e[2] === name) return { pre: s, method: e[0], param: e[1] }
        }
    }
    return null
}


// Level requirement of an evolution step (0 if it isn't a level-up evolution).
function vsEvoLevel(method, param) {
    if (typeof method === "string" && method.startsWith("EVO_LEVEL")) {
        const n = parseInt(param, 10)
        return isNaN(n) ? 0 : n
    }
    return 0
}


// Minimum level a Pokémon must have reached to be in this form: the highest
// level-up requirement along its evolution chain, floored at 10 (base forms).
function vsMinLevel(name) {
    let min = 10
    let cur = name
    let guard = 0
    while (guard++ < 12) {
        const pre = vsFindPreEvo(cur)
        if (!pre) break
        const lvl = vsEvoLevel(pre.method, pre.param)
        if (lvl > min) min = lvl
        cur = pre.pre
    }
    return min
}


// Current level for a Pokémon in the comparison (user-editable, defaults to min).
function vsLevelOf(name) {
    if (!window.vsLevels) window.vsLevels = {}
    if (typeof window.vsLevels[name] !== "number") window.vsLevels[name] = vsMinLevel(name)
    return window.vsLevels[name]
}


// Rough damage estimate as a % of the defender's HP, using the real damage
// formula at each Pokémon's set level (neutral nature, 31 IVs, 0 EVs). Applies
// STAB + type effectiveness but ignores items, abilities, weather, crits and
// move conditions — a comparison aid, not an exact battle figure.
function vsEstimateDamage(attacker, defender, power, split, moveType) {
    const aL = vsLevelOf(attacker)
    const dL = vsLevelOf(defender)
    const stat = (base, L) => Math.floor((2 * base + 31) * L / 100) + 5
    const hpStat = (base, L) => Math.floor((2 * base + 31) * L / 100) + L + 10
    const phys = split === "SPLIT_PHYSICAL"
    const atk = phys ? stat(species[attacker]["baseAttack"], aL) : stat(species[attacker]["baseSpAttack"], aL)
    const def = phys ? stat(species[defender]["baseDefense"], dL) : stat(species[defender]["baseSpDefense"], dL)

    const stab = vsMonTypes(attacker).includes(moveType) ? 1.5 : 1
    let typeMult = 1
    for (const d of vsMonTypes(defender)) typeMult *= typeChart[moveType][d]

    const baseDmg = Math.floor(Math.floor((2 * aL / 5 + 2) * power * atk / def) / 50) + 2
    const roll = r => Math.floor(Math.floor(Math.floor(baseDmg * stab) * typeMult) * r)
    const hp = hpStat(species[defender]["baseHP"], dL)

    return {
        minPct: Math.round(roll(0.85) / hp * 100),
        maxPct: Math.round(roll(1.0) / hp * 100),
    }
}


function vsRound1(x) {
    const r = Math.round(x * 10) / 10
    return Number.isInteger(r) ? String(r) : r.toFixed(1)
}


// Damage label: a %HP range, or "KO ×N" overkill multiplier when it KOs.
function vsFmtPct(dmg) {
    if (dmg.maxPct === 0) return "0%"
    if (dmg.minPct >= 100) return `KO ×${vsRound1(dmg.maxPct / 100)}`
    if (dmg.maxPct >= 100) return `${dmg.minPct}%–KO`
    return `${dmg.minPct}–${dmg.maxPct}%`
}


function buildVsMoveList(detail) {
    const panel = document.createElement("div")
    panel.className = "vsMoveList"

    // Owner indicator — only shown in the single-column (mobile) layout, where the
    // move lists stack full-width and the chevron link to a column is gone.
    const owner = document.createElement("img")
    owner.className = "vsMoveListOwner"
    owner.src = getSpeciesSpriteSrc(detail.attacker)
    owner.title = sanitizeString(detail.attacker)
    owner.alt = sanitizeString(detail.attacker)
    panel.append(owner)

    const level = vsLevelOf(detail.attacker)
    const opts = vsSourceOpts()
    // Resolve each move's availability for the current toggles; drop ones that
    // aren't obtainable at all (e.g. a TM-only move when TM/HM is disabled).
    const all = vsMovesOfType(detail.attacker, detail.type)
        .map(mv => Object.assign({}, mv, vsMoveAvail(mv, opts)))
        .filter(mv => mv.obtainable)
    // Hide moves the Pokémon can't have at its level, unless the toggle is on.
    const list = (window.vsShowUnavailable ? all : all.filter(mv => mv.availLevel <= level))
        .sort((x, y) => {
            const xa = x.availLevel <= level, ya = y.availLevel <= level
            if (xa !== ya) return xa ? -1 : 1   // available first
            return y.power - x.power
        })

    if (list.length === 0) {
        const none = document.createElement("div")
        none.className = "vsNote"
        none.innerText = "no moves at this level"
        panel.append(none)
        return panel
    }
    for (const mv of list) {
        const avail = mv.availLevel <= level
        const row = document.createElement("div")
        row.className = avail ? "vsMoveRow" : "vsMoveRow vsMoveUnavailable"

        const nm = document.createElement("span")
        nm.className = "vsMoveName"
        nm.innerText = mv.name
        if (!avail) {
            const req = document.createElement("span")
            req.className = "vsMoveReq"
            req.innerText = `Lv${mv.availLevel}`
            nm.append(document.createTextNode(" "), req)
        }

        const meta = document.createElement("span")
        meta.className = "vsMoveMeta"
        meta.innerText = mv.power

        const dmg = vsEstimateDamage(detail.attacker, detail.defender, mv.power, mv.split, detail.type)
        const pct = document.createElement("span")
        pct.className = "vsMovePct" + (avail && dmg.maxPct >= 100 ? " vsMoveKO" : "")
        pct.innerText = vsFmtPct(dmg)

        const learn = document.createElement("span")
        learn.className = "vsMoveLearn"
        learn.innerText = vsLearnLabel(mv, opts)

        const splitShort = mv.split === "SPLIT_PHYSICAL" ? "Phys" : mv.split === "SPLIT_SPECIAL" ? "Spec" : ""
        row.append(nm, learn, meta, pct)
        row.title = `${mv.power} BP · ${splitShort} · ${[...mv.sources].join(", ")}` + (avail ? "" : ` · learned at Lv${mv.availLevel}`)
        panel.append(row)
    }

    const foot = document.createElement("div")
    foot.className = "vsMoveListFoot"
    foot.innerText = `≈ %HP · Lv${vsLevelOf(detail.attacker)} vs Lv${vsLevelOf(detail.defender)} · neutral, no EV · no item/ability/crit`
    panel.append(foot)
    return panel
}


function vsCovMultClass(mult) {
    if (mult === 0) return "vsCov0"
    if (mult > 1) return "vsCovGood"
    if (mult < 1) return "vsCovBad"
    return "vsCovNeutral"
}


// Label for an effective (possibly STAB-boosted) multiplier.
function vsCovLabel(mult) {
    const map = {
        "0": "0", "0.25": "¼", "0.375": "⅜", "0.5": "½", "0.75": "¾",
        "1": "1", "1.5": "1.5", "2": "2", "3": "3", "4": "4", "6": "6",
    }
    return (mult in map) ? map[mult] : String(mult)
}


// Actual stat at a given level (neutral nature, 31 IV, 0 EV).
function vsActualStat(base, level, isHP) {
    base = Number(base)
    if (isHP) return Math.floor((2 * base + 31) * level / 100) + level + 10
    return Math.floor((2 * base + 31) * level / 100) + 5
}


// Stat value to show: raw base, or the actual stat (and summed BST) at `level`.
function vsStatValue(name, key, level) {
    if (level == null) return Number(species[name][key])
    if (key === "BST") {
        return ["baseHP", "baseAttack", "baseDefense", "baseSpAttack", "baseSpDefense", "baseSpeed"]
            .reduce((sum, k) => sum + vsActualStat(species[name][k], level, k === "baseHP"), 0)
    }
    return vsActualStat(species[name][key], level, key === "baseHP")
}


function buildVsStats(a, b) {
    const box = document.createElement("div")
    box.className = "vsStatsBox"

    const heading = document.createElement("div")
    heading.className = "vsMatchupHeading bold"
    heading.innerText = "Stats"
    box.append(heading)

    const wrap = document.createElement("div")
    wrap.className = "vsStatsWrap"
    wrap.append(buildVsStatGrid(a, b, "Base", null))
    wrap.append(buildVsStatGrid(a, b, `Current · Lv ${vsLevelOf(a)} / ${vsLevelOf(b)}`, true))
    box.append(wrap)
    return box
}


function buildVsStatGrid(a, b, title, atLevel) {
    const block = document.createElement("div")
    block.className = "vsStatBlock"

    const t = document.createElement("div")
    t.className = "vsStatBlockTitle"
    t.innerText = title
    block.append(t)

    const la = atLevel ? vsLevelOf(a) : null
    const lb = atLevel ? vsLevelOf(b) : null

    const grid = document.createElement("div")
    grid.className = "vsStats"
    for (const [key, label] of VS_STATS) {
        const va = vsStatValue(a, key, la)
        const vb = vsStatValue(b, key, lb)

        const cellA = document.createElement("div")
        cellA.className = "vsStatA"
        cellA.innerText = va

        const cellLabel = document.createElement("div")
        cellLabel.className = "vsStatLabel"
        cellLabel.innerText = label

        const cellB = document.createElement("div")
        cellB.className = "vsStatB"
        cellB.innerText = vb

        if (va > vb) {
            cellA.classList.add("vsHigher")
            cellB.classList.add("vsLower")
        } else if (vb > va) {
            cellB.classList.add("vsHigher")
            cellA.classList.add("vsLower")
        }
        if (key === "BST") {
            cellA.classList.add("vsStatBST")
            cellLabel.classList.add("vsStatBST")
            cellB.classList.add("vsStatBST")
        }

        grid.append(cellA, cellLabel, cellB)
    }
    block.append(grid)
    return block
}


function vsMultLabel(mult) {
    if (mult === 0.25) return "¼"
    if (mult === 0.5) return "½"
    if (mult === 0.125) return "⅛"
    return String(mult)
}


function vsMultClass(mult) {
    if (mult === 0) return "vsMult0"
    if (mult > 1) return "vsMultSuper"
    if (mult < 1) return "vsMultResist"
    return "vsMultNeutral"
}


function injectVsStyle() {
    if (document.getElementById("vsStyle")) return
    const style = document.createElement("style")
    style.id = "vsStyle"
    style.textContent = `
        .vsTable { width: 100%; }
        /* Core darkens every <thead>; neutralise it so our content sits on the
           app background instead of a near-black band. */
        .vsTable thead { background: transparent; }
        .vsTableCell { padding: 10px; font-weight: 400; }
        /* Card matching the species panel container (#speciesPanelContainer). */
        #vsContent {
            max-width: 680px;
            margin: 14px auto;
            padding: 16px;
            font-family: "Roboto Condensed", sans-serif;
        }
        .vsSection { margin: 0 auto 18px; }
        .vsSectionLabel {
            text-align: center;
            font-size: 13px;
            opacity: 0.75;
            margin-bottom: 8px;
        }
        .vsNote {
            text-align: center;
            opacity: 0.6;
            padding: 14px 8px;
        }
        .vsHistoryStrip {
            display: flex; flex-wrap: wrap; justify-content: center;
            gap: 4px;
        }
        .vsHistoryItem {
            position: relative;
            display: inline-flex; align-items: center; justify-content: center;
            width: 56px; height: 56px;
            border: 2px solid transparent; border-radius: 10px;
            cursor: pointer;
            transition: border-color 0.1s, background 0.1s;
        }
        .vsHistoryItem:hover { background: rgba(255,255,255,0.07); }
        .vsHistoryItem img { width: 48px; height: 48px; image-rendering: pixelated; }
        .vsHistoryItem.vsSelected {
            border-color: var(--blue-border, #3b82f6);
            background: rgba(255,255,255,0.1);
        }
        .vsSlotBadge {
            position: absolute; top: -4px; right: -4px;
            min-width: 16px; height: 16px; line-height: 16px;
            padding: 0 3px; border-radius: 8px;
            background: var(--blue-border, #3b82f6); color: #fff;
            font-size: 11px; font-weight: 700; text-align: center;
        }
        .vsHead {
            display: flex; align-items: flex-start; justify-content: center;
            gap: 4px; flex-wrap: wrap;
        }
        .vsMon {
            display: flex; flex-direction: column; align-items: center;
            gap: 4px; flex: 0 1 auto; min-width: 120px; padding: 0 4px;
        }
        .vsMonSprite { width: 80px; height: 80px; image-rendering: pixelated; }
        .vsMonName { font-size: 17px; }
        .vsMonLevel { display: flex; align-items: center; gap: 4px; font-size: 13px; }
        .vsMonLevelLabel { opacity: 0.7; margin-right: 1px; }
        .vsMonLevelInput {
            width: 42px; text-align: center; font-size: 13px; font-weight: 700;
            background: rgba(255,255,255,0.06); color: #f1f1f1;
            border: 1px solid rgba(255,255,255,0.2); border-radius: 6px; padding: 2px 2px;
            -moz-appearance: textfield; appearance: textfield;
        }
        .vsMonLevelInput::-webkit-inner-spin-button,
        .vsMonLevelInput::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        .vsLvlBtn {
            display: inline-flex; align-items: center; justify-content: center;
            width: 20px; height: 20px; border-radius: 5px; cursor: pointer;
            background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.18);
            font-weight: 700; line-height: 1; user-select: none;
            transition: background 0.1s;
        }
        .vsLvlBtn:hover { background: rgba(255,255,255,0.18); }
        .vsLvlBtn:active { background: rgba(255,255,255,0.28); }
        .vsMonTypes { display: flex; gap: 4px; justify-content: center; }
        .vsMonAbilities { text-align: center; font-size: 13px; opacity: 0.85; }
        .vsMonDex { text-align: center; font-size: 11px; opacity: 0.55; margin-top: 3px; }
        .vsMonCatch {
            text-align: center; font-size: 12px; opacity: 0.8;
            max-width: 170px; line-height: 1.3; margin-top: 2px;
            color: rgb(150,200,255);
        }
        .vsHeadVs { font-size: 34px; opacity: 0.5; letter-spacing: 1px; margin: 22px 22px 0; }
        .vsMonSpriteWrap { position: relative; display: inline-block; line-height: 0; }
        .vsResultArrow {
            position: absolute; top: -4px; z-index: 2;
            font-size: 26px; line-height: 1; font-weight: 700;
            pointer-events: none;
        }
        .vsResultArrow-left { left: -8px; }
        .vsResultArrow-right { right: -8px; }
        .vsResult-win { color: rgb(100,221,23); text-shadow: 0 0 8px rgba(100,221,23,0.45); }
        .vsResult-lose { color: rgb(239,83,80); text-shadow: 0 0 8px rgba(239,83,80,0.4); }
        .vsMatchup, .vsStatsBox, .vsCoverageBox {
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 10px;
            padding: 12px 14px;
            margin-top: 14px;
        }
        .vsCoverageNote {
            text-align: center; font-size: 12px; opacity: 0.55; margin-bottom: 10px;
        }
        .vsCoverageCols {
            display: flex; justify-content: center; align-items: flex-start;
            gap: 16px; flex-wrap: wrap;
        }
        .vsCovSlot { flex: 0 0 168px; width: 168px; display: flex; }
        .vsCoverageRow { margin: 8px 0; min-width: 130px; }
        .vsCoverageLabel { text-align: center; font-size: 13px; margin-bottom: 8px; }
        .vsCoverageList {
            display: flex; flex-direction: column; align-items: center; gap: 4px;
        }
        .vsCovChip {
            position: relative;
            display: inline-flex; align-items: center;
            gap: 5px; width: 88px; padding: 2px 6px; border-radius: 6px;
            background: rgba(255,255,255,0.05);
        }
        .vsCovChevron {
            position: absolute; top: 50%; transform: translateY(-50%);
            color: rgb(120,170,255); font-size: 10px; line-height: 1;
            pointer-events: none;
        }
        .vsCovChevronLeft { left: -13px; }
        .vsCovChevronRight { right: -13px; }
        .vsCovStab {
            background: rgba(255,205,60,0.1);
            box-shadow: inset 0 0 0 1px rgba(255,205,60,0.55);
        }
        .vsCovType {
            display: inline-flex; align-items: center; justify-content: center;
            min-width: 30px; padding: 1px 4px; border-radius: 4px;
            font-size: 10px; font-weight: 700; color: #fff;
            text-shadow: 0 1px 1px rgba(0,0,0,0.5);
        }
        .vsCovClickable { cursor: pointer; transition: background 0.1s, box-shadow 0.1s; }
        .vsCovClickable:hover { background: rgba(255,255,255,0.12); }
        .vsCovChipActive {
            background: rgba(120,170,255,0.18);
            box-shadow: inset 0 0 0 1px rgba(120,170,255,0.7);
        }
        .vsMoveList {
            position: relative;
            width: 100%;
            border: 1px solid rgba(255,255,255,0.12);
            border-radius: 8px; padding: 8px 10px;
            align-self: flex-start;
            background: rgba(255,255,255,0.03);
        }
        .vsMoveListOwner { display: none; }
        .vsMoveRow {
            display: flex; align-items: center;
            gap: 6px; padding: 2px 0; font-size: 13px;
        }
        .vsMoveName { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .vsMoveMeta { opacity: 0.55; font-size: 11px; white-space: nowrap; min-width: 20px; text-align: right; }
        .vsMovePct {
            font-weight: 700; font-size: 12px; white-space: nowrap;
            min-width: 50px; text-align: right; color: rgb(120,170,255);
        }
        .vsMoveKO { color: rgb(239,120,118); }
        .vsMoveUnavailable { opacity: 0.42; }
        .vsMoveReq { font-size: 10px; color: rgb(235,185,90); font-weight: 700; }
        .vsMoveLearn {
            display: none; font-size: 11px; color: rgb(225,180,95); font-weight: 700;
            min-width: 40px; text-align: right; white-space: nowrap;
        }
        .vsCovToggles {
            display: flex; flex-wrap: wrap; align-items: center; justify-content: center;
            gap: 6px 18px; margin-bottom: 10px;
        }
        .vsCovToggle {
            display: inline-flex; align-items: center; gap: 6px;
            font-size: 12px; opacity: 0.85; cursor: pointer; user-select: none;
        }
        .vsCovToggle input { width: auto; margin: 0; cursor: pointer; }
        .vsMoveListFoot {
            margin-top: 7px; padding-top: 6px;
            border-top: 1px solid rgba(255,255,255,0.08);
            font-size: 10px; opacity: 0.5; line-height: 1.3;
        }
        .vsCovRight { display: inline-flex; align-items: center; gap: 3px; margin-left: auto; }
        .vsCovMult { font-size: 13px; font-weight: 700; min-width: 20px; text-align: right; }
        .vsCovStar { display: inline-flex; align-items: center; line-height: 1; color: rgb(255,205,60); font-size: 11px; }
        .vsCovGood { color: rgb(120,230,60); }
        .vsCovBad { color: rgb(239,120,118); }
        .vsCov0 { color: rgb(239,83,80); opacity: 0.7; }
        .vsCovNeutral { color: #9a9a9a; }
        .vsMatchupHeading {
            text-align: center; font-size: 13px;
            text-transform: uppercase; letter-spacing: 1px;
            opacity: 0.7; margin-bottom: 10px;
        }
        .vsMatchupLine {
            display: flex; align-items: center; justify-content: center;
            gap: 10px; margin: 6px 0;
        }
        .vsMatchupText { min-width: 200px; text-align: right; font-weight: 700; }
        .vsMultBadge {
            min-width: 38px; color: #fff; font-weight: 700;
            text-shadow: 0 1px 1px rgba(0,0,0,0.5);
        }
        .vsMatchupWord { min-width: 60px; text-align: left; opacity: 0.85; }
        .vsMult0 { background: rgba(0,0,0,0.7); }
        .vsMultResist { background: rgba(239,83,80,0.85); }
        .vsMultSuper { background: rgba(100,221,23,0.8); }
        .vsMultNeutral { background: rgba(127,127,127,0.45); }
        .vsVerdict {
            text-align: center; font-size: 16px; margin-top: 12px;
            padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.1);
        }
        .vsVerdictWin { color: rgb(100,221,23); }
        .vsVerdictEven { opacity: 0.7; }
        .vsStatsWrap {
            display: flex; justify-content: center; align-items: flex-start;
            gap: 26px; flex-wrap: wrap;
        }
        .vsStatBlockTitle {
            text-align: center; font-size: 12px; opacity: 0.7;
            text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;
        }
        .vsStats {
            display: grid; grid-template-columns: 1fr auto 1fr;
            gap: 2px 14px; align-items: center; width: 188px; margin: 0 auto;
        }
        .vsStatA { text-align: right; }
        .vsStatB { text-align: left; }
        .vsStatLabel { text-align: center; opacity: 0.7; font-size: 13px; }
        .vsHigher { color: rgb(100,221,23); font-weight: 700; }
        .vsLower { opacity: 0.55; }
        .vsStatBST {
            margin-top: 4px; padding-top: 4px;
            border-top: 1px solid rgba(255,255,255,0.1); font-weight: 700;
        }
        .vsButtons { display: flex; justify-content: center; gap: 12px; margin-top: 16px; }
        .vsClearButton { margin: 0; }

        /* ---- mobile ---- */
        @media (max-width: 600px) {
            /* Full-bleed: drop the side padding and pull out by the body's 8px
               margin so the boxes sit flush against the screen edges. */
            #vsContent { padding: 10px 0; margin: 10px -8px; max-width: none; }
            .vsTableCell { padding: 6px 0; }
            .vsMatchup, .vsStatsBox, .vsCoverageBox { padding: 12px 8px; }
            .vsHead { gap: 2px; }
            .vsMon { min-width: 104px; }
            .vsHeadVs { margin: 22px 8px 0; font-size: 26px; }
            .vsMonSprite { width: 66px; height: 66px; }
            /* Coverage: columns side by side, open move list full-width below;
               drop the reserved side slots (and hide empty ones) so nothing wraps
               awkwardly. */
            .vsCoverageCols { gap: 10px 14px; }
            .vsCoverageRow { order: 1; }
            .vsCovSlot { order: 2; flex: 1 0 100%; width: auto; justify-content: center; }
            .vsCovSlot:empty { display: none; }
            .vsMoveList { width: 100%; max-width: 320px; padding-left: 44px; }
            .vsMoveLearn { display: inline-block; }
            .vsMoveReq { display: none; }
            .vsMoveList .vsMoveName { flex: 1; }
            .vsMoveListOwner {
                display: block; position: absolute; left: 7px; top: 6px;
                width: 30px; height: 30px; image-rendering: pixelated;
            }
            .vsCovChevron { display: none; }
            /* Stats: stack BASE over CURRENT */
            .vsStatsWrap { gap: 14px; }
        }
    `
    document.head.append(style)
}
