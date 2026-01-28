/**
 * Belgian Lottery Analyzer
 * Analyzes historical lottery data to suggest numbers using different strategies.
 */

// Detect if running with local server or static hosting (GitHub Pages)
const isLocalServer = window.location.port === '3000' ||
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1';

// API endpoints - use local proxy if available, otherwise static JSON files
const API_ENDPOINTS = {
    lotto: isLocalServer ? '/api/lotto' : './data/lotto.json',
    euromillions: isLocalServer ? '/api/euromillions' : './data/euromillions.json'
};

// Game configurations
const GAME_CONFIG = {
    lotto: {
        name: 'Lotto',
        mainNumbers: 6,
        mainRange: 45,
        hasStars: false,
        drawDays: 'Wednesday & Saturday',
        periodFilter: '2011-Today'
    },
    euromillions: {
        name: 'EuroMillions',
        mainNumbers: 5,
        mainRange: 50,
        starNumbers: 2,
        starRange: 12,
        hasStars: true,
        drawDays: 'Tuesday & Friday',
        periodFilter: '2016-Today'
    }
};

// Application state
let state = {
    currentGame: 'lotto',
    currentStrategy: 'cold',
    mainStats: null,
    starStats: null,
    drawCount: 0,
    history: [],
    isLoading: true,
    error: null,
    // Multi-board state
    multiBoard: {
        count: 5,
        mode: 'smart',
        wheelNumbers: new Set(),
        generatedBoards: []
    }
};

const STORAGE_KEY = 'luckyNumbersSettings:v1';

function saveSettings() {
    const payload = {
        currentGame: state.currentGame,
        currentStrategy: state.currentStrategy,
        multiBoard: {
            count: state.multiBoard.count,
            mode: state.multiBoard.mode,
            wheelNumbers: Array.from(state.multiBoard.wheelNumbers)
        }
    };
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (err) {
        console.warn('Unable to save settings:', err);
    }
}

function loadSettings() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw);

        const validGame = parsed.currentGame && GAME_CONFIG[parsed.currentGame];
        const validStrategy = parsed.currentStrategy && STRATEGY_INFO[parsed.currentStrategy];
        if (validGame) state.currentGame = parsed.currentGame;
        if (validStrategy) state.currentStrategy = parsed.currentStrategy;

        if (parsed.multiBoard) {
            const count = parseInt(parsed.multiBoard.count);
            if ([2, 3, 5, 10].includes(count)) state.multiBoard.count = count;
            if (['smart', 'coverage', 'wheel'].includes(parsed.multiBoard.mode)) {
                state.multiBoard.mode = parsed.multiBoard.mode;
            }
            if (Array.isArray(parsed.multiBoard.wheelNumbers)) {
                state.multiBoard.wheelNumbers = new Set(parsed.multiBoard.wheelNumbers.filter(n => Number.isInteger(n)));
            }
        }

        const config = GAME_CONFIG[state.currentGame];
        state.multiBoard.wheelNumbers = new Set(
            Array.from(state.multiBoard.wheelNumbers).filter(n => n >= 1 && n <= config.mainRange)
        );
    } catch (err) {
        console.warn('Unable to load settings:', err);
    }
}

function applyStateToUI() {
    elements.gameButtons.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.game === state.currentGame);
    });

    elements.strategyButtons.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.strategy === state.currentStrategy);
    });

    elements.countBtns.forEach(btn => {
        btn.classList.toggle('active', parseInt(btn.dataset.count) === state.multiBoard.count);
    });

    elements.modeBtns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === state.multiBoard.mode);
    });

    elements.wheelConfig.classList.toggle('hidden', state.multiBoard.mode !== 'wheel');
    if (state.multiBoard.mode === 'wheel') {
        renderWheelGrid();
    }
}

// DOM Elements
const elements = {
    gameButtons: document.querySelectorAll('.game-btn'),
    strategyButtons: document.querySelectorAll('.strategy-btn'),
    refreshBtn: document.getElementById('refreshBtn'),
    retryBtn: document.getElementById('retryBtn'),
    copyBtn: document.getElementById('copyBtn'),
    gameInfo: document.getElementById('gameInfo'),
    loadingState: document.getElementById('loadingState'),
    errorState: document.getElementById('errorState'),
    errorMessage: document.getElementById('errorMessage'),
    resultsContent: document.getElementById('resultsContent'),
    suggestedNumbers: document.getElementById('suggestedNumbers'),
    suggestedStars: document.getElementById('suggestedStars'),
    starNumbersSection: document.getElementById('starNumbersSection'),
    mainNumbersLabel: document.getElementById('mainNumbersLabel'),
    reasonsList: document.getElementById('reasonsList'),
    numberGrid: document.getElementById('numberGrid'),
    starGrid: document.getElementById('starGrid'),
    starGridSection: document.getElementById('starGridSection'),
    copyFeedback: document.getElementById('copyFeedback'),
    // Statistics elements
    totalDraws: document.getElementById('totalDraws'),
    mostDrawn: document.getElementById('mostDrawn'),
    leastDrawn: document.getElementById('leastDrawn'),
    lastUpdated: document.getElementById('lastUpdated'),
    // History
    historyList: document.getElementById('historyList'),
    // Strategy explanation
    strategyExplanation: document.getElementById('strategyExplanation'),
    // Multi-board elements
    countBtns: document.querySelectorAll('.count-btn'),
    modeBtns: document.querySelectorAll('.mode-btn'),
    wheelConfig: document.getElementById('wheelConfig'),
    wheelNumberGrid: document.getElementById('wheelNumberGrid'),
    wheelSelectedCount: document.getElementById('wheelSelectedCount'),
    wheelCombinations: document.getElementById('wheelCombinations'),
    generateMultiBtn: document.getElementById('generateMultiBtn'),
    multiboardResults: document.getElementById('multiboardResults'),
    boardCountLabel: document.getElementById('boardCountLabel'),
    boardsGrid: document.getElementById('boardsGrid'),
    multiboardStats: document.getElementById('multiboardStats'),
    copyAllBtn: document.getElementById('copyAllBtn'),
    regenerateBtn: document.getElementById('regenerateBtn'),
    // Odds & EV elements
    jackpotOdds: document.getElementById('jackpotOdds'),
    jackpotOddsPercent: document.getElementById('jackpotOddsPercent'),
    totalCombinations: document.getElementById('totalCombinations'),
    jackpotInput: document.getElementById('jackpotInput'),
    evCalcBtn: document.getElementById('evCalcBtn'),
    evValue: document.getElementById('evValue'),
    // Modal elements
    modal: document.getElementById('numberModal'),
    modalClose: document.getElementById('modalClose'),
    modalNumber: document.getElementById('modalNumber'),
    modalTimesDrawn: document.getElementById('modalTimesDrawn'),
    modalFrequency: document.getElementById('modalFrequency'),
    modalLastDrawn: document.getElementById('modalLastDrawn'),
    modalDrawsSince: document.getElementById('modalDrawsSince')
};

