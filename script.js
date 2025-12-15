// ========================================
// Initialization
// ========================================

function initializeApp() {
    console.log('🚀 Initializing C Pyramid Grader...');

    // בדיקה ש-JSCPP נטען מה-CDN
    if (typeof JSCPP === 'undefined') {
        console.error('❌ JSCPP not loaded yet');
        // ננסה שוב אחרי חצי שנייה (אולי ה-CDN עדיין נטען)
        setTimeout(initializeApp, 500);
        return;
    }

    console.log('✅ JSCPP library detected');

    const runButton = document.getElementById('runTests');
    if (runButton) {
        runButton.addEventListener('click', handleRunTests);
        console.log('✅ Event listener attached to button');
    } else {
        console.error('❌ Button not found!');
    }

    console.log('✅ System ready');
}

// הפעלה כש ה-DOM מוכן
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
}

// ========================================
// Main Test Runner
// ========================================

async function handleRunTests() {
    const codeEditor = document.getElementById('codeEditor');
    const studentCode = codeEditor.value.trim();

    if (!studentCode) {
        alert('אנא הדבק קוד C לפני הרצת הבדיקות');
        return;
    }

    // בדיקה שהספרייה נטענה
    if (typeof JSCPP === 'undefined') {
        alert('שגיאה: מערכת ההרצה לא נטענה כראוי. אנא רענן את הדף ונסה שוב.\n\nודא שיש לך חיבור לאינטרנט (JSCPP נטען מ-CDN).');
        console.error('JSCPP not loaded. JSCPP:', typeof JSCPP);
        return;
    }

    setUIRunning(true);
    clearPreviousResults();

    try {
        const testCases = generateTestCases();
        const testResults = await runAllTests(studentCode, testCases);

        const score = calculateScore(testResults, studentCode);
        const feedback = generateFeedback(testResults, score);

        displayResults(testResults, score, feedback);
    } catch (error) {
        console.error('Error during testing:', error);
        displayError('שגיאה כללית בזמן הרצת הבדיקות: ' + (error.message || error));
    } finally {
        setUIRunning(false);
    }
}

// ========================================
// C Program Execution (באמצעות JSCPP)
// ========================================

async function runCProgram(cSource, input) {
    return new Promise((resolve) => {
        let stdout = '';
        let stderr = '';

        try {
            // JSCPP.run הוא סינכרוני, אבל אנחנו עוטפים אותו ב-Promise
            const exitCode = JSCPP.run(cSource, input, {
                stdio: {
                    write: (s) => {
                        stdout += s;
                    }
                },
                maxTimeout: 3000 // מילישניות – הגנה מלולאות אינסופיות
            });

            resolve({
                compiled: true,
                compileOutput: 'Compilation/execution successful (exit code ' + exitCode + ')',
                stdout: stdout,
                stderr: stderr
            });

        } catch (error) {
            const errorMsg = (error && error.message) ? error.message : String(error);
            console.error('❌ JSCPP error:', errorMsg);

            resolve({
                compiled: false,
                compileOutput: errorMsg,
                stdout: stdout,
                stderr: errorMsg
            });
        }
    });
}

// ========================================
// Test Case Generation
// ========================================

