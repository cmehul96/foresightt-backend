const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
    console.warn('GEMINI_API_KEY not set. Gemini API calls will fail.');
}

const ai = new GoogleGenerativeAI(apiKey);
const model = ai.getGenerativeModel({ model: 'gemini-2.5-flash-preview-04-17' });

const parseJsonResponse = (text) => {
    let jsonStr = text.replace(/^```[a-zA-Z]*\s*|```$/gm, '').trim();
    const firstBrace = jsonStr.indexOf('{');
    const firstBracket = jsonStr.indexOf('[');
    if (firstBrace === -1 && firstBracket === -1) return null;
    const isArray = firstBracket !== -1 && (firstBrace === -1 || firstBracket < firstBrace);
    const startIndex = isArray ? firstBracket : firstBrace;
    const endIndex = isArray ? jsonStr.lastIndexOf(']') : jsonStr.lastIndexOf('}');
    if (endIndex === -1 || endIndex < startIndex) return null;
    jsonStr = jsonStr.substring(startIndex, endIndex + 1);
    try {
        return JSON.parse(jsonStr);
    } catch {
        return null;
    }
};

async function analyzeCompany(companyName) {
    const prompt = `You are a concise business analyst. Analyze the company provided.\nCompany Name: "${companyName}"\nUse Google Search to find up-to-date information.\nProvide your analysis in a valid JSON object format. The JSON object must have the following structure and nothing else:\n{\n  "category": "The primary industry or category the company operates in.",\n  "domain": "The main website domain of the company.",\n  "summary": "A brief one or two-sentence summary of what the company does.",\n  "competitors": ["A list of 3-5 main competitors."]\n}`;
    const response = await model.generateContent(prompt);
    return parseJsonResponse(response.response.text());
}

async function generateInitialQuestions(companyName, researchGoal, companyAnalysis) {
    const prompt = `You are a world-class user researcher. Your task is to generate a structured questionnaire.\nUse the following context to create highly relevant questions:\n- Company Name: "${companyName}"\n- Company Details: ${JSON.stringify(companyAnalysis)}\n- Primary Research Goal: "${researchGoal}"\nBased on ALL the context above, generate a diverse questionnaire with 5-7 questions (a mix of 'open-text', 'multiple-choice', and 'rating-scale' from 1 to 5).\nEach question must be short, clear, and concise (ideally under 15 words). Do not include extra context, explanations, or multi-part questions. Only ask what is essential.\nFor each option, also provide a relevant Material icon name (e.g., 'attach_money', 'store', 'star', etc.) in an 'icon' field. The icon should match the meaning of the option as closely as possible. The options array should be an array of objects: { label: string, icon: string }.\nIMPORTANT: Your response MUST be a valid JSON array of objects, and NOTHING else.\nDo NOT wrap it in markdown or add any commentary.\nOnly output the raw JSON array.\nEach object in the array must have this exact structure:\n{\n  "id": "A unique string identifier",\n  "text": "The full question text",\n  "type": "one of 'open-text', 'multiple-choice', or 'rating-scale'",\n  "options": [\n    { "label": "Option text", "icon": "material_icon_name" },\n    ...\n  ]\n}\n- For 'multiple-choice' questions, you MUST populate the 'options' array with 3-5 relevant and distinct choices, each with an appropriate icon. This is not optional.\n- For 'rating-scale', populate 'options' with exactly [\n  { "label": "1", "icon": "star_border" },\n  { "label": "2", "icon": "star_border" },\n  { "label": "3", "icon": "star_border" },\n  { "label": "4", "icon": "star_border" },\n  { "label": "5", "icon": "star" }\n].\n- For 'open-text', 'options' MUST be an empty array [].`;
    const response = await model.generateContent(prompt);
    return parseJsonResponse(response.response.text());
}

async function generateMultipleChoiceOptions(questionText, researchGoal) {
    const prompt = `You are a user research expert. Based on the provided research goal and a specific question, generate 3 to 5 relevant and distinct multiple-choice options.\n- Research Goal: "${researchGoal}"\n- Question: "${questionText}"\nIMPORTANT: Your response MUST be a valid JSON array of objects, and NOTHING else. Each object must have this structure: { "label": string, "icon": string }. The icon should be a relevant Material icon name (e.g., 'check_box', 'store', etc.).\nExample response: [ { "label": "Option A", "icon": "check_box" }, { "label": "Option B", "icon": "store" } ]`;
    const response = await model.generateContent(prompt);
    return parseJsonResponse(response.response.text());
}

async function generateFollowUpQuestion(originalQuestion, userAnswer, language) {
    const prompt = `You are a world-class user researcher. Given the following question and user answer, generate a single, concise follow-up question (under 15 words) and 2-4 relevant options (each with a Material icon name).\n\nOriginal Question: "${originalQuestion}"\nUser Answer: "${userAnswer}"\nLanguage: ${language}\n\nRespond with a JSON object:\n{\n  "followUp": "The follow-up question text",\n  "options": [ { "label": "Option text", "icon": "material_icon_name" }, ... ]\n}`;
    const response = await model.generateContent(prompt);
    return parseJsonResponse(response.response.text());
}

async function generateProjectReport(responses, researchGoal) {
    const prompt = `You are a world-class research analyst. Given the following research goal and a set of interview responses, generate a detailed research report.\n\nResearch Goal: "${researchGoal}"\n\nResponses: ${JSON.stringify(responses)}\n\nYour report must be a valid JSON object with this exact structure and nothing else:\n{\n  "title": string,\n  "executiveSummary": string,\n  "keyThemes": [ { "theme": string, "percentage": number, "description": string } ],\n  "detailedAnalysis": string,\n  "actionableInsights": string[],\n  "notableQuotes": [ { "quote": string, "context"?: string } ]\n}\n\nDo not include any commentary or markdown. Only output the raw JSON object.`;
    const response = await model.generateContent(prompt);
    return parseJsonResponse(await response.response.text());
}

module.exports = {
    analyzeCompany,
    generateInitialQuestions,
    generateMultipleChoiceOptions,
    generateFollowUpQuestion,
    generateProjectReport,
}; 