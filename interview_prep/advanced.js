import chalk from "chalk";
import { config } from "dotenv";
import OpenAI from "openai";
import { dirname } from 'path';
import readline from "readline";
import { fileURLToPath } from 'url';

// Configure environment variables
config();

// Get current file path (ES modules equivalent of __dirname)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Topic Analysis Agent
async function analyzeTopicAgent(topic) {
    const prompt = `As a technical topic analyzer for "${topic}", provide a comprehensive analysis:

KEY CONCEPTS
- List the 5 most important concepts in ${topic}
- Rate each concept's difficulty (Basic/Intermediate/Advanced)

PREREQUISITES
- Required knowledge before learning ${topic}
- Related technologies or concepts to understand first

LEARNING PATH
- Beginner fundamentals (What to learn first)
- Intermediate concepts (What to learn next)
- Advanced topics (What to master later)

INDUSTRY RELEVANCE
- Current industry usage and trends
- Popular frameworks/tools related to ${topic}
- Job roles that frequently use ${topic}

Format the response in clear sections with bullet points.`;

    const response = await openai.chat.completions.create({
        model: "gpt-4",
        messages: [{ role: "user", content: prompt }],
    });
    return response.choices[0].message.content;
}

// Hint Provider Agent
async function hintProviderAgent(question, type) {
    const prompt = `As a technical interview hint provider, for this ${type} question:
"${question}"

Provide a structured hint that:
1. Points to the key concept being tested
2. Reminds of any relevant principles or patterns
3. Offers a small example if applicable
4. Suggests a way to approach the answer

Rules:
- Don't give away the answer
- Start with a broader hint, then get more specific
- Include any relevant technical terms
- For MCQs, help eliminate obviously wrong choices
- For theory questions, provide framework for structuring the answer

Format the hint to be clear and concise, using bullet points where appropriate.`;

    const response = await openai.chat.completions.create({
        model: "gpt-4",
        messages: [{ role: "user", content: prompt }],
    });
    return response.choices[0].message.content;
}

// Learning Resource Agent
async function resourceProviderAgent(topic, weakAreas) {
    const prompt = `As a technical learning resource provider for ${topic}, create a personalized learning plan addressing these weak areas: ${weakAreas}

DOCUMENTATION AND TUTORIALS
- Official documentation links
- Best beginner-friendly tutorials
- Recommended video courses
- Interactive learning platforms

PRACTICE RESOURCES
- Coding challenges focused on ${weakAreas}
- Project ideas to reinforce learning
- Practice exercises with increasing difficulty

COMMON PITFALLS
- List typical mistakes in ${weakAreas}
- How to avoid these mistakes
- Best practices to follow

ADVANCED LEARNING
- Advanced tutorials for deeper understanding
- Real-world project examples
- Community resources (forums, Discord servers, etc.)

INTERVIEW PREPARATION
- Specific topics to focus on
- Practice question types
- Mock interview resources

Format the response in clear sections with clickable resources where possible.`;

    const response = await openai.chat.completions.create({
        model: "gpt-4",
        messages: [{ role: "user", content: prompt }],
    });
    return response.choices[0].message.content;
}

// Progress Tracking Agent
class ProgressTrackingAgent {
    constructor() {
        this.correctAnswers = 0;
        this.totalQuestions = 0;
        this.topicPerformance = {};
        this.weakAreas = new Set();
        this.questionHistory = [];
        this.conceptMastery = {};
        this.timeSpent = {};
    }

