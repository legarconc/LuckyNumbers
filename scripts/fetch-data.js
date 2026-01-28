/**
 * Standalone script to fetch lottery data and save as static JSON files.
 * Used by GitHub Actions to update data daily for GitHub Pages deployment.
 */

const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

const STAT_PAGES = {
    lotto: 'https://www.loterie-nationale.be/content/opp/fr/games/lotto/results/statistics.html',
    euromillions: 'https://www.loterie-nationale.be/content/opp/fr/games/euromillions/results/statistics.html'
};

const GAME_CONFIG = {
    lotto: {
        name: 'Lotto',
        mainNumbers: 6,
        mainRange: 45,
        hasStars: false
    },
    euromillions: {
        name: 'Euro Millions',
        mainNumbers: 5,
        mainRange: 50,
        starNumbers: 2,
        starRange: 12,
        hasStars: true
    }
};

async function resolveStatsXlsxUrl(game) {
    const pageUrl = STAT_PAGES[game];
    const response = await fetch(pageUrl, { headers: { 'User-Agent': 'LuckyNumbers/1.0' } });
    if (!response.ok) {
        throw new Error(`Failed to load statistics page (${response.status})`);
    }
    const html = await response.text();
    const match = html.match(/href="([^"]+\.xlsx)"/i);
    if (!match) {
        throw new Error('Could not find statistics file link');
    }
    const href = match[1];
    return new URL(href, pageUrl).href;
}

async function fetchXlsx(url) {
    const response = await fetch(url, { headers: { 'User-Agent': 'LuckyNumbers/1.0' } });
    if (!response.ok) {
        throw new Error(`Failed to download statistics file (${response.status})`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return xlsx.read(Buffer.from(arrayBuffer), { type: 'buffer' });
}

function buildColumnStats(rows) {
    const stats = [];
    rows.forEach(row => {
        row.forEach((cell, idx) => {
            const num = toNumber(cell);
            if (!Number.isFinite(num)) return;
            if (!stats[idx]) {
                stats[idx] = { max: num, min: num };
            } else {
                stats[idx].max = Math.max(stats[idx].max, num);
                stats[idx].min = Math.min(stats[idx].min, num);
            }
        });
    });
    return stats;
}

function pickTimesColumn(colStats, numCol, headerRow = []) {
    const headerText = headerRow.map(cell => String(cell || '').toLowerCase());
    const headerTimesIdx = headerText.findIndex(cell =>
        cell.includes('nombre d\'apparitions') ||
        cell.includes('apparitions') ||
        cell.includes('times drawn') ||
        cell.includes('drawn')
    );
    if (headerTimesIdx >= 0 && headerTimesIdx !== numCol) {
        return headerTimesIdx;
    }

    let bestIdx = null;
    let bestMax = -Infinity;
    colStats.forEach((stat, idx) => {
        if (!stat || idx === numCol) return;
        if (stat.max > 30000) return;
        if (stat.max > bestMax) {
            bestMax = stat.max;
            bestIdx = idx;
        }
    });
    return bestIdx;
}

function pickFrequencyColumn(colStats, headerRow, numCol, timesCol) {
    for (let i = 0; i < headerRow.length; i++) {
        if (i === numCol || i === timesCol) continue;
        const cell = String(headerRow[i] || '').toLowerCase();
        if (cell.includes('freq') || cell.includes('%') || cell.includes('pourcent')) return i;
    }
    for (let i = 0; i < colStats.length; i++) {
        if (i === numCol || i === timesCol) continue;
        const stat = colStats[i];
        if (stat && stat.max <= 100 && stat.min >= 0) return i;
    }
    return null;
}

function scoreDateColumn(rows, idx) {
    const years = [];
    rows.forEach(row => {
        const date = toDate(row[idx]);
        if (date && !isNaN(date)) years.push(date.getUTCFullYear());
    });
    years.sort((a, b) => a - b);
    const count = years.length;
    const medianYear = count ? years[Math.floor(count / 2)] : 0;
    return { count, medianYear };
}

function pickDateColumn(rows, headerRow = []) {
    const headerText = headerRow.map(cell => String(cell || '').toLowerCase());
    const headerDateIdx = headerText.findIndex(cell =>
        cell.includes('date') ||
        cell.includes('dernier') ||
        cell.includes('derniere') ||
        cell.includes('tirage') ||
        cell.includes('last') ||
        cell.includes('draw')
    );
    if (headerDateIdx >= 0) {
        const headerScore = scoreDateColumn(rows, headerDateIdx);
        if (headerScore.count >= 10 && headerScore.medianYear >= 2000) {
            return headerDateIdx;
        }
    }

    const counts = new Map();
    rows.forEach(row => {
        row.forEach((cell, idx) => {
            const date = toDate(cell);
            if (date) counts.set(idx, (counts.get(idx) || 0) + 1);
        });
    });
    let bestIdx = null;
    let bestScore = null;
    counts.forEach((count, idx) => {
        const score = scoreDateColumn(rows, idx);
        if (score.count < 10 || score.medianYear < 2000) return;
        if (!bestScore || score.count > bestScore.count || score.medianYear > bestScore.medianYear) {
            bestScore = score;
            bestIdx = idx;
        }
    });
    return bestIdx;
}

function pickGapColumn(colStats, headerRow, numCol, timesCol, freqCol, dateCol) {
    for (let i = 0; i < headerRow.length; i++) {
        if ([numCol, timesCol, freqCol, dateCol].includes(i)) continue;
        const cell = String(headerRow[i] || '').toLowerCase();
        if (cell.includes('écart') || cell.includes('ecart') || cell.includes('retard') ||
            cell.includes('gap') || cell.includes('sorti depuis') || cell.includes('plus sorti')) {
            return i;
        }
    }
    for (let i = 0; i < colStats.length; i++) {
        if ([numCol, timesCol, freqCol, dateCol].includes(i)) continue;
        const stat = colStats[i];
        if (stat && stat.max <= 200 && stat.min >= 0) return i;
    }
    return null;
}

function toNumber(value) {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
        const cleaned = value.replace(',', '.').replace(/[^\d.]/g, '');
        const num = parseFloat(cleaned);
        return Number.isFinite(num) ? num : null;
    }
    return null;
}

function toDate(value) {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (typeof value === 'number') {
        if (value < 20000) return null;
        const parsed = xlsx.SSF.parse_date_code(value);
        if (!parsed) return null;
        return new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d));
    }
    if (typeof value === 'string') {
        const trimmed = value.trim();
        const parsed = new Date(trimmed);
        if (!isNaN(parsed)) return parsed;
        const match = trimmed.match(/(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/);
        if (match) {
            const day = parseInt(match[1], 10);
            const month = parseInt(match[2], 10) - 1;
            const year = parseInt(match[3].length === 2 ? `20${match[3]}` : match[3], 10);
            return new Date(Date.UTC(year, month, day));
        }
    }
    return null;
}

