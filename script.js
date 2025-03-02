// Initialize particles.js
particlesJS('particles', {
    particles: {
        number: { value: 50, density: { enable: true, value_area: 800 } },
        color: { value: '#ffffff' },
        opacity: { value: 0.1 },
        size: { value: 1 },
        line_linked: { enable: false },
        move: {
            enable: true,
            speed: 0.5,
            direction: 'none',
            random: true,
            straight: false,
            out_mode: 'out'
        }
    }
});

// Major currencies to always show at the top
const majorCurrencies = ['USD', 'EUR', 'GBP', 'JPY', 'CNY', 'CHF', 'AUD', 'CAD'];
const conqueredCurrencies = new Set();

// Cryptocurrencies and non-fiat to exclude
const excludedCurrencies = new Set([
    'btc', 'eth', 'ltc', 'xrp', 'bch', 'bnb', 'usdt', 'usdc', 'busd',  // cryptos
    'xau', 'xag', 'xpt', 'xpd',  // precious metals
    'xdr', 'sdr', 'xyz'  // special drawing rights and others
]);

// API URLs with fallback
const API_URLS = {
    primary: 'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies',
    fallback: 'https://latest.currency-api.pages.dev/v1/currencies'
};

// Add this helper function to handle localStorage
function getStoredData(key) {
    try {
        const item = localStorage.getItem(key);
        if (!item) return null;
        
        const { data, timestamp } = JSON.parse(item);
        // Data is valid for 5 minutes
        if (Date.now() - timestamp < 5 * 60 * 1000) {
            return data;
        }
        return null;
    } catch (error) {
        console.error('Error reading from localStorage:', error);
        return null;
    }
}

function storeData(key, data) {
    try {
        localStorage.setItem(key, JSON.stringify({
            data,
            timestamp: Date.now()
        }));
    } catch (error) {
        console.error('Error writing to localStorage:', error);
    }
}

async function fetchWithFallback(endpoint) {
    try {
        const response = await fetch(`${API_URLS.primary}/${endpoint}`);
        if (!response.ok) throw new Error('Primary API failed');
        return await response.json();
    } catch (error) {
        console.warn('Primary API failed, trying fallback...', error);
        const fallbackResponse = await fetch(`${API_URLS.fallback}/${endpoint}`);
        return await fallbackResponse.json();
    }
}

async function fetchBitcoinPrice() {
    try {
        const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd');
        const data = await response.json();
        return data.bitcoin.usd;
    } catch (error) {
        console.error('Error fetching Bitcoin price:', error);
        return null;
    }
}

async function fetchCurrencyNames() {
    try {
        const response = await fetch('https://openexchangerates.org/api/currencies.json');
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error fetching currency names:', error);
        return {};
    }
}

async function fetchCurrencies() {
    try {
        // Try to get cached data first
        const cachedData = getStoredData('currencyData');
        if (cachedData) {
            // Update all displays with cached data while fetching new data
            updateDisplay(cachedData);
            updateClock(
                cachedData.filter(([,data]) => data.isDead).length,
                cachedData.length
            );
            updateHeaderText(
                cachedData.filter(([,data]) => data.isDead).length,
                cachedData.length
            );
        }

        // Get BTC price and currency names
        const [btcPrice, currencyNames] = await Promise.all([
            fetchBitcoinPrice(),
            fetchCurrencyNames()
        ]);
        
        if (!btcPrice) throw new Error('Failed to fetch Bitcoin price');
        const satoshiUSD = btcPrice / 100000000;

        // Get currency rates
        const response = await fetch('https://open.er-api.com/v6/latest/USD');
        const data = await response.json();
        
        if (!data.rates) throw new Error('Failed to fetch currency rates');

        const currencyData = {};

        // Calculate sat values for each currency
        Object.entries(data.rates).forEach(([currency, rate]) => {
            // Skip non-fiat currencies
            if (currency !== 'BTC' && currency !== 'XAU' && currency !== 'XAG') {
                const currencyInUSD = 1.0 / rate;
                const satsNeeded = currencyInUSD / satoshiUSD;
                
                currencyData[currency] = {
                    code: currency,
                    name: currencyNames[currency] || currency,
                    satsNeeded: satsNeeded,
                    isDead: satsNeeded <= 1.0
                };
            }
        });

        // Sort currencies
        const sortedCurrencies = Object.entries(currencyData)
            .sort(([,a], [,b]) => b.satsNeeded - a.satsNeeded);

        // Store the new data
        storeData('currencyData', sortedCurrencies);

        // Update all displays with new data
        updateDisplay(sortedCurrencies);
        updateClock(
            sortedCurrencies.filter(([,data]) => data.isDead).length,
            sortedCurrencies.length
        );
        updateHeaderText(
            sortedCurrencies.filter(([,data]) => data.isDead).length,
            sortedCurrencies.length
        );
        
    } catch (error) {
        console.error('Error fetching data:', error);
        
        // If we have cached data, keep showing it
        const cachedData = getStoredData('currencyData');
        if (cachedData) {
            console.log('Using cached data due to fetch error');
            updateDisplay(cachedData);
            updateClock(
                cachedData.filter(([,data]) => data.isDead).length,
                cachedData.length
            );
            updateHeaderText(
                cachedData.filter(([,data]) => data.isDead).length,
                cachedData.length
            );
        } else {
            // Only show error if we have no cached data
            document.getElementById('main-currencies').innerHTML = `
                <div class="error">Error fetching currency data. Please try again later.</div>
            `;
        }
    }
}

