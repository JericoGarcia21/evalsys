const AI_SYSTEM_PROMPT = `You are an expert education rubric designer. Given a rubric description (pasted text or extracted from a document), generate a structured grading rubric.

Output requirements:
- Return ONLY valid JSON (no markdown fences, no extra text before or after).
- The JSON object must have: title, instructions, and criteria array.
- Each criterion needs: label, section, description, maxScore, scoringMode ("range"), and levels array.
- Each criterion must have exactly 4 levels: Excellent, Good, Fair, Poor.
- Each level needs: label, minScore, maxScore, description.
- Level ranges must not overlap and must stay within 0 to maxScore.
- All scores must be valid numbers.`;

/**
 * Strip markdown fences and extract the outermost JSON object from an AI response string.
 * Returns a parsed JS object (not a string).
 */
const extractAndParseJson = (text) => {
  // Strip markdown fences if present
  let cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();

  // Find the outermost JSON object
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) throw new Error('No JSON object found in AI response');

  let jsonText = cleaned.slice(start, end + 1);

  // Try parsing; if it fails, attempt to fix common issues (trailing commas)
  try {
    return JSON.parse(jsonText);
  } catch (firstErr) {
    let fixed = jsonText;
    let previous = '';
    while (fixed !== previous) {
      previous = fixed;
      fixed = fixed
        .replace(/,\s*}/g, '}')
        .replace(/,\s*\]/g, ']');
    }
    try {
      return JSON.parse(fixed);
    } catch {
      throw new Error('Invalid JSON from AI: ' + firstErr.message);
    }
  }
};

const normalizeResult = (parsed) => {
  // Handle different JSON shapes: { criteria: [...] } or { rubric: { criteria: [...] } }
  let criteriaArray = parsed.criteria;
  if (!criteriaArray && parsed.rubric && Array.isArray(parsed.rubric.criteria)) {
    criteriaArray = parsed.rubric.criteria;
  }
  if (!criteriaArray || !Array.isArray(criteriaArray) || criteriaArray.length === 0) {
    throw new Error('AI response missing criteria array');
  }

  const normalizedCriteria = criteriaArray.map((c) => ({
    label: String(c.label || c.name || 'Criterion').trim(),
    section: String(c.section || 'General').trim(),
    description: String(c.description || '').trim(),
    maxScore: Number(c.maxScore || c.points || 0) || 0,
    scoringMode: c.scoringMode === 'percentage' ? 'percentage' : 'range',
    key: String(c.key || '').trim() || '',
    levels: (c.levels || []).map((l) => ({
      label: String(l.label || l.name || 'Level').trim(),
      minScore: Number(l.minScore || l.min_score || 0) || 0,
      maxScore: Number(l.maxScore || l.max_score || 0) || 0,
      description: String(l.description || '').trim(),
    })),
  }));

  return {
    title: String(parsed.title || parsed.rubric?.title || 'AI-Generated Rubric').trim(),
    instructions: String(parsed.instructions || '').trim(),
    criteria: normalizedCriteria,
  };
};

const callGroq = async (inputText) => {
  const apiKey = process.env.GROQ_API_KEY || '';
  if (!apiKey) throw new Error('GROQ_API_KEY not configured');

  const model = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: AI_SYSTEM_PROMPT },
        { role: 'user', content: `Rubric source text:\n\n${inputText}` },
      ],
      temperature: 0.4,
      max_tokens: 4096,
    }),
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => '');
    throw new Error(`Groq API error (${res.status}): ${errorText}`);
  }

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || '';
  if (!text) throw new Error('Groq returned empty response');

  // extractAndParseJson already returns a parsed object — do NOT JSON.parse again
  const parsed = extractAndParseJson(text);
  return normalizeResult(parsed);
};

const callGemini = async (inputText) => {
  const apiKey = process.env.GEMINI_API_KEY || '';
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured');

  // gemini-1.5-flash and newer models require the v1beta endpoint
  const model = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [
            { text: AI_SYSTEM_PROMPT },
            { text: `Rubric source text:\n\n${inputText}` },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 4096,
      },
    }),
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => '');
    throw new Error(`Gemini API error (${res.status}): ${errorText}`);
  }

  const data = await res.json();
  const candidates = data.candidates || [];
  if (!candidates.length) throw new Error('No content generated by AI');

  const text = candidates[0].content?.parts?.[0]?.text || '';
  if (!text) throw new Error('Gemini returned empty response');

  const textString = typeof text === 'string' ? text : JSON.stringify(text);
  // extractAndParseJson already returns a parsed object — do NOT JSON.parse again
  const parsed = extractAndParseJson(textString);
  return normalizeResult(parsed);
};

exports.generateRubricFromText = async (inputText) => {
  const groqKey = process.env.GROQ_API_KEY || '';
  const geminiKey = process.env.GEMINI_API_KEY || '';

  if (!groqKey && !geminiKey) {
    throw new Error('No AI provider configured. Set GROQ_API_KEY (free, at console.groq.com) or GEMINI_API_KEY on the backend.');
  }

  // Try Groq first (free, fast, reliable), fall back to Gemini
  const errors = [];
  if (groqKey) {
    try {
      return await callGroq(inputText);
    } catch (err) {
      errors.push('Groq: ' + err.message);
    }
  }
  if (geminiKey) {
    try {
      return await callGemini(inputText);
    } catch (err) {
      errors.push('Gemini: ' + err.message);
    }
  }

  throw new Error('All AI providers failed: ' + errors.join('; '));
};
