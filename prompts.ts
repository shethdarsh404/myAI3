// prompt.ts
import { DATE_AND_TIME, OWNER_NAME, AI_NAME } from './config';

/**
 * prompt.ts — NutriBuddy system & prompt helpers
 *
 * - Keeps your original prompt structure and labels.
 * - Adds clear NutriBuddy instructions to collect mandatory profile info first:
 *     -> name, age, weight (kg), exercise routine (activity level)
 *     -> then dietary / meal preferences (veg / non-veg / vegan / gluten-free / jain / etc.)
 * - If any required profile fields are missing, the assistant must ask them before attempting to log food,
 *   suggest meals, or compute kcal progress.
 * - When app requests structured data (requireJSONResponse=true), assistant MUST return only valid JSON using
 *   the schema in NUTRIBUDDY_GUIDANCE.
 * - Exports buildMessages(...) and parseAssistantJson(...) helpers.
 */

/* -------------------------------
   Types
   ------------------------------- */

export type MealItem = {
  name: string;
  quantity?: string;
  kcal?: number;
  protein_g?: number;
  carbs_g?: number;
  fat_g?: number;
};

export type UserProfile = {
  name?: string;
  age?: number;
  sex?: 'male' | 'female' | 'non-binary' | 'other';
  height_cm?: number;
  weight_kg?: number;
  activity_level?: 'sedentary' | 'light' | 'moderate' | 'active' | 'very active';
  daily_kcal_goal?: number;
  dietary_preferences?: string[]; // e.g., ['vegetarian', 'gluten-free', 'jain']
  allergies?: string[];
};

export type SessionState = {
  today_kcal_consumed?: number;
  today_log?: MealItem[];
  timezone?: string;
};

export type BuildMessagesOptions = {
  userName?: string;
  userProfile?: UserProfile;
  sessionState?: SessionState;
  userMessage: string;
  requireJSONResponse?: boolean;
  language?: string;
};

/* -------------------------------
   Your original prompt sections
   ------------------------------- */

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

/* -------------------------------
   NutriBuddy guidance & onboarding requirements
   ------------------------------- */

export const NUTRIBUDDY_GUIDANCE = `
You are NutriBuddy — a friendly nutrition & meal-planning assistant.

Primary rules (mandatory):
1) BEFORE performing any calorie calculations, logging, or personalized meal suggestions, ensure the user's profile includes:
   - name
   - age
   - weight_kg (weight in kilograms)
   - activity_level (one of: sedentary, light, moderate, active, very active)
2) AFTER collecting the fields above, ask for dietary / meal preferences (one or more): vegetarian, non-vegetarian, vegan, gluten-free, jain, lactose-intolerant, etc.
3) Only when the above onboarding fields are present should the assistant proceed to:
   - log foods and calculate totals
   - suggest recipes personalized to preferences and activity level
   - set or change daily kcal goals

Behavior when fields are missing:
 - If any required onboarding field is missing, ask only the missing onboarding questions in a friendly, concise way.
 - When the app requests structured JSON (requireJSONResponse=true), respond with ONLY valid JSON following the schema below. If onboarding fields are missing, return an intent 'ask_clarifying' with follow_up.questions listing exactly the missing fields as focused questions.

JSON schema (must be followed when JSON requested):
{
  "intent": "<string: one of log_food | suggest_meal | get_snapshot | set_goal | greet | farewell | ask_clarifying | info | generic>",
  "fulfillment_text": "<string: brief human-friendly reply>",
  "data": { /* intent-specific payload */ },
  "follow_up": {
    "should_ask": boolean,
    "questions": [ "<question 1>", "<question 2>" ]
  }
}

Onboarding example (assistant MUST follow this flow if missing info):
- If weight_kg and activity_level are missing:
  {
    "intent": "ask_clarifying",
    "fulfillment_text": "I need a couple of quick details to personalize recommendations.",
    "data": {},
    "follow_up": {
      "should_ask": true,
      "questions": [
        "What's your weight in kilograms (kg)?",
        "How active are you on a typical week? (sedentary, light, moderate, active, very active)"
      ]
    }
  }

General notes:
 - Label calorie estimates clearly with ≈ when approximate.
 - Do not provide specialized medical or therapeutic diet plans; refer to a registered dietitian or doctor for that.
 - Ask only focused questions — do not request more info than necessary.
`.trim();

