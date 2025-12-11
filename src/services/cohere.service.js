import cohere from '../config/cohere.js';

class CohereService {
  // Symptom checker
  async analyzeSymptoms(symptoms) {
    try {
      const prompt = `You are a medical AI assistant. A patient describes these symptoms: "${symptoms}".
      
Provide:
1. Possible conditions (3-5 most likely)
2. Severity level (mild, moderate, severe)
3. Recommended specialties to consult
4. Urgency (routine, urgent, emergency)

Format as JSON:
{
  "conditions": ["condition1", "condition2"],
  "severity": "moderate",
  "specialties": ["General Physician", "Cardiologist"],
  "urgency": "routine",
  "advice": "Brief advice here"
}`;

      const response = await cohere.chat({
        message: prompt,
        model: 'command',
        temperature: 0.3,
      });

      const result = response.text;
      
      // Try to parse JSON from response
      try {
        const jsonMatch = result.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0]);
        }
      } catch (e) {
        // Return raw text if JSON parsing fails
        return {
          conditions: [],
          severity: 'unknown',
          specialties: ['General Physician'],
          urgency: 'routine',
          advice: result
        };
      }

      return result;
    } catch (error) {
      console.error('Cohere API error:', error);
      throw new Error('Failed to analyze symptoms');
    }
  }

  // Smart doctor search
  async smartSearch(query) {
    try {
      const prompt = `A patient searches: "${query}". Extract:
1. Medical specialty needed
2. Condition/symptom keywords
3. Location preference (if mentioned)

Return JSON:
{
  "specialty": "Cardiologist",
  "keywords": ["heart", "chest pain"],
  "location": null
}`;

      const response = await cohere.chat({
        message: prompt,
        model: 'command',
        temperature: 0.3,
      });

      const result = response.text;
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }

      return {
        specialty: null,
        keywords: [query],
        location: null
      };
    } catch (error) {
      console.error('Smart search error:', error);
      return {
        specialty: null,
        keywords: [query],
        location: null
      };
    }
  }
}

export default new CohereService();