    trackAnswer(topic, question, isCorrect, evaluation, timeTaken = null) {
        // Track basic metrics
        this.totalQuestions++;
        if (isCorrect) this.correctAnswers++;

        // Initialize topic if not exists
        if (!this.topicPerformance[topic]) {
            this.topicPerformance[topic] = {
                correct: 0,
                total: 0,
                weakAreas: new Set(),
                conceptsTests: {},
                averageTime: 0
            };
        }

        // Update topic statistics
        const topicStats = this.topicPerformance[topic];
        topicStats.total++;
        if (isCorrect) {
            topicStats.correct++;
        }

        // Track time spent if provided
        if (timeTaken) {
            if (!this.timeSpent[topic]) {
                this.timeSpent[topic] = [];
            }
            this.timeSpent[topic].push(timeTaken);
            topicStats.averageTime = this.calculateAverageTime(topic);
        }

        // Extract and track concepts from the question
        const concepts = this.extractConcepts(question);
        concepts.forEach(concept => {
            if (!this.conceptMastery[concept]) {
                this.conceptMastery[concept] = { correct: 0, total: 0 };
            }
            this.conceptMastery[concept].total++;
            if (isCorrect) this.conceptMastery[concept].correct++;

            // Track per-topic concept performance
            if (!topicStats.conceptsTests[concept]) {
                topicStats.conceptsTests[concept] = { correct: 0, total: 0 };
            }
            topicStats.conceptsTests[concept].total++;
            if (isCorrect) topicStats.conceptsTests[concept].correct++;
        });

        // Track question history
        this.questionHistory.push({
            topic,
            question,
            isCorrect,
            evaluation,
            timeTaken,
            concepts,
            timestamp: new Date()
        });

        // Update weak areas if needed
        if (!isCorrect) {
            concepts.forEach(concept => {
                if (this.conceptMastery[concept].correct / this.conceptMastery[concept].total < 0.7) {
                    this.weakAreas.add(concept);
                    topicStats.weakAreas.add(concept);
                }
            });
        }
    }

    getPerformanceReport() {
        const report = {
            overall: {
                correct: this.correctAnswers,
                total: this.totalQuestions,
                percentage: ((this.correctAnswers / this.totalQuestions) * 100).toFixed(2)
            },
            topicWise: {},
            conceptMastery: {},
            weakAreas: Array.from(this.weakAreas),
            timeAnalysis: {},
            recommendedFocus: []
        };

        // Process topic-wise performance
        for (const [topic, stats] of Object.entries(this.topicPerformance)) {
            report.topicWise[topic] = {
                correct: stats.correct,
                total: stats.total,
                percentage: ((stats.correct / stats.total) * 100).toFixed(2),
                weakAreas: Array.from(stats.weakAreas),
                averageTime: stats.averageTime
            };
        }

        // Process concept mastery
        for (const [concept, stats] of Object.entries(this.conceptMastery)) {
            report.conceptMastery[concept] = {
                correct: stats.correct,
                total: stats.total,
                percentage: ((stats.correct / stats.total) * 100).toFixed(2)
            };
        }

        // Generate recommended focus areas
        report.recommendedFocus = this.generateRecommendedFocus();

        return report;
    }

    calculateAverageTime(topic) {
        const times = this.timeSpent[topic];
        return times.length > 0 ? 
            (times.reduce((a, b) => a + b, 0) / times.length).toFixed(2) : 0;
    }

    extractConcepts(question) {
        // Simple concept extraction - could be enhanced with NLP
        const words = question.toLowerCase().split(' ');
        const concepts = new Set();
        
        // Common technical concepts to look for
        const technicalTerms = ['array', 'function', 'class', 'object', 'loop', 'variable', 
                              'recursion', 'inheritance', 'async', 'promise', 'component', 
                              'state', 'props', 'api', 'database', 'algorithm'];
        
        words.forEach(word => {
            if (technicalTerms.includes(word)) {
                concepts.add(word);
            }
        });
        
        return Array.from(concepts);
    }

    generateRecommendedFocus() {
        const recommendations = [];
        
        // Add weak areas with low mastery
        for (const concept of this.weakAreas) {
            const mastery = this.conceptMastery[concept];
            if (mastery && (mastery.correct / mastery.total) < 0.6) {
                recommendations.push({
                    concept,
                    type: 'weak',
                    mastery: ((mastery.correct / mastery.total) * 100).toFixed(2)
                });
            }
        }

        // Add concepts that need practice
        for (const [concept, stats] of Object.entries(this.conceptMastery)) {
            if (!this.weakAreas.has(concept) && (stats.correct / stats.total) < 0.8) {
                recommendations.push({
                    concept,
                    type: 'practice',
                    mastery: ((stats.correct / stats.total) * 100).toFixed(2)
                });
            }
        }

        return recommendations.sort((a, b) => a.mastery - b.mastery);
    }
}

