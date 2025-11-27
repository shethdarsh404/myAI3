"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import * as z from "zod";

import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useChat } from "@ai-sdk/react";
import { ArrowUp, Loader2, Square, PlusIcon, Eraser } from "lucide-react";

import { MessageWall } from "@/components/messages/message-wall";
import { ChatHeader } from "@/app/parts/chat-header";
import { ChatHeaderBlock } from "@/app/parts/chat-header";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

import { UIMessage } from "ai";
import { useEffect, useRef, useState } from "react";
import {
  AI_NAME,
  CLEAR_CHAT_TEXT,
  OWNER_NAME,
  WELCOME_MESSAGE,
} from "@/config";

import Image from "next/image";
import Link from "next/link";

/* ---------------- storage keys + types ---------------- */
const STORAGE_KEY = "chat-messages";
const SAVED_CONVS_KEY = "nutribuddy-saved-convs";
const PROFILE_KEY = "nutribuddy-profile";
const TODAY_LOG_KEY = "nutribuddy-today-log";
const GOALS_KEY = "nutribuddy-goals";

const formSchema = z.object({
  message: z.string().min(1).max(2000),
});

type TodayLog = {
  dateIso: string; // date key e.g. 2025-11-27
  kcal: number;
  protein: number; // grams
  carbs: number; // grams
  fat: number; // grams
};

type Goals = {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
};

/* ---------------- helpers: BMI/BMR & default goals ---------------- */

function computeBMI(weightKg: number, heightCm: number) {
  if (!weightKg || !heightCm) return null;
  const h = heightCm / 100;
  return +(weightKg / (h * h)).toFixed(1);
}

// Mifflin-St Jeor BMR (male/female not provided; we will just estimate gender-neutral)
function computeBMR(weightKg: number, heightCm: number, age: number) {
  // use average factor (male formula slightly higher). We'll use male formula for a simple estimate:
  if (!weightKg || !heightCm || !age) return null;
  // Mifflin St-Jeor (male)
  const bmr = 10 * weightKg + 6.25 * heightCm - 5 * age + 5;
  return Math.round(bmr);
}

function activityMultiplier(activity: string) {
  switch ((activity || "").toLowerCase()) {
    case "sedentary":
      return 1.2;
    case "light":
      return 1.375;
    case "moderate":
      return 1.55;
    case "active":
      return 1.725;
    default:
      return 1.55;
  }
}

// Estimate default macro grams from calorie goal (protein set by 1.6g/kg if weight exists)
function estimateGoalsFromProfile(profile: any): Goals {
  const weight = Number(profile.weightKg) || null;
  const height = Number(profile.heightCm) || null;
  const age = Number(profile.age) || 30;
  const activity = profile.activity || "Moderate";
  const bmr = computeBMR(weight || 70, height || 170, age);
  const kcal = Math.round((bmr || 1500) * activityMultiplier(activity));
  // protein grams: 1.6 g per kg of bodyweight default
  const proteinG = weight ? Math.round(weight * 1.6) : Math.round((kcal * 0.25) / 4);
  // fat calories ~ 25% of kcal -> grams = (kcal*0.25)/9
  const fatG = Math.round((kcal * 0.25) / 9);
  // carbs fill remainder calories
  const remainingCalories = kcal - proteinG * 4 - fatG * 9;
  const carbsG = remainingCalories > 0 ? Math.round(remainingCalories / 4) : Math.round((kcal * 0.45) / 4);

  return {
    kcal,
    proteinG,
    carbsG,
    fatG,
  };
}

/* ---------------- small UI helpers ---------------- */

function formatNumber(n: number) {
  if (!n && n !== 0) return "—";
  return Math.round(n).toString();
}

function clamp(n: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, n));
}
/* ---------------- small UI helpers ---------------- */

function formatNumber(n: number) {
  if (!n && n !== 0) return "—";
  return Math.round(n).toString();
}

function clamp(n: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, n));
}

