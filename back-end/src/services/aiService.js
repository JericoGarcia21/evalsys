const AI_SYSTEM_PROMPT = `You are an expert education rubric designer. Convert the provided rubric source into structured JSON.

Return ONLY valid JSON (no markdown fences, no text before or after) with this shape:
{"title":"...","instructions":"...","criteria":[{"label":"...","section":"...","description":"...","maxScore":10,"scoringMode":"range"|"percentage","levels":[{"label":"...","description":"..."}]}]}

How to read the source:
- Keep the source's own criteria, wording, section names, and weights. Do not invent, merge, or drop criteria.
- If the source lists criterion weights or percentages (for example "10%", "12%", "4%") or a performance rating scale in percentages, then for EVERY criterion:
  * set "scoringMode":"percentage"
  * set "maxScore" to that criterion's weight in points (so the criteria add up to the rubric total, usually 100)
  * give each level a "percentage" from 0 to 100 and DO NOT use minScore/maxScore, for example:
    {"label":"Excellent","percentage":100,"description":"Complete, accurate and meets all requirements."}
    {"label":"Very Good","percentage":90,"description":"Meets requirements with minor errors."}
    {"label":"Good","percentage":80,"description":"Meets most basic requirements with some errors."}
    {"label":"Needs Improvement","percentage":70,"description":"Partially complete with significant errors."}
    {"label":"Not Submitted / Not Demonstrated","percentage":0,"description":"Required output is missing."}
  * copy the source's level names and percentages exactly when the source provides them.
- If the source gives score ranges instead (for example "23-25", "20-22"), set "scoringMode":"range" and give each level numeric minScore and maxScore within 0 to maxScore.
- If the source lists no rating levels, create them yourself: use the five percentage levels above when the source gives weights, otherwise use 4 score-range levels (Excellent, Good, Fair, Poor) spread across maxScore without overlaps.
- Weights may be written as percentages ("10%"), points ("10 pts"), or totals per section. Treat them the same way.
- Use the source's section headings (for example "Project Requirements", "Project Documentation", "Project Presentation") as the criterion "section".
- "title" is a short rubric name from the source. "instructions" is 0-2 sentences of evaluation notes, or "".
- All scores and percentages must be valid numbers.`;

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

// Matches the rating math used by the app (front-end ratingScale.ts / backend validation).
const ratingPoints = (weight, percentage) => Math.round(weight * percentage) / 100;

const toPercent = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  // Accept 0.9 style fractions as well as 90 style percentages.
  if (number > 0 && number <= 1) return Math.round(number * 10000) / 100;
  return number;
};

// "A. Conceptual Design" / "1) Overview" → "Conceptual Design" / "Overview"
const cleanLabel = (value) => String(value || '')
  .replace(/^\(?[A-Za-z0-9]{1,3}[.)]\s+/, '')
  .replace(/^[IVXLC]+[.)]\s+/i, '')
  .trim();

const levelPercent = (level) => toPercent(
  level.percentage ??
  level.percent ??
  level.percentageOfWeight ??
  level.percentOfWeight ??
  level.weight ??
  level.rating ??
  null
);

const round2 = (value) => Math.round(Number(value) * 100) / 100;

// Fallbacks so any pasted text produces a rubric the app can actually save.
const DEFAULT_PERCENTAGE_LEVELS = [
  { label: 'Excellent', percentage: 100, description: 'Complete, accurate, well-executed, and meets all requirements.' },
  { label: 'Very Good', percentage: 90, description: 'Meets requirements with only minor errors or omissions.' },
  { label: 'Good', percentage: 80, description: 'Meets most basic requirements but has some errors or omissions.' },
  { label: 'Needs Improvement', percentage: 70, description: 'Partially complete or contains significant errors.' },
  { label: 'Not Submitted / Not Demonstrated', percentage: 0, description: 'Required output is missing or cannot be evaluated.' },
];

const defaultPercentage = (index, count) => {
  if (count <= 1) return 100;
  return Math.max(0, Math.round((100 - (100 / (count - 1)) * index) / 5) * 5);
};

const defaultRangeLevels = (maxScore) => {
  const safeMax = round2(maxScore);
  const band = (fraction) => round2(safeMax * fraction);
  return [
    { label: 'Excellent', minScore: band(0.9), maxScore: safeMax, description: '' },
    { label: 'Good', minScore: band(0.75), maxScore: round2(band(0.9) - 0.01), description: '' },
    { label: 'Fair', minScore: band(0.6), maxScore: round2(band(0.75) - 0.01), description: '' },
    { label: 'Poor', minScore: 0, maxScore: round2(band(0.6) - 0.01), description: '' },
  ];
};