/**
 * Fetch lottery statistics from the API
 */
async function fetchLotteryData(game) {
    try {
        const response = await fetch(API_ENDPOINTS[game], {
            headers: {
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            throw new Error('API did not return JSON');
        }

        return response.json();
    } catch (error) {
        console.warn('API unavailable:', error.message);
        throw error;
    }
}

/**
 * Parse API response and extract relevant statistics
 */
function parseStatistics(data, game) {
    const config = GAME_CONFIG[game];
    const drawnResults = data.drawStatistics[0].drawnResults;

    // Find the main numbers statistics for the relevant period
    let mainStats = drawnResults.find(
        r => r.selectionType === 'main' && r.period && r.period.includes(config.periodFilter)
    );
    if (!mainStats) {
        mainStats = drawnResults.find(r => r.selectionType === 'main');
    }

    if (!mainStats) {
        throw new Error('Could not find statistics for the specified period');
    }

    let starStats = null;
    if (config.hasStars) {
        starStats = drawnResults.find(
            r => r.selectionType === 'star' && r.period && r.period.includes(config.periodFilter)
        );
        if (!starStats) {
            starStats = drawnResults.find(r => r.selectionType === 'star');
        }
    }

    return {
        mainStats: mainStats.statistics,
        starStats: starStats?.statistics || null,
        drawCount: mainStats.drawCount,
        mostDrawnResults: mainStats.mostDrawnResults.slice(0, 5),
        leastDrawnResults: mainStats.leastDrawnResults.slice(0, 5)
    };
}

/**
 * Strategy: Get cold numbers (highest notDrawnSince)
 */
function getColdNumbers(statistics, count) {
    return [...statistics]
        .sort((a, b) => b.notDrawnSince - a.notDrawnSince)
        .slice(0, count)
        .map(s => ({
            number: parseInt(s.result),
            notDrawnSince: s.notDrawnSince,
            frequency: s.frequency,
            reason: `Not drawn in ${s.notDrawnSince} draws`
        }));
}

/**
 * Strategy: Get hot numbers (highest frequency)
 */
function getHotNumbers(statistics, count) {
    return [...statistics]
        .sort((a, b) => b.frequency - a.frequency)
        .slice(0, count)
        .map(s => ({
            number: parseInt(s.result),
            notDrawnSince: s.notDrawnSince,
            frequency: s.frequency,
            reason: `Drawn ${s.frequency.toFixed(1)}% of the time`
        }));
}

/**
 * Strategy: Get balanced numbers (mix of cold and hot)
 */
function getBalancedNumbers(statistics, count) {
    const halfCount = Math.ceil(count / 2);
    const cold = getColdNumbers(statistics, halfCount);
    const coldNumbers = new Set(cold.map(c => c.number));

    // Get hot numbers that aren't already in cold selection
    const remainingStats = statistics.filter(s => !coldNumbers.has(parseInt(s.result)));
    const hot = getHotNumbers(remainingStats, count - halfCount);

    return [...cold, ...hot].map(n => ({
        ...n,
        reason: coldNumbers.has(n.number)
            ? `Cold: Not drawn in ${n.notDrawnSince} draws`
            : `Hot: Drawn ${n.frequency.toFixed(1)}% of the time`
    }));
}

/**
 * Strategy: Get due numbers (below expected frequency)
 */
function getDueNumbers(statistics, count, drawCount, totalNumbers, numbersPerDraw) {
    // Expected draws = (totalDraws * numbersPerDraw) / totalNumbers
    const expectedDraws = (drawCount * numbersPerDraw) / totalNumbers;

    return [...statistics]
        .map(s => ({
            number: parseInt(s.result),
            notDrawnSince: s.notDrawnSince,
            frequency: s.frequency,
            numberOfTimesDrawn: s.numberOfTimesDrawn,
            deficit: expectedDraws - s.numberOfTimesDrawn
        }))
        .filter(s => s.deficit > 0)
        .sort((a, b) => b.deficit - a.deficit)
        .slice(0, count)
        .map(s => ({
            ...s,
            reason: `${s.deficit.toFixed(0)} draws behind expected (${s.numberOfTimesDrawn} vs ${expectedDraws.toFixed(0)})`
        }));
}

/**
 * Strategy: Smart Pick - Avoid commonly picked numbers to reduce jackpot sharing
 * Based on research about player behavior, not lottery statistics
 */
function getSmartNumbers(statistics, count, maxNumber) {
    // Numbers people commonly pick based on behavioral research:
    // - Lucky numbers (7 is most popular worldwide)
    // - Single digits (easier to remember)
    // - Patterns on ticket slips
    const luckyNumbers = new Set([7, 3, 13, 21, 1, 11, 17, 23, 27, 9, 5]);
    const veryPopular = new Set([7, 3, 11, 13]); // Extra penalty
    const birthdayRange = 31;

    // Score each number: higher = fewer other players likely to pick it
    const scored = statistics.map(s => {
        const num = parseInt(s.result);
        let score = 0;
        let reason = '';

        // Strongly favor numbers above 31 (not birthdays/anniversaries)
        if (num > birthdayRange) {
            score += 60;
            reason = `Above 31 (not a birthday)`;
        } else if (num > 12) {
            score += 20; // Still avoid day-of-month picks (1-12 used for months too)
            reason = `Mid-range number`;
        }

        // Penalize commonly picked "lucky" numbers
        if (veryPopular.has(num)) {
            score -= 40;
            reason = `Avoiding very popular number`;
        } else if (luckyNumbers.has(num)) {
            score -= 20;
            reason = `Avoiding lucky number`;
        }

        // Penalize "hot" numbers - players often copy recent winners
        if (s.frequency > 16) { // Above average frequency
            score -= 10;
        }

        // Favor numbers in the 32-maxNumber range
        if (num > birthdayRange) {
            score += (num - birthdayRange) / (maxNumber - birthdayRange) * 15;
        }

        // Small random factor to vary suggestions
        score += Math.random() * 5;

        if (!reason) {
            reason = num > birthdayRange
                ? `High number (less picked by others)`
                : `Uncommon choice`;
        }

        return {
            number: num,
            score,
            notDrawnSince: s.notDrawnSince,
            frequency: s.frequency,
            reason
        };
    });

    return scored
        .sort((a, b) => b.score - a.score)
        .slice(0, count);
}

/**
 * Strategy: Random - Mathematically optimal (all numbers have equal probability)
 * Uses Fisher-Yates shuffle for true randomness
 */
function getRandomNumbers(statistics, count) {
    // Fisher-Yates shuffle
    const shuffled = [...statistics];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    return shuffled.slice(0, count).map(s => ({
        number: parseInt(s.result),
        notDrawnSince: s.notDrawnSince,
        frequency: s.frequency,
        reason: 'Randomly selected (equal probability)'
    }));
}

/**
 * Multi-Board Generation Functions
 */

/**
 * Generate multiple boards using Smart mode (avoid common picks)
 */
function generateSmartBoards(count, mainRange, mainCount, starRange, starCount, hasStars) {
    const boards = [];
    const usedCombinations = new Set();

    // Numbers people commonly pick
    const avoidNumbers = new Set([7, 3, 13, 21, 1, 11, 17, 23, 27, 9, 5]);
    const birthdayRange = 31;

    // Generate pool of good numbers (favoring > 31)
    const mainPool = [];
    for (let i = 1; i <= mainRange; i++) {
        // Weight higher numbers more heavily
        const weight = i > birthdayRange ? 3 : (avoidNumbers.has(i) ? 0.5 : 1);
        for (let w = 0; w < weight; w++) {
            mainPool.push(i);
        }
    }

    for (let b = 0; b < count; b++) {
        let mainNumbers;
        let attempts = 0;

        // Try to generate unique combination
        do {
            mainNumbers = [];
            const poolCopy = [...mainPool];

            while (mainNumbers.length < mainCount && poolCopy.length > 0) {
                const idx = Math.floor(Math.random() * poolCopy.length);
                const num = poolCopy.splice(idx, 1)[0];
                if (!mainNumbers.includes(num)) {
                    mainNumbers.push(num);
                }
            }
            mainNumbers.sort((a, b) => a - b);
            attempts++;
        } while (usedCombinations.has(mainNumbers.join(',')) && attempts < 100);

        usedCombinations.add(mainNumbers.join(','));

        let starNumbers = null;
        if (hasStars) {
            starNumbers = [];
            const starPool = Array.from({ length: starRange }, (_, i) => i + 1);
            while (starNumbers.length < starCount) {
                const idx = Math.floor(Math.random() * starPool.length);
                starNumbers.push(starPool.splice(idx, 1)[0]);
            }
            starNumbers.sort((a, b) => a - b);
        }

        boards.push({ mainNumbers, starNumbers });
    }

    return boards;
}

/**
 * Generate multiple boards using Coverage mode (maximize number spread)
 */
function generateCoverageBoards(count, mainRange, mainCount, starRange, starCount, hasStars) {
    const boards = [];
    const numberUsage = new Map();

    // Initialize usage count
    for (let i = 1; i <= mainRange; i++) {
        numberUsage.set(i, 0);
    }

    for (let b = 0; b < count; b++) {
        // Sort numbers by usage (least used first)
        const sortedNumbers = Array.from(numberUsage.entries())
            .sort((a, b) => a[1] - b[1])
            .map(([num]) => num);

        // Take least used numbers with some randomization
        const candidates = sortedNumbers.slice(0, mainCount * 3);
        const mainNumbers = [];

        // Shuffle candidates and pick
        for (let i = candidates.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
        }

        for (let i = 0; i < mainCount && i < candidates.length; i++) {
            mainNumbers.push(candidates[i]);
            numberUsage.set(candidates[i], numberUsage.get(candidates[i]) + 1);
        }

        mainNumbers.sort((a, b) => a - b);

        let starNumbers = null;
        if (hasStars) {
            starNumbers = [];
            const starPool = Array.from({ length: starRange }, (_, i) => i + 1);
            for (let i = starPool.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [starPool[i], starPool[j]] = [starPool[j], starPool[i]];
            }
            starNumbers = starPool.slice(0, starCount).sort((a, b) => a - b);
        }

        boards.push({ mainNumbers, starNumbers });
    }

    return boards;
}

/**
 * Generate boards using Wheeling system (all combinations of selected numbers)
 */
function generateWheelBoards(selectedNumbers, mainCount, starRange, starCount, hasStars) {
    const numbers = Array.from(selectedNumbers).sort((a, b) => a - b);
    const combinations = [];

    // Generate all combinations of mainCount from selected numbers
    function combine(start, combo) {
        if (combo.length === mainCount) {
            combinations.push([...combo]);
            return;
        }
        for (let i = start; i < numbers.length; i++) {
            combo.push(numbers[i]);
            combine(i + 1, combo);
            combo.pop();
        }
    }

    combine(0, []);

    // Convert to board format
    return combinations.map(mainNumbers => {
        let starNumbers = null;
        if (hasStars) {
            const starPool = Array.from({ length: starRange }, (_, i) => i + 1);
            for (let i = starPool.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [starPool[i], starPool[j]] = [starPool[j], starPool[i]];
            }
            starNumbers = starPool.slice(0, starCount).sort((a, b) => a - b);
        }
        return { mainNumbers, starNumbers };
    });
}

/**
 * Calculate number of combinations (n choose k)
 */
function combinations(n, k) {
    if (k > n) return 0;
    if (k === 0 || k === n) return 1;
    let result = 1;
    for (let i = 0; i < k; i++) {
        result = result * (n - i) / (i + 1);
    }
    return Math.round(result);
}

/**
 * Calculate total possible tickets (jackpot combinations)
 */
function getTotalCombinations(game) {
    const config = GAME_CONFIG[game];
    if (config.hasStars) {
        return combinations(config.mainRange, config.mainNumbers) * combinations(config.starRange, config.starNumbers);
    }
    return combinations(config.mainRange, config.mainNumbers);
}

/**
 * Generate multi-boards based on current settings
 */
function generateMultiBoards() {
    const config = GAME_CONFIG[state.currentGame];
    const { count, mode, wheelNumbers } = state.multiBoard;

    let boards;

    switch (mode) {
        case 'smart':
            boards = generateSmartBoards(
                count,
                config.mainRange,
                config.mainNumbers,
                config.starRange || 12,
                config.starNumbers || 2,
                config.hasStars
            );
            break;
        case 'coverage':
            boards = generateCoverageBoards(
                count,
                config.mainRange,
                config.mainNumbers,
                config.starRange || 12,
                config.starNumbers || 2,
                config.hasStars
            );
            break;
        case 'wheel':
            if (wheelNumbers.size < config.mainNumbers) {
                alert(`Please select at least ${config.mainNumbers} numbers for wheeling`);
                return null;
            }
            boards = generateWheelBoards(
                wheelNumbers,
                config.mainNumbers,
                config.starRange || 12,
                config.starNumbers || 2,
                config.hasStars
            );
            // Limit wheel boards to reasonable amount
            if (boards.length > 100) {
                boards = boards.slice(0, 100);
            }
            break;
    }

    state.multiBoard.generatedBoards = boards;
    return boards;
}

// Strategy explanations
const STRATEGY_INFO = {
    cold: {
        icon: '&#129398;',
        title: 'Cold Numbers',
        badge: 'fun',
        badgeText: 'Entertainment only',
        description: 'Picks numbers not drawn for the longest time. Based on the "gambler\'s fallacy" - the mistaken belief that overdue numbers are more likely to appear. Fun to play, but mathematically each number has the same odds every draw.'
    },
    hot: {
        icon: '&#128293;',
        title: 'Hot Numbers',
        badge: 'fun',
        badgeText: 'Entertainment only',
        description: 'Picks the most frequently drawn numbers historically. While interesting to see patterns, past frequency has no influence on future draws. The lottery balls have no memory!'
    },
    balanced: {
        icon: '&#9878;',
        title: 'Balanced Mix',
        badge: 'fun',
        badgeText: 'Entertainment only',
        description: 'Combines cold and hot numbers for variety. Gives you a mix of "overdue" and "frequent" numbers. Still just for fun - the math doesn\'t change.'
    },
    due: {
        icon: '&#127922;',
        title: 'Due Numbers',
        badge: 'fun',
        badgeText: 'Entertainment only',
        description: 'Finds numbers that have appeared less than statistically expected. If a number "should" have been drawn 200 times but only appeared 180 times, it\'s considered "due". Reality: numbers don\'t owe us anything!'
    },
    smart: {
        icon: '&#129504;',
        title: 'Smart Pick',
        badge: 'useful',
        badgeText: 'May increase payout',
        description: 'Selects numbers that fewer people typically choose (above 31, avoids "lucky" numbers like 7). Won\'t help you win more often, but you\'re statistically less likely to share the jackpot if you do win.'
    },
    random: {
        icon: '&#127808;',
        title: 'Random',
        badge: 'optimal',
        badgeText: 'Mathematically honest',
        description: 'Pure random selection using Fisher-Yates shuffle. Since every number has exactly the same probability of being drawn, this is mathematically equivalent to any other strategy. The most honest choice!'
    }
};

/**
 * Get suggested numbers based on current strategy
 */
function getSuggestedNumbers() {
    const config = GAME_CONFIG[state.currentGame];
    const strategy = state.currentStrategy;

    let mainNumbers;
    switch (strategy) {
        case 'cold':
            mainNumbers = getColdNumbers(state.mainStats, config.mainNumbers);
            break;
        case 'hot':
            mainNumbers = getHotNumbers(state.mainStats, config.mainNumbers);
            break;
        case 'balanced':
            mainNumbers = getBalancedNumbers(state.mainStats, config.mainNumbers);
            break;
        case 'due':
            mainNumbers = getDueNumbers(
                state.mainStats,
                config.mainNumbers,
                state.drawCount,
                config.mainRange,
                config.mainNumbers
            );
            break;
        case 'smart':
            mainNumbers = getSmartNumbers(state.mainStats, config.mainNumbers, config.mainRange);
            break;
        case 'random':
            mainNumbers = getRandomNumbers(state.mainStats, config.mainNumbers);
            break;
    }

    let starNumbers = null;
    if (config.hasStars && state.starStats) {
        switch (strategy) {
            case 'cold':
                starNumbers = getColdNumbers(state.starStats, config.starNumbers);
                break;
            case 'hot':
                starNumbers = getHotNumbers(state.starStats, config.starNumbers);
                break;
            case 'balanced':
                starNumbers = getBalancedNumbers(state.starStats, config.starNumbers);
                break;
            case 'due':
                starNumbers = getDueNumbers(
                    state.starStats,
                    config.starNumbers,
                    state.drawCount,
                    config.starRange,
                    config.starNumbers
                );
                break;
            case 'smart':
                starNumbers = getSmartNumbers(state.starStats, config.starNumbers, config.starRange);
                break;
            case 'random':
                starNumbers = getRandomNumbers(state.starStats, config.starNumbers);
                break;
        }
    }

    return { mainNumbers, starNumbers };
}

/**
 * Get temperature color based on notDrawnSince value
 */
function getTemperatureColor(notDrawnSince, maxGap) {
    const ratio = notDrawnSince / maxGap;
    if (ratio < 0.2) return '#ef4444'; // hot (red)
    if (ratio < 0.4) return '#f97316'; // orange
    if (ratio < 0.6) return '#eab308'; // yellow
    if (ratio < 0.8) return '#22c55e'; // green
    return '#3b82f6'; // cold (blue)
}

/**
 * Format Unix timestamp to readable date
 */
function formatDate(timestamp) {
    if (!timestamp) return 'Unknown';
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });
}

