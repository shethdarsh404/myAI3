// prompt.ts
import { DATE_AND_TIME, OWNER_NAME, AI_NAME } from './config';

/**
 * Prompt helper for NutriBuddy — uses Personal Data when available
 *
 * - buildMessages(opts) will include profile info in system context and
 *   instruct the assistant NOT to ask onboarding questions if profile is complete.
 * - If any required onboarding fields are missing, assistant will be told to
 *   return an 'ask_clarifying' JSON intent with focused questions for ONLY missing fields.
 *
 * Expected keys for profile passed from your page.tsx:
 *  {
 *    name: string,
 *    age: string | number,
 *    heightCm: string | number,
 *    weightKg: string | number,
 *    activity: string,             // e.g., "Moderate", "Sedentary", etc.
 *    dietaryPreferences?: string[] // optional: ["vegetarian"] etc.
 *  }
 */

/* -----------------------
   Types
   ----------------------- */

export type MealItem = {
  name: string;
  quantity?: string;
  kcal?: number;
  protein_g?: number;
  carbs_g?: number;
  fat_g?: number;
};

export type UserProfile = {
  name?: string | null;
  age?: number | string | null;
  sex?: 'male' | 'female' | 'non-binary' | 'other' | string | null;
  height_cm?: number | string | null;
  weight_kg?: number | string | null;
  activity_level?: 'sedentary' | 'light' | 'moderate' | 'active' | 'very active' | string | null;
  daily_kcal_goal?: number | null;
  dietary_preferences?: string[] | null;
  allergies?: string[] | null;
};

export type SessionState = {
  today_kcal_consumed?: number;
  today_log?: MealItem[];
  timezone?: string;
};

export type BuildMessagesOptions = {
  userName?: string;
  // accept the same shape your page.tsx stores in localStorage (adapted below)
  userProfile?: Partial<UserProfile> | Record<string, any> | null;
  sessionState?: SessionState;
  userMessage: string;
  requireJSONResponse?: boolean;
  language?: string;
};

/* -----------------------
   Original prompts (kept)
   ----------------------- */

export const IDENTITY_PROMPT = `
You are ${AI_NAME}, an agentic assistant. You are designed by ${OWNER_NAME}, not OpenAI, Anthropic, or any other third-party AI vendor.
`.trim();

export const TOOL_CALLING_PROMPT = `
- In order to be as truthful as possible, call tools to gather context before answering.
- Prioritize retrieving from the vector database; if the answer is not found there, then search the web.
`.trim();

export const TONE_STYLE_PROMPT = `
- Maintain a friendly, approachable, and helpful tone at all times.
- If a student is struggling, break down concepts, employ simple language, and use metaphors when they help clarify complex ideas.
`.trim();

export const GUARDRAILS_PROMPT = `
- Strictly refuse and end engagement if a request involves dangerous, illegal, shady, or inappropriate activities.
`.trim();

export const CITATIONS_PROMPT = `
- Always cite your sources using inline markdown, e.g., [Source #](https://example.com).
- Do not ever write [Source #] without providing the URL as a markdown link.
`.trim();

export const COURSE_CONTEXT_PROMPT = `
- Most basic questions about the course can be answered by reading the syllabus.
`.trim();

/* -----------------------
   NutriBuddy guidance (onboarding & JSON schema)
   ----------------------- */

export const NUTRIBUDDY_GUIDANCE = `
You are NutriBuddy — a friendly nutrition & meal-planning assistant.

MANDATORY ONBOARDING FIELDS (to personalize calculations and suggestions):
 - name
 - age
 - weight_kg (weight in kilograms)
 - activity_level (one of: sedentary, light, moderate, active, very active)
 - dietary_preferences (one or more: vegetarian, non-vegetarian, vegan, gluten-free, jain, lactose-intolerant, etc.)

BEHAVIOR:
 - If the app provides a complete profile with the fields above, DO NOT ask those onboarding questions — use the provided values directly.
 - If any required onboarding field is missing, return intent = "ask_clarifying" with a follow_up.questions array containing only the focused questions for the missing fields.
 - When requireJSONResponse is true, RESPOND WITH ONLY valid JSON following the JSON schema below (no extra text).
 - Label estimates clearly (e.g., "≈220 kcal") and avoid making medical claims. For medical/therapeutic diet requests, advise consulting a registered dietitian or doctor.

JSON response schema (when requested):
{
  "intent": "<one of: log_food | suggest_meal | get_snapshot | set_goal | greet | farewell | ask_clarifying | info | generic>",
  "fulfillment_text": "<human-friendly reply string>",
  "data": { /* intent-specific fields */ },
  "follow_up": {
    "should_ask": boolean,
    "questions": [ "<question 1>", "<question 2>" ]
  }
}
`.trim();

/* -----------------------
   SYSTEM_PROMPT (assembled)
   ----------------------- */

