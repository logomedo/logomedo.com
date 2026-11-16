#!/usr/bin/env bash
# e2e pozivnice (docs/rbac, S2), samo lokalno. Pretpostavlja `npm run dev` na $BASE (astro dev, rpID localhost).
# Tijek: superadmin (sesija upisana u lokalni D1) izda pozivnicu → browser s virtualnim WebAuthn
# autentifikatorom (CDP, playwright-cli) otvori link → passkey → /admin → odjava → prijava passkeyem →
# (S3) logoped: administracija 403, tuđi zadatak 404, vlastiti se sprema →
# superadmin deaktivira → sljedeći zahtjev logopeda ide na prijavu, a njegovih sesija više nema.
# Superadmin je prvi e-mail iz ADMIN_EMAILS u .dev.vars (ne ispisuje se). Logoped je e2e-<vrijeme>@primjer.hr.
set -euo pipefail
cd "$(dirname "$0")/.."

BASE=${BASE:-http://localhost:4321}
PW=(npx --yes @playwright/cli@0.1.21 -s=e2e-poziv)
KOLACIC=__Host-logomedo_admin
LOGOPED="e2e-$(date +%s)@primjer.hr"
TMP=$(mktemp -d); trap 'rm -rf "$TMP"; "${PW[@]}" close >/dev/null 2>&1 || true' EXIT

d1() { npx wrangler d1 execute logomedo --local --json --command "$1" 2>/dev/null; }
pao() { echo "PAO: $*" >&2; exit 1; }
ok() { echo "ok: $*"; }

ADMIN=$(sed -n 's/^ADMIN_EMAILS=//p' .dev.vars | tr -d '"' | cut -d, -f1 | tr -d ' ' | tr 'A-Z' 'a-z')
[ -n "$ADMIN" ] || pao "ADMIN_EMAILS nije u .dev.vars"
curl -s -o /dev/null "$BASE/admin/login" || pao "dev server ne radi na $BASE (npm run dev)"

npx wrangler d1 migrations apply logomedo --local >/dev/null 2>&1 || pao "lokalne migracije"

# 1. Superadmin sesija u lokalnom D1 (docs/admin.md „Lokalno”).
T=$(openssl rand -hex 24); H=$(printf %s "$T" | shasum -a 256 | cut -d' ' -f1)
d1 "INSERT INTO admin_sessions (token_hash,email,method,created_at,expires_at,last_seen_at) VALUES ('$H','$ADMIN','access',strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now','+12 hours'),strftime('%Y-%m-%dT%H:%M:%fZ','now'))" >/dev/null
SA=(-s -H "Origin: $BASE" -b "$KOLACIC=$T")

# 2. Pozivnica.
curl "${SA[@]}" -o "$TMP/izdaj.html" --data-urlencode akcija=poziv --data-urlencode ime="E2E Logoped" --data-urlencode email="$LOGOPED" "$BASE/admin/korisnici"
LINK=$(grep -o 'id="poziv-link"[^>]*' "$TMP/izdaj.html" | grep -o 'value="[^"]*"' | sed 's/value="//;s/"$//' | sed 's/&#35;/#/')
case "$LINK" in */admin/poziv\#*) ok "pozivnica izdana";; *) pao "nema linka pozivnice u odgovoru";; esac
LINK="$BASE/admin/poziv#${LINK#*#}"

# 3. Logoped u browseru: pozivnica → passkey → /admin → odjava → prijava passkeyem.
cat > "$TMP/logoped.js" <<EOF
async page => {
  const ctx = page.context();
  await ctx.clearCookies();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal',
    hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
  const korak = [];
  await page.goto('$BASE/admin/login');
  await page.goto('$LINK');
  await page.waitForSelector('#poziv[data-stanje="spremno"]', { timeout: 15000 });
  korak.push('ime:' + (await page.textContent('#poziv-ime')).trim());
  await page.click('#poziv-passkey');
  const put = () => page.url().replace(/^https?:\/\/[^/]+/, '').split(/[?#]/)[0];
  await page.waitForURL(/\/admin\/?(\?|#|$)/, { timeout: 15000 });
  korak.push('poziv->/admin');
  await page.evaluate(() => fetch('/admin/logout', { method: 'POST' }));
  await page.goto('$BASE/admin');
  if (!put().startsWith('/admin/login')) throw new Error('nakon odjave nije na prijavi: ' + page.url());
  korak.push('odjava');
  await page.click('#passkey-login');
  await page.waitForFunction(() => !location.pathname.startsWith('/admin/login'), null, { timeout: 15000 });
  korak.push('prijava passkeyem->' + put());
  const c = (await ctx.cookies()).find(k => k.name === '$KOLACIC');
  return { korak, kolacic: c ? c.value : null };
}
EOF
"${PW[@]}" open about:blank >/dev/null 2>&1
"${PW[@]}" run-code --filename="$TMP/logoped.js" > "$TMP/logoped.out" 2>&1 || true
REZ=$(sed -n '/^### Result/{n;p;}' "$TMP/logoped.out")
[ -n "$REZ" ] || { sed -n '1,30p' "$TMP/logoped.out" >&2; pao "browser dio"; }
echo "$REZ" | grep -q '"kolacic":"' || { echo "$REZ" >&2; pao "logoped nema sesiju"; }
ok "$(echo "$REZ" | sed 's/,"kolacic":"[^"]*"//')"
LT=$(echo "$REZ" | sed 's/.*"kolacic":"\([^"]*\)".*/\1/')

# Sesija iz pozivnice (method='poziv') obrisana je odjavom; ostaje zapis u aktivnosti i passkey sesija.
N=$(d1 "SELECT COUNT(*) AS n FROM aktivnost WHERE radnja='poziv.iskoristen' AND tko='$LOGOPED'" | grep -o '"n": *[0-9]*' | grep -o '[0-9]*$')
[ "$N" = 1 ] || pao "zapis poziv.iskoristen: $N"
M=$(d1 "SELECT group_concat(method) AS m FROM admin_sessions WHERE email='$LOGOPED'" | grep -o '"m": *"[^"]*"' || true)
echo "$M" | grep -q passkey || pao "sesije logopeda: $M"
ok "poziv.iskoristen u aktivnosti, sesija $M"

STATUS=$(curl -s -o /dev/null -w '%{http_code}' -b "$KOLACIC=$LT" "$BASE/admin/passkeys")
[ "$STATUS" = 200 ] || pao "logoped /admin/passkeys: $STATUS"
ok "logoped vidi /admin/passkeys"

# 3b. Ovlasti logopeda (S3): administracija 403, tuđi zadatak 404, vlastiti se sprema.
LO=(-s -H "Origin: $BASE" -b "$KOLACIC=$LT")
kod() { curl -s -o "$TMP/odg" -w '%{http_code}' "$@"; }
for P in /admin/prompt /admin/red /admin/korisnici /admin/zvukovi/glasovi /admin/app/prijava '/admin%2Fprompt' /ADMIN/Prompt ; do
  S=$(kod -b "$KOLACIC=$LT" "$BASE$P")
  [ "$S" = 403 ] && grep -q "Natrag na katalog" "$TMP/odg" || pao "logoped GET $P: $S"  # stranica kroz rewrite, ne zamjenski HTML
done
S=$(kod -b "$KOLACIC=$LT" "$BASE//admin//red"); [ "$S" = 200 ] && pao "logoped //admin//red: 200"  # astro dev daje 404
ok "logoped: administracija 403 (stranica „Nemaš pristup”)"
for P in /admin/api/zvuk-proba /admin/api/app-kod /admin/korisnici; do
  S=$(kod "${LO[@]}" -H 'content-type: application/json' --data '{}' "$BASE$P")
  [ "$S" = 403 ] && grep -q forbidden "$TMP/odg" || pao "logoped POST $P: $S"
done
ok "logoped: POST na administraciju 403 JSON"
S=$(kod -b "$KOLACIC=$LT" "$BASE/admin/zvukovi"); [ "$S" = 200 ] || pao "logoped /admin/zvukovi: $S"
S=$(kod -b "$KOLACIC=$T" "$BASE/admin/prompt"); [ "$S" = 200 ] || pao "superadmin /admin/prompt: $S"
ok "logoped /admin/zvukovi 200, superadmin /admin/prompt 200"

novi_zadatak() {  # $1 = kolačić; ispisuje id iz 303 Location
  curl -s -o /dev/null -w '%{redirect_url}' -H "Origin: $BASE" -b "$KOLACIC=$1" --data-urlencode vrsta=odabir "$BASE/admin/api/zadatak" | sed -n 's#.*/admin/zadaci/\([0-9]*\).*#\1#p'
}
TUDJI=$(novi_zadatak "$T"); [ -n "$TUDJI" ] || pao "superadmin nije napravio zadatak"
MOJ=$(novi_zadatak "$LT"); [ -n "$MOJ" ] || pao "logoped nije napravio zadatak"
for P in "/admin/zadaci/$TUDJI" "/admin/zadaci/$TUDJI/dijete"; do
  S=$(kod -b "$KOLACIC=$LT" "$BASE$P"); [ "$S" = 404 ] || pao "logoped GET $P: $S"
done
TIJELO='{"naslov":"E2E svoj","uputa":"","podrucje_id":null,"stil":"","sadrzaj":{}}'
S=$(kod "${LO[@]}" -H 'content-type: application/json' --data "$TIJELO" "$BASE/admin/api/zadatak/$TUDJI"); [ "$S" = 404 ] || pao "logoped sprema tuđi: $S"
S=$(kod "${LO[@]}" --data-urlencode akcija=obrisi "$BASE/admin/api/zadatak/$TUDJI"); [ "$S" = 404 ] || pao "logoped briše tuđi: $S"
S=$(kod -b "$KOLACIC=$LT" "$BASE/admin/zadaci"); grep -q "/admin/zadaci/$TUDJI\"" "$TMP/odg" && pao "tuđi zadatak na logopedovom popisu"
ok "tuđi zadatak $TUDJI: 404 (otvaranje, dijete, spremanje, brisanje), nije na popisu"
S=$(kod "${LO[@]}" -H 'content-type: application/json' --data "$TIJELO" "$BASE/admin/api/zadatak/$MOJ"); [ "$S" = 200 ] || pao "logoped sprema svoj: $S"
N=$(d1 "SELECT COUNT(*) AS n FROM zadaci WHERE id=$MOJ AND naslov='E2E svoj'" | grep -o '"n": *[0-9]*' | grep -o '[0-9]*$')
[ "$N" = 1 ] || pao "vlastiti zadatak nije spremljen"
S=$(kod -b "$KOLACIC=$T" "$BASE/admin/zadaci/$MOJ"); [ "$S" = 200 ] || pao "superadmin ne vidi logopedov zadatak: $S"
ok "vlastiti zadatak $MOJ spremljen (200), superadmin ga vidi"
d1 "UPDATE zadaci SET obrisan_at=datetime('now') WHERE id IN ($TUDJI,$MOJ)" >/dev/null

# 4. Superadmin deaktivira; logopedov sljedeći zahtjev ide na prijavu.
ID=$(d1 "SELECT id FROM korisnici WHERE email='$LOGOPED' AND uloga='logoped' AND aktivan=1" | grep -o '"id": *[0-9]*' | grep -o '[0-9]*$')
[ -n "$ID" ] || pao "nema aktivnog retka logopeda"
STATUS=$(curl "${SA[@]}" -o /dev/null -w '%{http_code}' --data-urlencode akcija=deaktiviraj --data-urlencode id="$ID" "$BASE/admin/korisnici")
[ "$STATUS" = 303 ] || pao "deaktivacija: $STATUS"
ok "deaktiviran (id $ID)"

ODG=$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' -b "$KOLACIC=$LT" "$BASE/admin")
case "$ODG" in 302*/admin/login*|401*) ok "logoped nakon deaktivacije: $ODG";; *) pao "logoped nakon deaktivacije: $ODG";; esac
N=$(d1 "SELECT COUNT(*) AS n FROM admin_sessions WHERE email='$LOGOPED'" | grep -o '"n": *[0-9]*' | grep -o '[0-9]*$')
[ "$N" = 0 ] || pao "logoped još ima $N sesija"
ok "sesije logopeda obrisane"

d1 "DELETE FROM admin_sessions WHERE token_hash='$H'" >/dev/null
echo "e2e-poziv: PROŠLO"
