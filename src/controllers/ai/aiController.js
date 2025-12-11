import cohereService from '../../services/cohere.service.js';

// POST /api/ai/symptom-checker
export async function checkSymptoms(req, res, next) {
  try {
    const { symptoms } = req.body;

    if (!symptoms || symptoms.trim().length < 10) {
      return res.status(400).json({ 
        error: 'Please provide detailed symptoms (at least 10 characters)' 
      });
    }

    const analysis = await cohereService.analyzeSymptoms(symptoms);

    res.json({
      success: true,
      analysis,
      disclaimer: 'This is AI-generated advice. Please consult a real doctor for accurate diagnosis.'
    });
  } catch (error) {
    next(error);
  }
}

// POST /api/ai/smart-search
export async function smartSearch(req, res, next) {
  try {
    const { query } = req.body;

    if (!query || query.trim().length < 3) {
      return res.status(400).json({ 
        error: 'Search query too short' 
      });
    }

    const searchParams = await cohereService.smartSearch(query);

    res.json({
      success: true,
      searchParams
    });
  } catch (error) {
    next(error);
  }
}