/**
 * Render the number grid
 */
function renderNumberGrid() {
    const config = GAME_CONFIG[state.currentGame];
    const { mainNumbers, starNumbers } = getSuggestedNumbers();
    const selectedMainNumbers = new Set(mainNumbers.map(n => n.number));
    const selectedStarNumbers = starNumbers ? new Set(starNumbers.map(n => n.number)) : new Set();

    // Calculate max gap for temperature coloring
    const maxMainGap = Math.max(...state.mainStats.map(s => s.notDrawnSince));

    // Render main number grid
    elements.numberGrid.innerHTML = '';
    for (let i = 1; i <= config.mainRange; i++) {
        const stat = state.mainStats.find(s => parseInt(s.result) === i);
        const color = getTemperatureColor(stat?.notDrawnSince || 0, maxMainGap);
        const isSelected = selectedMainNumbers.has(i);

        const cell = document.createElement('div');
        cell.className = `grid-number ${isSelected ? 'selected' : ''}`;
        cell.style.backgroundColor = color;
        cell.innerHTML = `
            <span class="number">${i}</span>
            <span class="gap">${stat?.notDrawnSince || 0}</span>
        `;
        cell.addEventListener('click', () => showNumberModal(stat, 'main'));
        elements.numberGrid.appendChild(cell);
    }

    // Render star grid for EuroMillions
    if (config.hasStars && state.starStats) {
        elements.starGridSection.classList.remove('hidden');
        const maxStarGap = Math.max(...state.starStats.map(s => s.notDrawnSince));

        elements.starGrid.innerHTML = '';
        for (let i = 1; i <= config.starRange; i++) {
            const stat = state.starStats.find(s => parseInt(s.result) === i);
            const color = getTemperatureColor(stat?.notDrawnSince || 0, maxStarGap);
            const isSelected = selectedStarNumbers.has(i);

            const cell = document.createElement('div');
            cell.className = `grid-number ${isSelected ? 'selected' : ''}`;
            cell.style.backgroundColor = color;
            cell.innerHTML = `
                <span class="number">${i}</span>
                <span class="gap">${stat?.notDrawnSince || 0}</span>
            `;
            cell.addEventListener('click', () => showNumberModal(stat, 'star'));
            elements.starGrid.appendChild(cell);
        }
    } else {
        elements.starGridSection.classList.add('hidden');
    }
}

