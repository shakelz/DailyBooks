// ── Berlin Event Calendar for Seasonal Forecasting ──
// Dates are formatted as 'MM-DD' (Month-Day) for recurring events
// or 'YYYY-MM-DD' for specific one-off dates.
// Weight represents the expected traffic multiplier (e.g., 1.25 = +25% expected traffic)
// Dips can be represented by weights below 1 (e.g., 0.8 = -20% expected traffic)

export const BERLIN_EVENTS = [
    // ── Public Holidays (General Slowdown or prep-shopping days) ──
    { date: '01-01', name: 'New Year\'s Day', weight: 0.5 }, // Most shops closed
    { date: '03-08', name: 'International Women\'s Day', weight: 1.1 }, // Berlin specific public holiday, sometimes small gift shopping
    { date: '05-01', name: 'Labour Day', weight: 0.8 },
    { date: '10-03', name: 'German Unity Day', weight: 1.1 },
    { date: '12-25', name: 'Christmas Day', weight: 0.3 }, // Closed
    { date: '12-26', name: 'Boxing Day', weight: 0.5 }, // Closed

    // ── Seasonal & Shopping Events (Traffic Boosts) ──
    { date: '02-14', name: 'Valentine\'s Day', weight: 1.2 }, // Gift shopping
    { date: '10-31', name: 'Halloween / Reformation Day Prep', weight: 1.15 },

    // Black Friday / Cyber week are usually late November
    // Hardcoding for 2024-2026 roughly.
    { date: '2024-11-29', name: 'Black Friday', weight: 1.4 },
    { date: '2025-11-28', name: 'Black Friday', weight: 1.4 },
    { date: '2026-11-27', name: 'Black Friday', weight: 1.4 },
    { date: '2024-12-02', name: 'Cyber Monday', weight: 1.25 },
    { date: '2025-12-01', name: 'Cyber Monday', weight: 1.25 },
    { date: '2026-11-30', name: 'Cyber Monday', weight: 1.25 },

    // Christmas Shopping Season (December weekends usually bump up)
    { date: '12-20', name: 'Late Christmas Shopping', weight: 1.3 },
    { date: '12-21', name: 'Late Christmas Shopping', weight: 1.35 },
    { date: '12-22', name: 'Late Christmas Shopping', weight: 1.4 },
    { date: '12-23', name: 'Last Minute Christmas', weight: 1.5 },
    { date: '12-24', name: 'Christmas Eve (Half Day)', weight: 0.9 }, // Rushed early morning, closed afternoon

    // ── Semester Breaks / Back to School (Tech purchases) ──
    // Varies by state, rough Berlin dates
    { date: '09-01', name: 'Back to School / Uni Prep', weight: 1.2 },
    { date: '04-15', name: 'Summer Semester Start', weight: 1.15 },
    { date: '10-15', name: 'Winter Semester Start', weight: 1.15 }
];

/**
 * Checks if a given date string matches any event and returns the weight & name.
 * @param {string} dateString - 'YYYY-MM-DD'
 * @returns {Object|null} { name, weight } or null if no event
 */
export const getEventForDate = (dateString) => {
    // Check specific year date first
    let event = BERLIN_EVENTS.find(e => e.date === dateString);

    // Check recurring 'MM-DD'
    if (!event) {
        const monthDay = dateString.substring(5); // gets 'MM-DD'
        event = BERLIN_EVENTS.find(e => e.date === monthDay);
    }

    return event || null;
};
