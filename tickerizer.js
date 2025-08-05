// Tickerizer JavaScript Implementation
// Port of the Python tickerizer with enhanced fuzzy matching and acronym support

// Cache for cleaned company names (equivalent to Python's @lru_cache)
const cleanNameCache = new Map();
const tickerCache = new Map();

/**
 * Clean company name by removing suffixes and normalizing
 * Equivalent to Python's clean_company_name function
 */
function cleanCompanyName(name) {
    if (!name || name.trim() === '') {
        return null;
    }
    
    // Check cache first
    const cacheKey = name.toLowerCase();
    if (cleanNameCache.has(cacheKey)) {
        return cleanNameCache.get(cacheKey);
    }
    
    let cleanName = name.toLowerCase().trim();
    
    // Remove common corporate suffixes and terms
    const suffixes = [
        /\b(?:ltd\.?|limited|inc\.?|incorporated|corp\.?|corporation|llc|plc|pvt\.?|private)\b/g,
        /\b(?:co\.?|company|group|holding|holdings|industries|international|global)\b/g,
        /\b(?:&|and|amp)\b/g
    ];
    
    for (const suffix of suffixes) {
        cleanName = cleanName.replace(suffix, '');
    }
    
    // Clean up whitespace and special characters
    cleanName = cleanName.replace(/[^\w\s]/g, ' ');
    cleanName = cleanName.replace(/\s+/g, ' ');
    cleanName = cleanName.trim();
    
    // Cache the result
    cleanNameCache.set(cacheKey, cleanName);
    
    return cleanName;
}

/**
 * Fuzzy matching functions - JavaScript implementation of fuzzywuzzy
 */
class FuzzyMatcher {
    static ratio(s1, s2) {
        if (!s1 || !s2) return 0;
        
        const len1 = s1.length;
        const len2 = s2.length;
        
        // Levenshtein distance calculation
        const matrix = Array(len1 + 1).fill(null).map(() => Array(len2 + 1).fill(0));
        
        for (let i = 0; i <= len1; i++) matrix[i][0] = i;
        for (let j = 0; j <= len2; j++) matrix[0][j] = j;
        
        for (let i = 1; i <= len1; i++) {
            for (let j = 1; j <= len2; j++) {
                const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
                matrix[i][j] = Math.min(
                    matrix[i - 1][j] + 1,     // deletion
                    matrix[i][j - 1] + 1,     // insertion
                    matrix[i - 1][j - 1] + cost // substitution
                );
            }
        }
        
        const distance = matrix[len1][len2];
        const maxLen = Math.max(len1, len2);
        return Math.round(((maxLen - distance) / maxLen) * 100);
    }
    
    static partialRatio(s1, s2) {
        if (!s1 || !s2) return 0;
        
        const shorter = s1.length <= s2.length ? s1 : s2;
        const longer = s1.length > s2.length ? s1 : s2;
        
        let bestRatio = 0;
        for (let i = 0; i <= longer.length - shorter.length; i++) {
            const substring = longer.substr(i, shorter.length);
            const ratio = this.ratio(shorter, substring);
            bestRatio = Math.max(bestRatio, ratio);
        }
        
        return bestRatio;
    }
    
    static tokenSortRatio(s1, s2) {
        if (!s1 || !s2) return 0;
        
        const sorted1 = s1.split(/\s+/).sort().join(' ');
        const sorted2 = s2.split(/\s+/).sort().join(' ');
        
        return this.ratio(sorted1, sorted2);
    }
    
    static tokenSetRatio(s1, s2) {
        if (!s1 || !s2) return 0;
        
        const tokens1 = new Set(s1.split(/\s+/));
        const tokens2 = new Set(s2.split(/\s+/));
        
        const intersection = new Set([...tokens1].filter(x => tokens2.has(x)));
        const difference1 = new Set([...tokens1].filter(x => !tokens2.has(x)));
        const difference2 = new Set([...tokens2].filter(x => !tokens1.has(x)));
        
        const sortedIntersection = [...intersection].sort().join(' ');
        const sorted1 = [...difference1].sort().join(' ');
        const sorted2 = [...difference2].sort().join(' ');
        
        const combined1 = (sortedIntersection + ' ' + sorted1).trim();
        const combined2 = (sortedIntersection + ' ' + sorted2).trim();
        
        return this.ratio(combined1, combined2);
    }
}