// Feedback Summarizer Agent
async function feedbackSummarizerAgent(performanceReport, topic) {
    const prompt = `Based on this performance report: ${JSON.stringify(performanceReport)}
                   For the topic "${topic}", provide:
                   1. Overall performance analysis
                   2. Specific areas needing improvement
                   3. Actionable recommendations for improvement
                   Make the feedback constructive and motivating.`;

    const response = await openai.chat.completions.create({
        model: "gpt-4",
        messages: [{ role: "user", content: prompt }],
    });
    return response.choices[0].message.content;
}
async function generateQuestions(topic, numQuestions, type) {
    const questionType = type.toLowerCase() === "mcq" ? "multiple-choice" : "theoretical";
    let prompt;
    
    if (questionType === "multiple-choice") {
        prompt = `Generate ${numQuestions} multiple-choice questions about ${topic}. 
                 For each question, provide 4 options (A, B, C, D) and mark the correct answer.
                 Format each question as:
                 Question: [question text]
                 A) [option]
                 B) [option]
                 C) [option]
                 D) [option]
                 Correct: [A/B/C/D]`;
    } else {
        prompt = `Generate ${numQuestions} theoretical questions about ${topic}.
                 Also provide a model answer for each question.
                 Format as:
                 Question: [question text]
                 Model Answer: [detailed answer]`;
    }

    const response = await openai.chat.completions.create({
        model: "gpt-4",
        messages: [{ role: "user", content: prompt }],
    });
    
    // Parse the response based on question type
    const content = response.choices[0].message.content;
    const questions = [];
    
    if (questionType === "multiple-choice") {
        const questionBlocks = content.split(/Question: /).filter(block => block.trim());
        for (const block of questionBlocks) {
            const lines = block.split('\n').filter(line => line.trim());
            const question = lines[0].trim();
            const options = lines.slice(1, 5).map(line => line.trim());
            const correct = lines.find(line => line.startsWith('Correct:'))?.split(':')[1].trim();
            questions.push({ question, options, correct });
        }
    } else {
        const questionBlocks = content.split(/Question: /).filter(block => block.trim());
        for (const block of questionBlocks) {
            const [question, ...answerParts] = block.split('Model Answer:');
            const modelAnswer = answerParts.join('Model Answer:').trim();
            questions.push({ question: question.trim(), modelAnswer });
        }
    }
    
    return questions;
}

// Evaluate Answers Agent
async function evaluateAnswers(question, userAnswer, type, correctAnswer = null) {
    if (!question.trim()) return "No valid question to evaluate.";
    
    let prompt;
    if (type === "mcq") {
        prompt = `Evaluate the following multiple-choice answer:
        Question: ${question}
        User's Answer: ${userAnswer}
        Correct Answer: ${correctAnswer}
        
        If the answer is correct, say "Correct!" and explain why.
        If the answer is wrong, say "Incorrect." and explain why the correct answer is better.`;
    } else {
        prompt = `Evaluate the following theoretical answer:
        Question: ${question}
        User's Answer: ${userAnswer}
        Model Answer: ${correctAnswer}
        
        Provide a score out of 10 and a detailed explanation of the evaluation.`;
    }
    
    const response = await openai.chat.completions.create({
        model: "gpt-4",
        messages: [{ role: "user", content: prompt }],
    });
    return response.choices[0].message.content || "Evaluation not available.";
}

