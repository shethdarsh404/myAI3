import { openai } from "@ai-sdk/openai";
import { fireworks } from "@ai-sdk/fireworks";
import { wrapLanguageModel, extractReasoningMiddleware } from "ai";

export const MODEL = openai('gpt-4.1');

// If you want to use a Fireworks model, uncomment the following code and set the FIREWORKS_API_KEY in Vercel
// NOTE: Use middleware when the reasoning tag is different than think. (Use ChatGPT to help you understand the middleware)
// export const MODEL = wrapLanguageModel({
//     model: fireworks('fireworks/deepseek-r1-0528'),
//     middleware: extractReasoningMiddleware({ tagName: 'think' }), // Use this only when using Deepseek
// });


function getDateAndTime(): string {
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
    const timeStr = now.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        timeZoneName: 'short'
    });
    return `The day today is ${dateStr} and the time right now is ${timeStr}.`;
}

export const DATE_AND_TIME = getDateAndTime();

export const AI_NAME = "NutriBuddy";
export const OWNER_NAME = "Darsh Mitra";

export const WELCOME_MESSAGE = `Hello! I'm ${AI_NAME}, an AI assistant created by ${OWNER_NAME}, hope you are having a wonderful day. How can I help you? You can ask me anything related to you Nutrition needs and I shall help you with it.`

export const CLEAR_CHAT_TEXT = "New";

export const MODERATION_DENIAL_MESSAGE_SEXUAL = "I can't discuss explicit sexual content. Please ask something else.";
export const MODERATION_DENIAL_MESSAGE_SEXUAL_MINORS = "I can't discuss content involving minors in a sexual context. Please ask something else.";
export const MODERATION_DENIAL_MESSAGE_HARASSMENT = "I can't engage with harassing content. Please be respectful.";
export const MODERATION_DENIAL_MESSAGE_HARASSMENT_THREATENING = "I can't engage with threatening or harassing content. Please be respectful.";
export const MODERATION_DENIAL_MESSAGE_HATE = "I can't engage with hateful content. Please be respectful.";
export const MODERATION_DENIAL_MESSAGE_HATE_THREATENING = "I can't engage with threatening hate speech. Please be respectful.";
export const MODERATION_DENIAL_MESSAGE_ILLICIT = "I can't discuss illegal activities. Please ask something else.";
export const MODERATION_DENIAL_MESSAGE_ILLICIT_VIOLENT = "I can't discuss violent illegal activities. Please ask something else.";
export const MODERATION_DENIAL_MESSAGE_SELF_HARM = "I can't discuss self-harm. If you're struggling, please reach out to a mental health professional or crisis helpline.";
export const MODERATION_DENIAL_MESSAGE_SELF_HARM_INTENT = "I can't discuss self-harm intentions. If you're struggling, please reach out to a mental health professional or crisis helpline.";
export const MODERATION_DENIAL_MESSAGE_SELF_HARM_INSTRUCTIONS = "I can't provide instructions related to self-harm. If you're struggling, please reach out to a mental health professional or crisis helpline.";
export const MODERATION_DENIAL_MESSAGE_VIOLENCE = "I can't discuss violent content. Please ask something else.";
export const MODERATION_DENIAL_MESSAGE_VIOLENCE_GRAPHIC = "I can't discuss graphic violent content. Please ask something else.";
export const MODERATION_DENIAL_MESSAGE_DEFAULT = "Your message violates our guidelines. I can't answer that.";
export const NUTRITION_DENIAL_MESSAGE_MEDICAL = "I can't provide medical or diagnostic advice. Please consult a doctor or registered dietitian for this.";
export const NUTRITION_DENIAL_MESSAGE_DISEASE_SPECIFIC_DIET = "I can't design diets for medical conditions. Please speak with a healthcare professional or registered dietitian.";
export const NUTRITION_DENIAL_MESSAGE_EXTREME_DIET = "I can't support extreme, crash, or starvation diets. Let's focus on safe, sustainable nutrition instead.";
export const NUTRITION_DENIAL_MESSAGE_DISORDERED_EATING = "I can't assist with weight loss requests that may encourage disordered eating. Please reach out to a mental health or nutrition professional for support.";
export const NUTRITION_DENIAL_MESSAGE_UNSAFE_SUPPLEMENTS = "I can't recommend unsafe or unverified supplements. Please talk to a healthcare professional before using these products.";
export const NUTRITION_DENIAL_MESSAGE_WEIGHT_TARGET_UNSAFE = "I can't help you pursue an unsafe weight or body target. We should aim for healthy, realistic goals only.";
export const NUTRITION_DENIAL_MESSAGE_CHILD_DIET = "I can't provide specific diet plans for children or minors. Please consult a pediatrician or child nutrition specialist.";
export const NUTRITION_DENIAL_MESSAGE_PREGNANCY = "I can't give pregnancy related nutrition or medical advice. Please consult your doctor or a qualified prenatal nutrition expert.";
export const NUTRITION_DENIAL_MESSAGE_ALLERGY_RISK = "I can't confirm food safety for allergies or intolerances. Please check labels carefully and consult a medical professional.";
export const NUTRITION_DENIAL_MESSAGE_DATA_PRIVACY = "I can't store or share sensitive personal health information. Please avoid entering private medical details here.";
export const NUTRITION_DENIAL_MESSAGE_MISINFORMATION = "I can't confirm or promote nutrition claims that conflict with established evidence. Let’s rely on trusted, science based guidance instead.";
export const NUTRITION_DENIAL_MESSAGE_DRUGS = "I can't provide guidance on the use, preparation, or effects of illegal drugs. Please avoid such questions.";
export const NUTRITION_DENIAL_MESSAGE_WEED = "I can't give advice on cannabis or related substances. Please consult a qualified professional if needed.";
export const NUTRITION_DENIAL_MESSAGE_ALCOHOL_ABUSE = "I can't assist with harmful or excessive alcohol use. If you're struggling, please reach out to a healthcare provider or support service.";
export const NUTRITION_DENIAL_MESSAGE_SUBSTANCE_USE = "I can't provide advice on substance use or dependency. Please seek professional help if you need support.";
export const NUTRITION_DENIAL_MESSAGE_DEFAULT = "I can't safely answer this request. Please rephrase it or consult a qualified professional.";

export const PINECONE_TOP_K = 5;
export const PINECONE_INDEX_NAME = "my-ai";