/**
 * Render suggested numbers and reasons
 */
function renderSuggestedNumbers() {
    const config = GAME_CONFIG[state.currentGame];
    const { mainNumbers, starNumbers } = getSuggestedNumbers();

    // Render main numbers
    elements.suggestedNumbers.innerHTML = mainNumbers
        .sort((a, b) => a.number - b.number)
        .map((n, i) => `<div class="suggested-number" style="animation-delay: ${i * 0.1}s">${n.number}</div>`)
        .join('');

    // Render star numbers for EuroMillions
    if (config.hasStars && starNumbers) {
        elements.starNumbersSection.classList.remove('hidden');
        elements.suggestedStars.innerHTML = starNumbers
            .sort((a, b) => a.number - b.number)
            .map((n, i) => `<div class="suggested-number star" style="animation-delay: ${(mainNumbers.length + i) * 0.1}s">${n.number}</div>`)
            .join('');
    } else {
        elements.starNumbersSection.classList.add('hidden');
    }

    // Render reasons
    let reasonsHtml = mainNumbers
        .map(n => `
            <li>
                <span class="reason-number">${n.number}</span>
                <span class="reason-text">${n.reason}</span>
            </li>
        `)
        .join('');

    if (config.hasStars && starNumbers) {
        reasonsHtml += starNumbers
            .map(n => `
                <li>
                    <span class="reason-number star">${n.number}</span>
                    <span class="reason-text">Star: ${n.reason}</span>
                </li>
            `)
            .join('');
    }

    elements.reasonsList.innerHTML = reasonsHtml;
}