function generateTestCases() {
    return [
        {
            name: 'Test 1: n=1',
            input: '1\n',
            n: 1,
            expectedPyramid: ['*'],
            points: 10
        },
        {
            name: 'Test 2: n=4',
            input: '4\n',
            n: 4,
            expectedPyramid: [
                '   *',
                '  * *',
                ' * * *',
                '* * * *'
            ],
            points: 20
        },
        {
            name: 'Test 3: n=5',
            input: '5\n',
            n: 5,
            expectedPyramid: [
                '    *',
                '   * *',
                '  * * *',
                ' * * * *',
                '* * * * *'
            ],
            points: 20
        },
        {
            name: 'Test 4: קלט לא תקין ואז 4',
            input: '0\n4\n',
            n: 4,
            expectedPyramid: [
                '   *',
                '  * *',
                ' * * *',
                '* * * *'
            ],
            points: 10,
            isValidationTest: true
        },
        {
            name: 'Test 5: קלט שלילי ואז 3',
            input: '-2\n3\n',
            n: 3,
            expectedPyramid: [
                '  *',
                ' * *',
                '* * *'
            ],
            points: 10,
            isValidationTest: true
        },
        {
            name: 'Test 6: מספר קלטים לא תקינים',
            input: '0\n-5\n0\n4\n',
            n: 4,
            expectedPyramid: [
                '   *',
                '  * *',
                ' * * *',
                '* * * *'
            ],
            points: 5,
            isValidationTest: true
        }
    ];
}

// ========================================
// Run All Tests
// ========================================

async function runAllTests(studentCode, testCases) {
    const results = [];

    for (const testCase of testCases) {
        console.log(`Running: ${testCase.name}`);

        const result = await runCProgram(studentCode, testCase.input);

        if (!result.compiled) {
            // כישלון קומפילציה – עוצרים הכל
            results.push({
                ...testCase,
                passed: false,
                actualLines: [],
                notes: result.compileOutput || 'הקוד לא הצליח להתקמפל',
                compilationFailed: true
            });
            break;
        }

        const actualPyramid = extractPyramidLines(result.stdout);
        const comparisonResult = comparePyramids(testCase.expectedPyramid, actualPyramid, testCase.n);

        results.push({
            ...testCase,
            passed: comparisonResult.passed,
            actualLines: actualPyramid,
            notes: comparisonResult.notes
        });
    }

    return results;
}

// ========================================
// Output Normalization
// ========================================

function extractPyramidLines(stdout) {
    if (!stdout) return [];

    const lines = stdout.split('\n');
    const pyramidLines = [];

    for (let rawLine of lines) {
        if (!rawLine) continue;

        // איחוד פורמט – החלפת טאבים ברווחים
        let line = rawLine.replace(/\r/g, '').replace(/\t/g, ' ');

        // רק שורות שמכילות כוכביות בכלל
        if (!line.includes('*')) continue;

        const trimmed = line.trim();
        if (!trimmed) continue;

        // שורה של פירמידה אמורה להכיל רק כוכביות ורווחים
        if (!/^[* ]+$/.test(trimmed)) continue;

        // הסרה של רווחים מסוף השורה
        line = line.replace(/\s+$/, '');

        pyramidLines.push(line);
    }

    return pyramidLines;
}

function comparePyramids(expected, actual, n) {
    if (actual.length !== expected.length) {
        return {
            passed: false,
            notes: `מספר שורות שגוי: צפוי ${expected.length}, התקבל ${actual.length}`
        };
    }

    for (let i = 0; i < expected.length; i++) {
        const expectedLine = expected[i];
        const actualLine = actual[i];

        const expectedLeading = expectedLine.match(/^ */)[0].length;
        const actualLeading = actualLine.match(/^ */)[0].length;

        const expectedStars = expectedLine.trim();
        const actualStars = actualLine.trim();

        if (expectedLeading !== actualLeading) {
            return {
                passed: false,
                notes: `שורה ${i + 1}: מספר רווחים מובילים שגוי (צפוי ${expectedLeading}, התקבל ${actualLeading})`
            };
        }

        if (expectedStars !== actualStars) {
            const normalizedExpected = expectedStars.replace(/\s+/g, ' ');
            const normalizedActual = actualStars.replace(/\s+/g, ' ');

            if (normalizedExpected !== normalizedActual) {
                return {
                    passed: false,
                    notes: `שורה ${i + 1}: תוכן שגוי של הכוכביות`
                };
            }
        }

        const expectedStarCount = expectedStars.split('*').length - 1;
        const actualStarCount = actualStars.split('*').length - 1;

        if (expectedStarCount !== actualStarCount) {
            return {
                passed: false,
                notes: `שורה ${i + 1}: מספר כוכביות שגוי (צפוי ${expectedStarCount}, התקבל ${actualStarCount})`
            };
        }
    }

    return {
        passed: true,
        notes: 'עבר בהצלחה ✓'
    };
}