/**
 * Find ticker for a company name using enhanced fuzzy matching
 * Equivalent to Python's find_ticker function
 */
function findTicker(companyName, tickerDict) {
    if (!companyName || companyName.trim() === '' || 
        companyName.includes('Cash') || companyName.includes('Equity')) {
        console.log(`SKIPPING: ${companyName} (empty/cash/equity)`);
        return '';
    }
    
    const cleanName = cleanCompanyName(companyName);
    if (!cleanName || cleanName.length <= 2) {
        console.log(`SKIPPING: ${companyName} (too short after cleaning)`);
        return '';
    }
    
    console.log(`SEARCHING: ${companyName} -> cleaned: ${cleanName}`);
    
    // Create cache key for this search
    const cacheKey = `${cleanName}:${JSON.stringify(Object.keys(tickerDict).sort())}`;
    if (tickerCache.has(cacheKey)) {
        const cached = tickerCache.get(cacheKey);
        console.log(`CACHED: ${companyName} -> ${cached}`);
        return cached;
    }
    
    const inputWords = cleanName.split(/\s+/);
    
    // Strategy 1: Exact match (fastest)
    for (const [key, ticker] of Object.entries(tickerDict)) {
        if (cleanCompanyName(key) === cleanName) {
            console.log(`EXACT MATCH: ${companyName} -> ${ticker}`);
            tickerCache.set(cacheKey, ticker);
            return ticker;
        }
    }
    
    // Strategy 1.5: Check for direct acronym match as separate word or at start
    if (inputWords.length === 1 && cleanName.length >= 3) {
        for (const [key, ticker] of Object.entries(tickerDict)) {
            const keyUpper = key.toUpperCase();
            const inputUpper = cleanName.toUpperCase();
            if (keyUpper.includes(` ${inputUpper} `) || keyUpper.startsWith(`${inputUpper} `)) {
                console.log(`DIRECT NAME MATCH: ${companyName} -> ${ticker}`);
                tickerCache.set(cacheKey, ticker);
                return ticker;
            }
        }
    }
    
    // Strategy 2: Enhanced fuzzy matching with better abbreviation handling
    let bestMatch = null;
    let bestScore = 0;
    const minThreshold = 70;
    
    for (const [key, ticker] of Object.entries(tickerDict)) {
        const cleanKey = cleanCompanyName(key);
        if (!cleanKey) continue;
        
        const keyWords = cleanKey.split(/\s+/);
        
        // Calculate multiple scoring metrics
        let baseScore = FuzzyMatcher.tokenSortRatio(cleanName, cleanKey);
        let partialScore = FuzzyMatcher.partialRatio(cleanName, cleanKey);
        const tokenSetScore = FuzzyMatcher.tokenSetRatio(cleanName, cleanKey);
        
        // Prevent very short names from getting high partial scores
        if (cleanKey.length <= 4 && partialScore > 80) {
            partialScore = Math.min(partialScore, 60);
        }
        
        let score = Math.max(baseScore, partialScore, tokenSetScore);
        
        // Word-level matching for abbreviations
        let matchedWords = 0;
        let significantMatches = 0;
        const totalInputWords = inputWords.length;
        
        for (const inputWord of inputWords) {
            let wordMatched = false;
            
            // Check for exact word matches
            if (keyWords.includes(inputWord)) {
                matchedWords++;
                wordMatched = true;
                if (inputWord.length > 3) {
                    significantMatches++;
                }
            } else {
                // Check for abbreviation matches
                for (const keyWord of keyWords) {
                    if (inputWord.length >= 3 && keyWord.startsWith(inputWord)) {
                        matchedWords++;
                        wordMatched = true;
                        if (inputWord.length > 3) {
                            significantMatches++;
                        }
                        break;
                    } else if (keyWord.length >= 3 && inputWord.startsWith(keyWord)) {
                        matchedWords++;
                        wordMatched = true;
                        break;
                    }
                }
            }
        }
        
        // Calculate word match percentage
        const wordMatchRatio = totalInputWords > 0 ? matchedWords / totalInputWords : 0;
        const significantWordsCount = inputWords.filter(w => w.length > 3).length;
        const significantMatchRatio = significantWordsCount > 0 ? significantMatches / significantWordsCount : 0;
        
        // Boost score based on word matches
        if (wordMatchRatio >= 0.8 && significantMatchRatio >= 0.5) {
            score += 40;
        } else if (wordMatchRatio >= 0.7) {
            score += 30;
        } else if (wordMatchRatio >= 0.5) {
            score += 15;
        }
        
        // Penalty for poor word matching when we have multiple words
        if (totalInputWords >= 2 && wordMatchRatio < 0.3) {
            score -= 25;
        }
        
        // Penalty for very different lengths
        const lenDiff = Math.abs(cleanName.length - cleanKey.length);
        if (lenDiff > 10) {
            score -= Math.min(20, lenDiff);
        }
        
        // Additional validation: check if first word matches reasonably
        if (inputWords.length > 0 && keyWords.length > 0) {
            const firstWordScore = FuzzyMatcher.ratio(inputWords[0], keyWords[0]);
            if (firstWordScore < 60) {
                score -= 20;
            } else if (firstWordScore >= 90) {
                score += 10;
            }
        }
        
        // Strong boost for company name prefix matches
        if (inputWords.length > 0 && keyWords.length > 0) {
            if (inputWords[0] === keyWords[0]) {
                score += 25;
            } else if (inputWords[0].length >= 3 && keyWords[0].startsWith(inputWords[0])) {
                score += 20;
            } else if (keyWords[0].length >= 3 && inputWords[0].startsWith(keyWords[0])) {
                score += 15;
            }
        }
        
        // Acronym matching
        if (keyWords.length >= 2) {
            // Generate acronym from key words (skip short words)
            const acronym = keyWords
                .filter(word => word.length > 2)
                .map(word => word[0].toUpperCase())
                .join('');
            
            // Check single word input (e.g., "CAMS")
            if (inputWords.length === 1 && inputWords[0].length >= 3) {
                const inputWord = inputWords[0].toUpperCase();
                if (inputWord === acronym) {
                    score += 50;
                    // Ensure perfect acronym matches get a very high minimum score
                    score = Math.max(score, 95);
                } else if (acronym.includes(inputWord) || acronym.startsWith(inputWord)) {
                    score += 30;
                } else {
                    // Penalize matches that don't match the acronym when input is short and likely an acronym
                    if (inputWord.length >= 3 && inputWord.length <= 5) {
                        score -= 15;
                    }
                }
            }
            // Check first word of multi-word input (e.g., "Cams Services")
            else if (inputWords.length >= 2 && inputWords[0].length >= 3) {
                const firstWord = inputWords[0].toUpperCase();
                if (firstWord === acronym) {
                    score += 45;
                } else if (acronym.includes(firstWord) || acronym.startsWith(firstWord)) {
                    score += 25;
                }
            }
        }
        
        if (score > bestScore && score >= minThreshold) {
            bestScore = score;
            bestMatch = key;
        }
    }
    
    if (bestMatch) {
        const result = tickerDict[bestMatch];
        console.log(`FUZZY MATCH: ${companyName} -> ${result} (score: ${bestScore})`);
        tickerCache.set(cacheKey, result);
        return result;
    } else {
        console.log(`NO MATCH: ${companyName}`);
        tickerCache.set(cacheKey, '');
        return '';
    }
}

// Export for both Node.js and browser environments
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        cleanCompanyName,
        findTicker,
        FuzzyMatcher
    };
} else if (typeof window !== 'undefined') {
    window.Tickerizer = {
        cleanCompanyName,
        findTicker,
        FuzzyMatcher
    };
}