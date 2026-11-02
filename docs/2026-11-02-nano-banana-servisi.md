# Nano Banana: gdje se još može koristiti (2. 11. 2026.)

Runner generira slike preko Vertex AI (`gemini-nano-banana-2.1`, vidi `katalog.md`). Usko grlo je
kvota zahtjeva po minuti na novom projektu (429 otprilike svaki drugi do treći poziv, ~1,2 slike/min),
a ne cijena. Ovo je pregled alternativa. Cijene za Gemini API su sa službene stranice, ostale s
stranica servisa ili agregatora; prije odluke provjeriti uživo.

## Modeli

| Model | Ime | Napomena |
|---|---|---|
| `gemini-nano-banana-2.1` | Nano Banana 2.1 | GA 6. 10. 2026., do 14 referentnih slika, 1K/2K/4K. **Runner ga koristi.** |
| `gemini-3.1-flash-image` | Nano Banana 2 | U Gemini API-ju gašen 29. 10. 2026.; na Vertexu još radi. Uz `LOW` troši ~2.100 tokena razmišljanja po slici (2.1 troši 0). |
| `gemini-3.1-flash-lite-image` | Nano Banana 2 Lite | Na projektu dostupan, nije testiran. |
| `gemini-3-pro-image` | Nano Banana Pro | Skuplji (~$0,134/slika). |

`gemini-3.8-…-image` ne postoji; 3.8 su samo tekstni modeli.

## Servisi koji nude 2.1

| Servis | Model id | Cijena 1K slike | Ref. slike | Napomena |
|---|---|---|---|---|
| Vertex AI (sad) | `gemini-nano-banana-2.1` | ~$0,04 izmjereno (3.540 ulaz + 1.120 izlaz tokena, uz Gemini API cjenik) | do 14 | Kvota po minuti po projektu. |
| Gemini API, standard | `gemini-nano-banana-2.1` | $0,0336 (ulaz $1,50/M, izlaz slike $30/M) | do 14 | Bez free tiera. Tier 1 ima prag $10 potrošnje u 10 min. |
| **Gemini API, Batch** | isto | **$0,0168** (−50 %) | do 14 | Asinkrono (sati), bez limita po minuti. Najbolje za skupno generiranje kataloga. |
| fal.ai | `google/nano-banana-2.1/edit` | ~$0,040 | do 14 | Jedan ključ, queue, bez Google tierova; ~20 % iznad Googlea. |
| OpenRouter | `google/gemini-nano-banana-2.1` | nepotvrđeno | do 14 (`input_references`) | |
| Replicate | `google/nano-banana-2.1` | nije nađeno | 14 | |
| Vercel AI Gateway | `google/gemini-nano-banana-2.1` | $1,50 / $7,50 po M (agregator, nepotvrđeno) | nepoznato | OpenAI-kompatibilan endpoint. |

Nije nađeno: ElevenLabs (njihova Nano Banana ponuda nije potvrđena kao API), Together, Fireworks,
DeepInfra, Leonardo, Krea, Freepik, Adobe, Poe, Eden AI. Cloudflare AI Gateway samo prosljeđuje na
Googleov ključ i ne diže kvotu; Workers AI nema Nano Banana.

## Besplatni krediti

| Gdje | Što | Pouzdanost |
|---|---|---|
| Google Cloud free trial | $300 za nove korisnike, ~90 dana | Službeno. **Pokriva li Gemini na Vertexu nije potvrđeno**: popis izuzetaka navodi Gemini API u AI Studiju i partnerske modele, a Gemini na Vertexu ne spominje. Gemini API (AI Studio) trial **ne pokriva**. |
| Gemini API | Nema free tiera za 2.1 | Službeni cjenik. |
| Vercel AI Gateway | $5 svakih 30 dana, za cijeli katalog modela | Službeno. Prestaje kad se kupe krediti. ~125 slika mjesečno ako se 2.1 tamo naplaćuje kao kod Googlea. |
| fal.ai | ~$20 pri registraciji (poslovni e-mail) | Samo treća strana, nepotvrđeno. |
| OpenRouter | promo kodovi; besplatni modeli samo tekstni | Image modeli troše saldo. |
| Replicate | free tier postoji, iznos nije nađen | Nepotvrđeno. |

Stanje kod nas: projekt je na billing accountu kojem gcloud račun runnera nema pristup (ne može
pročitati je li free trial). Stari `bimbo-sync-prod` free trial ($123 do 14. 12. 2026.) je blokiran
zbog Vertexa. Što se troši vidi se u konzoli: Billing → Reports (kasni nekoliko sati).

## Preporuka

1. Tekući red pustiti na Vertexu (~$0,04/slika, cijeli red ~$4–5).
2. Za veliki skup (632 stare riječi) dodati **batch** put: pola cijene, bez 429.
3. Ako zatreba brzina odmah: fal.ai kao drugi backend u `vertex-slika.py` (isti prompt i reference).
4. Alternativno zatražiti veću kvotu za `gemini-nano-banana-2.1` (IAM & Admin → Quotas).

## Izvori

- https://ai.google.dev/gemini-api/docs/pricing
- https://ai.google.dev/gemini-api/docs/rate-limits
- https://ai.google.dev/gemini-api/docs/models/gemini-nano-banana-2.1
- https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/nano-banana-2-1
- https://cloud.google.com/free-trial/
- https://blog.laozhang.ai/en/posts/gemini-3-pro-image-free-tier.md (treća strana, trial i Gemini)
- https://fal.ai/learn/tools/nano-banana-api
- https://freeapihub.com/ai-tools/fal-ai (treća strana, fal krediti)
- https://openrouter.ai/google/gemini-nano-banana-2.1
- https://openrouter.ai/redeem
- https://replicate.com/google/nano-banana-2.1
- https://vercel.com/ai-gateway/models/gemini-nano-banana-2.1
- https://vercel.com/docs/ai-gateway/pricing
- https://developers.cloudflare.com/ai-gateway/usage/providers/google-ai-studio/