// Function to handle checkbox selection
async function selectQuestionType() {
    const choices = ['MCQ', 'Theory'];
    let selectedIndex = 0;

    // Function to render the choices
    const renderChoices = () => {
        console.clear();
        console.log(chalk.cyan('Select question type (use arrow keys ↑↓, press Enter to select):'));
        choices.forEach((choice, index) => {
            const checkbox = index === selectedIndex ? '[✓]' : '[ ]';
            console.log(chalk.white(`${checkbox} ${choice}`));
        });
    };

    return new Promise((resolve) => {
        renderChoices();

        // Handle key presses
        readline.emitKeypressEvents(process.stdin);
        process.stdin.setRawMode(true);

        process.stdin.on('keypress', (str, key) => {
            if (key.name === 'up' && selectedIndex > 0) {
                selectedIndex--;
                renderChoices();
            } else if (key.name === 'down' && selectedIndex < choices.length - 1) {
                selectedIndex++;
                renderChoices();
            } else if (key.name === 'return') {
                process.stdin.setRawMode(false);
                console.clear();
                resolve(choices[selectedIndex].toLowerCase());
            } else if (key.name === 'c' && key.ctrl) {
                process.exit();
            }
        });
    });
}

// Main interview loop
async function startInterview() {
    try {
        // Get initial inputs
        const topic = await askQuestion(chalk.cyan("Enter interview topic: "));
        const numQuestions = parseInt(await askQuestion(chalk.cyan("Enter number of questions: ")));
        const type = await selectQuestionType();

        if (isNaN(numQuestions) || numQuestions <= 0) {
            console.log(chalk.red("Invalid number of questions."));
            rl.close();
            return;
        }

        // Generate questions
        console.log(chalk.yellow("\nGenerating questions..."));
        const questions = await generateQuestions(topic, numQuestions, type);

        // Process each question
        let score = 0;
        for (let i = 0; i < questions.length; i++) {
            console.log(chalk.cyan(`\n--- Question ${i + 1} ---`));
            
            if (type === "mcq") {
                const { question, options, correct } = questions[i];
                console.log(chalk.white(`\n${question}`));
                options.forEach(opt => console.log(chalk.white(opt)));
                
                const answer = await askQuestion(chalk.yellow("\nYour answer (A/B/C/D or 'skip'): "));
                if (answer.toLowerCase() === "skip") {
                    console.log(chalk.gray("Question skipped."));
                    continue;
                }
                
                const evaluation = await evaluateAnswers(question, answer, type, correct);
                console.log(chalk.green(`\nEvaluation: ${evaluation}`));
                // Check if the answer is correct by looking at the evaluation text
                if (evaluation.startsWith('Correct!')) {
                    score++;
                }
                
            } else {
                const { question, modelAnswer } = questions[i];
                console.log(chalk.white(`\n${question}`));
                
                const answer = await askQuestion(chalk.yellow("\nYour answer (or 'skip'): "));
                if (answer.toLowerCase() === "skip") {
                    console.log(chalk.gray("Question skipped."));
                    continue;
                }
                
                const evaluation = await evaluateAnswers(question, answer, type, modelAnswer);
                console.log(chalk.green(`\nEvaluation: ${evaluation}`));
            }
        }

        // Show final results
        if (type === "mcq") {
            const percentage = (score / questions.filter(q => q.question).length) * 100;
            console.log(chalk.bold.cyan(`\nFinal Results:`));
            console.log(chalk.cyan(`Correct Answers: ${score}`));
            console.log(chalk.cyan(`Total Questions: ${questions.length}`));
            console.log(chalk.cyan(`Score: ${score}/${questions.length}`));
            console.log(chalk.cyan(`Percentage: ${percentage.toFixed(2)}%`));
        }
        
        console.log(chalk.green("\nInterview session completed."));
        rl.close();
        
    } catch (error) {
        console.error(chalk.red("An error occurred:", error));
        rl.close();
    }
}