export const SYSTEM_PROMPT = `
${IDENTITY_PROMPT}

<tool_calling>
${TOOL_CALLING_PROMPT}
</tool_calling>

<tone_style>
${TONE_STYLE_PROMPT}
</tone_style>

<guardrails>
${GUARDRAILS_PROMPT}
</guardrails>

<citations>
${CITATIONS_PROMPT}
</citations>

<course_context>
${COURSE_CONTEXT_PROMPT}
</course_context>

<nutribuddy_guidance>
${NUTRIBUDDY_GUIDANCE}
</nutribuddy_guidance>

<date_time>
${DATE_AND_TIME}
</date_time>
`.trim();

/* -----------------------
   Few-shot compact examples
   ----------------------- */

const fewShotExamples: { role: 'user' | 'assistant'; content: string }[] = [
  // Example: no profile provided -> ask for onboarding
  {
    role: 'user',
    content: 'Hi — I want to track my meals and get suggestions.',
  },
  {
    role: 'assistant',
    content: JSON.stringify({
      intent: 'ask_clarifying',
      fulfillment_text: "Great — I need a couple of quick details to personalize your recommendations.",
      data: {},
      follow_up: {
        should_ask: true,
        questions: [
          "What's your name?",
          "How old are you?",
          "What's your weight in kilograms (kg)?",
          "How active are you on a typical week? (sedentary, light, moderate, active, very active)",
          "Do you have any dietary preferences (e.g., vegetarian, non-vegetarian, vegan, gluten-free, jain)?"
        ]
      }
    }),
  },

  // Example: profile present -> log food
  {
    role: 'user',
    content: 'I am Riya, 28, weight 58 kg, moderate activity, vegetarian. Log 2 boiled eggs and a toast.',
  },
  {
    role: 'assistant',
    content: JSON.stringify({
      intent: 'log_food',
      fulfillment_text: "Logged 2 boiled eggs (≈156 kcal) and 1 slice whole-wheat toast (≈70 kcal). Added ≈226 kcal to today's total.",
      data: {
        items: [
          { name: 'Boiled egg', quantity: '2', kcal: 156 },
          { name: 'Whole wheat toast', quantity: '1 slice', kcal: 70 }
        ],
        added_kcal: 226,
        new_total_kcal: 226,
        goal_kcal: 2000,
        progress_percent: 11.3
      },
      follow_up: { should_ask: false, questions: [] }
    }),
  }
];

/* -----------------------
   Helpers: normalize & onboarding questions
   ----------------------- */

/**
 * Map a profile object from your UI to the normalized UserProfile fields
 * Accepts strings like "Moderate" or "moderate" and normalizes them to the expected keys.
 */
export function normalizeProfile(raw: Record<string, any> | null | undefined): UserProfile | null {
  if (!raw) return null;
  const p: UserProfile = {};

  // keys used in your page.tsx: name, age, heightCm, weightKg, activity
  if (raw.name !== undefined) p.name = raw.name === "" ? undefined : String(raw.name);
  if (raw.age !== undefined) {
    const n = Number(raw.age);
    p.age = Number.isFinite(n) ? n : (raw.age ? String(raw.age) : undefined);
  }
  if (raw.heightCm !== undefined) {
    const n = Number(raw.heightCm);
    p.height_cm = Number.isFinite(n) ? n : (raw.heightCm ? String(raw.heightCm) : undefined);
  }
  if (raw.weightKg !== undefined) {
    const n = Number(raw.weightKg);
    p.weight_kg = Number.isFinite(n) ? n : (raw.weightKg ? String(raw.weightKg) : undefined);
  }
  // activity mapping (pages uses "Moderate", "Sedentary", etc.)
  if (raw.activity !== undefined) {
    const act = String(raw.activity).toLowerCase();
    if (['sedentary', 'light', 'moderate', 'active', 'very active', 'veryactive'].includes(act)) {
      // normalize to one of the five canonical values
      if (act === 'very active' || act === 'veryactive') p.activity_level = 'very active';
      else if (act === 'sedentary') p.activity_level = 'sedentary';
      else if (act === 'light') p.activity_level = 'light';
      else if (act === 'moderate') p.activity_level = 'moderate';
      else if (act === 'active') p.activity_level = 'active';
      else p.activity_level = act;
    } else {
      p.activity_level = act;
    }
  }
  // dietary preferences - your UI currently doesn't have this; apps may pass dietaryPreferences
  if (raw.dietaryPreferences !== undefined) {
    if (Array.isArray(raw.dietaryPreferences)) p.dietary_preferences = raw.dietaryPreferences.map(String);
    else if (typeof raw.dietaryPreferences === 'string' && raw.dietaryPreferences.trim()) {
      // split common separators
      p.dietary_preferences = raw.dietaryPreferences.split(/[,;|]/).map((s: string) => s.trim()).filter(Boolean);
    }
  } else if (raw.dietary_preferences !== undefined) {
    if (Array.isArray(raw.dietary_preferences)) p.dietary_preferences = raw.dietary_preferences.map(String);
  }

  if (raw.daily_kcal_goal !== undefined) {
    const n = Number(raw.daily_kcal_goal);
    p.daily_kcal_goal = Number.isFinite(n) ? n : null;
  }

  return p;
}