/**
 * Update statistics display
 */
function renderStatistics(data) {
    elements.totalDraws.textContent = data.drawCount.toLocaleString();
    elements.mostDrawn.textContent = data.mostDrawnResults.join(', ');
    elements.leastDrawn.textContent = data.leastDrawnResults.join(', ');
    const latestDate = Math.max(...state.mainStats.map(s => s.lastWinningDrawDate || 0));
    elements.lastUpdated.textContent = latestDate ? formatDate(latestDate) : formatDate(Date.now());
}

/**
 * Render odds and jackpot-only expected value
 */
function renderOdds() {
    const total = getTotalCombinations(state.currentGame);
    const oddsText = total ? `1 in ${total.toLocaleString()}` : '-';
    const oddsPercent = total ? `${(1 / total * 100).toFixed(8)}%` : '-';

    elements.totalCombinations.textContent = total.toLocaleString();
    elements.jackpotOdds.textContent = oddsText;
    elements.jackpotOddsPercent.textContent = oddsPercent;

    updateJackpotEV();
}

function formatCurrency(value) {
    return new Intl.NumberFormat('en-GB', {
        style: 'currency',
        currency: 'EUR',
        maximumFractionDigits: 2
    }).format(value);
}

function updateJackpotEV() {
    if (!elements.jackpotInput) return;
    const raw = parseFloat(elements.jackpotInput.value);
    if (!Number.isFinite(raw) || raw <= 0) {
        elements.evValue.textContent = '-';
        return;
    }
    const total = getTotalCombinations(state.currentGame);
    const ev = raw / total;
    elements.evValue.textContent = formatCurrency(ev);
}

