# Belgian Lottery Analyzer

A web application that analyzes historical lottery data from the Belgian National Lottery to suggest numbers for **Lotto** and **EuroMillions** games.

> **Important:** Lottery draws are completely random. This tool is for entertainment purposes only and does not increase your chances of winning.

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
| **Smart** | May increase payout | Numbers fewer people pick |
| **Random** | Mathematically honest | Pure random selection |

### Understanding the Strategies

#### Cold, Hot, Balanced, Due (Entertainment Only)

These strategies are based on analyzing historical lottery data. While fun to explore, they're based on the **gambler's fallacy** - the mistaken belief that past results influence future draws.

**The mathematical reality:**
- Every number has exactly the same probability each draw
- The lottery balls have no memory
- A number being "overdue" doesn't make it more likely to appear
- Past frequency has no influence on future results

These strategies are included because they're fun and give you a data-driven way to pick numbers instead of pure guesswork. Just don't expect them to improve your odds!

#### Smart Pick (Actually Useful)

The Smart Pick strategy is the only one with real-world value. It doesn't improve your odds of winning, but it can **increase your potential payout** by selecting numbers that fewer other players typically choose.

**How it works:**
- Favors numbers **32-45** (avoids birthday pickers who use 1-31)
- Avoids popular "lucky" numbers (7, 3, 13, 21, etc.)
- Penalizes "hot" numbers (players often copy recent winners)

**Why it matters:**
- ~30% of players pick birthdays (1-31)
- 7 is the most picked number worldwide
- If you win with commonly picked numbers, you're more likely to share the jackpot

#### Random (Mathematically Optimal)

Since every number has equal probability, random selection is mathematically equivalent to any pattern-based strategy. This is the most honest choice - uses Fisher-Yates shuffle for true randomness.

### Multi-Board Generator

Generate multiple unique boards to maximize your coverage when playing multiple tickets.

| Mode | Description | Best For |
|------|-------------|----------|
| **Smart** | All boards avoid commonly picked numbers (>31, no lucky numbers) | Reducing jackpot sharing |
| **Coverage** | Spreads numbers across boards to maximize unique coverage | Covering more numbers |
| **Wheel** | Select 8-12 numbers, generates all combinations | Guaranteed partial matches |

**Wheeling System Explained:**
If you select 10 numbers and play all combinations (210 boards), you're guaranteed that if 4 of your 10 numbers are drawn, at least one board will have 4 matches. The trade-off is more boards = more money spent.

### Additional Features

- **Number Grid** - Color-coded visualization (red = hot, blue = cold)
- **Click any number** - View detailed statistics
- **Recent Draw Results** - Last 20 draws (~2 months)
- **Copy to Clipboard** - Easy number copying (single board or all boards)
- **Strategy Explanations** - Clear descriptions of what each strategy does
- **Responsive Design** - Works on desktop and mobile

## Quick Start

### Local Server (Required for Live Data)
```bash
cd LuckyNumbers
npm install
npm start
```
Open http://localhost:3000

## Project Structure

```
LuckyNumbers/
├── index.html      # Main HTML structure
├── styles.css      # Responsive styling
├── app.js          # Application logic & data
├── server.js       # Local proxy for official stats (Loterie Nationale)
├── package.json    # Server dependencies/scripts
└── README.md       # This file
```

## Data Sources

The app uses the official Loterie Nationale statistics files and fetches them server-side via `server.js`.
It resolves the latest `.xlsx` links from the official statistics pages and parses them into the app’s format.

**Note:** If the official pages or files are unavailable, the app will show an error and no historical data will be displayed.

## Technical Details

### Strategy Calculations

**Cold Numbers:**
```javascript
Sort by notDrawnSince (descending) → Take top N
```

**Hot Numbers:**
```javascript
Sort by frequency (descending) → Take top N
```

**Due Numbers:**
```javascript
expectedDraws = (totalDraws × numbersPerDraw) / totalNumbers
deficit = expectedDraws - actualDraws
Sort by deficit (descending) → Take top N
```

**Smart Numbers:**
```javascript
score = 0
if (number > 31) score += 60        // Not a birthday
if (veryPopular) score -= 40        // Avoid 7, 3, 11, 13
if (luckyNumber) score -= 20        // Avoid other lucky numbers
if (hotNumber) score -= 10          // Players copy winners
Sort by score (descending) → Take top N
```

**Random Numbers:**
```javascript
Fisher-Yates shuffle → Take first N
```

### Updating Data

There is no embedded dataset. Update the statistics page URLs in `server.js` if the official pages change.

### Debugging Data Fetch

If results look wrong, check the debug endpoint:
- http://localhost:3000/api/debug/lotto
- http://localhost:3000/api/debug/euromillions

This shows which XLSX file is used and which columns were detected for numbers, frequency, and dates.

## The Bottom Line

| If you want... | Use this strategy |
|----------------|-------------------|
| Fun data exploration | Cold, Hot, Balanced, or Due |
| Maximize payout if you win | Smart Pick |
| Mathematical honesty | Random |
| Best actual odds | Buy more tickets (not recommended) |

Remember: The only guaranteed way to win the lottery is to not play. But if you're going to play anyway, you might as well have fun analyzing the numbers!

## Browser Support

- Chrome 80+
- Firefox 75+
- Safari 13+
- Edge 80+

## License

MIT License - Feel free to use and modify.

---

*Data sources: Loterie Nationale official statistics pages (fetched by `server.js`).*
