"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import * as z from "zod";

import { Button } from "@/components/ui/button";
import { Field, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useChat } from "@ai-sdk/react";
import { ArrowUp, Square, PlusIcon, Eraser } from "lucide-react";

import { MessageWall } from "@/components/messages/message-wall";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

import { UIMessage } from "ai";
import { useEffect, useRef, useState } from "react";
import { AI_NAME, CLEAR_CHAT_TEXT, OWNER_NAME, WELCOME_MESSAGE } from "@/config";

import Link from "next/link";

/* ---------------- constants + storage keys ---------------- */

const STORAGE_KEY = "chat-messages";
const SAVED_CONVS_KEY = "nutribuddy-saved-convs";
const PROFILE_KEY = "nutribuddy-profile";
const TODAY_LOG_KEY = "nutribuddy-today-log";
const GOALS_KEY = "nutribuddy-goals";

const formSchema = z.object({
  message: z.string().min(1).max(2000),
});

/* ---------------- small helpers (single copy) ---------------- */

function formatNumber(n: number | null | undefined): string {
  if (n === undefined || n === null) return "—";
  return Math.round(n).toString();
}

function clamp(n: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, n));
}

// short date only
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

/* ---------------- BMI / BMR / Goal estimation ---------------- */

function computeBMI(weightKg: number | null, heightCm: number | null) {
  if (!weightKg || !heightCm) return null;
  const h = heightCm / 100;
  return +(weightKg / (h * h)).toFixed(1);
}

