# ⚽ Kalkulator Zdarzeń Meczowych

Aplikacja React do obliczania prawdopodobieństwa zdarzeń meczowych (faule, rzuty rożne, kartki) w oparciu o Model Poissona i dane z API football-data.org.

## 🚀 Wdrożenie na GitHub Pages

### Krok 1 — Utwórz repo na GitHub
1. Wejdź na https://github.com/new
2. Nazwij repo np. `football-calc`
3. Ustaw jako **Public**
4. Kliknij **Create repository**

### Krok 2 — Wgraj pliki
```bash
cd football-calc
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/TWOJA_NAZWA/football-calc.git
git push -u origin main
```

### Krok 3 — Ustaw nazwę repo w vite.config.js
Otwórz `vite.config.js` i zmień `football-calc` na nazwę swojego repo:
```js
base: '/football-calc/',  // ← nazwa twojego repo
```

### Krok 4 — Zainstaluj i wdróż
```bash
npm install
npm run deploy
```

To polecenie zbuduje aplikację i automatycznie wgra ją do gałęzi `gh-pages`.

### Krok 5 — Włącz GitHub Pages
1. Wejdź w repo → **Settings** → **Pages**
2. Source: **Deploy from a branch**
3. Branch: **gh-pages** / **/ (root)**
4. Kliknij **Save**

Po ~2 minutach aplikacja będzie dostępna pod:
`https://TWOJA_NAZWA.github.io/football-calc/`

## 🔑 Klucz API

Zarejestruj się bezpłatnie na https://www.football-data.org/client/register

Klucz wpisz w aplikacji — jest zapisywany lokalnie w przeglądarce.

## 📊 Dane

- **10 lig**: Premier League, Bundesliga, Serie A, La Liga, Ligue 1, Eredivisie, Primeira Liga, Championship, Série A Brazil, Champions League
- **Model Poissona** z baseline per liga
- **Intensywność** z historii ostatnich 8 meczów każdej drużyny
- **Waga meczu** automatycznie z pozycji w tabeli ligowej
