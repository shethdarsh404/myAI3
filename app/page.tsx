"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import * as z from "zod";

import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useChat } from "@ai-sdk/react";
import { 
  ArrowUp, 
  Square, 
  Eraser, 
  Flame,
  Zap,
  TrendingUp,
  Heart,
  Award,
  Clock,
  UtensilsCrossed,
  Droplets,
  Target,
  ChevronRight,
  Share2,
  Download
} from "lucide-react";

import { MessageWall } from "@/components/messages/message-wall";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

import { UIMessage } from "ai";
import { useEffect, useRef, useState } from "react";

import { AI_NAME, OWNER_NAME, WELCOME_MESSAGE } from "@/config";

// Validation & Storage
const formSchema = z.object({
  message: z.string().min(1).max(2000),
});
const STORAGE_KEY = "chat-messages";

type StorageData = {
  messages: UIMessage[];
  durations: Record<string, number>;
  userProfile?: {
    calorieGoal: number;
    proteinGoal: number;
    waterGoal: number;
    streakDays: number;
  };
};

const loadMessagesFromStorage = (): StorageData => {
  if (typeof window === "undefined") return { messages: [], durations: {}, userProfile: undefined };
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return { messages: [], durations: {}, userProfile: undefined };
    const parsed = JSON.parse(stored) as StorageData;
    return {
      messages: parsed.messages || [],
      durations: parsed.durations || {},
      userProfile: parsed.userProfile,
    };
  } catch {
    return { messages: [], durations: {}, userProfile: undefined };
  }
};

const saveMessagesToStorage = (
  messages: UIMessage[],
  durations: Record<string, number>,
  userProfile?: StorageData["userProfile"]
) => {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ messages, durations, userProfile }));
  } catch {}
};

