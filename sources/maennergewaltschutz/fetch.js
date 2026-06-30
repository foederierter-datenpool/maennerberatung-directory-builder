import path from "path"
import fs from "fs"

// maennergewaltschutz.de — single-GET retrieval of the public listing page.
//
// Everything we need is on this one page, so there is no API call and no
// pagination:
//   • every facility is rendered as schema.org microdata — name, Träger (via
//     itemprop="parentOrganization"), streetAddress, postalCode,
//     addressLocality, telephone, email, url — i.e. the full contact record.
//   • each entry's container also carries its WordPress post id, both as
//     id="mse-<slug>-<id>" (which is the itemscope element holding the
//     microdata) and as data-marker="marker-<id>". That is the stable
//     provenance id the wp/v2 REST API would otherwise give us — and it matches
//     the API ids 1:1 — so the API is redundant here.
//
// fetch's only job is to retrieve: we save the page verbatim and leave all
// extraction (microdata fields + post id → triples) to the lift step, where the
// project does its HTML parsing. Not PLZ-partitioned, so the plz run param is
// ignored.

const OUT_DIR = process.argv[2]
const LISTING_URL = process.argv[3]

const res = await fetch(LISTING_URL)
if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${LISTING_URL}`)
const html = await res.text()

// Smoke check: each facility renders one .item-content block — confirms we got
// the real listing, not an error/consent page, before the lift step runs.
const entries = (html.match(/class="item-content"/g) || []).length
if (!entries) throw new Error(`no entries found in ${LISTING_URL} — page layout changed?`)

fs.mkdirSync(OUT_DIR, { recursive: true })
const outPath = path.join(OUT_DIR, "beratungsstellen.html")
fs.writeFileSync(outPath, html)
console.log(`  ${(html.length / 1024).toFixed(0)} KB, ${entries} entries → ${outPath}`)