// ========================================
// Scoring
// ========================================

function calculateScore(testResults, codeSource) {
    let score = 0;

    if (testResults.length > 0 && testResults[0].compilationFailed) {
        return 0;
    }

    const totalPoints = testResults.reduce((sum, test) => sum + (test.points || 0), 0);
    const earnedPoints = testResults.reduce((sum, test) => {
        return sum + (test.passed ? (test.points || 0) : 0);
    }, 0);

    // 70% פונקציונליות (כל הבדיקות)
    const functionalScore = totalPoints > 0 ? (earnedPoints / totalPoints) * 70 : 0;
    score += functionalScore;

    // 20% – מעבר על בדיקות תקינות (קלטים שגויים)
    const validationTests = testResults.filter(t => t.isValidationTest);
    const passedValidation = validationTests.filter(t => t.passed).length;
    const validationScore = validationTests.length > 0
        ? (passedValidation / validationTests.length) * 20
        : 0;
    score += validationScore;

    // 10% – איכות קוד
    let qualityScore = 10;

    const hasLoop = /\b(for|while|do)\b/.test(codeSource);
    if (!hasLoop) {
        qualityScore -= 5;
    }

    // ניסיון לזהות "הקשחה" עם שורות מודפסות מוכנות של כוכביות
    const hasHardcoded =
        /"[^"\n]*\*[^"\n]*\*[^"\n]*"/.test(codeSource) ||
        /'[^'\n]*\*[^'\n]*\*[^'\n]*'/.test(codeSource);

    if (hasHardcoded) {
        qualityScore -= 5;
    }

    score += qualityScore;

    return Math.round(Math.max(0, Math.min(100, score)));
}

// ========================================
// Feedback Generation
// ========================================

function generateFeedback(testResults, score) {
    if (testResults.length > 0 && testResults[0].compilationFailed) {
        return 'הקוד לא מתקמפל. אנא תקן את שגיאות הקומפילציה ונסה שוב.';
    }

    if (score === 100) {
        return 'מצוין! הפתרון שלך מושלם! כל הבדיקות עברו בהצלחה. 🎉';
    }

    let feedback = [];

    const hasAlignmentIssue = testResults.some(t =>
        !t.passed && t.notes && t.notes.includes('רווחים מובילים')
    );
    if (hasAlignmentIssue) {
        feedback.push('יש בעיות במספר הרווחים המובילים (יישור הפירמידה).');
    }

    const hasStarIssue = testResults.some(t =>
        !t.passed && t.notes && t.notes.includes('כוכביות')
    );
    if (hasStarIssue) {
        feedback.push('יש בעיות במספר או במיקום הכוכביות בכל שורה.');
    }

    const validationTests = testResults.filter(t => t.isValidationTest);
    const failedValidation = validationTests.some(t => !t.passed);
    if (failedValidation) {
        feedback.push('נראה שהתוכנית לא מטפלת בצורה מלאה בקלטים שאינם חיוביים (0 או שליליים). ודא שאתה חוזר לבקש מספר עד לקלט חיובי.');
    }

    if (feedback.length === 0) {
        if (score >= 80) {
            return 'עבודה טובה! יש כמה בעיות קטנות לתקן – בדוק את פירוט מקרי הבדיקה.';
        } else if (score >= 60) {
            return 'יש התקדמות יפה, אבל חלק מהבדיקות נכשלו. מומלץ לבדוק את יישור הפירמידה ומספר הכוכביות בכל שורה.';
        } else {
            return 'הקוד זקוק לעבודה נוספת. בדוק את לוגיקת הלולאה, הטיפול בקלטים לא תקינים והמבנה של הפירמידה.';
        }
    }

    return feedback.join(' ');
}