// Chat Page Component
export default function ChatPage() {
  const [isClient, setIsClient] = useState(false);
  const stored = typeof window !== "undefined" ? loadMessagesFromStorage() : { messages: [], durations: {} };
  const [initialMessages] = useState<UIMessage[]>(stored.messages || []);
  const [durations, setDurations] = useState<Record<string, number>>(stored.durations || {});
  const [userProfile, setUserProfile] = useState(stored.userProfile || {
    calorieGoal: 2200,
    proteinGoal: 150,
    waterGoal: 3000,
    streakDays: 5,
  });
  const [isTyping, setIsTyping] = useState(false);

  const { messages, sendMessage, status, stop, setMessages } = useChat({ messages: initialMessages });
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const welcomeShownRef = useRef(false);

  useEffect(() => {
    setIsClient(true);
    setDurations(stored.durations || {});
    setMessages(stored.messages || []);
  }, []);

  useEffect(() => {
    if (isClient) {
      saveMessagesToStorage(messages, durations, userProfile);
    }
  }, [messages, durations, isClient, userProfile]);

  useEffect(() => {
    if (isClient && initialMessages.length === 0 && !welcomeShownRef.current) {
      const welcome: UIMessage = {
        id: `welcome-${Date.now()}`,
        role: "assistant",
        parts: [{ type: "text", text: `👋 ${WELCOME_MESSAGE}` }],
      };
      setMessages([welcome]);
      saveMessagesToStorage([welcome], {}, userProfile);
      welcomeShownRef.current = true;
    }
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleDurationChange = (key: string, duration: number) => {
    setDurations(prev => ({ ...prev, [key]: duration }));
  };

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { message: "" },
  });

  const onSubmit = (data: z.infer<typeof formSchema>) => {
    setIsTyping(true);
    sendMessage({ text: data.message });
    form.reset();
    setTimeout(() => setIsTyping(false), 1200);
  };

  const clearChat = () => {
    setMessages([]);
    setDurations({});
    saveMessagesToStorage([], {}, userProfile);
    toast.success("Chat cleared");
  };

  // Parse latest calories
  const latestCalories = (() => {
    const txt = messages
      .map((m) => {
        if (m.parts && m.parts.length) return m.parts.map((p: any) => p.text).join(" ");
        return (m as any).text || "";
      })
      .join(" ");
    const match = txt.match(/(\d{2,4})\s?k?c?a?l?/i);
    return match ? Number(match[1]) : 0;
  })();

  // Progress calculations
  const calorieProgress = Math.min(100, (latestCalories / userProfile.calorieGoal) * 100);
  const macroProgress = (45 / userProfile.proteinGoal) * 100; // demo
  const waterProgress = (2400 / userProfile.waterGoal) * 100; // demo

  const suggestedMeals = [
    { title: "Mediterranean Chickpea Bowl", calories: 420, macros: { protein: 18, carbs: 52, fat: 12 }, prepTime: 15 },
    { title: "Grilled Paneer & Quinoa", calories: 480, macros: { protein: 28, carbs: 45, fat: 14 }, prepTime: 20 },
    { title: "Thai Green Curry (Tofu)", calories: 350, macros: { protein: 22, carbs: 35, fat: 10 }, prepTime: 25 },
    { title: "Salmon & Sweet Potato", calories: 520, macros: { protein: 35, carbs: 42, fat: 16 }, prepTime: 30 },
  ];

  const quickPrompts = [
    "🍽️ Build me a 1800 kcal vegetarian meal plan",
    "💪 High-protein snacks under 200 kcal",
    "📸 Count calories: 1 bowl rice, dal, salad",
    "🎯 Help me hit my protein goal today",
  ];

  return (
    <div className="min-h-screen bg-white bg-[url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="%e0e0e0"/><stop offset="100%" stop-color="%f0f0f0"/></linearGradient><rect width="40" height="40" fill="url(%23grad)" stroke="%e0e0e0" stroke-width="1"/></svg>')] opacity-40 bg-repeat">
      {/* Background pattern used above, ensure proper escaping */}
      <main className="max-w-7xl mx-auto p-4 lg:p-6 grid grid-cols-12 gap-4 lg:gap-6 min-h-screen">
        {/* Sidebar */}
        <aside className="col-span-1 hidden lg:flex flex-col items-center gap-4 pt-6">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center text-2xl shadow-lg">🥗</div>
        </aside>
        {/* Chat section */}
        <section className="col-span-12 lg:col-span-7 flex flex-col gap-4">
          {/* Header */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center text-2xl">🥗</div>
              <div>
                <h2 className="text-xl font-semibold text-slate-800">{AI_NAME}</h2>
                <p className="text-sm text-slate-500">AI nutrition & meal planning</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={clearChat}><Eraser className="w-4 h-4 mr-1" />Clear</Button>
              <Button size="sm" onClick={() => toast.success("Saved! ✨")} className="bg-emerald-600 hover:bg-emerald-700 text-white">Save</Button>
            </div>
          </div>
          {/* Chat messages */}
          <div className="flex-1 overflow-y-auto px-4 py-6 bg-white rounded-2xl border border-slate-100 shadow-inner">
            <div className="flex flex-col gap-4">
              <MessageWall messages={messages} status={status} durations={durations} onDurationChange={handleDurationChange} />
              {isTyping && (
                <div className="flex items-center gap-3 text-sm text-slate-500 animate-in fade-in slide-in-from-bottom-4">
                  <div className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center">AI</div>
                  <div className="px-4 py-3 rounded-2xl bg-slate-100 flex items-center gap-2">
                    <div className="flex gap-1">
                      <div className="w-2 h-2 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                      <div className="w-2 h-2 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                      <div className="w-2 h-2 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                    </div>
                    <span className="font-medium">NutriBuddy is analyzing...</span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          </div>
          {/* Input footer */}
          <div className="sticky bottom-0 bg-white px-4 py-4 border-t border-slate-100">
            <form onSubmit={form.handleSubmit(onSubmit)} className="flex gap-3 items-center max-w-3xl mx-auto">
              <Controller
                name="message"
                control={form.control}
                render={({ field }) => (
                  <div className="flex-1 relative">
                    <Input
                      {...field}
                      placeholder="Ask me: meal plans, recipes, macros..."
                      className="h-14 rounded-full border border-slate-200 px-5 shadow-sm focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-200"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          form.handleSubmit(onSubmit)();
                        }
                      }}
                    />
                  </div>
                )}
              />
              {(status === "ready" || status === "error") && (
                <Button
                  type="submit"
                  size="icon"
                  className="rounded-full bg-emerald-600 hover:bg-emerald-700 text-white"
                  disabled={!form.getValues("message").trim()}
                >
                  <ArrowUp className="w-5 h-5" />
                </Button>
              )}
              {(status === "streaming" || status === "submitted") && (
                <Button size="icon" className="rounded-full bg-slate-200 hover:bg-slate-300" onClick={() => stop()}>
                  <Square className="w-5 h-5" />
                </Button>
              )}
            </form>
            <div className="mt-2 flex flex-wrap gap-2 justify-center">
              {quickPrompts.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => {
                    form.setValue("message", q);
                    toast.success("Prompt loaded — press Enter");
                  }}
                  className="px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700 text-sm hover:bg-emerald-100 transition"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        </section>
        {/* Sidebar metrics */}
        <aside className="hidden lg:flex flex-col gap-4 col-span-5 max-h-screen overflow-y-auto p-4">
          {/* Summary & progress */}
          <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-800 mb-2">📊 Today's Snapshot</h3>
            {/* Progress ring for calories */}
            <div className="flex justify-center mb-4">
              <div className="relative w-24 h-24">
                <svg className="absolute inset-0" width={96} height={96}>
                  <circle cx={48} cy={48} r={40} fill="none" stroke="#e5e7eb" strokeWidth={8} />
                  <circle
                    cx={48}
                    cy={48}
                    r={40}
                    fill="none"
                    stroke="#10b981"
                    strokeWidth={8}
                    strokeLinecap="round"
                    strokeDasharray={2 * Math.PI * 40}
                    strokeDashoffset={(1 - calorieProgress / 100) * 2 * Math.PI * 40}
                    style={{ transition: "stroke-dashoffset 0.5s ease" }}
                    transform="rotate(-90 48 48)"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center text-lg font-bold text-slate-700">
                  {Math.round(calorieProgress)}%
                </div>
              </div>
            </div>
            {/* Macros breakdown */}
            <div className="grid grid-cols-2 gap-4 text-sm text-slate-600">
              <div className="flex flex-col items-center">
                <Heart className="w-5 h-5 text-red-400" />
                <div>Protein</div>
                <div className="text-xs mt-1">{Math.round((45 / userProfile.proteinGoal) * 100)}%</div>
              </div>
              <div className="flex flex-col items-center">
                <TrendingUp className="w-5 h-5 text-blue-400" />
                <div>Carbs</div>
                <div className="text-xs mt-1">{Math.round((120 / 280) * 100)}%</div>
              </div>
              <div className="flex flex-col items-center">
                <Droplets className="w-5 h-5 text-blue-300" />
                <div>Water</div>
                <div className="text-xs mt-1">{Math.round((2400 / userProfile.waterGoal) * 100)}%</div>
              </div>
            </div>
            <div className="mt-3 flex gap-2 justify-center">
              <Button variant="outline" size="sm" onClick={() => toast.success("Export in PDF")}>
                <Download className="w-3 h-3 mr-1" /> Export
              </Button>
              <Button size="sm" onClick={() => toast.success("Shared!")}>
                <Share2 className="w-3 h-3 mr-1" /> Share
              </Button>
            </div>
          </div>
          {/* Suggested meals */}
          <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-800 mb-2">🍽️ Meal Suggestions</h3>
            <div className="flex flex-col gap-3 max-h-48 overflow-y-auto">
              {suggestedMeals.map((meal) => (
                <div key={meal.title} className="p-2 border border-slate-200 rounded-lg shadow-sm hover:shadow-md transition cursor-pointer" onClick={() => {
                  form.setValue("message", `Tell me more about: ${meal.title} — ingredients, steps, macros`);
                  toast.success("Loaded! Press Enter");
                }}>
                  <div className="font-semibold">{meal.title}</div>
                  <div className="text-xs text-slate-500">{meal.calories} kcal</div>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}
