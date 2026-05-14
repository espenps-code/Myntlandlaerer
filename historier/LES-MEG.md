# 📁 historier/ — Myntland-historier

Denne mappa inneholder alle interaktive historier til Myntland.

## Struktur

Hver historie har sin egen mappe for bilder og lyd, slik at filnavn ikke krasjer:

```
historier/
├── bolge-sykkel.html              ← Selve historien
├── bolge-sykkel/
│   ├── bilder/                    ← 12 PNG-er (01_start.png – 12_diskusjon.png)
│   └── lyd/                       ← 11 mp3-er (start.mp3, pris.mp3, ...)
├── stjerne-tur.html
└── stjerne-tur/
    ├── bilder/                    ← 11 PNG-er
    └── lyd/                       ← 10 mp3-er
```

## Slik fyller du på etter opplasting

### Bølge-historien
- **12 bilder** → `historier/bolge-sykkel/bilder/`
- **11 lyder** → `historier/bolge-sykkel/lyd/`

(Dette er de eksisterende filene fra forrige versjon — de skal bare flyttes inn i den nye undermappa.)

### Stjerne-historien
- **11 bilder** → `historier/stjerne-tur/bilder/` — last ned med `last_ned_bilder.html` fra Stjerne-pakka
- **10 lyder** → `historier/stjerne-tur/lyd/` — generer med ElevenLabs fra `innleseskript.md` eller `elevenlabs_klipp_og_lim.txt`

## Sjekkliste

- [ ] `bolge-sykkel.html` lastet opp
- [ ] 12 bilder i `bolge-sykkel/bilder/`
- [ ] 11 lyder i `bolge-sykkel/lyd/`
- [ ] `stjerne-tur.html` lastet opp
- [ ] 11 bilder i `stjerne-tur/bilder/`
- [ ] 10 lyder i `stjerne-tur/lyd/`
- [ ] `okonomiske-historier.html` oppdatert med Stjerne-oppføring

🪙 *Myntland — Økonomiske historier*