/**
 * Render draw history
 */
function renderHistory() {
    const history = Array.isArray(state.history) ? state.history : [];
    const isEuroMillions = state.currentGame === 'euromillions';

    if (history.length === 0) {
        elements.historyList.innerHTML = `
            <div class="history-empty">
                Draw history unavailable (latest data could not be retrieved).
            </div>
        `;
        return;
    }

    elements.historyList.innerHTML = history.map(draw => {
        const [dateStr, mainNumbers, bonusOrStars] = draw;
        const date = new Date(dateStr);
        const dayName = date.toLocaleDateString('en-GB', { weekday: 'short' });
        const formattedDate = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

        // Sort main numbers for display
        const sortedMain = [...mainNumbers].sort((a, b) => a - b).slice(0, isEuroMillions ? 5 : 6);

        let numbersHtml = sortedMain
            .map(n => `<span class="history-number">${n}</span>`)
            .join('');

        if (isEuroMillions) {
            // Stars for EuroMillions
            numbersHtml += `<span class="history-separator">+</span>`;
            numbersHtml += bonusOrStars
                .map(n => `<span class="history-number star">${n}</span>`)
                .join('');
        } else {
            // Bonus number for Lotto
            numbersHtml += `<span class="history-separator">+</span>`;
            numbersHtml += `<span class="history-number bonus">${bonusOrStars}</span>`;
        }

        return `
            <div class="history-item">
                <div class="history-date">
                    <span class="day">${dayName}</span> ${formattedDate}
                </div>
                <div class="history-numbers">
                    ${numbersHtml}
                </div>
            </div>
        `;
    }).join('');
}

/**
 * Render wheel number selection grid
 */
function renderWheelGrid() {
    const config = GAME_CONFIG[state.currentGame];
    elements.wheelNumberGrid.innerHTML = '';

    for (let i = 1; i <= config.mainRange; i++) {
        const btn = document.createElement('button');
        btn.className = 'wheel-number' + (state.multiBoard.wheelNumbers.has(i) ? ' selected' : '');
        btn.textContent = i;
        btn.addEventListener('click', () => toggleWheelNumber(i));
        elements.wheelNumberGrid.appendChild(btn);
    }

    updateWheelInfo();
}

/**
 * Toggle wheel number selection
 */
function toggleWheelNumber(num) {
    if (state.multiBoard.wheelNumbers.has(num)) {
        state.multiBoard.wheelNumbers.delete(num);
    } else {
        if (state.multiBoard.wheelNumbers.size < 15) {
            state.multiBoard.wheelNumbers.add(num);
        }
    }

    // Update button state
    const buttons = elements.wheelNumberGrid.querySelectorAll('.wheel-number');
    buttons[num - 1].classList.toggle('selected', state.multiBoard.wheelNumbers.has(num));

    updateWheelInfo();
    saveSettings();
}

/**
 * Update wheel info display
 */
function updateWheelInfo() {
    const config = GAME_CONFIG[state.currentGame];
    const count = state.multiBoard.wheelNumbers.size;
    elements.wheelSelectedCount.textContent = count;

    if (count >= config.mainNumbers) {
        const numCombos = combinations(count, config.mainNumbers);
        elements.wheelCombinations.textContent = `= ${numCombos} board${numCombos !== 1 ? 's' : ''}`;
    } else {
        elements.wheelCombinations.textContent = `(need at least ${config.mainNumbers})`;
    }
}

/**
 * Render generated multi-boards
 */
