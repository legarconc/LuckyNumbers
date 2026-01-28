# Belgian Lottery Analyzer

A Progressive Web App (PWA) that analyzes historical lottery data from the Belgian National Lottery to suggest numbers for **Lotto** and **EuroMillions** games.

**Live App:** https://legarconc.github.io/LuckyNumbers/

> **Disclaimer:** Lottery draws are completely random. This tool is for entertainment purposes only and does not increase your chances of winning. Play responsibly.

## Features

### Game Support
- **Lotto** - Pick 6 numbers from 1-45 (draws: Wednesday & Saturday)
- **EuroMillions** - Pick 5 numbers from 1-50 + 2 stars from 1-12 (draws: Tuesday & Friday)

### Number Selection Strategies

| Strategy | Badge | What It Does |
|----------|-------|--------------|
| **Cold** | Entertainment only | Picks numbers not drawn for the longest time |
| **Hot** | Entertainment only | Picks the most frequently drawn numbers |
| **Balanced** | Entertainment only | Mix of cold and hot numbers |
| **Due** | Entertainment only | Numbers below expected frequency |
| **Smart** | May increase payout | Numbers fewer people pick (>31, avoids lucky numbers) |
| **Random** | Mathematically honest | Pure random selection (Fisher-Yates shuffle) |

### Multi-Board Generator
Generate multiple unique boards with three modes:
- **Smart** - Avoid commonly picked numbers to reduce jackpot sharing
- **Coverage** - Maximize unique number spread across boards
- **Wheel** - Select 8-12 numbers, generates all combinations for guaranteed partial matches

### Additional Features
- **Number Grid** - Color-coded visualization (red = hot, blue = cold)
- **Click any number** - View detailed statistics (times drawn, frequency, last drawn)
- **Recent Draw Results** - Last 20 draws
- **Odds Calculator** - Expected value calculation for any jackpot amount
- **Copy to Clipboard** - Easy number copying
- **Works Offline** - PWA with service worker caching

## Installation

### Install on iPhone (Add to Home Screen)
1. Open https://legarconc.github.io/LuckyNumbers/ in Safari
2. Tap the Share button (square with arrow)
3. Scroll down and tap "Add to Home Screen"
4. Tap "Add"

The app will appear on your home screen and work like a native app.

### Run Locally (Development)
```bash
git clone https://github.com/legarconc/LuckyNumbers.git
cd LuckyNumbers
npm install
npm start
```
Open http://localhost:3000

## How It Works

### Data Source
The app fetches official statistics from the Belgian National Lottery (Loterie Nationale):
- Dynamically finds the latest `.xlsx` statistics file on their website
- Parses number frequencies, draw dates, and historical results
- Data is refreshed automatically via GitHub Actions (daily at 6 AM UTC)

### GitHub Pages Deployment
- Static JSON data files are pre-generated and committed to the repo
- GitHub Actions runs daily to fetch fresh data from the lottery website
- The frontend automatically uses static data when hosted on GitHub Pages

### Data Freshness
The lottery publishes updated statistics files periodically (typically monthly). The app always fetches the latest available file. Recent draw results depend on when the lottery updates their statistics file.

## Project Structure

```
LuckyNumbers/
├── index.html                      # Main HTML with PWA meta tags
├── app.js                          # Frontend application logic
├── styles.css                      # Responsive styling (mobile-optimized)
├── server.js                       # Local dev server & API proxy
├── manifest.json                   # PWA manifest
├── sw.js                           # Service worker for offline support
├── package.json                    # Dependencies
├── data/
│   ├── lotto.json                  # Pre-fetched Lotto statistics
│   └── euromillions.json           # Pre-fetched EuroMillions statistics
├── icons/
│   ├── icon-192.svg                # PWA icon
│   └── icon-512.svg                # PWA icon (large)
├── scripts/
│   ├── fetch-data.js               # Data fetching script for GitHub Actions
│   └── generate-icons.js           # Icon generation utility
└── .github/
    └── workflows/
        └── update-data.yml         # Daily data update action
```

## Manual Data Update

To manually trigger a data update:
1. Go to the repository's **Actions** tab
2. Select **Update Lottery Data**
3. Click **Run workflow**

Or run locally:
```bash
node scripts/fetch-data.js
```

## Understanding the Strategies

### Entertainment Strategies (Cold, Hot, Balanced, Due)
These are based on the **gambler's fallacy** - the mistaken belief that past results influence future draws. Every number has exactly the same probability each draw. These strategies are included for fun, not because they improve your odds.

### Smart Pick (Actually Useful)
Doesn't improve winning odds, but can **increase your payout** by avoiding numbers other players commonly pick:
- Favors numbers 32-45 (avoids birthday pickers who use 1-31)
- Avoids popular "lucky" numbers (7, 3, 13, etc.)
- ~30% of players pick birthdays, so avoiding them means less jackpot sharing

### Random (Mathematically Optimal)
Since every number has equal probability, random selection is mathematically equivalent to any pattern. This is the most honest choice.

## Technical Details

### Environment Detection
The app automatically detects its environment:
- **Local server** (port 3000): Uses live API endpoints (`/api/lotto`)
- **GitHub Pages**: Uses static JSON files (`./data/lotto.json`)

### Debugging
When running locally, check data parsing with:
- http://localhost:3000/api/debug/lotto
- http://localhost:3000/api/debug/euromillions

## Browser Support
- Chrome/Edge 80+
- Firefox 75+
- Safari 13+ (including iOS Safari)

## License
MIT License - Feel free to use and modify.

---

*Data source: Loterie Nationale (Belgian National Lottery) official statistics.*
