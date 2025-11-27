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
  Heart,
  TrendingUp,
  Zap,
  Droplets,
  Target,
} from "lucide-react";

import { MessageWall } from "@/components/messages/message-wall";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

import { UIMessage } from "ai";
import { useEffect, useRef, useState } from "react";
import { OWNER_NAME, WELCOME_MESSAGE } from "@/config";

/* -------- Validation & Storage -------- */

const formSchema = z.object({
  message: z.string().min(1).max(2000),
});

const STORAGE_KEY = "chat-messages";

type StorageData = {
  messages: UIMessage[];
  durations: Record<string, number>;
};

const loadMessagesFromStorage = (): StorageData => {
  if (typeof window === "undefined") return { messages: [], durations: {} };
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return { messages: [], durations: {} };
    const parsed = JSON.parse(stored) as StorageData;
    return {
      messages: parsed.messages || [],
      durations: parsed.durations || {},
    };
  } catch (error) {
    console.error("Failed to load messages from localStorage:", error);
    return { messages: [], durations: {} };
  }
};

const saveMessagesToStorage = (
  messages: UIMessage[],
  durations: Record<string, number>
) => {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ messages, durations }));
  } catch (error) {
    console.error("Failed to save messages:", error);
  }
};

/* -------- Minimal Background Pattern -------- */

function MinimalBackground() {
  return (
    <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="%e0e0e0"/><stop offset="100%" stop-color="%f0f0f0"/></linearGradient><rect width="40" height="40" fill="url(%23grad)" stroke="%e0e0e0" stroke-width="1"/></svg>')] opacity-20 bg-repeat"
      />
    </div>
  );
}

/* -------- Main Chat Page -------- */

export default function ChatPage() {
  const [isClient, setIsClient] = useState(false);
  const stored = typeof window !== "undefined" ? loadMessagesFromStorage() : { messages: [], durations: {} };
  const [initialMessages] = useState<UIMessage[]>(stored.messages || []);
  const [durations, setDurations] = useState<Record<string, number>>(stored.durations || {});
  const [isTyping, setIsTyping] = useState(false);

  const { messages, sendMessage, status, stop, setMessages } = useChat({ messages: initialMessages });
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const welcomeShownRef = useRef(false);

  useEffect(() => {
    setIsClient(true);
    setMessages(stored.messages || []);
  }, []);

  useEffect(() => {
    if (isClient) saveMessagesToStorage(messages, durations);
  }, [messages, durations, isClient]);

  useEffect(() => {
    if (isClient && initialMessages.length === 0 && !welcomeShownRef.current) {
      const welcome: UIMessage = {
        id: `welcome-${Date.now()}`,
        role: "assistant",
        parts: [{ type: "text", text: WELCOME_MESSAGE }],
      };
      setMessages([welcome]);
      saveMessagesToStorage([welcome], {});
      welcomeShownRef.current = true;
    }
  }, [isClient]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleDurationChange = (key: string, duration: number) => {
    setDurations((prev) => ({ ...prev, [key]: duration }));
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
    saveMessagesToStorage([], {});
    toast.success("Chat cleared");
  }

  // Parse latest calories from messages
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

  // Proportions
  const caloriePercent = Math.min(100, (latestCalories / 2200) * 100);

  // Quick prompts
  const quickPrompts = [
    "🍽️ Build me a 1800 kcal vegetarian meal plan",
    "💪 High-protein snacks under 200 kcal",
    "📸 Count calories: 1 bowl rice, dal, salad",
  ];

  return (
    <div className="relative min-h-screen bg-white font-sans overflow-hidden">
      <MinimalBackground />

      {/* Main Container */}
      <div className="relative z-10 max-w-6xl mx-auto p-4 sm:p-6">
        {/* Header */}
        <header className="flex items-center justify-between mb-4 md:mb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-emerald-200 flex items-center justify-center text-2xl shadow-lg">
              🥗
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-slate-800">NutriBuddy</h1>
              <p className="text-sm text-slate-500">Meal & Nutrition Planner</p>
            </div>
          </div>
          <button className="px-3 py-1 text-sm rounded-lg border border-slate-200 hover:bg-slate-50 transition" onClick={clearChat}>
            <Eraser className="w-4 h-4 mr-2 inline" /> Clear
          </button>
        </header>

        {/* Chat & Messages Area */}
        <div className="flex flex-col-reverse lg:flex-row gap-4 lg:gap-6 min-h-[70vh] lg:min-h-[75vh] rounded-xl bg-white shadow-md overflow-hidden backdrop-blur-sm border border-slate-200 relative z-0">
          
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 scrollbar-thin scrollbar-thumb-slate-300 scrollbar-rounded">
            <MessageWall messages={messages} status={status} durations={durations} onDurationChange={handleDurationChange} />
            {isTyping && (
              <div className="flex items-center gap-3 mt-4 text-sm text-slate-500 animate-fade-in">
                <div className="w-8 h-8 rounded-full bg-emerald-200 flex items-center justify-center font-semibold text-sm shadow-md">AI</div>
                <div className="px-3 py-2 rounded-lg bg-slate-100 max-w-md">
                  NutriBuddy is thinking...
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Composer */}
          <div className="p-4 border-t border-slate-200 bg-white backdrop-blur-md">
            <form onSubmit={form.handleSubmit(onSubmit)} className="flex items-center gap-3 max-w-3xl mx-auto">
              <Controller
                name="message"
                control={form.control}
                render={({ field }) => (
                  <input
                    {...field}
                    placeholder="Ask about meal plans, recipes, macros..."
                    className="flex-1 h-14 px-4 rounded-full border-2 border-slate-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-0 transition bg-white"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        form.handleSubmit(onSubmit)();
                      }
                    }}
                  />
                )}
              />

              {(status === "ready" || status === "error") && (
                <button
                  type="submit"
                  className="p-3 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white transition shadow-lg"
                  disabled={!form.getValues("message").trim()}
                >
                  <ArrowUp className="w-5 h-5" />
                </button>
              )}
              {(status === "streaming" || status === "submitted") && (
                <button
                  type="button"
                  className="p-3 rounded-full bg-slate-200 hover:bg-slate-300 text-slate-700 transition shadow-lg"
                  onClick={() => stop()}
                >
                  <Square className="w-5 h-5" />
                </button>
              )}
            </form>
            {/* Quick prompts - minimal */}
            <div className="mt-3 flex flex-wrap gap-2 justify-center md:justify-start">
              {quickPrompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  className="px-3 py-1 text-sm rounded-full bg-slate-100 hover:bg-slate-200 transition"
                  onClick={() => {
                    form.setValue("message", prompt);
                    toast.success("Prompt loaded! Press Enter");
                  }}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Minimal Metrics Sidebar (hidden on small screens, slide-in on click can be added) */}
        {/* For simplicity, omit sidebars in minimal version, focusing on chat */}
      </div>
    </div>
  );
}