function renderMultiBoards() {
    const boards = state.multiBoard.generatedBoards;
    const config = GAME_CONFIG[state.currentGame];

    if (!boards || boards.length === 0) return;

    elements.boardCountLabel.textContent = boards.length;

    // Render board cards
    elements.boardsGrid.innerHTML = boards.map((board, idx) => {
        const mainHtml = board.mainNumbers
            .map(n => `<span class="board-number">${n}</span>`)
            .join('');

        let starsHtml = '';
        if (config.hasStars && board.starNumbers) {
            starsHtml = `
                <span class="board-separator">+</span>
                ${board.starNumbers.map(n => `<span class="board-number star">${n}</span>`).join('')}
            `;
        }

        return `
            <div class="board-card">
                <div class="board-header">
                    <span class="board-label">Board ${idx + 1}</span>
                    <button class="board-copy-btn" data-board="${idx}" title="Copy">&#128203;</button>
                </div>
                <div class="board-numbers">
                    ${mainHtml}
                    ${starsHtml}
                </div>
            </div>
        `;
    }).join('');

    // Add click handlers for individual copy buttons
    elements.boardsGrid.querySelectorAll('.board-copy-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const idx = parseInt(btn.dataset.board);
            copyBoard(idx);
        });
    });

    // Render stats
    renderMultiBoardStats(boards);

    // Show results
    elements.multiboardResults.classList.remove('hidden');
}

/**
 * Render multi-board statistics
 */
function renderMultiBoardStats(boards) {
    const config = GAME_CONFIG[state.currentGame];
    const allNumbers = boards.flatMap(b => b.mainNumbers);
    const uniqueNumbers = new Set(allNumbers);
    const coverage = ((uniqueNumbers.size / config.mainRange) * 100).toFixed(0);

    // Count number frequency across boards
    const freq = new Map();
    allNumbers.forEach(n => freq.set(n, (freq.get(n) || 0) + 1));
    const maxFreq = Math.max(...freq.values());
    const avgFreq = (allNumbers.length / uniqueNumbers.size).toFixed(1);

    // Count high numbers (>31)
    const highNumbers = allNumbers.filter(n => n > 31).length;
    const highPercent = ((highNumbers / allNumbers.length) * 100).toFixed(0);

    elements.multiboardStats.innerHTML = `
        <div class="stat-item">
            <div class="stat-value">${boards.length}</div>
            <div class="stat-label">Total Boards</div>
        </div>
        <div class="stat-item">
            <div class="stat-value">${uniqueNumbers.size}/${config.mainRange}</div>
            <div class="stat-label">Numbers Covered (${coverage}%)</div>
        </div>
        <div class="stat-item">
            <div class="stat-value">${highPercent}%</div>
            <div class="stat-label">High Numbers (>31)</div>
        </div>
        <div class="stat-item">
            <div class="stat-value">${avgFreq}x</div>
            <div class="stat-label">Avg Repetition</div>
        </div>
    `;
}

/**
 * Copy a single board to clipboard
 */
function copyBoard(idx) {
    const board = state.multiBoard.generatedBoards[idx];
    const config = GAME_CONFIG[state.currentGame];

    let text = board.mainNumbers.join(', ');
    if (config.hasStars && board.starNumbers) {
        text += ' | Stars: ' + board.starNumbers.join(', ');
    }

    navigator.clipboard.writeText(text);
}

/**
 * Copy all boards to clipboard
 */
function copyAllBoards() {
    const boards = state.multiBoard.generatedBoards;
    const config = GAME_CONFIG[state.currentGame];

    const text = boards.map((board, idx) => {
        let line = `Board ${idx + 1}: ${board.mainNumbers.join(', ')}`;
        if (config.hasStars && board.starNumbers) {
            line += ` | Stars: ${board.starNumbers.join(', ')}`;
        }
        return line;
    }).join('\n');

    navigator.clipboard.writeText(text);

    // Brief feedback
    const btn = elements.copyAllBtn;
    const original = btn.innerHTML;
    btn.innerHTML = '<span>&#10003;</span> Copied!';
    setTimeout(() => btn.innerHTML = original, 2000);
}

/**
 * Update game info display
 */
function updateGameInfo() {
    const config = GAME_CONFIG[state.currentGame];
    let infoText = `Pick ${config.mainNumbers} numbers from 1-${config.mainRange}`;
    if (config.hasStars) {
        infoText += ` + ${config.starNumbers} stars from 1-${config.starRange}`;
    }

    elements.gameInfo.innerHTML = `
        <span class="game-badge">${config.name}</span>
        <span>${infoText}</span>
        <span class="draw-days">Draws: ${config.drawDays}</span>
    `;

    // Update label for main numbers section
    elements.mainNumbersLabel.textContent = config.hasStars ? 'Main Numbers' : 'Your Numbers';
}

/**
 * Show the number detail modal
 */
function showNumberModal(stat, type) {
    if (!stat) return;

    elements.modalNumber.textContent = stat.result;
    elements.modalTimesDrawn.textContent = stat.numberOfTimesDrawn;
    elements.modalFrequency.textContent = `${stat.frequency.toFixed(2)}%`;
    elements.modalLastDrawn.textContent = formatDate(stat.lastWinningDrawDate);
    elements.modalDrawsSince.textContent = stat.notDrawnSince;

    elements.modal.classList.remove('hidden');
}

/**
 * Hide the modal
 */
function hideModal() {
    elements.modal.classList.add('hidden');
}

/**
 * Copy numbers to clipboard
 */
async function copyNumbers() {
    const config = GAME_CONFIG[state.currentGame];
    const { mainNumbers, starNumbers } = getSuggestedNumbers();

    let text = mainNumbers.map(n => n.number).sort((a, b) => a - b).join(', ');
    if (config.hasStars && starNumbers) {
        text += ' | Stars: ' + starNumbers.map(n => n.number).sort((a, b) => a - b).join(', ');
    }

    try {
        await navigator.clipboard.writeText(text);
        elements.copyFeedback.classList.remove('hidden');
        setTimeout(() => {
            elements.copyFeedback.classList.add('hidden');
        }, 2000);
    } catch (err) {
        console.error('Failed to copy:', err);
    }
}

