window.repoDex = "ydarissep/Unbound-Pokedex"
window.repo1 = "Skeli789/Complete-Fire-Red-Upgrade/master"
window.repo2 = "Skeli789/Dynamic-Pokemon-Expansion/Unbound"
window.checkUpdate = "22 Unbound"


fetch('https://raw.githubusercontent.com/ydarissep/dex-core/main/index.html').then(async response => {
	return response.text()
}).then(async rawHTMLText => {
	const parser = new DOMParser()
	const doc = parser.parseFromString(rawHTMLText, 'text/html')

    // Replace only the <body>, not the whole <html>. Our <head> — and with it
    // the PWA manifest/meta/apple-touch tags from index.html — must stay present
    // from the very first page load, otherwise mobile browsers won't offer a
    // real "Install" (they only create a plain home-screen shortcut). dex-core's
    // own <head> just holds defer scripts (which never execute when assigned via
    // innerHTML) and stylesheets we already load locally, so nothing is lost.
    for (const attr of doc.body.getAttributeNames()) {
        document.body.setAttribute(attr, doc.body.getAttribute(attr))
    }
    document.body.innerHTML = doc.body.innerHTML

    document.title = "Unbound Dex"
    document.getElementById("footerName").innerText = "Unbound\nYdarissep Pokedex"

    // Belt-and-suspenders: make sure the PWA tags are present (no-op if the
    // <head> from index.html is intact, which it now is).
    injectPWATags()



    await fetch("https://raw.githubusercontent.com/ydarissep/dex-core/main/src/global.js").then(async response => {
        return response.text()
    }).then(async text => {
        text = text.replace("Credit to ris", "Credit to DMan16 for:\n- Randomized Abilities\n- Randomized Learnset\n- Rebalanced Stats\n\nCredit to Aussi for:\n- Randomized Species\n\nCredit to ris")
        await eval.call(window,text)
    }).catch(error => {
        console.warn(error)
    })

    // Local addition: build the "Type Chart" tab once the core UI is in place.
    try {
        await buildTypeChartTab()
    } catch (error) {
        console.warn(error)
    }

    // Local addition: build the "vs" comparison tab.
    try {
        buildVsTab()
    } catch (error) {
        console.warn(error)
    }

    // Local addition: add "good vs" / "sucks vs" columns to the species panel.
    try {
        installSpeciesMatchupColumns()
    } catch (error) {
        console.warn(error)
    }

    // Local addition: "Download for offline" button (PWA warm-up).
    try {
        installOfflineButton()
    } catch (error) {
        console.warn(error)
    }

}).catch(error => {
	console.warn(error)
})


// Add (or re-add) the PWA <head> tags. Idempotent: skips anything already present.
function injectPWATags() {
    const head = document.head
    const ensure = (selector, create) => {
        if (!head.querySelector(selector)) head.append(create())
    }
    const meta = (name, content) => () => {
        const m = document.createElement("meta")
        m.setAttribute("name", name)
        m.setAttribute("content", content)
        return m
    }
    const link = (rel, href, extra) => () => {
        const l = document.createElement("link")
        l.setAttribute("rel", rel)
        l.setAttribute("href", href)
        if (extra) for (const k in extra) l.setAttribute(k, extra[k])
        return l
    }

    ensure('link[rel="manifest"]', link("manifest", "manifest.webmanifest"))
    ensure('meta[name="theme-color"]', meta("theme-color", "#ee1c25"))
    ensure('meta[name="mobile-web-app-capable"]', meta("mobile-web-app-capable", "yes"))
    ensure('meta[name="apple-mobile-web-app-capable"]', meta("apple-mobile-web-app-capable", "yes"))
    ensure('meta[name="apple-mobile-web-app-status-bar-style"]', meta("apple-mobile-web-app-status-bar-style", "black-translucent"))
    ensure('meta[name="apple-mobile-web-app-title"]', meta("apple-mobile-web-app-title", "Yda Dex"))
    ensure('link[rel="apple-touch-icon"]', link("apple-touch-icon", "icons/apple-touch-icon.png"))
}