/* -------------------------------
   System prompt assembly
   ------------------------------- */

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

<nutribuddy>
${NUTRIBUDDY_GUIDANCE}
</nutribuddy>

<date_time>
${DATE_AND_TIME}
</date_time>
`.trim();

/* -------------------------------
   Few-shot / onboarding examples
   ------------------------------- */

const fewShotExamples: { role: 'user' | 'assistant'; content: string }[] = [
  // User greets with no profile
  {
    role: 'user',
    content: 'Hi — I want to use the app to track my meals.',
  },
  {
    role: 'assistant',
    content: JSON.stringify({
      intent: 'ask_clarifying',
      fulfillment_text: 'Great — I need a few quick details to personalize your experience.',
      data: {},
      follow_up: {
        should_ask: true,
        questions: [
          "What's your name?",
          "How old are you?",
          "What's your weight in kilograms (kg)?",
          "How active are you on a typical week? (sedentary, light, moderate, active, very active)",
          "Do you have any dietary preferences (e.g., vegetarian, non-vegetarian, vegan, gluten-free, jain)?",
        ],
      },
    }),
  },

  // Partial profile present: ask missing fields only
  {
    role: 'user',
    content: 'My name is Riya and I am vegetarian. My weight is 58 kg.',
  },
  {
    role: 'assistant',
    content: JSON.stringify({
      intent: 'ask_clarifying',
      fulfillment_text:
        "Thanks, Riya — just two quick questions to finish setup before I can personalize suggestions.",
      data: {},
      follow_up: {
        should_ask: true,
        questions: [
          "How old are you?",
          "How active are you on a typical week? (sedentary, light, moderate, active, very active)",
        ],
      },
    }),
  },

  // After onboarding complete: log food example
  {
    role: 'user',
    content:
      'I am Riya, 28 years old, weigh 58 kg, activity level moderate, vegetarian. I had 2 boiled eggs and a slice of toast — log it.',
  },
  {
    role: 'assistant',
    content: JSON.stringify({
      intent: 'log_food',
      fulfillment_text:
        "Logged 2 boiled eggs (≈156 kcal) and 1 slice whole-wheat toast (≈70 kcal). Added ≈226 kcal to today's total.",
      data: {
        items: [
          { name: 'Boiled egg', quantity: '2', kcal: 156 },
          { name: 'Whole wheat toast', quantity: '1 slice', kcal: 70 },
        ],
        added_kcal: 226,
        new_total_kcal: 226,
        goal_kcal: 2000,
        progress_percent: 11.3,
      },
      follow_up: { should_ask: false, questions: [] },
    }),
  },
];

/* -------------------------------
   Helper: buildMessages
   ------------------------------- */

export function buildMessages(opts: BuildMessagesOptions) {
  const {
    userName = 'User',
    userProfile,
    sessionState,
    userMessage,
    requireJSONResponse = true,
    language = 'English',
  } = opts;

  const profileBlock =
    userProfile && Object.keys(userProfile).length
      ? `User profile: ${JSON.stringify(userProfile)}.`
      : 'User profile: Not provided.';

  const sessionBlock =
    sessionState && Object.keys(sessionState).length
      ? `Session state: ${JSON.stringify(sessionState)}.`
      : 'Session state: Not provided.';

  const jsonInstruction = requireJSONResponse
    ? `\n\nIMPORTANT: Respond with ONLY valid JSON using the schema in the system prompt. If any required onboarding fields (name, age, weight_kg, activity_level, dietary_preferences) are missing, return intent 'ask_clarifying' and include focused follow_up.questions for ONLY the missing fields. Do NOT include any additional explanatory text.`
    : `\n\nYou may respond in natural ${language} text. If helpful, include a short JSON payload labeled "assistant_payload".`;

  const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'system',
      content:
        `Context for this session:\n` +
        `User display name: ${userName}.\n` +
        profileBlock +
        `\n` +
        sessionBlock +
        `\nAssistant response language: ${language}.` +
        jsonInstruction,
    },
  ];

  for (const ex of fewShotExamples) {
    messages.push({ role: ex.role, content: ex.content });
  }

  messages.push({ role: 'user', content: userMessage });

  return messages;
}

/* -------------------------------
   Utility: parseAssistantJson
   ------------------------------- */

export function parseAssistantJson(text: string) {
  if (!text) return null;
  const trimmed = text.trim();
  try {
    // direct parse if JSON only
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      return JSON.parse(trimmed);
    }
    // otherwise try to extract first {...} block
    const first = trimmed.indexOf('{');
    const last = trimmed.lastIndexOf('}');
    if (first !== -1 && last !== -1 && last > first) {
      const sub = trimmed.substring(first, last + 1);
      return JSON.parse(sub);
    }
  } catch (err) {
    // ignore parse errors
  }
  return null;
}

/* -------------------------------
   Utility: onboarding questions generator
   ------------------------------- */

/**
 * Given a partially-complete profile, returns an array of focused questions
 * for missing onboarding fields. These are phrased to be user-facing.
 */
export function getOnboardingQuestions(profile?: UserProfile): string[] {
  const q: string[] = [];
  if (!profile) {
    q.push("What's your name?");
    q.push("How old are you?");
    q.push("What's your weight in kilograms (kg)?");
    q.push(
      "How active are you on a typical week? (choose one: sedentary, light, moderate, active, very active)"
    );
    q.push(
      "Do you have any dietary preferences (e.g., vegetarian, non-vegetarian, vegan, gluten-free, jain)?"
    );
    return q;
  }
  if (!profile.name) q.push("What's your name?");
  if (!profile.age && profile.age !== 0) q.push("How old are you?");
  if (!profile.weight_kg && profile.weight_kg !== 0) q.push("What's your weight in kilograms (kg)?");
  if (!profile.activity_level) {
    q.push(
      "How active are you on a typical week? (choose one: sedentary, light, moderate, active, very active)"
    );
  }
  if (!profile.dietary_preferences || profile.dietary_preferences.length === 0) {
    q.push(
      "Do you have any dietary preferences (e.g., vegetarian, non-vegetarian, vegan, gluten-free, jain)?"
    );
  }
  return q;
}

/* -------------------------------
   Example builder
   ------------------------------- */

export const exampleBuild = (() => {
  const sampleProfile: UserProfile = {
    name: 'Riya',
    age: 28,
    sex: 'female',
    height_cm: 160,
    weight_kg: 58,
    daily_kcal_goal: 2000,
    dietary_preferences: ['vegetarian'],
    allergies: [],
  };

  const sampleSession: SessionState = {
    today_kcal_consumed: 560,
    today_log: [
      { name: 'Boiled egg', quantity: '2', kcal: 156 },
      { name: 'Whole wheat toast', quantity: '1 slice', kcal: 70 },
    ],
    timezone: 'Asia/Kolkata',
  };

  return buildMessages({
    userName: 'Riya',
    userProfile: sampleProfile,
    sessionState: sampleSession,
    userMessage: 'Log 2 boiled eggs and show how close I am to my goal.',
    requireJSONResponse: true,
  });
})();

/* -------------------------------
   Default export
   ------------------------------- */

export default {
  IDENTITY_PROMPT,
  TOOL_CALLING_PROMPT,
  TONE_STYLE_PROMPT,
  GUARDRAILS_PROMPT,
  CITATIONS_PROMPT,
  COURSE_CONTEXT_PROMPT,
  NUTRIBUDDY_GUIDANCE,
  SYSTEM_PROMPT,
  buildMessages,
  parseAssistantJson,
  getOnboardingQuestions,
  exampleBuild,
};