/**
 * Return focused user-facing questions for missing onboarding fields.
 */
export function onboardingQuestionsForMissing(profile?: UserProfile | null): string[] {
  const missing: string[] = [];
  if (!profile) {
    return [
      "What's your name?",
      "How old are you?",
      "What's your weight in kilograms (kg)?",
      "How active are you on a typical week? (choose one: sedentary, light, moderate, active, very active)",
      "Do you have any dietary preferences (e.g., vegetarian, non-vegetarian, vegan, gluten-free, jain)?"
    ];
  }
  if (!profile.name) missing.push("What's your name?");
  if (profile.age === undefined || profile.age === null || profile.age === '') missing.push("How old are you?");
  if (profile.weight_kg === undefined || profile.weight_kg === null || profile.weight_kg === '') missing.push("What's your weight in kilograms (kg)?");
  if (!profile.activity_level) missing.push("How active are you on a typical week? (choose one: sedentary, light, moderate, active, very active)");
  if (!profile.dietary_preferences || profile.dietary_preferences.length === 0) missing.push("Do you have any dietary preferences (e.g., vegetarian, non-vegetarian, vegan, gluten-free, jain)?");
  return missing;
}

/* -----------------------
   buildMessages - core function
   ----------------------- */

export function buildMessages(opts: BuildMessagesOptions) {
  const {
    userName = 'User',
    userProfile: rawProfile = null,
    sessionState,
    userMessage,
    requireJSONResponse = true,
    language = 'English',
  } = opts;

  const normalizedProfile = normalizeProfile(rawProfile as Record<string, any> | null);

  // Determine missing onboarding fields
  const missingFieldsQuestions = onboardingQuestionsForMissing(normalizedProfile);

  // Build a short profile summary string for the system context when available
  const profileSummary = normalizedProfile
    ? `Profile provided: ${JSON.stringify(normalizedProfile)}.`
    : 'Profile provided: none.';

  // JSON instruction — if requireJSONResponse, require strict JSON only
  const jsonInstruction = requireJSONResponse
    ? `\n\nIMPORTANT: Respond with ONLY valid JSON following the app's schema. If any of these onboarding fields are missing: name, age, weight_kg, activity_level, dietary_preferences, return intent 'ask_clarifying' and include follow_up.questions listing only the focused questions for the missing fields. Do not output any extra explanatory text.`
    : `\n\nYou may respond in natural ${language} text. If helpful, include a short JSON payload labeled "assistant_payload".`;

  // Compose context that tells the assistant whether profile is present and whether it should ask
  let systemContextAddition = `Context: ${profileSummary}\nIf profile is present and complete (name, age, weight_kg, activity_level, dietary_preferences), DO NOT ask onboarding questions — proceed to fulfill the user's request using the provided values.`;
  if (missingFieldsQuestions.length > 0) {
    systemContextAddition += `\nHowever, the following onboarding items are missing: ${JSON.stringify(missingFieldsQuestions)}. If the user action requires onboarding (e.g., logging food, calculating kcal progress, or personalized suggestions), return an 'ask_clarifying' intent with follow_up.questions containing exactly those missing questions.`;
  }

  // Session block
  const sessionBlock =
    sessionState && Object.keys(sessionState).length
      ? `Session state: ${JSON.stringify(sessionState)}.`
      : 'Session state: Not provided.';

  // Build messages: system prompt + context
  const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'system',
      content:
        `Context for this session:\n` +
        `User display name: ${userName}.\n` +
        profileSummary +
        `\n` +
        sessionBlock +
        `\nAssistant response language: ${language}.` +
        jsonInstruction +
        `\n\n${systemContextAddition}`,
    },
  ];

  // Append few-shot examples to help enforce behavior
  for (const ex of fewShotExamples) {
    messages.push({ role: ex.role, content: ex.content });
  }

  // Finally add the user's message
  messages.push({ role: 'user', content: userMessage });

  return messages;
}

/* -----------------------
   Utility: robust JSON extraction
   ----------------------- */

export function parseAssistantJson(text: string | null | undefined) {
  if (!text) return null;
  const trimmed = text.trim();
  try {
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) return JSON.parse(trimmed);
    const first = trimmed.indexOf('{');
    const last = trimmed.lastIndexOf('}');
    if (first !== -1 && last !== -1 && last > first) {
      return JSON.parse(trimmed.substring(first, last + 1));
    }
  } catch (err) {
    // fail gracefully
  }
  return null;
}

/* -----------------------
   Exports
   ----------------------- */

export default {
  IDENTITY_PROMPT,
  TOOL_CALLING_PROMPT,
  TONE_STYLE_PROMPT,
  GUARDRAILS_PROMPT,
  CITATIONS_PROMPT,
  COURSE_CONTEXT_PROMPT,
  NUTRIBUDDY_GUIDANCE,
  SYSTEM_PROMPT,
  normalizeProfile,
  onboardingQuestionsForMissing,
  buildMessages,
  parseAssistantJson,
};
