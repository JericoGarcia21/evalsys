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

const slugifyKey = (value) => String(value || '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 48);

const normalizeResult = (parsed) => {
  // Handle different JSON shapes: { criteria: [...] } or { rubric: { criteria: [...] } }
  let criteriaArray = parsed.criteria;
  if (!criteriaArray && parsed.rubric && Array.isArray(parsed.rubric.criteria)) {
    criteriaArray = parsed.rubric.criteria;
  }
  if (!criteriaArray || !Array.isArray(criteriaArray) || criteriaArray.length === 0) {
    throw new Error('AI response missing criteria array');
  }

  const usedKeys = new Set();
  const normalizedCriteria = criteriaArray.map((c, index) => {
    // Criteria keys are required by the rubric form and must be unique.
    const baseKey = slugifyKey(c.key || c.label || c.name) || `criterion-${index + 1}`;
    let key = baseKey;
    let suffix = 2;
    while (usedKeys.has(key)) {
      key = `${baseKey}-${suffix}`;
      suffix += 1;
    }
    usedKeys.add(key);

    return {
      label: String(c.label || c.name || 'Criterion').trim(),
      section: String(c.section || 'General').trim(),
      description: String(c.description || '').trim(),
      maxScore: Number(c.maxScore || c.points || 0) || 0,
      scoringMode: c.scoringMode === 'percentage' ? 'percentage' : 'range',
      key,
      levels: (c.levels || []).map((l) => ({
        label: String(l.label || l.name || 'Level').trim(),
        minScore: Number(l.minScore || l.min_score || 0) || 0,
        maxScore: Number(l.maxScore || l.max_score || 0) || 0,
        description: String(l.description || '').trim(),
      })),
    };
  });

  return {
    title: String(parsed.title || parsed.rubric?.title || 'AI-Generated Rubric').trim(),
    instructions: String(parsed.instructions || '').trim(),
    criteria: normalizedCriteria,
  };
};

// Model names are provider-side and change often. Try the configured model first,
// then fall back through known-good alternatives when the provider says "model not found".
const GEMINI_FALLBACK_MODELS = ['gemini-3.5-flash-lite', 'gemini-2.5-flash-lite', 'gemini-3.5-flash'];
const GROQ_FALLBACK_MODELS = ['openai/gpt-oss-20b', 'llama-3.3-70b-versatile', 'llama-3.1-8b-instant'];

const buildModelList = (configured, fallbacks) => {
  const list = [];
  const push = (value) => {
    const model = String(value || '').trim();
    if (model && !list.includes(model)) list.push(model);
  };
  push(configured);
  fallbacks.forEach(push);
  return list;
};

const isModelNotFound = (status, body) =>
  status === 404 || /model_not_found|does not exist|not found|decommissioned|unsupported model/i.test(String(body || ''));

const callGroq = async (inputText) => {
  const apiKey = (process.env.GROQ_API_KEY || '').trim();
  if (!apiKey) throw new Error('GROQ_API_KEY not configured');

  const models = buildModelList(process.env.GROQ_MODEL, GROQ_FALLBACK_MODELS);
  let lastError = null;

  for (const model of models) {
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
      lastError = new Error(`Groq API error (${res.status}): ${errorText}`);
      if (isModelNotFound(res.status, errorText)) continue;
      throw lastError;
    }

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || '';
    if (!text) throw new Error('Groq returned empty response');

    // extractAndParseJson already returns a parsed object — do NOT JSON.parse again
    return normalizeResult(extractAndParseJson(text));
  }

  throw lastError || new Error('No usable Groq model available');
};

const callGemini = async (inputText) => {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured');

  const models = buildModelList(process.env.GEMINI_MODEL, GEMINI_FALLBACK_MODELS);
  // v1 and v1beta expose slightly different model catalogs — try both before giving up.
  const apiVersions = ['v1', 'v1beta'];
  let lastError = null;

  for (const version of apiVersions) {
    for (const model of models) {
      const url = `https://generativelanguage.googleapis.com/${version}/models/${model}:generateContent?key=${apiKey}`;
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
        lastError = new Error(`Gemini API error (${res.status}): ${errorText}`);
        if (isModelNotFound(res.status, errorText)) continue;
        throw lastError;
      }

      const data = await res.json();
      const candidates = data.candidates || [];
      if (!candidates.length) {
        lastError = new Error('No content generated by AI');
        continue;
      }

      const text = candidates[0].content?.parts?.[0]?.text || '';
      if (!text) {
        lastError = new Error('Gemini returned empty response');
        continue;
      }

      const textString = typeof text === 'string' ? text : JSON.stringify(text);
      // extractAndParseJson already returns a parsed object — do NOT JSON.parse again
      return normalizeResult(extractAndParseJson(textString));
    }
  }

  throw lastError || new Error('No usable Gemini model available');
};

exports.getProviderStatus = () => {
  const geminiKey = (process.env.GEMINI_API_KEY || '').trim();
  const groqKey = (process.env.GROQ_API_KEY || '').trim();
  return {
    configured: Boolean(geminiKey || groqKey),
    providers: {
      gemini: geminiKey
        ? { model: buildModelList(process.env.GEMINI_MODEL, GEMINI_FALLBACK_MODELS)[0] }
        : null,
      groq: groqKey
        ? { model: buildModelList(process.env.GROQ_MODEL, GROQ_FALLBACK_MODELS)[0] }
        : null,
    },
  };
};

exports.generateRubricFromText = async (inputText) => {
  const groqKey = (process.env.GROQ_API_KEY || '').trim();
  const geminiKey = (process.env.GEMINI_API_KEY || '').trim();

  if (!groqKey && !geminiKey) {
    throw new Error(
      'AI is not configured on the server. Add GEMINI_API_KEY or GROQ_API_KEY to back-end/.env, then restart the backend.'
    );
  }

  // Gemini lite first (fast, free tier), Groq as fallback
  const errors = [];
  if (geminiKey) {
    try {
      return await callGemini(inputText);
    } catch (err) {
      errors.push('Gemini: ' + err.message);
    }
  }
  if (groqKey) {
    try {
      return await callGroq(inputText);
    } catch (err) {
      errors.push('Groq: ' + err.message);
    }
  }

  throw new Error('All AI providers failed: ' + errors.join('; '));
};
