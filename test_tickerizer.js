// Test the JavaScript Tickerizer implementation

// Sample ticker data (subset for testing)
const sampleTickerDict = {
    'Computer Age Management Services Ltd': 'CAMS IN EQUITY',
    'Precision Camshafts Ltd': 'PRECAM IN EQUITY',
    'Aditya Birla Fashion and Retail Ltd': 'ABFRL IN EQUITY',
    'Aditya Birla Capital Ltd': 'ABCAP IN EQUITY',
    'Aditya Birla Real Estate Ltd': 'ABREL IN EQUITY',
    'BLS International Services Ltd': 'BLSIN IN EQUITY',
    'Agarwal Industrial Corp Ltd': 'AGAR IN EQUITY',
    'Apar Industries Ltd': 'APR IN EQUITY',
    'Authum Investment & Infrastructure Ltd': 'AIIL IN EQUITY',
    'LS Industries Ltd': 'LSIL IN EQUITY',
    'Ser Industries Ltd': 'SER IN EQUITY',
    'A-1 Ltd': 'A1L IN EQUITY',
    'Esaar India Ltd': 'ESARI IN EQUITY'
};

// Test cases that were problematic in Python
const testCases = [
    'A B Real Estate',    // Should match ABREL IN EQUITY
    'Cams Services',      // Should match CAMS IN EQUITY  
    'CAMS',              // Should match CAMS IN EQUITY
    'BLS Internat.',     // Should match BLSIN IN EQUITY
    'Aditya Bir. Fas.',  // Should match ABFRL IN EQUITY
    'Aditya Birla Cap',  // Should match ABCAP IN EQUITY
    'Agarwal Indl.',     // Should match AGAR IN EQUITY
    'Apar Inds.',        // Should match APR IN EQUITY
    'Authum Invest'      // Should match AIIL IN EQUITY
];

// Expected results for verification
const expectedResults = {
    'A B Real Estate': 'ABREL IN EQUITY',
    'Cams Services': 'CAMS IN EQUITY',
    'CAMS': 'CAMS IN EQUITY',
    'BLS Internat.': 'BLSIN IN EQUITY',
    'Aditya Bir. Fas.': 'ABFRL IN EQUITY',
    'Aditya Birla Cap': 'ABCAP IN EQUITY',
    'Agarwal Indl.': 'AGAR IN EQUITY',
    'Apar Inds.': 'APR IN EQUITY',
    'Authum Invest': 'AIIL IN EQUITY'
};

// Load the tickerizer module
let Tickerizer;
try {
    Tickerizer = require('./tickerizer.js');
} catch (e) {
    console.error('Error loading tickerizer module:', e.message);
    process.exit(1);
}

console.log('='.repeat(60));
console.log('TESTING JAVASCRIPT TICKERIZER IMPLEMENTATION');
console.log('='.repeat(60));

let passedTests = 0;
let totalTests = testCases.length;

console.log('\nTesting all cases:');
console.log('-'.repeat(60));

for (const testCase of testCases) {
    try {
        const result = Tickerizer.findTicker(testCase, sampleTickerDict);
        const expected = expectedResults[testCase];
        const passed = result === expected;
        
        console.log(`${testCase.padEnd(20)} -> ${result.padEnd(20)} ${passed ? '✅' : '❌'}`);
        
        if (!passed) {
            console.log(`  Expected: ${expected}`);
        }
        
        if (passed) passedTests++;
        
    } catch (error) {
        console.log(`${testCase.padEnd(20)} -> ERROR: ${error.message.padEnd(15)} ❌`);
    }
}

console.log('-'.repeat(60));
console.log(`Results: ${passedTests}/${totalTests} tests passed`);

if (passedTests === totalTests) {
    console.log('🎉 All tests passed! JavaScript implementation is working correctly.');
} else {
    console.log('❌ Some tests failed. Please check the implementation.');
}

// Test fuzzy matching functions directly
console.log('\n' + '='.repeat(60));
console.log('TESTING FUZZY MATCHING FUNCTIONS');
console.log('='.repeat(60));

const testPairs = [
    ['cams', 'computer age management services'],
    ['aditya birla cap', 'aditya birla capital'],
    ['bls internat', 'bls international services']
];

for (const [s1, s2] of testPairs) {
    console.log(`\nTesting: "${s1}" vs "${s2}"`);
    console.log(`  Ratio: ${Tickerizer.FuzzyMatcher.ratio(s1, s2)}`);
    console.log(`  Partial: ${Tickerizer.FuzzyMatcher.partialRatio(s1, s2)}`);
    console.log(`  Token Sort: ${Tickerizer.FuzzyMatcher.tokenSortRatio(s1, s2)}`);
    console.log(`  Token Set: ${Tickerizer.FuzzyMatcher.tokenSetRatio(s1, s2)}`);
}

console.log('\n' + '='.repeat(60));
console.log('Testing complete!');
console.log('='.repeat(60));