/* ----------- dateFmt FIX (Option B: Short Date Only) ----------- */
// Formats ISO timestamps for saved conversation list
function dateFmt(iso?: string): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString([], {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}
/* ---------------- parse nutrients from text ----------------
  Accepts text like:
   "Grilled paneer bowl — 420 kcal, 30g protein, 40g carbs, 10g fat"
  or "420 kcal" or "30g protein" etc.
  Returns an object with kcal, protein, carbs, fat (all numbers, may be null).
*/
function parseNutrientsFromText(text: string) {
  if (!text) return null;
  const lower = text.toLowerCase();

  const kcalMatch = lower.match(/(\d{2,5})\s?kcal/);
  const proteinMatch = lower.match(/(\d{1,4})\s?g\s?(?:protein)?/);
  const carbsMatch = lower.match(/(\d{1,4})\s?g\s?(?:carb|carbohydrate|carbs)?/);
  const fatMatch = lower.match(/(\d{1,4})\s?g\s?(?:fat)?/);

  const kcal = kcalMatch ? Number(kcalMatch[1]) : null;
  const protein = proteinMatch ? Number(proteinMatch[1]) : null;
  const carbs = carbsMatch ? Number(carbsMatch[1]) : null;
  const fat = fatMatch ? Number(fatMatch[1]) : null;

  return { kcal, protein, carbs, fat };
}

/* ---------------- localStorage helpers for Today log & goals --------------- */

const todayIso = () => new Date().toISOString().slice(0, 10);

function loadTodayLog(): TodayLog {
  try {
    const raw = localStorage.getItem(TODAY_LOG_KEY);
    if (!raw) {
      return { dateIso: todayIso(), kcal: 0, protein: 0, carbs: 0, fat: 0 };
    }
    const parsed = JSON.parse(raw) as TodayLog;
    if (parsed.dateIso !== todayIso()) {
      // reset for new day
      return { dateIso: todayIso(), kcal: 0, protein: 0, carbs: 0, fat: 0 };
    }
    return parsed;
  } catch {
    return { dateIso: todayIso(), kcal: 0, protein: 0, carbs: 0, fat: 0 };
  }
}

function saveTodayLog(log: TodayLog) {
  localStorage.setItem(TODAY_LOG_KEY, JSON.stringify(log));
}

function loadGoals(): Goals | null {
  try {
    const raw = localStorage.getItem(GOALS_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Goals;
  } catch {
    return null;
  }
}
function saveGoals(g: Goals) {
  localStorage.setItem(GOALS_KEY, JSON.stringify(g));
}

/* ---------------- Main Page Component (drop-in) ---------------- */

export default function ChatPage() {
  // initial storage & client flag
  const [isClient, setIsClient] = useState(false);

  // load existing stored chat messages (keeps app behavior)
  const stored = typeof window !== "undefined"
    ? (() => {
        try {
          const raw = localStorage.getItem(STORAGE_KEY);
          if (!raw) return { messages: [], durations: {} };
          const parsed = JSON.parse(raw);
          return { messages: parsed.messages || [], durations: parsed.durations || {} };
        } catch {
          return { messages: [], durations: {} };
        }
      })()
    : { messages: [], durations: {} };

  const [initialMessages] = useState<UIMessage[]>(stored.messages || []);
  const [durations, setDurations] = useState<Record<string, number>>(stored.durations || {});
  const [isTyping, setIsTyping] = useState(false);

  // saved conversations & profile
  const [savedConversations, setSavedConversations] = useState(() => {
    try {
      const raw = localStorage.getItem(SAVED_CONVS_KEY);
      return raw ? (JSON.parse(raw) as any[]) : [];
    } catch {
      return [];
    }
  });

  const [profile, setProfile] = useState(() => {
    try {
      const raw = localStorage.getItem(PROFILE_KEY);
      return raw ? JSON.parse(raw) : { name: "", age: "", heightCm: "", weightKg: "", activity: "Moderate" };
    } catch {
      return { name: "", age: "", heightCm: "", weightKg: "", activity: "Moderate" };
    }
  });

  // inferred/default goals (can be overridden by user)
  const [goals, setGoals] = useState<Goals>(() => {
    const loaded = loadGoals();
    if (loaded) return loaded;
    return estimateGoalsFromProfile(profile);
  });

  // today's log
  const [todayLog, setTodayLog] = useState<TodayLog>(() => loadTodayLog());

  // chat hook
  const { messages, sendMessage, status, stop, setMessages } = useChat({ messages: initialMessages });

  // refs
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const welcomeShownRef = useRef(false);

  // react-hook-form
  const form = useForm<{ message: string }>({
    resolver: zodResolver(formSchema),
    defaultValues: { message: "" },
  });

  // mount
  useEffect(() => {
    setIsClient(true);
    setDurations(stored.durations || {});
    setMessages(stored.messages || []);
    // sync saved convs/profile/goals/todayLog from localStorage
    try {
      const rawConvs = localStorage.getItem(SAVED_CONVS_KEY);
      if (rawConvs) setSavedConversations(JSON.parse(rawConvs));
    } catch {}
    try {
      const rawProfile = localStorage.getItem(PROFILE_KEY);
      if (rawProfile) setProfile(JSON.parse(rawProfile));
    } catch {}
    const loadedGoals = loadGoals();
    if (loadedGoals) setGoals(loadedGoals);
    setTodayLog(loadTodayLog());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // persist messages/durations
  useEffect(() => {
    if (!isClient) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ messages, durations }));
    } catch {}
  }, [messages, durations, isClient]);

  // autoscroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // handlers for MessageWall durations
  const handleDurationChange = (key: string, duration: number) => {
    setDurations((prev) => ({ ...prev, [key]: duration }));
  };

  /* ------------------ Actions: save / load convs ------------------ */

  function saveCurrentConversation() {
    const title = window.prompt("Enter a title for this conversation", `Chat ${new Date().toLocaleString()}`);
    if (!title) return;
    const conv = { id: `conv-${Date.now()}`, title, createdAt: new Date().toISOString(), messages: messages || [] };
    const next = [conv, ...savedConversations].slice(0, 50);
    setSavedConversations(next);
    localStorage.setItem(SAVED_CONVS_KEY, JSON.stringify(next));
    toast.success("Conversation saved");
  }

  function loadConversation(conv: any) {
    setMessages(conv.messages);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ messages: conv.messages, durations }));
    toast.success(`Loaded "${conv.title}"`);
  }

  function deleteConversation(convId: string) {
    const next = savedConversations.filter((c) => c.id !== convId);
    setSavedConversations(next);
    localStorage.setItem(SAVED_CONVS_KEY, JSON.stringify(next));
    toast.success("Removed conversation");
  }

  function clearChat() {
    setMessages([]);
    setDurations({});
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ messages: [], durations: {} }));
    toast.success("Chat cleared");
  }

  /* ------------------ Nutrient log management ------------------ */

  function persistTodayLog(next: TodayLog) {
    setTodayLog(next);
    saveTodayLog(next);
  }

  // Add nutrients to today's log (numbers are grams or kcal)
  function addToTodayLog({ kcal = 0, protein = 0, carbs = 0, fat = 0 }: { kcal?: number; protein?: number; carbs?: number; fat?: number }) {
    const next: TodayLog = {
      dateIso: todayIso(),
      kcal: Math.round((todayLog.kcal || 0) + (kcal || 0)),
      protein: Math.round((todayLog.protein || 0) + (protein || 0)),
      carbs: Math.round((todayLog.carbs || 0) + (carbs || 0)),
      fat: Math.round((todayLog.fat || 0) + (fat || 0)),
    };
    persistTodayLog(next);
    toast.success("Added to today's log");
  }

  // High-level parse and add: parse text, estimate macros if missing using goals ratio
  function parseAndAddFromText(text: string) {
    if (!text) {
      toast.error("No text provided");
      return;
    }
    const parsed = parseNutrientsFromText(text);
    if (!parsed) {
      toast.error("Could not parse nutrients from text");
      return;
    }

    let { kcal, protein, carbs, fat } = parsed;

    // If only kcal found and no macros, estimate macros by goals ratio
    if (kcal && (!protein && !carbs && !fat)) {
      // use goals to derive percentages
      const totalGoalCals = goals.kcal || 2000;
      const proteinCals = (goals.proteinG || 0) * 4;
      const fatCals = (goals.fatG || 0) * 9;
      const carbsCals = totalGoalCals - proteinCals - fatCals;
      const pRatio = proteinCals / totalGoalCals;
      const fRatio = fatCals / totalGoalCals;
      const cRatio = carbsCals / totalGoalCals;

      protein = Math.round((kcal * pRatio) / 4);
      fat = Math.round((kcal * fRatio) / 9);
      carbs = Math.round((kcal * cRatio) / 4);
    } else {
      // if kcal missing but macros present, compute kcal
      if (!kcal) kcal = (protein || 0) * 4 + (carbs || 0) * 4 + (fat || 0) * 9;
      // if some macros missing, estimate from remaining calories using goals ratio
      const missingProtein = protein == null;
      const missingCarbs = carbs == null;
      const missingFat = fat == null;
      if (kcal && (missingProtein || missingCarbs || missingFat)) {
        // compute used calories from known macros
        const used = (protein || 0) * 4 + (carbs || 0) * 4 + (fat || 0) * 9;
        const remainingCals = Math.max(0, (kcal || 0) - used);
        // distribute remaining calories according to goals proportions of the remaining macros
        const goalProteinCals = (goals.proteinG || 0) * 4;
        const goalCarbCals = (goals.carbsG || 0) * 4;
        const goalFatCals = (goals.fatG || 0) * 9;
        const goalSum = goalProteinCals + goalCarbCals + goalFatCals;
        if (goalSum > 0) {
          const pShare = missingProtein ? goalProteinCals / goalSum : 0;
          const cShare = missingCarbs ? goalCarbCals / goalSum : 0;
          const fShare = missingFat ? goalFatCals / goalSum : 0;
          if (missingProtein) protein = Math.round((remainingCals * pShare) / 4);
          if (missingCarbs) carbs = Math.round((remainingCals * cShare) / 4);
          if (missingFat) fat = Math.round((remainingCals * fShare) / 9);
        }
      }
    }

    // final normalization to numbers
    kcal = kcal ? Math.round(kcal) : 0;
    protein = protein ? Math.round(protein) : 0;
    carbs = carbs ? Math.round(carbs) : 0;
    fat = fat ? Math.round(fat) : 0;

    addToTodayLog({ kcal, protein, carbs, fat });
  }

  // Add composer content or last assistant message
  function addComposerToLog() {
    const txt = (form.getValues()?.message || "").trim();
    if (!txt) return toast.error("Composer is empty");
    parseAndAddFromText(txt);
  }
  function addLastAssistantMessageToLog() {
    const assistantMsgs = (messages || []).filter((m) => m.role === "assistant");
    if (!assistantMsgs || assistantMsgs.length === 0) return toast.error("No assistant messages found");
    const last = assistantMsgs[assistantMsgs.length - 1];
    const text = last.parts?.map((p: any) => p.text).join(" ") || (last as any).text || "";
    parseAndAddFromText(text);
  }

  /* ---------------- UI: interactive progress bar component ---------------- */
  function ProgressBar({ value, target, color = "#34D399" }: { value: number; target: number; color?: string }) {
    const pct = target > 0 ? clamp((value / target) * 100, 0, 200) : 0;
    return (
      <div>
        <div className="flex items-center justify-between text-xs text-slate-600 mb-1">
          <div>{formatNumber(value)}</div>
          <div>{formatNumber(target)}</div>
        </div>
        <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
          <div style={{ width: `${pct}%`, background: color, height: "100%", transition: "width 500ms ease" }} />
        </div>
      </div>
    );
  }

  /* ---------------- UI render ---------------- */

  return (
    <div
      style={{
        backgroundImage: `radial-gradient(circle at 1px 1px, rgba(34,197,94,0.02) 0.6px, transparent 0.6px)`,
        backgroundSize: "10px 10px",
      }}
      className="min-h-screen font-sans antialiased"
    >
      <main className="max-w-7xl mx-auto p-6 grid grid-cols-12 gap-6">
        {/* LEFT: profile + saved chats */}
        <aside className="col-span-12 lg:col-span-3 flex flex-col gap-4">
          <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-lg bg-emerald-50 flex items-center justify-center text-xl">🥗</div>
                <div>
                  <div className="text-sm font-semibold text-slate-800">Personal data</div>
                  <div className="text-xs text-slate-500">Saved locally</div>
                </div>
              </div>
              <div>
                <Button variant="outline" size="sm" onClick={() => { document.getElementById("profile-name")?.focus(); }}>Edit</Button>
              </div>
            </div>

            <div className="mt-3 space-y-2 text-sm">
              <label className="flex flex-col">
                <span className="text-xs text-slate-500">Name</span>
                <input id="profile-name" value={profile.name || ""} onChange={(e) => { const next = { ...profile, name: e.target.value }; setProfile(next); localStorage.setItem(PROFILE_KEY, JSON.stringify(next)); }} className="mt-1 p-2 rounded border border-slate-100" />
              </label>

              <div className="grid grid-cols-3 gap-2">
                <label className="flex flex-col text-xs">
                  <span className="text-slate-500">Age</span>
                  <input value={profile.age || ""} onChange={(e) => { const next = { ...profile, age: e.target.value }; setProfile(next); localStorage.setItem(PROFILE_KEY, JSON.stringify(next)); }} className="mt-1 p-2 rounded border border-slate-100" />
                </label>
                <label className="flex flex-col text-xs">
                  <span className="text-slate-500">Height (cm)</span>
                  <input value={profile.heightCm || ""} onChange={(e) => { const next = { ...profile, heightCm: e.target.value }; setProfile(next); localStorage.setItem(PROFILE_KEY, JSON.stringify(next)); }} className="mt-1 p-2 rounded border border-slate-100" />
                </label>
                <label className="flex flex-col text-xs">
                  <span className="text-slate-500">Weight (kg)</span>
                  <input value={profile.weightKg || ""} onChange={(e) => { const next = { ...profile, weightKg: e.target.value }; setProfile(next); localStorage.setItem(PROFILE_KEY, JSON.stringify(next)); }} className="mt-1 p-2 rounded border border-slate-100" />
                </label>
              </div>

              <label className="flex flex-col text-xs">
                <span className="text-slate-500">Activity level</span>
                <select value={profile.activity || "Moderate"} onChange={(e) => { const next = { ...profile, activity: e.target.value }; setProfile(next); localStorage.setItem(PROFILE_KEY, JSON.stringify(next)); }} className="mt-1 p-2 rounded border border-slate-100">
                  <option>Sedentary</option>
                  <option>Light</option>
                  <option>Moderate</option>
                  <option>Active</option>
                </select>
              </label>

              {/* Recompute default goals from profile */}
              <div className="flex items-center gap-2 mt-2">
                <Button size="sm" variant="outline" onClick={() => {
                  const est = estimateGoalsFromProfile(profile);
                  setGoals(est);
                  saveGoals(est);
                  toast.success("Goals estimated from profile");
                }}>Estimate goals</Button>
                <Button size="sm" onClick={() => { setProfile({ name: "", age: "", heightCm: "", weightKg: "", activity: "Moderate" }); localStorage.removeItem(PROFILE_KEY); toast.success("Profile cleared"); }}>Reset</Button>
              </div>
            </div>
          </div>

          {/* saved conversations */}
          <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm flex-1 overflow-auto">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-semibold text-slate-800">Past chats</div>
              <div className="text-xs text-slate-500">{savedConversations.length} saved</div>
            </div>

            {savedConversations.length === 0 ? (
              <div className="text-xs text-slate-500">No saved conversations. Use Save in the header.</div>
            ) : (
              <ul className="space-y-2">
                {savedConversations.map((c: any) => (
                  <li key={c.id} className="p-2 rounded-lg border border-slate-100 hover:bg-slate-50 flex items-center justify-between">
                    <div>
                      <button onClick={() => loadConversation(c)} className="text-sm font-medium text-slate-800 text-left">{c.title}</button>
                      <div className="text-xs text-slate-500">{dateFmt(c.createdAt)}</div>
                    </div>
                    <div className="flex flex-col gap-1 items-end">
                      <button onClick={() => loadConversation(c)} className="text-xs px-2 py-1 rounded-full bg-emerald-50 text-emerald-700">Open</button>
                      <button onClick={() => deleteConversation(c.id)} className="text-xs text-red-500 mt-1">Delete</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>

        {/* CENTER: chat */}
        <section className="col-span-12 lg:col-span-6 flex flex-col gap-4">
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center text-2xl">🥗</div>
              <div>
                <h1 className="text-xl font-semibold text-slate-800">NutriBuddy</h1>
                <p className="text-xs text-slate-500">Personalised nutrition chat</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Button variant="outline" size="sm" onClick={saveCurrentConversation}><PlusIcon className="size-4 mr-1" />Save</Button>
              <Button variant="outline" size="sm" onClick={clearChat}><Eraser className="size-4 mr-1" />Clear</Button>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-lg border border-slate-100 flex flex-col h-[72vh] overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Avatar>
                  <AvatarImage src="/logo.png" />
                  <AvatarFallback>NB</AvatarFallback>
                </Avatar>
                <div>
                  <div className="text-sm font-medium text-slate-800">Conversation</div>
                  <div className="text-xs text-slate-500">Chat with {AI_NAME}</div>
                </div>
              </div>
              <div className="text-xs text-slate-500">Status: {status}</div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-5">
              <div className="max-w-3xl mx-auto flex flex-col gap-4">
                <MessageWall messages={messages} status={status} durations={durations} onDurationChange={handleDurationChange} />

                {isTyping && (
                  <div className="flex items-center gap-3 text-sm text-slate-500">
                    <div className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center">AI</div>
                    <div className="px-3 py-2 rounded-lg bg-slate-100">NutriBuddy is typing…</div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            </div>

            <div className="sticky bottom-0 bg-white px-4 py-4 border-t border-slate-100">
              <form onSubmit={form.handleSubmit((d) => { setIsTyping(true); sendMessage({ text: d.message }); form.reset(); setTimeout(() => setIsTyping(false), 1000); })} className="max-w-3xl mx-auto">
                <FieldGroup>
                  <Controller
                    name="message"
                    control={form.control}
                    render={({ field }) => (
                      <Field className="flex items-center gap-3">
                        <Input {...field} placeholder="Type: 'Grilled paneer bowl — 420 kcal, 30g protein, 40g carbs, 10g fat'" className="flex-1 h-14 rounded-full border border-slate-200 shadow-sm px-5" onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            form.handleSubmit(onSubmit)();
                          }
                        }} />

                        {(status === "ready" || status === "error") && (
                          <Button type="submit" size="icon" className="rounded-full bg-emerald-600 hover:bg-emerald-700 text-white shadow-md" disabled={!field.value.trim()}>
                            <ArrowUp className="size-4 text-white" />
                          </Button>
                        )}

                        {(status === "streaming" || status === "submitted") && (
                          <Button size="icon" className="rounded-full bg-slate-100" onClick={() => stop()}>
                            <Square className="size-4 text-slate-700" />
                          </Button>
                        )}
                      </Field>
                    )}
                  />
                </FieldGroup>

                <div className="mt-3 flex flex-wrap gap-2">
                  {["Meal plan", "Calories", "Recipe", "Veg", "Keto"].map((chip) => (
                    <button key={chip} type="button" onClick={() => { form.setValue("message", chip); toast.success("Prompt loaded — press Enter to send"); }} className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-sm hover:bg-emerald-100 transition">
                      {chip}
                    </button>
                  ))}
                </div>
              </form>
            </div>
          </div>
        </section>

        {/* RIGHT: interactive Today's snapshot */}
        <aside className="col-span-12 lg:col-span-3 flex flex-col gap-5">
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-800">Today's snapshot</h3>
                <p className="text-xs text-slate-500 mt-1">Log & targets</p>
              </div>
              <div className="text-xs text-slate-400">{todayIso()}</div>
            </div>

            <div className="mt-4 flex items-center gap-4">
              <div>
                {/* calories donut - simple svg ring */}
                <svg width="92" height="92">
                  <defs>
                    <linearGradient id="g-c" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#34D399" />
                      <stop offset="100%" stopColor="#059669" />
                    </linearGradient>
                  </defs>
                  <g transform="translate(46,46)">
                    <circle r="36" fill="transparent" stroke="#EEF6F0" strokeWidth="12" />
                    <circle r="36" fill="transparent" stroke="url(#g-c)" strokeWidth="12" strokeLinecap="round"
                      strokeDasharray={`${2 * Math.PI * 36}`} strokeDashoffset={`${2 * Math.PI * 36 * (1 - clamp(todayLog.kcal / goals.kcal, 0, 1))}`} transform="rotate(-90)" />
                    <text textAnchor="middle" dy="6" style={{ fontSize: 14, fontWeight: 600, fill: "#065F46" }}>{Math.round((todayLog.kcal / (goals.kcal || 1)) * 100)}%</text>
                  </g>
                </svg>
              </div>

              <div className="flex-1">
                <div className="text-sm font-semibold text-slate-800">{todayLog.kcal} kcal logged</div>
                <div className="text-xs text-slate-500 mt-1">Goal: {goals.kcal} kcal</div>

                <div className="mt-4 space-y-3">
                  <div>
                    <div className="text-xs text-slate-500 mb-1">Protein (g)</div>
                    <ProgressBar value={todayLog.protein} target={goals.proteinG} color="#F97316" />
                  </div>
                  <div>
                    <div className="text-xs text-slate-500 mb-1">Carbs (g)</div>
                    <ProgressBar value={todayLog.carbs} target={goals.carbsG} color="#60A5FA" />
                  </div>
                  <div>
                    <div className="text-xs text-slate-500 mb-1">Fat (g)</div>
                    <ProgressBar value={todayLog.fat} target={goals.fatG} color="#F472B6" />
                  </div>
                </div>
              </div>
            </div>

            {/* editable goals */}
            <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
              <label className="flex flex-col text-xs">
                <span className="text-slate-500">Calorie goal</span>
                <input type="number" value={goals.kcal} onChange={(e) => { const next = { ...goals, kcal: Number(e.target.value) }; setGoals(next); saveGoals(next); }} className="mt-1 p-2 rounded border border-slate-100" />
              </label>
              <label className="flex flex-col text-xs">
                <span className="text-slate-500">Protein (g)</span>
                <input type="number" value={goals.proteinG} onChange={(e) => { const next = { ...goals, proteinG: Number(e.target.value) }; setGoals(next); saveGoals(next); }} className="mt-1 p-2 rounded border border-slate-100" />
              </label>
              <label className="flex flex-col text-xs">
                <span className="text-slate-500">Carbs (g)</span>
                <input type="number" value={goals.carbsG} onChange={(e) => { const next = { ...goals, carbsG: Number(e.target.value) }; setGoals(next); saveGoals(next); }} className="mt-1 p-2 rounded border border-slate-100" />
              </label>
              <label className="flex flex-col text-xs">
                <span className="text-slate-500">Fat (g)</span>
                <input type="number" value={goals.fatG} onChange={(e) => { const next = { ...goals, fatG: Number(e.target.value) }; setGoals(next); saveGoals(next); }} className="mt-1 p-2 rounded border border-slate-100" />
              </label>
            </div>

            <div className="mt-3 flex gap-2">
              <Button size="sm" onClick={() => { addComposerToLog(); }}>Add composer → Log</Button>
              <Button size="sm" variant="outline" onClick={() => { addLastAssistantMessageToLog(); }}>Add last assistant → Log</Button>
              <Button size="sm" variant="ghost" onClick={() => { persistTodayLog({ dateIso: todayIso(), kcal: 0, protein: 0, carbs: 0, fat: 0 }); toast.success("Log reset"); }}>Reset</Button>
            </div>
          </div>

          {/* Suggested meals */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
            <h3 className="text-sm font-semibold text-slate-800">Suggested meals</h3>
            <ul className="mt-3 space-y-3">
              {[
                { title: "Grilled paneer bowl", kcal: 420, protein: 30, carbs: 40, fat: 10 },
                { title: "Quinoa salad with roasted veg", kcal: 350, protein: 12, carbs: 50, fat: 10 },
                { title: "Chickpea curry + brown rice", kcal: 560, protein: 20, carbs: 80, fat: 12 },
              ].map((m) => (
                <li key={m.title} className="flex items-center justify-between p-3 rounded-lg bg-white border border-slate-100 shadow-sm">
                  <div>
                    <div className="text-sm font-medium text-slate-800">{m.title}</div>
                    <div className="text-xs text-slate-500">{m.kcal} kcal — {m.protein}g P / {m.carbs}g C / {m.fat}g F</div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <button className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-sm" onClick={() => { form.setValue("message", `${m.title} — ${m.kcal} kcal, ${m.protein}g protein, ${m.carbs}g carbs, ${m.fat}g fat`); toast.success("Loaded into composer"); }}>
                      Load
                    </button>
                    <button className="px-3 py-1 rounded-full bg-emerald-600 text-white text-sm" onClick={() => { addToTodayLog({ kcal: m.kcal, protein: m.protein, carbs: m.carbs, fat: m.fat }); }}>
                      Add to today's log
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 text-xs text-slate-500">
            © {new Date().getFullYear()} {OWNER_NAME} • <Link href="/terms" className="underline">Terms</Link>
          </div>
        </aside>
      </main>
    </div>
  );
}