function updateDisplay(sortedCurrencies) {
    const mainCurrenciesDiv = document.getElementById('main-currencies');
    const lastGaspDiv = document.getElementById('last-gasp-currencies');
    const conqueredDiv = document.getElementById('conquered-currencies');
    const summaryDiv = document.getElementById('summary');
    
    // Clear all sections
    mainCurrenciesDiv.innerHTML = '';
    lastGaspDiv.innerHTML = '';
    conqueredDiv.innerHTML = '';
    summaryDiv.innerHTML = '';

    // Count currencies in each category
    const totalCurrencies = sortedCurrencies.length;
    const terminalCount = sortedCurrencies.filter(([,data]) => data.satsNeeded > 100).length;
    const lastGaspCount = sortedCurrencies.filter(([,data]) => data.satsNeeded <= 100 && !data.isDead).length;
    const deadCount = sortedCurrencies.filter(([,data]) => data.isDead).length;

    // Add summary section
    summaryDiv.innerHTML = `
        <div class="summary-section">
            <h2>Fiat currencies dying</h2>
            <p class="summary-subtitle">Watch in real-time as government money becomes worth less than the smallest unit of Bitcoin</p>
            <div class="summary-item">
                <span class="summary-emoji">🤮</span>
                Terminal Stage (>${formatSatValue(100)} sats): ${terminalCount}/${totalCurrencies} fiat currencies
            </div>
            <div class="summary-item">
                <span class="summary-emoji">😰</span>
                Last Gasps (1-100 sats): ${lastGaspCount}/${totalCurrencies} fiat currencies
            </div>
            <div class="summary-item">
                <span class="summary-emoji">☠️</span>
                Dead (<1 sat): ${deadCount}/${totalCurrencies} fiat currencies
            </div>
        </div>
    `;

    // Add headers
    mainCurrenciesDiv.innerHTML = `
        <div class="section-header">
            <h2>Terminal Stage 🤮</h2>
            <p>These currencies still require more than 100 sats to buy 1 full unit</p>
        </div>
    `;

    lastGaspDiv.innerHTML = `
        <div class="section-header">
            <h2>Last Gasps 😰</h2>
            <p>These currencies need between 100 and 1 sats to buy 1 full unit</p>
        </div>
    `;

    conqueredDiv.innerHTML = `
        <div class="section-header">
            <h2>Dead Currencies ☠️</h2>
            <p>1 sat can buy 1 or more full units of these currencies</p>
        </div>
    `;

    // Display currencies in appropriate sections
    sortedCurrencies.forEach(([currency, data]) => {
        let container;
        if (data.isDead) {
            container = conqueredDiv;
        } else if (data.satsNeeded <= 100) {
            container = lastGaspDiv;
        } else {
            container = mainCurrenciesDiv;
        }

        const currencyItem = document.createElement('div');
        currencyItem.className = 'currency-item';
        if (data.isDead) currencyItem.classList.add('conquered');
        if (data.satsNeeded <= 100 && !data.isDead) currencyItem.classList.add('last-gasp');
        
        currencyItem.innerHTML = `
            <div class="currency-info">
                <span class="currency-code">${data.code}</span>
                <span class="currency-name">${data.name}</span>
            </div>
            <span class="currency-value">
                ${formatSatValue(data.satsNeeded)}${data.satsNeeded < 1 ? ' msat' : ''} = 1.0 ${data.code}
            </span>
            ${data.isDead ? ' ☠️' : data.satsNeeded <= 100 ? ' 😰' : ' 🤮'}
        `;
        
        container.appendChild(currencyItem);
    });

    // Calculate and display time remaining
    const strongCurrencies = sortedCurrencies.filter(([,data]) => !data.isDead).length;
    const timeRemaining = calculateTimeRemaining(strongCurrencies);
    
    document.querySelector('.time-remaining').textContent = 
        `${timeRemaining} to the death of fiat`;
}