const parseLevelRange = (level) => {
  const min = Number(level.minScore ?? level.min_score ?? level.min ?? null);
  const max = Number(level.maxScore ?? level.max_score ?? level.max ?? null);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  return { min, max };
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

  // Decide each criterion's points before building levels so percentage math stays consistent.
  const rawWeights = criteriaArray.map((c) => Number(c.maxScore ?? c.points ?? c.weight ?? c.max_points ?? 0) || 0);
  const positiveWeights = rawWeights.filter((weight) => weight > 0);
  const evenSplit = round2(100 / criteriaArray.length);
  const fallbackWeight = positiveWeights.length ? Math.min(...positiveWeights) : evenSplit;
  const finalWeights = rawWeights.map((weight) => (weight > 0 ? weight : fallbackWeight));
  if (positiveWeights.length === 0 && finalWeights.length > 0) {
    // Nothing usable in the source: give the rubric a familiar 100-point total.
    const total = round2(finalWeights.reduce((sum, weight) => sum + weight, 0));
    finalWeights[finalWeights.length - 1] = round2(finalWeights[finalWeights.length - 1] + (100 - total));
  }

  const usedKeys = new Set();
  const normalizedCriteria = criteriaArray.map((c, index) => {
    // Criteria keys are required by the rubric form and must be unique.
    const label = cleanLabel(c.label || c.name || `Criterion ${index + 1}`) || `Criterion ${index + 1}`;
    const section = String(c.section || c.category || c.group || 'General').trim();
    const baseKey = slugifyKey(c.key || label) || `criterion-${index + 1}`;
    let key = baseKey;
    let suffix = 2;
    while (usedKeys.has(key)) {
      key = `${baseKey}-${suffix}`;
      suffix += 1;
    }
    usedKeys.add(key);

    const rawLevels = (Array.isArray(c.levels) ? c.levels : []).filter(Boolean);
    const percentages = rawLevels.map(levelPercent);
    const parsedRanges = rawLevels.map(parseLevelRange);
    const hasAllPercentages = rawLevels.length > 0 && percentages.every((value) => typeof value === 'number');
    const hasUsableRanges = rawLevels.length > 0
      && parsedRanges.every(Boolean)
      && parsedRanges.some((range) => range.max > 0 || range.min > 0);
    const usePercentage = c.scoringMode === 'percentage'
      ? true
      : c.scoringMode === 'range'
        ? (!hasUsableRanges && hasAllPercentages)
        : (hasAllPercentages || !hasUsableRanges);

    const maxScore = finalWeights[index];

    let levels;
    if (usePercentage) {
      const sourceLevels = rawLevels.length > 0 ? rawLevels : DEFAULT_PERCENTAGE_LEVELS;
      levels = sourceLevels.map((level, levelIndex) => {
        const levelLabel = cleanLabel(level.label || level.name)
          || DEFAULT_PERCENTAGE_LEVELS[levelIndex]?.label
          || `Level ${levelIndex + 1}`;
        const percentage = percentages[levelIndex] ?? defaultPercentage(levelIndex, sourceLevels.length);
        const points = ratingPoints(maxScore, percentage);
        return {
          label: levelLabel,
          percentage,
          minScore: points,
          maxScore: points,
          description: String(level.description || '').trim(),
        };
      });
    } else if (hasUsableRanges) {
      levels = rawLevels.map((level, levelIndex) => ({
        label: cleanLabel(level.label || level.name) || `Level ${levelIndex + 1}`,
        minScore: parsedRanges[levelIndex].min,
        maxScore: parsedRanges[levelIndex].max,
        description: String(level.description || '').trim(),
      }));
    } else {
      levels = defaultRangeLevels(maxScore).map((level) => ({
        ...level,
        label: cleanLabel(level.label) || level.label,
      }));
    }

    return {
      label,
      section,
      description: String(c.description || '').trim(),
      maxScore,
      scoringMode: usePercentage ? 'percentage' : 'range',
      key,
      levels,
    };
  });

  // Some models return weights as fractions (0.1, 0.12). Scale up when every weight looks fractional.
  const allFractional = normalizedCriteria.length > 1
    && normalizedCriteria.every((criterion) => criterion.maxScore > 0 && criterion.maxScore <= 1);
  if (allFractional) {
    normalizedCriteria.forEach((criterion) => {
      criterion.maxScore = Math.round(criterion.maxScore * 10000) / 100;
      if (criterion.scoringMode === 'percentage') {
        criterion.levels = criterion.levels.map((level) => {
          const points = ratingPoints(criterion.maxScore, level.percentage ?? 0);
          return { ...level, minScore: points, maxScore: points };
        });
      }
    });
  }

  return {
    title: String(parsed.title || parsed.rubric?.title || parsed.rubricTitle || 'AI-Generated Rubric').trim(),
    instructions: String(parsed.instructions || parsed.notes || '').trim(),
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

const callGroq = async (inputText, signal) => {
  const apiKey = (process.env.GROQ_API_KEY || '').trim();
  if (!apiKey) throw new Error('GROQ_API_KEY not configured');

  const models = buildModelList(process.env.GROQ_MODEL, GROQ_FALLBACK_MODELS);
  let lastError = null;

  for (const model of models) {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      signal,
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
      lastError.status = res.status;
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

const callGemini = async (inputText, signal) => {
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
        signal,
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
        lastError.status = res.status;
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

  // Billing depends on the provider account, not this model selection.
  // One shared deadline bounds the whole request, including fallback attempts.
  const signal = AbortSignal.timeout(60000);
  const errors = [];
  if (geminiKey) {
    try {
      return await callGemini(inputText, signal);
    } catch (err) {
      errors.push(err);
    }
  }
  if (groqKey && !signal.aborted) {
    try {
      return await callGroq(inputText, signal);
    } catch (err) {
      errors.push(err);
    }
  }

  const error = new Error('AI providers are temporarily unavailable.');
  error.status = signal.aborted || errors.some(item => item.name === 'TimeoutError' || item.name === 'AbortError')
    ? 504 : errors.some(item => item.status === 429) ? 429 : 503;
  throw error;
};