// ========================================
// UI Functions
// ========================================

function setUIRunning(isRunning) {
    const runButton = document.getElementById('runTests');
    const loadingIndicator = document.getElementById('loadingIndicator');

    runButton.disabled = isRunning;
    loadingIndicator.classList.toggle('hidden', !isRunning);
}

function clearPreviousResults() {
    const resultsSection = document.getElementById('resultsSection');
    resultsSection.classList.add('hidden');

    document.getElementById('compilationOutput').textContent = '';
    document.getElementById('testResultsBody').innerHTML = '';
}

function displayResults(testResults, score, feedback) {
    const resultsSection = document.getElementById('resultsSection');
    resultsSection.classList.remove('hidden');

    const compilationOutput = document.getElementById('compilationOutput');
    if (testResults.length > 0 && testResults[0].compilationFailed) {
        compilationOutput.textContent = testResults[0].notes;
        compilationOutput.style.color = '#f44336';
    } else {
        compilationOutput.textContent = '✅ הקוד התקמפל והורץ בהצלחה';
        compilationOutput.style.color = '#4CAF50';
    }

    const scoreValue = document.getElementById('scoreValue');
    const scoreCircle = scoreValue.parentElement;
    const scoreFeedback = document.getElementById('scoreFeedback');

    scoreValue.textContent = score;
    scoreFeedback.textContent = feedback;

    scoreCircle.classList.remove('excellent', 'good', 'poor');
    scoreFeedback.classList.remove('excellent', 'good', 'poor');

    if (score >= 85) {
        scoreCircle.classList.add('excellent');
        scoreFeedback.classList.add('excellent');
    } else if (score >= 60) {
        scoreCircle.classList.add('good');
        scoreFeedback.classList.add('good');
    } else {
        scoreCircle.classList.add('poor');
        scoreFeedback.classList.add('poor');
    }

    const tbody = document.getElementById('testResultsBody');
    tbody.innerHTML = '';

    testResults.forEach((test, index) => {
        const row = document.createElement('tr');

        const statusIcon = test.passed ? '✓' : '✗';
        const statusClass = test.passed ? 'pass' : 'fail';
        const inputDisplay = test.input.replace(/\n/g, '\\n');

        row.innerHTML = `
            <td>${index + 1}</td>
            <td>${test.name}</td>
            <td><code class="test-input">${inputDisplay}</code></td>
            <td><span class="test-status ${statusClass}">${statusIcon}</span></td>
            <td class="test-notes">${test.notes}</td>
        `;

        tbody.appendChild(row);
    });

    // גלילה אוטומטית לתוצאות
    setTimeout(() => {
        resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
}

function displayError(errorMessage) {
    const resultsSection = document.getElementById('resultsSection');
    resultsSection.classList.remove('hidden');

    const compilationOutput = document.getElementById('compilationOutput');
    compilationOutput.textContent = errorMessage;
    compilationOutput.style.color = '#f44336';

    document.getElementById('scoreValue').textContent = '0';
    document.getElementById('scoreFeedback').textContent = 'אירעה שגיאה בזמן הבדיקה.';

    // גלילה אוטומטית לתוצאות
    setTimeout(() => {
        resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
}

// ========================================
// Welcome Modal Logic – הצגה בכל ריענון
// ========================================

document.addEventListener('DOMContentLoaded', function () {
    const modal = document.getElementById('welcomeModal');
    const btn = document.getElementById('enterAppButton');

    if (!modal || !btn) return;

    // ודא שהמודל מוצג כברירת מחדל בכל טעינה
    modal.classList.remove('hidden-modal');

    btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();

        // סגירת המודל (בטעינה הבאה שוב יופיע)
        modal.classList.add('hidden-modal');
    });
});
