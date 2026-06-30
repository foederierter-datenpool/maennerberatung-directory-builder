import { firefox } from "playwright"
import path from "path"
import fs from "fs"

// echte-maenner-reden.de "Vor Ort" directory (/OnSite). The site is a Blazor
// Server app: the counselor list and each person's detail modal are rendered
// server-side and streamed over a SignalR websocket — there is no static HTML,
// REST API, or data file to GET. So this fetcher drives a real (headless) browser:
// it loads /OnSite, clicks "Mehr Anzeigen" until every card is loaded, opens each
// counselor's modal, and reads the cleanly-classed fields (.Contact.Institution =
// Träger, .Contact.Adress, .Contact.Phone, .Contact.Mail, .Contact.Website,
// .IntroductionText, .Qualification-Warpper). It writes one clean JSON record per
// counselor — address already split — so the lift/clean steps stay trivial.
//
// Browser: Playwright's own Firefox (npx playwright install firefox), so the
// machine needs no system browser. This is the one source that needs a browser;
// it stays isolated to this fetch.js.

const OUT_DIR = process.argv[2]
const URL = process.argv[3]

const slug = (s) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")

// "Ernst-Reuter-Platz 2, Monheim am Rhein 40789" → street / locality / postalCode.
// Street is everything before the comma; the trailing 5-digit group is the PLZ;
// the locality is what's left between them (fallback: the modal's city headline).
const splitAddress = (addr, city) => {
    if (!addr) return { street: null, postalCode: null, locality: city || null }
    const [streetRaw, ...rest] = addr.split(",")
    const tail = rest.join(",").trim()
    const plz = (tail.match(/\b(\d{5})\b/) || [])[1] || null
    const locality = (plz ? tail.replace(plz, "") : tail).replace(/\s+/g, " ").trim() || city || null
    return { street: streetRaw.trim() || null, postalCode: plz, locality }
}

const browser = await firefox.launch({ headless: true })
try {
    const page = await browser.newPage()
    await page.goto(URL, { waitUntil: "networkidle", timeout: 60000 })
    await page.waitForTimeout(5000)

    // Load everyone: click "Mehr Anzeigen" until it's gone or the count stops growing.
    let prev = 0
    for (let i = 0; i < 40; i++) {
        const more = page.getByRole("button", { name: /Mehr Anzeigen/i })
        if (!(await more.count()) || !(await more.first().isVisible())) break
        await more.first().click()
        await page.waitForTimeout(1500)
        const now = await page.locator(".ConsultantInfoWrapper").count()
        if (now === prev) break
        prev = now
    }

    const total = await page.locator(".ConsultantInfoWrapper").count()
    const records = []
    for (let i = 0; i < total; i++) {
        const card = page.locator(".ConsultantInfoWrapper").nth(i)
        const person = (await card.locator(".Name .subline").innerText()).trim()
        await card.click()
        await page.waitForSelector(".Details", { timeout: 10000 })
        await page.waitForTimeout(300)
        const d = await page.evaluate(() => {
            const root = document.querySelector(".Details")
            const t = (sel) => { const e = root.querySelector(sel); return e ? e.innerText.trim() : null }
            const href = (sel) => { const e = root.querySelector(sel); return e ? (e.getAttribute("href") || "").trim() : null }
            return {
                city: [...root.querySelectorAll("h1 b")][1]?.innerText?.trim() || null,
                description: t(".IntroductionText"),
                qualifications: [...root.querySelectorAll(".Qualification-Warpper p")].map(e => e.innerText.trim()),
                org: t(".Contact.Institution p"),
                address: t(".Contact.Adress p"),
                phone: t(".Contact.Phone p"),
                email: (href(".Contact.Mail a") || "").replace(/^mailto:/, "") || t(".Contact.Mail p"),
                website: href(".Contact.Website a") || t(".Contact.Website p"),
            }
        })
        const { street, postalCode, locality } = splitAddress(d.address, d.city)
        records.push({
            id: slug(`${person}-${d.org || ""}`), person,
            org: d.org, city: d.city, street, postalCode, locality,
            phone: d.phone, email: d.email, website: d.website ? d.website.trim() : null,
            qualifications: d.qualifications, description: d.description,
        })
        await page.locator(".Details .closeIcon").click()
        await page.waitForTimeout(250)
    }

    // Smoke check: a layout change or a failed Blazor connect must fail loudly,
    // never silently produce an empty source.
    if (records.length < 10) throw new Error(`only ${records.length} counselors scraped from ${URL} — layout changed or Blazor failed to load?`)

    fs.mkdirSync(OUT_DIR, { recursive: true })
    const outPath = path.join(OUT_DIR, "counselors.json")
    fs.writeFileSync(outPath, JSON.stringify(records, null, 2))
    console.log(`  ${records.length} counselors → ${outPath}`)
} finally {
    await browser.close()
}