function calculateTimeRemaining(remainingCurrencies) {
    // Let's assume each currency takes about 1 month to be conquered
    const monthsRemaining = remainingCurrencies;
    
    if (monthsRemaining < 1) {
        return "Minutes";
    } else if (monthsRemaining === 1) {
        return "1 month";
    } else if (monthsRemaining < 12) {
        return `${monthsRemaining} months`;
    } else {
        const years = Math.floor(monthsRemaining / 12);
        const months = monthsRemaining % 12;
        if (months === 0) {
            return `${years} ${years === 1 ? 'year' : 'years'}`;
        } else {
            return `${years} ${years === 1 ? 'year' : 'years'} and ${months} ${months === 1 ? 'month' : 'months'}`;
        }
    }
}

function updateClock(deadCount, total) {
    // Start at 11:45 PM (like the Doomsday clock traditionally did)
    const START_HOUR = 11;
    const START_MINUTE = 45;
    const TOTAL_MINUTES = 15; // 15 minutes until midnight
    
    // Calculate how close we are to "midnight" (all currencies conquered)
    const progress = deadCount / total;
    const minutesUntilMidnight = Math.ceil(TOTAL_MINUTES * (1 - progress));
    
    // Calculate current time for clock hands
    let currentMinutes = START_MINUTE + (TOTAL_MINUTES - minutesUntilMidnight);
    let currentHour = START_HOUR;
    
    // Adjust hour if we've crossed over to the next hour
    if (currentMinutes >= 60) {
        currentHour = START_HOUR;
        currentMinutes -= 60;
    } else if (currentMinutes < 0) {
        currentHour = 0; // midnight
        currentMinutes = 0;
    }
    
    // Convert to degrees for clock hands
    const hourDegrees = (currentHour + currentMinutes/60) * 30; // 360/12 = 30 degrees per hour
    const minuteDegrees = currentMinutes * 6; // 360/60 = 6 degrees per minute

    // Update clock hands
    document.querySelector('.hour').style.transform = `rotate(${hourDegrees}deg)`;
    document.querySelector('.minute').style.transform = `rotate(${minuteDegrees}deg)`;

    // Update time remaining text
    const timeText = minutesUntilMidnight <= 0
        ? "MIDNIGHT - FIAT IS DEAD"
        : `${minutesUntilMidnight} ${minutesUntilMidnight === 1 ? 'minute' : 'minutes'} to the death of fiat`;
    
    document.querySelector('.time-remaining').textContent = timeText;
}

function formatSatValue(sats) {
    if (sats >= 1000000) {
        return `${(sats/1000000).toFixed(2)}M sats`;
    } else if (sats >= 1000) {
        return `${(sats/1000).toFixed(2)}K sats`;
    } else if (sats >= 1) {
        return `${sats.toFixed(2)} sats`;
    } else {
        // Convert sats to millisatoshis (1 sat = 1000 msat)
        const msats = sats * 1000;
        return `${msats.toFixed(2)}`;
    }
}

function updateHeaderText(deadCount, totalCount) {
    document.getElementById('conquered-count').textContent = 
        `${deadCount} of the ${totalCount} main`;
}

// Initialize and set update interval
fetchCurrencies();
setInterval(fetchCurrencies, 60000); // Update every minute

// Add error handling styles
const errorStyle = document.createElement('style');
errorStyle.textContent = `
    .error {
        color: var(--accent-color);
        padding: 1rem;
        text-align: center;
        border: 1px solid var(--accent-color);
        border-radius: 4px;
        margin: 1rem 0;
    }
`;
document.head.appendChild(errorStyle);

// Add this after the other initialization code
document.querySelectorAll('.nav-button').forEach(button => {
    button.addEventListener('click', () => {
        const targetId = button.getAttribute('data-target');
        const targetElement = document.getElementById(targetId);
        if (targetElement) {
            targetElement.scrollIntoView({ 
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
}); 