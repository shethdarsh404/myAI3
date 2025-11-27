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
  Loader2, 
  Square, 
  PlusIcon, 
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
  AlertCircle,
  ChevronRight,
  BookOpen,
  Share2,
  Download
} from "lucide-react";

import { MessageWall } from "@/components/messages/message-wall";
import { ChatHeader } from "@/app/parts/chat-header";
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

/* ============ Validation & Storage ============ */

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
  } catch (error) {
    console.error("Failed to load messages from localStorage:", error);
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
    const data: StorageData = { messages, durations, userProfile };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    console.error("Failed to save messages to localStorage:", error);
  }
};

/* ============ Advanced Progress Ring Component ============ */

function AnimatedProgressRing({ 
  size = 120, 
  stroke = 12, 
  progress = 0,
  label = "kcal",
  value = 0,
  goal = 2200,
  color = "from-emerald-400 to-emerald-600"
}: { 
  size?: number; 
  stroke?: number; 
  progress: number;
  label?: string;
  value?: number;
  goal?: number;
  color?: string;
}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (progress / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative inline-flex items-center justify-center">
        <svg width={size} height={size} className="drop-shadow-lg">
          <defs>
            <linearGradient id={`gradient-${progress}`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#34D399" />
              <stop offset="100%" stopColor="#059669" />
            </linearGradient>
            <filter id="glow">
              <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
              <feMerge>
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
          </defs>
          <g transform={`translate(${size / 2}, ${size / 2})`}>
            <circle 
              r={radius} 
              fill="none" 
              stroke="#E5E7EB" 
              strokeWidth={stroke}
              opacity="0.3"
            />
            <circle
              r={radius}
              fill="none"
              stroke={`url(#gradient-${progress})`}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={`${circumference} ${circumference}`}
              strokeDashoffset={offset}
              transform="rotate(-90)"
              style={{
                transition: "stroke-dashoffset 0.8s ease-out",
                filter: "url(#glow)"
              }}
            />
          </g>
        </svg>
        <div className="absolute flex flex-col items-center">
          <div className="text-2xl font-bold text-slate-900">{Math.round(progress)}%</div>
          <div className="text-xs text-slate-500">{label}</div>
        </div>
      </div>
      <div className="text-center">
        <p className="text-sm font-semibold text-slate-800">{value.toLocaleString()} / {goal.toLocaleString()}</p>
      </div>
    </div>
  );
}

/* ============ Nutrition Card Component ============ */

function NutritionCard({ 
  title, 
  current, 
  goal, 
  icon: Icon,
  color = "emerald"
}: {
  title: string;
  current: number;
  goal: number;
  icon: React.ElementType;
  color?: string;
}) {
  const progress = Math.min(100, (current / goal) * 100);
  const colors: Record<string, { bg: string; text: string; bar: string }> = {
    emerald: { bg: "bg-emerald-50", text: "text-emerald-700", bar: "bg-gradient-to-r from-emerald-400 to-emerald-600" },
    blue: { bg: "bg-blue-50", text: "text-blue-700", bar: "bg-gradient-to-r from-blue-400 to-blue-600" },
    orange: { bg: "bg-orange-50", text: "text-orange-700", bar: "bg-gradient-to-r from-orange-400 to-orange-600" },
  };
  const c = colors[color] || colors.emerald;

  return (
    <div className={`${c.bg} rounded-xl p-4 border border-${color}-200`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Icon className={`w-5 h-5 ${c.text}`} />
          <span className="text-sm font-semibold text-slate-800">{title}</span>
        </div>
        <span className="text-xs font-bold text-slate-600">{progress.toFixed(0)}%</span>
      </div>
      <div className="w-full bg-white rounded-full h-2 overflow-hidden">
        <div 
          className={`h-full ${c.bar} rounded-full transition-all duration-500`}
          style={{ width: `${Math.min(100, progress)}%` }}
        />
      </div>
      <p className="text-xs text-slate-600 mt-2">{current.toFixed(0)} / {goal} {title.toLowerCase() === "water" ? "ml" : "g"}</p>
    </div>
  );
}

/* ============ Meal Suggestion Card ============ */

function MealCard({
  title,
  calories,
  macros,
  prepTime,
  onLoad,
}: {
  title: string;
  calories: number;
  macros: { protein: number; carbs: number; fat: number };
  prepTime: number;
  onLoad: () => void;
}) {
  return (
    <div className="group relative bg-white border border-slate-200 rounded-xl p-4 hover:shadow-md hover:border-emerald-300 transition-all duration-300 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-emerald-50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      
      <div className="relative z-10">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h4 className="text-sm font-semibold text-slate-800 group-hover:text-emerald-700 transition">{title}</h4>
            <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
              <Clock className="w-3 h-3" /> {prepTime} min
            </p>
          </div>
          <div className="bg-gradient-to-br from-emerald-400 to-emerald-600 text-white px-3 py-1 rounded-lg text-sm font-bold">
            {calories}
          </div>
        </div>

        <div className="flex gap-2 mb-3">
          <div className="flex-1 text-center p-2 bg-blue-50 rounded-lg">
            <p className="text-xs text-blue-600 font-semibold">{macros.protein}g</p>
            <p className="text-xs text-blue-500">Protein</p>
          </div>
          <div className="flex-1 text-center p-2 bg-orange-50 rounded-lg">
            <p className="text-xs text-orange-600 font-semibold">{macros.carbs}g</p>
            <p className="text-xs text-orange-500">Carbs</p>
          </div>
          <div className="flex-1 text-center p-2 bg-pink-50 rounded-lg">
            <p className="text-xs text-pink-600 font-semibold">{macros.fat}g</p>
            <p className="text-xs text-pink-500">Fat</p>
          </div>
        </div>

        <button
          onClick={onLoad}
          className="w-full px-3 py-2 bg-emerald-50 text-emerald-700 text-sm font-semibold rounded-lg hover:bg-emerald-100 transition group-hover:bg-emerald-600 group-hover:text-white"
        >
          Load & Ask
        </button>
      </div>
    </div>
  );
}

/* ============ Achievement Badge ============ */

function AchievementBadge({
  title,
  description,
  icon: Icon,
  unlocked = false,
}: {
  title: string;
  description: string;
  icon: React.ElementType;
  unlocked?: boolean;
}) {
  return (
    <div className={`flex flex-col items-center p-3 rounded-lg border-2 transition ${
      unlocked 
        ? "bg-gradient-to-br from-yellow-50 to-orange-50 border-yellow-300" 
        : "bg-slate-50 border-slate-200 opacity-50"
    }`}>
      <div className={`text-3xl mb-2 ${unlocked ? "scale-110" : ""} transition`}>
        {unlocked ? (
          <div className="relative">
            <Icon className="w-8 h-8 text-yellow-600" />
            <div className="absolute -top-1 -right-1 w-4 h-4 bg-yellow-400 rounded-full animate-pulse" />
          </div>
        ) : (
          <Icon className="w-8 h-8 text-slate-400" />
        )}
      </div>
      <p className="text-xs font-semibold text-center text-slate-800">{title}</p>
      <p className="text-xs text-center text-slate-500 mt-1">{description}</p>
    </div>
  );
}

/* ============ Main Chat Page ============ */

export default function ChatPage() {
  const [isClient, setIsClient] = useState(false);
  const stored = typeof window !== "undefined" ? loadMessagesFromStorage() : { messages: [], durations: {}, userProfile: undefined };
  const [initialMessages] = useState<UIMessage[]>(stored.messages || []);
  const [durations, setDurations] = useState<Record<string, number>>(stored.durations || {});
  const [userProfile, setUserProfile] = useState(stored.userProfile || {
    calorieGoal: 2200,
    proteinGoal: 150,
    waterGoal: 3000,
    streakDays: 5,
  });
  const [isTyping, setIsTyping] = useState(false);
  const [showAchievements, setShowAchievements] = useState(false);

  const { messages, sendMessage, status, stop, setMessages } = useChat({
    messages: initialMessages,
  });

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const welcomeShownRef = useRef<boolean>(false);

  useEffect(() => {
    setIsClient(true);
    setDurations(stored.durations || {});
    setMessages(stored.messages || []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (isClient) saveMessagesToStorage(messages, durations, userProfile);
  }, [messages, durations, isClient, userProfile]);

  useEffect(() => {
    if (isClient && initialMessages.length === 0 && !welcomeShownRef.current) {
      const welcome: UIMessage = {
        id: `welcome-${Date.now()}`,
        role: "assistant",
        parts: [{ type: "text", text: "🥗 Welcome to NutriBuddy Premium! I'm your AI-powered nutrition assistant. Let's create amazing meal plans, track your nutrition goals, and build healthy habits together!\n\nWhat can I help you with today?" }],
      };
      setMessages([welcome]);
      saveMessagesToStorage([welcome], {}, userProfile);
      welcomeShownRef.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isClient]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleDurationChange = (key: string, duration: number) => {
    setDurations((prev) => {
      const next = { ...prev };
      next[key] = duration;
      return next;
    });
  };

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { message: "" },
  });

  function onSubmit(data: z.infer<typeof formSchema>) {
    setIsTyping(true);
    sendMessage({ text: data.message });
    form.reset();
    setTimeout(() => setIsTyping(false), 1200);
  }

  function clearChat() {
    setMessages([]);
    setDurations({});
    saveMessagesToStorage([], {}, userProfile);
    toast.success("Chat cleared! Fresh start 🎉");
  }

  // Parse latest nutrition data
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

  const calorieProgress = Math.min(100, (latestCalories / userProfile.calorieGoal) * 100);
  const proteinProgress = Math.min(100, (45 / userProfile.proteinGoal) * 100); // demo
  const waterProgress = Math.min(100, (2400 / userProfile.waterGoal) * 100); // demo

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

  const achievements = [
    { title: "First Step", description: "Log your first meal", icon: Award, unlocked: true },
    { title: "Streak Master", description: "5 day streak", icon: Flame, unlocked: true },
    { title: "Goal Crusher", description: "Hit macros 10 times", icon: Target, unlocked: false },
    { title: "Water Warrior", description: "3L water daily", icon: Droplets, unlocked: false },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-emerald-50 font-sans antialiased">
      {/* Floating Background Elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 right-10 w-72 h-72 bg-emerald-200 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse" />
        <div className="absolute bottom-20 left-10 w-72 h-72 bg-blue-200 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse" />
      </div>

      <main className="relative z-10 max-w-7xl mx-auto p-4 lg:p-6 grid grid-cols-12 gap-4 lg:gap-6 min-h-screen">
        {/* Left Navigation Sidebar */}
        <nav className="col-span-1 hidden xl:flex flex-col items-center gap-6 pt-6">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-2xl shadow-lg hover:shadow-xl transition transform hover:scale-110">
            🥗
          </div>
          <div className="flex flex-col gap-4">
            <button className="p-3 rounded-lg bg-white border-2 border-emerald-200 text-emerald-600 hover:bg-emerald-50 transition">
              <Heart className="w-5 h-5" />
            </button>
            <button className="p-3 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition">
              <TrendingUp className="w-5 h-5" />
            </button>
            <button className="p-3 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition">
              <Zap className="w-5 h-5" />
            </button>
          </div>
          <div className="mt-auto text-xs text-slate-400 font-semibold">v2.0</div>
        </nav>

        {/* Center Chat Section */}
        <section className="col-span-12 lg:col-span-7 xl:col-span-6 flex flex-col gap-4 lg:gap-5">
          {/* Hero Card */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 backdrop-blur flex items-center justify-between hover:shadow-md transition">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-3xl shadow-lg">
                🥗
              </div>
              <div>
                <h2 className="text-2xl font-bold bg-gradient-to-r from-emerald-600 to-emerald-700 bg-clip-text text-transparent">
                  NutriBuddy Premium
                </h2>
                <p className="text-sm text-slate-500">AI nutrition & meal planning</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={clearChat}
                className="hover:bg-red-50 hover:text-red-600 hover:border-red-300 transition"
              >
                <Eraser className="w-4 h-4 mr-1" />
                Clear
              </Button>
              <Button 
                size="sm"
                onClick={() => toast.success("Saved! ✨")}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                Save
              </Button>
            </div>
          </div>

          {/* Main Chat Card */}
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 flex flex-col h-[calc(100vh-280px)] overflow-hidden hover:shadow-2xl transition">
            {/* Chat Header */}
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-gradient-to-r from-slate-50 to-emerald-50">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-lg bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-lg shadow-md">
                  🤖
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-800">Live Chat</div>
                  <div className="text-xs text-slate-500">Powered by AI • {status}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${status === "streaming" ? "bg-emerald-500 animate-pulse" : "bg-slate-300"}`} />
                <span className="text-xs text-slate-500">{status === "streaming" ? "Thinking..." : "Ready"}</span>
              </div>
            </div>

            {/* Messages Container */}
            <div className="flex-1 overflow-y-auto px-5 py-6 scroll-smooth">
              <div className="max-w-2xl mx-auto flex flex-col gap-4">
                <MessageWall messages={messages} status={status} durations={durations} onDurationChange={handleDurationChange} />

                {isTyping && (
                  <div className="flex items-center gap-3 text-sm text-slate-500 animate-in fade-in slide-in-from-bottom-4">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-xs font-bold text-white">
                      AI
                    </div>
                    <div className="px-4 py-3 rounded-2xl bg-gradient-to-r from-slate-100 to-slate-50 flex items-center gap-2">
                      <div className="flex gap-1">
                        <div className="w-2 h-2 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                        <div className="w-2 h-2 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                        <div className="w-2 h-2 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                      </div>
                      <span className="text-slate-600 font-medium">NutriBuddy is analyzing...</span>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            </div>

            {/* Sticky Composer */}
            <div className="sticky bottom-0 bg-white px-5 py-5 border-t border-slate-200 backdrop-blur bg-opacity-95">
              <form onSubmit={form.handleSubmit(onSubmit)} className="max-w-2xl mx-auto space-y-3">
                <FieldGroup>
                  <Controller
                    name="message"
                    control={form.control}
                    render={({ field }) => (
                      <Field className="flex items-center gap-3">
                        <div className="flex-1 relative">
                          <Input
                            {...field}
                            placeholder="Ask me anything: meal plans, recipes, macros, calories..."
                            className="flex-1 h-14 rounded-2xl border-2 border-slate-200 shadow-sm px-5 focus:border-emerald-400 focus:shadow-lg transition bg-white hover:border-slate-300"
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                form.handleSubmit(onSubmit)();
                              }
                            }}
                          />
                        </div>

                        {(status === "ready" || status === "error") && (
                          <Button 
                            type="submit" 
                            size="icon" 
                            className="rounded-full bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white shadow-lg hover:shadow-xl transition transform hover:scale-105"
                            disabled={!field.value.trim()}
                          >
                            <ArrowUp className="w-5 h-5" />
                          </Button>
                        )}

                        {(status === "streaming" || status === "submitted") && (
                          <Button 
                            size="icon" 
                            className="rounded-full bg-slate-200 hover:bg-slate-300 text-slate-700 transition"
                            onClick={() => stop()}
                          >
                            <Square className="w-5 h-5" />
                          </Button>
                        )}
                      </Field>
                    )}
                  />
                </FieldGroup>

                {/* Quick Prompts */}
                <div className="flex flex-wrap gap-2">
                  {quickPrompts.map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => {
                        form.setValue("message", q);
                        toast.success("Prompt ready! Press Enter ↩️");
                      }}
                      className="px-3 py-1.5 rounded-full text-sm font-medium bg-gradient-to-r from-emerald-50 to-emerald-100 text-emerald-700 hover:from-emerald-100 hover:to-emerald-200 border border-emerald-200 transition hover:shadow-md hover:-translate-y-0.5"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </form>
            </div>
          </div>
        </section>

        {/* Right Insights & Tracking Sidebar */}
        <aside className="col-span-12 lg:col-span-5 xl:col-span-4 flex flex-col gap-4 lg:gap-5 max-h-[calc(100vh-100px)] overflow-y-auto">
          
          {/* Today's Snapshot */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 hover:shadow-md transition">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold text-slate-800">📊 Today's Snapshot</h3>
                <p className="text-xs text-slate-500">Nutrition & goals</p>
              </div>
              <button 
                onClick={() => setShowAchievements(!showAchievements)}
                className="text-2xl hover:scale-125 transition"
              >
                {showAchievements ? "📈" : "🎖️"}
              </button>
            </div>

            {!showAchievements ? (
              <>
                <div className="flex justify-center mb-5">
                  <AnimatedProgressRing 
                    size={120} 
                    stroke={12} 
                    progress={calorieProgress}
                    value={latestCalories}
                    goal={userProfile.calorieGoal}
                  />
                </div>

                <div className="space-y-3">
                  <NutritionCard 
                    title="Protein" 
                    current={45} 
                    goal={userProfile.proteinGoal}
                    icon={Zap}
                    color="blue"
                  />
                  <NutritionCard 
                    title="Carbs" 
                    current={120} 
                    goal={280}
                    icon={UtensilsCrossed}
                    color="orange"
                  />
                  <NutritionCard 
                    title="Water" 
                    current={2400} 
                    goal={userProfile.waterGoal}
                    icon={Droplets}
                    color="blue"
                  />
                </div>

                <div className="mt-4 flex gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="flex-1 text-xs"
                    onClick={() => toast.success("Export in PDF (demo) 📥")}
                  >
                    <Download className="w-3 h-3 mr-1" /> Export
                  </Button>
                  <Button 
                    size="sm" 
                    className="flex-1 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                    onClick={() => toast.success("Shared! 🔗")}
                  >
                    <Share2 className="w-3 h-3 mr-1" /> Share
                  </Button>
                </div>
              </>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {achievements.map((a) => (
                  <AchievementBadge key={a.title} {...a} />
                ))}
              </div>
            )}
          </div>

          {/* Suggested Meals */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 hover:shadow-md transition">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold text-slate-800">🍽️ Meal Suggestions</h3>
                <p className="text-xs text-slate-500">Based on your goals</p>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400" />
            </div>
            <div className="space-y-3 max-h-72 overflow-y-auto">
              {suggestedMeals.map((m) => (
                <MealCard
                  key={m.title}
                  title={m.title}
                  calories={m.calories}
                  macros={m.macros}
                  prepTime={m.prepTime}
                  onLoad={() => {
                    form.setValue("message", `Tell me more about: ${m.title} — ingredients, cooking steps, nutritional info?`);
                    toast.success("Loaded! Press Enter ↩️");
                  }}
                />
              ))}
            </div>
          </div>

          {/* Insights & Tips */}
          <div className="bg-gradient-to-br from-emerald-50 to-blue-50 rounded-2xl p-5 shadow-sm border border-emerald-200 hover:shadow-md transition">
            <div className="flex items-center gap-2 mb-3">
              <Zap className="w-5 h-5 text-emerald-600" />
              <h3 className="text-sm font-bold text-slate-800">💡 Pro Tips</h3>
            </div>
            <ul className="space-y-2 text-xs text-slate-700">
              <li className="flex gap-2">
                <span className="text-emerald-600">→</span>
                <span>Prep meals on Sunday for consistent goals</span>
              </li>
              <li className="flex gap-2">
                <span className="text-emerald-600">→</span>
                <span>Drink water 30 min before meals</span>
              </li>
              <li className="flex gap-2">
                <span className="text-emerald-600">→</span>
                <span>High-protein snacks keep you fuller</span>
              </li>
            </ul>
          </div>

          {/* Footer */}
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200 text-center">
            <p className="text-xs text-slate-500 mb-2">
              © {new Date().getFullYear()} {OWNER_NAME}
            </p>
            <div className="flex items-center justify-center gap-4 text-xs">
              <Link href="/terms" className="text-emerald-600 hover:underline font-medium">
                Terms
              </Link>
              <span className="text-slate-300">•</span>
              <Link href="/privacy" className="text-emerald-600 hover:underline font-medium">
                Privacy
              </Link>
              <span className="text-slate-300">•</span>
              <button className="text-emerald-600 hover:underline font-medium">
                Help
              </button>
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}
