require('dotenv').config();
const express = require('express');
const cors = require('cors');
const ttsRouter = require('./elevenlabs/tts');
const supabase = require('./services/supabase');
const jwt = require('jsonwebtoken');
const geminiService = require('./services/geminiService');

const app = express();

const allowedOrigins = [
  'http://localhost:5173',
  'https://foresightt-iwivrbui9-cmehul96s-projects.vercel.app', // <-- Updated to your actual Vercel domain
  'https://foresightt-656hwc2kb-cmehul96s-projects.vercel.app', // new deployment
];

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
}));
app.use(express.json());

app.use('/api', ttsRouter);

// Helper to get user id from JWT
function getUserIdFromAuthHeader(req) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return null;
  const token = auth.split(' ')[1];
  try {
    // Supabase JWTs are signed with the service key, so we can decode
    const payload = jwt.decode(token);
    return payload?.sub || null;
  } catch {
    return null;
  }
}

app.post('/api/projects', async (req, res) => {
  const userId = getUserIdFromAuthHeader(req);
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const { companyName, researchGoal, status, questions, companyAnalysis, report } = req.body;
  if (!companyName || !researchGoal) {
    return res.status(400).json({ error: 'companyName and researchGoal are required' });
  }
  const { data, error } = await supabase
    .from('projects')
    .insert([
      {
        user_id: userId,
        company_name: companyName,
        research_goal: researchGoal,
        status: status || 'Draft',
        questions: questions || [],
        company_analysis: companyAnalysis || null,
        report: report || null,
      },
    ])
    .select()
    .single();
  if (error) {
    return res.status(500).json({ error: error.message });
  }
  res.status(201).json({ project: data });
});

app.post('/api/profiles', async (req, res) => {
  const userId = getUserIdFromAuthHeader(req);
  const { email } = req.body;
  if (!userId || !email) {
    return res.status(400).json({ error: 'Missing user id or email' });
  }
  const { data, error } = await supabase
    .from('profiles')
    .upsert([
      { id: userId, email },
    ], { onConflict: ['id'] })
    .select()
    .single();
  if (error) {
    return res.status(500).json({ error: error.message });
  }
  res.status(200).json({ profile: data });
});

app.post('/api/ai/analyze-company', async (req, res) => {
  const userId = getUserIdFromAuthHeader(req);
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const { companyName } = req.body;
  if (!companyName) {
    return res.status(400).json({ error: 'companyName is required' });
  }
  try {
    const analysis = await geminiService.analyzeCompany(companyName);
    res.status(200).json({ analysis });
  } catch (err) {
    console.error('Gemini analyze-company error:', err);
    res.status(500).json({ error: 'Gemini analysis failed', details: err.message });
  }
});

app.post('/api/ai/generate-questions', async (req, res) => {
  const userId = getUserIdFromAuthHeader(req);
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const { companyName, researchGoal, companyAnalysis } = req.body;
  if (!companyName || !researchGoal || !companyAnalysis) {
    return res.status(400).json({ error: 'companyName, researchGoal, and companyAnalysis are required' });
  }
  try {
    const questions = await geminiService.generateInitialQuestions(companyName, researchGoal, companyAnalysis);
    res.status(200).json({ questions });
  } catch (err) {
    console.error('Gemini generate-questions error:', err);
    res.status(500).json({ error: 'Gemini question generation failed', details: err.message });
  }
});

app.post('/api/ai/generate-mc-options', async (req, res) => {
  // For now, allow public access (can add auth later)
  const { questionText, researchGoal } = req.body;
  if (!questionText || !researchGoal) {
    return res.status(400).json({ error: 'questionText and researchGoal are required' });
  }
  try {
    const options = await geminiService.generateMultipleChoiceOptions(questionText, researchGoal);
    res.status(200).json({ options });
  } catch (err) {
    console.error('Gemini generate-mc-options error:', err);
    res.status(500).json({ error: 'Gemini MC option generation failed', details: err.message });
  }
});

app.post('/api/ai/generate-followup', async (req, res) => {
  const { originalQuestion, userAnswer, language } = req.body;
  if (!originalQuestion || !userAnswer || !language) {
    return res.status(400).json({ error: 'originalQuestion, userAnswer, and language are required' });
  }
  try {
    const result = await geminiService.generateFollowUpQuestion(originalQuestion, userAnswer, language);
    res.status(200).json(result);
  } catch (err) {
    console.error('Gemini generate-followup error:', err);
    res.status(500).json({ error: 'Gemini follow-up generation failed', details: err.message });
  }
});

app.post('/api/ai/generate-project-report', async (req, res) => {
  const userId = getUserIdFromAuthHeader(req);
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const { responses, researchGoal } = req.body;
  if (!responses || !researchGoal) {
    return res.status(400).json({ error: 'responses and researchGoal are required' });
  }
  try {
    const report = await geminiService.generateProjectReport(responses, researchGoal);
    res.status(200).json({ report });
  } catch (err) {
    console.error('Gemini generate-project-report error:', err);
    res.status(500).json({ error: 'Gemini report generation failed', details: err.message });
  }
});

app.post('/api/projects/:id/response', async (req, res) => {
  const userId = getUserIdFromAuthHeader(req);
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const projectId = req.params.id;
  const { response } = req.body;
  if (!response) {
    return res.status(400).json({ error: 'Missing response' });
  }

  // Fetch current responses
  const { data: project, error: fetchError } = await supabase
    .from('projects')
    .select('responses')
    .eq('id', projectId)
    .single();

  if (fetchError || !project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  const updatedResponses = [...(project.responses || []), response];

  const { error: updateError } = await supabase
    .from('projects')
    .update({ responses: updatedResponses })
    .eq('id', projectId);

  if (updateError) {
    return res.status(500).json({ error: updateError.message });
  }

  res.status(200).json({ success: true });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);
});
