# WhatsApp Bridge Server — deploy pe Fly.io

## Pași de deploy

1. Instalează Fly CLI:
   ```bash
   curl -L https://fly.io/install.sh | sh
   ```

2. Login / cont nou (nu cere card la crearea contului, doar la scalare peste free tier):
   ```bash
   fly auth signup   # sau fly auth login dacă ai deja cont
   ```

3. Din folderul `whatsapp-server/`, inițializează aplicația (va folosi `fly.toml` deja creat):
   ```bash
   fly launch --no-deploy
   ```
   - Când te întreabă de nume, alege unul unic (ex: `nt2-whatsapp-bridge`) și actualizează `app = "..."` în `fly.toml`.
   - Când te întreabă de volum/postgres/redis: **refuză toate** — volumul îl creăm manual la pasul următor.

4. Creează volumul persistent pentru sesiunea WhatsApp (esențial, altfel pierzi conexiunea la fiecare restart):
   ```bash
   fly volumes create waha_data --size 1 --region otp
   ```

5. Setează cheia API secretă (nu o lăsa pe cea din fly.toml în producție):
   ```bash
   fly secrets set BRIDGE_API_KEY=cheia-ta-secreta-lunga-si-random
   ```

6. Deploy:
   ```bash
   fly deploy
   ```

7. Verifică status:
   ```bash
   curl https://your-whatsapp-bridge.fly.dev/health
   ```

## Conectare WhatsApp (o singură dată)

1. Ia imaginea QR (deschide direct în browser sau descarcă):
   ```
   https://your-whatsapp-bridge.fly.dev/qr?apikey=cheia-ta-secreta-lunga-si-random
   ```
2. Scanează cu WhatsApp de pe telefon (Setări → Dispozitive conectate → Conectează un dispozitiv).
3. Verifică status conexiune:
   ```bash
   curl -H "x-api-key: cheia-ta-secreta-lunga-si-random" https://your-whatsapp-bridge.fly.dev/status
   ```
   Ar trebui să vezi `"status": "WORKING"`.

## Endpoint-uri disponibile (folosite de extensia Nmod)

- `GET  /health` — verificare simplă, fără auth
- `GET  /status` — status conexiune WhatsApp (necesită `x-api-key`)
- `GET  /qr` — imagine QR pentru autentificare (necesită `x-api-key`)
- `POST /send-text` — body: `{ "phone": "40712345678", "message": "text" }`
- `POST /send-file-url` — body: `{ "phone": "...", "fileUrl": "https://...", "filename": "poza.jpg", "caption": "..." }`
- `POST /send-file-upload` — multipart form-data cu câmpurile `phone`, `file`, `caption`

## Notă despre costuri Fly.io

Configurația de mai sus (1 shared CPU, 1GB RAM, 1GB volum) se încadrează în tier-ul gratuit Fly.io.
`auto_stop_machines = false` ține mașina mereu pornită (necesar ca să nu pierzi sesiunea WhatsApp) —
verifică din când în când în dashboard-ul Fly.io că rămâi sub free allowance dacă adaugi alte proiecte.