function computeBMR(weightKg: number, heightCm: number, age: number) {
  if (!weightKg || !heightCm || !age) return null;
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

function estimateGoalsFromProfile(profile: any) {
  const weight = Number(profile.weightKg) || null;
  const height = Number(profile.heightCm) || null;
  const age = Number(profile.age) || 30;
  const activity = profile.activity || "Moderate";

  const bmr = computeBMR(weight || 70, height || 170, age) || 1500;
  const kcal = Math.round(bmr * activityMultiplier(activity));

  const proteinG = weight ? Math.round(weight * 1.6) : Math.round((kcal * 0.25) / 4);
  const fatG = Math.round((kcal * 0.25) / 9);
  const remainingCalories = kcal - proteinG * 4 - fatG * 9;
  const carbsG = remainingCalories > 0 ? Math.round(remainingCalories / 4) : Math.round((kcal * 0.45) / 4);

  return {
    kcal,
    proteinG,
    carbsG,
    fatG,
  };
}

/* ---------------- parse nutrients from text ----------------
 Accepts patterns like:
 "420 kcal", "30g protein", "40g carbs", "10g fat"
 Returns { kcal, protein, carbs, fat } (numbers or null)
*/
function parseNutrientsFromText(text: string | undefined | null) {
  if (!text) return null;
  const lower = text.toLowerCase();
  const kcalMatch = lower.match(/(\d{2,5})\s?kcal/);
  const proteinMatch = lower.match(/(\d{1,4})\s?g\s?(?:protein)?/);
  const carbsMatch = lower.match(/(\d{1,4})\s?g\s?(?:carb|carbs|carbohydrate)?/);
  const fatMatch = lower.match(/(\d{1,4})\s?g\s?(?:fat)?/);

  const kcal = kcalMatch ? Number(kcalMatch[1]) : null;
  const protein = proteinMatch ? Number(proteinMatch[1]) : null;
  const carbs = carbsMatch ? Number(carbsMatch[1]) : null;
  const fat = fatMatch ? Number(fatMatch[1]) : null;

  return { kcal, protein, carbs, fat };
}

/* ---------------- today log & goals persistence ---------------- */

const todayIso = () => new Date().toISOString().slice(0, 10);

type TodayLog = {
  dateIso: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
};

type Goals = {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
};

function loadTodayLog(): TodayLog {
  try {
    const raw = localStorage.getItem(TODAY_LOG_KEY);
    if (!raw) return { dateIso: todayIso(), kcal: 0, protein: 0, carbs: 0, fat: 0 };
    const parsed = JSON.parse(raw) as TodayLog;
    if (parsed.dateIso !== todayIso()) return { dateIso: todayIso(), kcal: 0, protein: 0, carbs: 0, fat: 0 };
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

/* ---------------- small UI components ---------------- */

function ProgressBar({ value, target, color = "#34D399" }: { value: number; target: number; color?: string }) {
  const pct = target > 0 ? clamp((value / target) * 100, 0, 200) : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-xs text-slate-600 mb-2">
        <div className="font-medium" style={{ color: "#0f172a" }}>{Math.round(value)} g</div>
        <div className="text-xs text-slate-400">{Math.round(target)} g</div>
      </div>
      <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
        <div style={{ width: `${pct}%`, background: color, height: "100%", transition: "width 400ms ease" }} />
      </div>
    </div>
  );
}

/* ---------------- MAIN PAGE (drop-in) ---------------- */

export default function ChatPage() {
  // client + stored messages
  const [isClient, setIsClient] = useState(false);
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

  // saved convs & profile
  const [savedConversations, setSavedConversations] = useState(() => {
    try {
      const raw = localStorage.getItem(SAVED_CONVS_KEY);
      return raw ? JSON.parse(raw) : [];
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

  // goals & today log
  const initialGoals = (() => {
    const loaded = loadGoals();
    if (loaded) return loaded;
    return estimateGoalsFromProfile(profile);
  })();

  const [goals, setGoalsState] = useState<Goals>(initialGoals);
  const [todayLog, setTodayLogState] = useState<TodayLog>(() => loadTodayLog());

  // chat hook
  const { messages, sendMessage, status, stop, setMessages } = useChat({ messages: initialMessages });

  // refs
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const welcomeShownRef = useRef(false);

  // form
  const form = useForm<{ message: string }>({
    resolver: zodResolver(formSchema),
    defaultValues: { message: "" },
  });

  // mount: sync persisted state
  useEffect(() => {
    setIsClient(true);
    setDurations(stored.durations || {});
    setMessages(stored.messages || []);
    try {
      const rawConvs = localStorage.getItem(SAVED_CONVS_KEY);
      if (rawConvs) setSavedConversations(JSON.parse(rawConvs));
    } catch {}
    try {
      const rawProfile = localStorage.getItem(PROFILE_KEY);
      if (rawProfile) setProfile(JSON.parse(rawProfile));
    } catch {}
    const loadedGoals = loadGoals();
    if (loadedGoals) setGoalsState(loadedGoals);
    setTodayLogState(loadTodayLog());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // persist messages/durations
  useEffect(() => {
    if (!isClient) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ messages, durations }));
    } catch {}
  }, [messages, durations, isClient]);

  // auto-scroll (smart)
  useEffect(() => {
    try {
      const container = messagesContainerRef.current;
      if (!container) {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
        return;
      }

      const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
      const NEAR_BOTTOM_THRESHOLD = 150; // px tolerance

      if (distanceFromBottom <= NEAR_BOTTOM_THRESHOLD) {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }
      // otherwise preserve user's scroll
    } catch (e) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const handleDurationChange = (key: string, duration: number) => {
    setDurations((prev) => ({ ...prev, [key]: duration }));
  };

  /* ---------------- Saved conversations actions ---------------- */

  function saveCurrentConversation() {
    const title = window.prompt("Enter title for this conversation", `Chat ${new Date().toLocaleString()}`);
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
    const next = savedConversations.filter((c: any) => c.id !== convId);
    setSavedConversations(next);
    localStorage.setItem(SAVED_CONVS_KEY, JSON.stringify(next));
    toast.success("Removed conversation");
  }

  function clearChat() {
    setMessages([]);
    setDurations({});
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ messages: [], durations: {} }));
    } catch {}
    toast.success("Chat cleared");
  }

  /* ---------------- Today log & adding nutrients ---------------- */

  function persistTodayLog(next: TodayLog) {
    setTodayLogState(next);
    saveTodayLog(next);
  }

  function addToTodayLog({ kcal = 0, protein = 0, carbs = 0, fat = 0 }: { kcal?: number; protein?: number; carbs?: number; fat?: number }) {
    const current = loadTodayLog();
    const next: TodayLog = {
      dateIso: todayIso(),
      kcal: Math.round((current.kcal || 0) + (kcal || 0)),
      protein: Math.round((current.protein || 0) + (protein || 0)),
      carbs: Math.round((current.carbs || 0) + (carbs || 0)),
      fat: Math.round((current.fat || 0) + (fat || 0)),
    };
    persistTodayLog(next);
    toast.success("Added to today's log");
  }

  function parseAndAddFromText(text: string | undefined | null) {
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
      if (!kcal) kcal = (protein || 0) * 4 + (carbs || 0) * 4 + (fat || 0) * 9;
      const missingProtein = protein == null;
      const missingCarbs = carbs == null;
      const missingFat = fat == null;
      if (kcal && (missingProtein || missingCarbs || missingFat)) {
        const used = (protein || 0) * 4 + (carbs || 0) * 4 + (fat || 0) * 9;
        const remainingCals = Math.max(0, (kcal || 0) - used);
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

    kcal = kcal ? Math.round(kcal) : 0;
    protein = protein ? Math.round(protein) : 0;
    carbs = carbs ? Math.round(carbs) : 0;
    fat = fat ? Math.round(fat) : 0;

    addToTodayLog({ kcal, protein, carbs, fat });
  }

  function addComposerToLog() {
    const txt = form.getValues()?.message?.trim();
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

  /* ---------------- UI actions for profile/goals ---------------- */

  function updateProfileField(updates: Partial<any>) {
    const next = { ...profile, ...updates };
    setProfile(next);
    localStorage.setItem(PROFILE_KEY, JSON.stringify(next));
  }

  function setGoals(next: Goals) {
    setGoalsState(next);
    saveGoals(next);
  }

  function resetTodayLog() {
    const empty = { dateIso: todayIso(), kcal: 0, protein: 0, carbs: 0, fat: 0 };
    persistTodayLog(empty);
    toast.success("Today's log reset");
  }

  /* ---------------- derived values for UI ---------------- */

  const quickPrompts = [
    "Create a 1800 kcal vegetarian day plan",
    "High-protein snack ideas",
    "Count calories: 1 bowl rice, dal, salad",
  ];

  /* ---------------- RENDER ---------------- */

  return (
    <div
      style={{
        backgroundImage: `radial-gradient(circle at 1px 1px, rgba(34,197,94,0.02) 0.6px, transparent 0.6px)`,
        backgroundSize: "10px 10px",
      }}
      className="min-h-screen font-sans antialiased"
    >
      <main className="max-w-7xl mx-auto p-6 grid grid-cols-12 gap-6">
        {/* LEFT: profile + saved convs */}
        <aside className="col-span-12 lg:col-span-3 flex flex-col gap-4">
          <div className="card p-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-lg bg-emerald-50 flex items-center justify-center text-xl">🥗</div>
                <div>
                  <div className="text-sm font-semibold text-slate-800">Personal data</div>
                  <div className="text-xs text-slate-500">Saved locally</div>
                </div>
              </div>
              <div>
                <button className="btn-outline" onClick={() => { document.getElementById("profile-name")?.focus(); }}>Edit</button>
              </div>
            </div>

            <div className="mt-3 space-y-2 text-sm">
              <label className="flex flex-col">
                <span className="text-xs text-slate-500">Name</span>
                <input id="profile-name" value={profile.name || ""} onChange={(e) => updateProfileField({ name: e.target.value })} className="input mt-1" />
              </label>

              <div className="grid grid-cols-3 gap-2">
                <label className="flex flex-col text-xs">
                  <span className="text-slate-500">Age</span>
                  <input value={profile.age || ""} onChange={(e) => updateProfileField({ age: e.target.value })} className="input mt-1" />
                </label>
                <label className="flex flex-col text-xs">
                  <span className="text-slate-500">Height (cm)</span>
                  <input value={profile.heightCm || ""} onChange={(e) => updateProfileField({ heightCm: e.target.value })} className="input mt-1" />
                </label>
                <label className="flex flex-col text-xs">
                  <span className="text-slate-500">Weight (kg)</span>
                  <input value={profile.weightKg || ""} onChange={(e) => updateProfileField({ weightKg: e.target.value })} className="input mt-1" />
                </label>
              </div>

              <label className="flex flex-col text-xs">
                <span className="text-slate-500">Activity level</span>
                <select value={profile.activity || "Moderate"} onChange={(e) => updateProfileField({ activity: e.target.value })} className="input mt-1">
                  <option>Sedentary</option>
                  <option>Light</option>
                  <option>Moderate</option>
                  <option>Active</option>
                </select>
              </label>

              <div className="flex items-center gap-2 mt-2">
                <button className="btn-outline text-sm" onClick={() => {
                  const est = estimateGoalsFromProfile(profile);
                  setGoals(est);
                  saveGoals(est);
                  toast.success("Goals estimated from profile");
                }}>Estimate goals</button>
                <button className="btn-ghost text-sm" onClick={() => { setProfile({ name: "", age: "", heightCm: "", weightKg: "", activity: "Moderate" }); localStorage.removeItem(PROFILE_KEY); toast.success("Profile cleared"); }}>Reset</button>
              </div>
            </div>
          </div>

          <div className="card p-4 flex-1 overflow-auto">
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
                      <div className="text-xs text-slate-400">{dateFmt(c.createdAt)}</div>
                      <div className="text-xs text-slate-500 mt-1 line-clamp-2">
                        {c.messages?.length ? (c.messages[c.messages.length - 1].parts?.map((p: any) => p.text).join(" ") || "").slice(0, 90) : ""}
                      </div>
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

        {/* CENTER chat */}
        <section className="col-span-12 lg:col-span-6 flex flex-col gap-4">
          <div className="card p-5 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center text-2xl">🥗</div>
              <div>
                <h1 className="text-xl font-semibold text-slate-800">NutriBuddy</h1>
                <p className="text-xs text-slate-500">Personalized nutrition chat</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button className="btn-outline" onClick={saveCurrentConversation}><PlusIcon className="size-4 mr-1" /> Save</button>
              <button className="btn-outline" onClick={clearChat}><Eraser className="size-4 mr-1" /> Clear</button>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-lg border border-slate-100 flex flex-col h-[72vh] overflow-hidden">
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

            <div className="flex-1 overflow-y-auto px-4 py-5" ref={messagesContainerRef}>
              <div className="max-w-3xl mx-auto flex flex-col gap-4">
                <MessageWall messages={messages} status={status} durations={durations} onDurationChange={handleDurationChange} onAddToLog={parseAndAddFromText} />

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
                        <Input {...field} placeholder="Type: 'Grilled paneer — 420 kcal, 30g protein, 40g carbs, 10g fat'" className="flex-1 h-14 rounded-full border border-slate-200 shadow-sm px-5" onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            form.handleSubmit((d) => { setIsTyping(true); sendMessage({ text: d.message }); form.reset(); setTimeout(() => setIsTyping(false), 1000); })();
                          }
                        }} />

                        {(status === "ready" || status === "error") && (
                          <button type="submit" className="btn-primary rounded-full" disabled={!field.value.trim()}>
                            <ArrowUp className="size-4 text-white" />
                          </button>
                        )}

                        {(status === "streaming" || status === "submitted") && (
                          <button type="button" className="btn-outline rounded-full" onClick={() => stop()}>
                            <Square className="size-4 text-slate-700" />
                          </button>
                        )}
                      </Field>
                    )}
                  />
                </FieldGroup>

                <div className="mt-3 flex flex-wrap gap-2">
                  {quickPrompts.map((chip) => (
                    <button key={chip} type="button" onClick={() => { form.setValue("message", chip); toast.success("Prompt loaded — press Enter to send"); }} className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-sm hover:bg-emerald-100 transition">
                      {chip}
                    </button>
                  ))}
                </div>
              </form>
            </div>
          </div>
        </section>

        {/* RIGHT: Today's snapshot + suggested meals */}
        <aside className="col-span-12 lg:col-span-3 flex flex-col gap-5">
          <div className="card p-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-800">Today's snapshot</h3>
                <p className="text-xs text-slate-500 mt-1">Log & targets</p>
              </div>
              <div className="text-xs text-slate-400">{todayIso()}</div>
            </div>

            <div className="mt-4 flex items-center gap-4">
              <div>
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
                      strokeDasharray={`${2 * Math.PI * 36}`} strokeDashoffset={`${2 * Math.PI * 36 * (1 - clamp(todayLog.kcal / (goals.kcal || 1), 0, 1))}`} transform="rotate(-90)" />
                    <text textAnchor="middle" dy="6" style={{ fontSize: 14, fontWeight: 600, fill: "#065F46" }}>{Math.round((todayLog.kcal / (goals.kcal || 1)) * 100)}%</text>
                  </g>
                </svg>
              </div>

              <div className="flex-1">
                <div className="text-sm font-semibold text-slate-800">{todayLog.kcal} kcal logged</div>
                <div className="text-xs text-slate-500 mt-1">Goal: {goals.kcal}</div>

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

            {/* Goals inputs */}
            <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
              <label className="flex flex-col text-xs">
                <span className="text-slate-500">Calorie goal</span>
                <input
                  type="number"
                  className="input mt-1"
                  value={goals.kcal ?? ""}
                  onChange={(e) => {
                    const raw = e.target.value;
                    const n = raw === "" ? 0 : Number(raw);
                    const next = { ...goals, kcal: Number(n) };
                    setGoals(next);
                  }}
                />
              </label>

              <label className="flex flex-col text-xs">
                <span className="text-slate-500">Protein (g)</span>
                <input
                  type="number"
                  className="input mt-1"
                  value={goals.proteinG ?? ""}
                  onChange={(e) => {
                    const raw = e.target.value;
                    const n = raw === "" ? 0 : Number(raw);
                    const next = { ...goals, proteinG: Number(n) };
                    setGoals(next);
                  }}
                />
              </label>

              <label className="flex flex-col text-xs">
                <span className="text-slate-500">Carbs (g)</span>
                <input
                  type="number"
                  className="input mt-1"
                  value={goals.carbsG ?? ""}
                  onChange={(e) => {
                    const raw = e.target.value;
                    const n = raw === "" ? 0 : Number(raw);
                    const next = { ...goals, carbsG: Number(n) };
                    setGoals(next);
                  }}
                />
              </label>

              <label className="flex flex-col text-xs">
                <span className="text-slate-500">Fat (g)</span>
                <input
                  type="number"
                  className="input mt-1"
                  value={goals.fatG ?? ""}
                  onChange={(e) => {
                    const raw = e.target.value;
                    const n = raw === "" ? 0 : Number(raw);
                    const next = { ...goals, fatG: Number(n) };
                    setGoals(next);
                  }}
                />
              </label>
            </div>

            <div className="mt-3 flex gap-2">
              <button className="btn-primary text-sm" onClick={() => addComposerToLog()}>Add composer → Log</button>
              <button className="btn-outline text-sm" onClick={() => addLastAssistantMessageToLog()}>Add last assistant → Log</button>
              <button className="btn-ghost text-sm" onClick={() => resetTodayLog()}>Reset</button>
            </div>
          </div>

          {/* Minimalistic suggested meals */}
          <div className="card p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-800">Suggested meals</h3>
              <div className="text-xs text-slate-400">Quick add</div>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-3">
              {[
                { title: "Grilled paneer bowl", kcal: 420, protein: 30, carbs: 40, fat: 10 },
                { title: "Quinoa salad with roasted veg", kcal: 350, protein: 12, carbs: 50, fat: 10 },
                { title: "Chickpea curry + brown rice", kcal: 560, protein: 20, carbs: 80, fat: 12 },
              ].map((m) => (
                <div key={m.title} className="flex items-center justify-between p-3 rounded-md border border-slate-100 bg-white">
                  <div>
                    <div className="text-sm font-medium text-slate-800">{m.title}</div>
                    <div className="text-xs text-slate-500 mt-1">{m.kcal} kcal · {m.protein}g P · {m.carbs}g C</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      className="btn-outline text-xs"
                      onClick={() => {
                        form.setValue("message", `${m.title} — ${m.kcal} kcal, ${m.protein}g protein, ${m.carbs}g carbs, ${m.fat}g fat`);
                        toast.success("Loaded into composer");
                      }}
                    >
                      Load
                    </button>
                    <button
                      className="btn-primary text-xs"
                      onClick={() => {
                        addToTodayLog({ kcal: m.kcal, protein: m.protein, carbs: m.carbs, fat: m.fat });
                      }}
                    >
                      Add
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card p-4 text-xs text-slate-500">
            © {new Date().getFullYear()} {OWNER_NAME} • <Link href="/terms" className="underline">Terms</Link>
          </div>
        </aside>
      </main>
    </div>
  );
}