/**
 * Set loading state
 */
function setLoading(isLoading) {
    state.isLoading = isLoading;
    elements.loadingState.classList.toggle('hidden', !isLoading);
    elements.resultsContent.classList.toggle('hidden', isLoading || state.error);
    elements.errorState.classList.toggle('hidden', !state.error);
    elements.refreshBtn.classList.toggle('loading', isLoading);
}

/**
 * Set error state
 */
function setError(error) {
    state.error = error;
    elements.loadingState.classList.add('hidden');
    elements.resultsContent.classList.add('hidden');
    elements.errorState.classList.toggle('hidden', !error);
    elements.refreshBtn.classList.remove('loading');
    if (elements.errorMessage) {
        elements.errorMessage.textContent = error || "Couldn't retrieve the latest data. Please try again.";
    }
}

/**
 * Load data and render UI
 */
async function loadData() {
    setLoading(true);
    setError(null);

    try {
        const data = await fetchLotteryData(state.currentGame);
        const parsed = parseStatistics(data, state.currentGame);

        state.mainStats = parsed.mainStats;
        state.starStats = parsed.starStats;
        state.drawCount = parsed.drawCount;
        state.history = Array.isArray(data?.drawHistory) ? data.drawHistory : [];

        setLoading(false);
        renderStatistics(parsed);
        renderSuggestedNumbers();
        renderNumberGrid();
        renderHistory();
        renderOdds();
    } catch (error) {
        console.error('Error loading lottery data:', error);
        setError(error.message);
    }
}

/**
 * Handle game change
 */
function handleGameChange(game) {
    if (game === state.currentGame) return;

    state.currentGame = game;
    elements.gameButtons.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.game === game);
    });

    // Reset multi-board state for new game
    state.multiBoard.wheelNumbers.clear();
    state.multiBoard.generatedBoards = [];
    elements.multiboardResults.classList.add('hidden');

    // Re-render wheel grid if visible
    if (state.multiBoard.mode === 'wheel') {
        renderWheelGrid();
    }

    updateGameInfo();
    saveSettings();
    loadData();
}

/**
 * Update strategy explanation panel
 */
function updateStrategyExplanation() {
    const info = STRATEGY_INFO[state.currentStrategy];
    if (!info) return;

    elements.strategyExplanation.innerHTML = `
        <div class="explanation-header">
            <span class="explanation-icon">${info.icon}</span>
            <span class="explanation-title">${info.title}</span>
            <span class="explanation-badge ${info.badge}">${info.badgeText}</span>
        </div>
        <p class="explanation-text">${info.description}</p>
    `;
}

/**
 * Handle strategy change
 */
function handleStrategyChange(strategy) {
    if (strategy === state.currentStrategy) return;

    state.currentStrategy = strategy;
    elements.strategyButtons.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.strategy === strategy);
    });

    updateStrategyExplanation();
    saveSettings();

    if (!state.isLoading && !state.error) {
        renderSuggestedNumbers();
        renderNumberGrid();
    }
}

/**
 * Initialize event listeners
 */
function initEventListeners() {
    // Game toggle buttons
    elements.gameButtons.forEach(btn => {
        btn.addEventListener('click', () => handleGameChange(btn.dataset.game));
    });

    // Strategy buttons
    elements.strategyButtons.forEach(btn => {
        btn.addEventListener('click', () => handleStrategyChange(btn.dataset.strategy));
    });

    // Refresh button
    elements.refreshBtn.addEventListener('click', loadData);

    // Retry button
    elements.retryBtn.addEventListener('click', loadData);

    // Copy button
    elements.copyBtn.addEventListener('click', copyNumbers);

    // Modal close
    elements.modalClose.addEventListener('click', hideModal);
    elements.modal.addEventListener('click', (e) => {
        if (e.target === elements.modal) hideModal();
    });

    // Keyboard navigation
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') hideModal();
    });

    // Multi-board: Board count buttons
    elements.countBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            state.multiBoard.count = parseInt(btn.dataset.count);
            elements.countBtns.forEach(b => b.classList.toggle('active', b === btn));
            saveSettings();
        });
    });

    // Multi-board: Mode buttons
    elements.modeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            state.multiBoard.mode = btn.dataset.mode;
            elements.modeBtns.forEach(b => b.classList.toggle('active', b === btn));

            // Show/hide wheel config
            elements.wheelConfig.classList.toggle('hidden', btn.dataset.mode !== 'wheel');

            // Render wheel grid if needed
            if (btn.dataset.mode === 'wheel') {
                renderWheelGrid();
            }
            saveSettings();
        });
    });

    // Multi-board: Generate button
    elements.generateMultiBtn.addEventListener('click', () => {
        const boards = generateMultiBoards();
        if (boards) {
            renderMultiBoards();
        }
    });

    // Multi-board: Copy all button
    elements.copyAllBtn.addEventListener('click', copyAllBoards);

    // Multi-board: Regenerate button
    elements.regenerateBtn.addEventListener('click', () => {
        const boards = generateMultiBoards();
        if (boards) {
            renderMultiBoards();
        }
    });

    // Odds & EV
    if (elements.evCalcBtn) {
        elements.evCalcBtn.addEventListener('click', updateJackpotEV);
    }
    if (elements.jackpotInput) {
        elements.jackpotInput.addEventListener('input', updateJackpotEV);
        elements.jackpotInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') updateJackpotEV();
        });
    }
}

/**
 * Initialize the application
 */
function init() {
    loadSettings();
    updateGameInfo();
    updateStrategyExplanation();
    initEventListeners();
    applyStateToUI();
    renderOdds();
    loadData();
}

// Start the app when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
