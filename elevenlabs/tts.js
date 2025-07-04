const express = require('express');
const axios = require('axios');
const router = express.Router();
require('dotenv').config();

const ELEVEN_LABS_API_KEY = process.env.ELEVEN_LABS_API_KEY;
const ELEVEN_LABS_VOICE_ID = process.env.ELEVEN_LABS_VOICE_ID || 'Rachel'; // Default voice

router.post('/tts', async (req, res) => {
  const { text } = req.body;
  if (!text) {
    return res.status(400).json({ error: 'Text is required' });
  }
  try {
    const response = await axios({
      method: 'post',
      url: `https://api.elevenlabs.io/v1/text-to-speech/${ELEVEN_LABS_VOICE_ID}`,
      headers: {
        'xi-api-key': ELEVEN_LABS_API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg',
      },
      data: {
        text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.5, similarity_boost: 0.8 },
      },
      responseType: 'stream',
    });
    res.set({ 'Content-Type': 'audio/mpeg' });
    response.data.pipe(res);
  } catch (err) {
    console.error('TTS error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to synthesize speech' });
  }
});

module.exports = router;