function toDateString(date) {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function maxDate(dates) {
    const valid = dates.filter(d => d instanceof Date && !isNaN(d));
    if (valid.length === 0) return null;
    return valid.reduce((max, d) => (d > max ? d : max), valid[0]);
}

function round(value, digits) {
    if (!Number.isFinite(value)) return 0;
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
}

function rowHasNumber(rows, target) {
    return rows.some(row => row[0] === target);
}

function calculateDrawsSince(lastDrawDate, currentDate, drawsPerWeek = 2) {
    const daysDiff = Math.floor((currentDate - lastDrawDate) / (1000 * 60 * 60 * 24));
    return Math.max(0, Math.floor(daysDiff / 7 * drawsPerWeek));
}

function extractNumberStats(sheets, { min, max, numbersPerDraw }) {
    for (const sheet of sheets) {
        const rows = sheet.rows;
        const numberRows = rows
            .map((row, index) => ({ row, index }))
            .filter(({ row }) => Number.isInteger(row[0]) && row[0] >= min && row[0] <= max);

        if (numberRows.length < max - min + 1) continue;

        const numCol = 0;
        const headerRow = rows[numberRows[0].index - 1] || [];
        const colStats = buildColumnStats(numberRows.map(nr => nr.row));

        const timesCol = pickTimesColumn(colStats, numCol, headerRow);
        const freqCol = pickFrequencyColumn(colStats, headerRow, numCol, timesCol);
        const dateCol = pickDateColumn(numberRows.map(nr => nr.row), headerRow);
        const gapCol = pickGapColumn(colStats, headerRow, numCol, timesCol, freqCol, dateCol);

        const statistics = numberRows.map(({ row }) => {
            const num = parseInt(row[numCol], 10);
            const timesDrawn = toNumber(row[timesCol]);
            const lastDrawDate = dateCol !== null ? toDate(row[dateCol]) : null;
            const gap = gapCol !== null ? toNumber(row[gapCol]) : null;
            return { num, timesDrawn, lastDrawDate, gap };
        });

        const sumTimes = statistics.reduce((sum, s) => sum + (s.timesDrawn || 0), 0);
        const drawCount = Math.round(sumTimes / numbersPerDraw);
        const lastDraw = maxDate(statistics.map(s => s.lastDrawDate));

        const normalized = statistics.map(s => {
            const frequency = freqCol !== null && rowHasNumber(rows, s.num)
                ? toNumber(rows[numberRows.find(nr => nr.row[numCol] === s.num)?.index][freqCol])
                : s.timesDrawn && drawCount
                    ? (s.timesDrawn / drawCount) * 100
                    : 0;

            const notDrawnSince = s.gap !== null && Number.isFinite(s.gap)
                ? s.gap
                : s.lastDrawDate && lastDraw
                    ? calculateDrawsSince(s.lastDrawDate, lastDraw)
                    : 0;

            return {
                result: String(s.num),
                frequency: round(frequency, 2),
                numberOfTimesDrawn: s.timesDrawn,
                notDrawnSince,
                lastWinningDrawId: drawCount ? String(drawCount - notDrawnSince) : '',
                lastWinningDrawDate: s.lastDrawDate ? s.lastDrawDate.getTime() : null
            };
        });

        const sorted = [...normalized].sort((a, b) => b.frequency - a.frequency);

        return {
            statistics: normalized,
            drawCount,
            lastDraw,
            mostDrawnResults: sorted.slice(0, 5).map(s => s.result),
            leastDrawnResults: sorted.slice(-5).reverse().map(s => s.result)
        };
    }

    throw new Error('Could not extract statistics from file');
}

function dedupeHistory(history, config) {
    const seen = new Set();
    const unique = [];
    history.forEach(entry => {
        const key = `${entry[0]}|${entry[1].join(',')}`;
        if (seen.has(key)) return;
        if (!config.hasStars && entry[2] === null) return;
        if (config.hasStars && (!Array.isArray(entry[2]) || entry[2].length !== config.starNumbers)) return;
        seen.add(key);
        unique.push(entry);
    });
    return unique;
}

function extractDrawHistory(sheets, config) {
    const history = [];
    for (const sheet of sheets) {
        for (const row of sheet.rows) {
            const date = row.map(toDate).find(d => d instanceof Date && !isNaN(d));
            if (!date) continue;

            const numbers = row
                .map(toNumber)
                .filter(n => Number.isInteger(n));

            if (numbers.length < config.mainNumbers) continue;

            const main = numbers.filter(n => n >= 1 && n <= config.mainRange).slice(0, config.mainNumbers);
            if (main.length !== config.mainNumbers) continue;

            if (!config.hasStars) {
                const bonus = numbers.find(n => n >= 1 && n <= config.mainRange && !main.includes(n)) || null;
                history.push([toDateString(date), main, bonus]);
            } else {
                const stars = numbers.filter(n => n >= 1 && n <= config.starRange).slice(0, config.starNumbers);
                if (stars.length !== config.starNumbers) continue;
                history.push([toDateString(date), main, stars]);
            }
        }
    }

    const deduped = dedupeHistory(history, config);
    deduped.sort((a, b) => new Date(b[0]) - new Date(a[0]));
    return deduped.slice(0, 20);
}

function buildDrawnResults(gameName, statistics, drawCount, mostDrawnResults, leastDrawnResults, selectionType) {
    return {
        gameName,
        period: 'Official statistics (Loterie Nationale)',
        statistics,
        mostDrawnResults,
        leastDrawnResults,
        drawCount,
        selectionType
    };
}

async function getGameData(game) {
    const statsUrl = await resolveStatsXlsxUrl(game);
    const workbook = await fetchXlsx(statsUrl);
    const sheets = workbook.SheetNames.map(name => ({
        name,
        rows: xlsx.utils.sheet_to_json(workbook.Sheets[name], {
            header: 1,
            raw: true,
            defval: null
        })
    }));

    const config = GAME_CONFIG[game];
    const mainStats = extractNumberStats(sheets, {
        min: 1,
        max: config.mainRange,
        numbersPerDraw: config.mainNumbers
    });

    const starStats = config.hasStars
        ? extractNumberStats(sheets, {
            min: 1,
            max: config.starRange,
            numbersPerDraw: config.starNumbers
        })
        : null;

    const drawHistory = extractDrawHistory(sheets, config);

    const drawCount = mainStats.drawCount;

    return {
        drawStatistics: [{
            drawnResults: [
                buildDrawnResults(
                    config.name,
                    mainStats.statistics,
                    drawCount,
                    mainStats.mostDrawnResults,
                    mainStats.leastDrawnResults,
                    'main'
                ),
                ...(config.hasStars ? [
                    buildDrawnResults(
                        config.name,
                        starStats.statistics,
                        drawCount,
                        [],
                        [],
                        'star'
                    )
                ] : [])
            ]
        }],
        drawHistory,
        lastUpdated: new Date().toISOString()
    };
}

async function main() {
    const dataDir = path.join(__dirname, '..', 'data');

    // Ensure data directory exists
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }

    console.log('Fetching Lotto data...');
    try {
        const lottoData = await getGameData('lotto');
        fs.writeFileSync(
            path.join(dataDir, 'lotto.json'),
            JSON.stringify(lottoData, null, 2)
        );
        console.log('Lotto data saved to data/lotto.json');
    } catch (err) {
        console.error('Failed to fetch Lotto data:', err.message);
        process.exit(1);
    }

    console.log('Fetching EuroMillions data...');
    try {
        const euroData = await getGameData('euromillions');
        fs.writeFileSync(
            path.join(dataDir, 'euromillions.json'),
            JSON.stringify(euroData, null, 2)
        );
        console.log('EuroMillions data saved to data/euromillions.json');
    } catch (err) {
        console.error('Failed to fetch EuroMillions data:', err.message);
        process.exit(1);
    }

    console.log('Data fetch complete!');
}

main();