// Menu Selection Function
async function showMenu() {
    const choices = [
        'Start New Interview Session',
        'Analyze a Topic',
        'View Learning Resources',
        'Check Previous Performance',
        'Practice Specific Concepts',
        'Exit'
    ];
    let selectedIndex = 0;

    // Function to render the menu
    const renderMenu = () => {
        console.clear();
        console.log(chalk.cyan.bold('\n=== Interview Preparation System ===\n'));
        choices.forEach((choice, index) => {
            const marker = index === selectedIndex ? '>' : ' ';
            const choice_text = index === selectedIndex ? chalk.green.bold(choice) : chalk.white(choice);
            console.log(`${marker} ${choice_text}`);
        });
    };

    return new Promise((resolve) => {
        renderMenu();

        // Handle key presses
        readline.emitKeypressEvents(process.stdin);
        process.stdin.setRawMode(true);

        process.stdin.on('keypress', (str, key) => {
            if (key.name === 'up' && selectedIndex > 0) {
                selectedIndex--;
                renderMenu();
            } else if (key.name === 'down' && selectedIndex < choices.length - 1) {
                selectedIndex++;
                renderMenu();
            } else if (key.name === 'return') {
                process.stdin.setRawMode(false);
                console.clear();
                resolve(selectedIndex);
            } else if (key.name === 'c' && key.ctrl) {
                process.exit();
            }
        });
    });
}

// Main Program Flow
async function mainProgram() {
    let running = true;
    const progressAgent = new ProgressTrackingAgent();

    while (running) {
        const choice = await showMenu();

        switch (choice) {
            case 0: // Start New Interview Session
                await startInterview();
                break;

            case 1: // Analyze a Topic
                const topicToAnalyze = await askQuestion(chalk.cyan("Enter the topic you want to analyze: "));
                console.log(chalk.yellow("\nAnalyzing topic..."));
                const analysis = await analyzeTopicAgent(topicToAnalyze);
                console.log(chalk.cyan("\n=== Topic Analysis ==="));
                console.log(chalk.white(analysis));
                await askQuestion(chalk.yellow("\nPress Enter to continue..."));
                break;

            case 2: // View Learning Resources
                const topicForResources = await askQuestion(chalk.cyan("Enter the topic for resources: "));
                const weakAreas = await askQuestion(chalk.cyan("Enter specific areas to focus on (comma-separated): "));
                console.log(chalk.yellow("\nFetching resources..."));
                const resources = await resourceProviderAgent(topicForResources, weakAreas);
                console.log(chalk.cyan("\n=== Learning Resources ==="));
                console.log(chalk.white(resources));
                await askQuestion(chalk.yellow("\nPress Enter to continue..."));
                break;

            case 3: // Check Previous Performance
                const report = progressAgent.getPerformanceReport();
                console.log(chalk.cyan("\n=== Performance Report ==="));
                console.log(chalk.white(JSON.stringify(report, null, 2)));
                await askQuestion(chalk.yellow("\nPress Enter to continue..."));
                break;

            case 4: // Practice Specific Concepts
                const topic = await askQuestion(chalk.cyan("Enter the topic: "));
                const concept = await askQuestion(chalk.cyan("Enter the specific concept: "));
                const numQuestions = parseInt(await askQuestion(chalk.cyan("Number of practice questions: ")));
                
                console.log(chalk.yellow("\nGenerating focused practice questions..."));
                const questions = await generateQuestions(topic, numQuestions, 'mcq');
                
                for (let i = 0; i < questions.length; i++) {
                    console.log(chalk.cyan(`\n=== Practice Question ${i + 1} ===`));
                    const { question, options, correct } = questions[i];
                    
                    console.log(chalk.white(`\n${question}`));
                    options.forEach(opt => console.log(chalk.white(opt)));
                    
                    const wantHint = await askQuestion(chalk.yellow("\nWould you like a hint? (y/n): "));
                    if (wantHint.toLowerCase() === 'y') {
                        const hint = await hintProviderAgent(question, 'mcq');
                        console.log(chalk.blue("\nHint:", hint));
                    }
                    
                    const answer = await askQuestion(chalk.yellow("\nYour answer (A/B/C/D): "));
                    const evaluation = await evaluateAnswers(question, answer, 'mcq', correct);
                    console.log(chalk.green(`\nEvaluation: ${evaluation}`));
                }
                
                await askQuestion(chalk.yellow("\nPress Enter to continue..."));
                break;

            case 5: // Exit
                console.log(chalk.green("\nThank you for using the Interview Preparation System!"));
                running = false;
                rl.close();
                break;
        }
    }
}

// Helper function to promisify readline.question
function askQuestion(query) {
    return new Promise(resolve => rl.question(query, resolve));
}

// Start the program
mainProgram();