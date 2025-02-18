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

// Generate Interview Questions Agent
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

// Helper function to promisify readline.question
function askQuestion(query) {
    return new Promise(resolve => rl.question(query, resolve));
}

// Start the program
startInterview();