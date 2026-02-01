"use client"

import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Avatar } from "@/components/ui/avatar"
import { Card } from "@/components/ui/card"
import { Paperclip, Send, Loader2, Sparkles, Film, Download, RefreshCw, X, Play } from "lucide-react"
import { cn } from "@/lib/utils"
import { PopcornSequence } from "@/types/cinema"
import { supabase } from "@/lib/supabase"
import { CinemaControls } from "@/components/CinemaControls"

// --- Media Preview Component (Light Theme) ---
const MediaPreview = ({ src, type, onAnimate, isAnimating }: { src: string, type: 'image' | 'video', onAnimate?: () => void, isAnimating?: boolean }) => {
    return (
        <div className="mt-3 rounded-2xl overflow-hidden border border-gray-100 shadow-xl shadow-gray-200/50 relative group bg-white">
            {type === 'image' ? (
                <>
                    <img src={src} alt="Preview" className="w-full h-auto object-cover" />
                    {onAnimate && (
                        <div className="absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                                onClick={onAnimate}
                                disabled={isAnimating}
                                className="bg-white/90 hover:bg-white text-purple-600 text-xs px-4 py-2 rounded-full flex items-center gap-2 border border-purple-100 shadow-lg backdrop-blur-md transition-all font-bold"
                            >
                                {isAnimating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Film className="w-3 h-3 text-purple-600" />}
                                {isAnimating ? "Animating..." : "Animate"}
                            </button>
                        </div>
                    )}
                </>
            ) : (
                <div className="relative">
                    <video src={src} controls autoPlay loop className="w-full h-auto" />
                    <div className="absolute top-2 right-2">
                        <a href={src} download className="p-2 bg-white/80 text-gray-900 rounded-full hover:bg-white transition-colors shadow-sm">
                            <Download className="w-4 h-4" />
                        </a>
                    </div>
                </div>
            )}
        </div>
    )
}

interface DirectorChatProps {
    onFinalize: (data: any) => void
}

export function DirectorChat({ onFinalize }: DirectorChatProps) {
    // Chat State
    const [messages, setMessages] = useState<Array<{
        role: string,
        content: string | any,
        id?: string,
        type?: string,
        mediaUrl?: string,
        mediaUrls?: string[],
        projectPlan?: any,
        specs?: any,
        previewUrl?: string | null,
        videoUrl?: string | null,
        storyboard?: PopcornSequence
    }>>([
        {
            role: 'assistant',
            content: "Hello! I'm your Creative Director. Describe your vision...",
            id: 'welcome'
        }
    ])
    const [input, setInput] = useState("")
    const [isLoading, setIsLoading] = useState(false)
    const [uploadedImages, setUploadedImages] = useState<string[]>([])
    const messagesEndRef = useRef<HTMLDivElement>(null)
    const [finalPlan, setFinalPlan] = useState<any>(null)
    const [isProcessing, setIsProcessing] = useState(false)
    const [isGeneratingPreview, setIsGeneratingPreview] = useState<string | null>(null)
    const [isAnimating, setIsAnimating] = useState<string | null>(null)
    const [recentPrompt, setRecentPrompt] = useState("")

    // Real-time Image Generation State
    const [sessionId, setSessionId] = useState<string | null>(null)
    const [generatingImages, setGeneratingImages] = useState<{
        hero_shot?: 'pending' | 'processing' | 'success' | 'failed';
        hero_plus_start?: 'pending' | 'processing' | 'success' | 'failed';
        hero_plus_end?: 'pending' | 'processing' | 'success' | 'failed';
    }>({})
    const [generatedImages, setGeneratedImages] = useState<{
        hero_shot?: string;
        hero_plus_start?: string;
        hero_plus_end?: string;
    }>({})

    // Console & Generation Settings
    const [genSettings, setGenSettings] = useState({
        aspectRatio: '16:9',
        resolution: 'HD',
        batchSize: 1
    })

    const [manualSpecs, setManualSpecs] = useState<any>({
        camera: "",
        lens: "",
        lighting: "",
        mood: ""
    })

    useEffect(() => {
        if (!sessionId) return;
        const channel = supabase
            .channel('image-generation')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'image_generation_tasks', filter: `session_id=eq.${sessionId}` },
                (payload) => {
                    const task = payload.new as any;
                    setGeneratingImages(prev => ({ ...prev, [task.task_type]: task.status }));
                    if (task.status === 'success' && task.image_url) {
                        setGeneratedImages(prev => ({ ...prev, [task.task_type]: task.image_url }));
                    }
                }
            )
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [sessionId]);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
    }

    useEffect(() => {
        scrollToBottom()
    }, [messages])

    // --- SEQUENTIAL WORKFLOW TRIGGER ---
    // Watch for Hero Shot success to trigger Hero+ (Product Integration)
    useEffect(() => {
        if (generatedImages.hero_shot && !generatingImages.hero_plus_start) {
            // Hero Shot is ready! Now let's trigger Hero+
            // 1. Find the Product Image (from the last user message with images)
            const lastUserMsgWithImg = [...messages].reverse().find(m => m.role === 'user' && m.mediaUrls && m.mediaUrls.length > 0);
            const productImageUrl = lastUserMsgWithImg?.mediaUrls?.[0];

            if (productImageUrl) {
                console.log("🚀 Hero Shot Ready. Triggering Hero+ with Product Integration...");
                setGeneratingImages(prev => ({ ...prev, hero_plus_start: 'processing' }));

                fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/cinema-director`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`
                    },
                    body: JSON.stringify({
                        action: "generate_image",
                        prompt: recentPrompt + " holding product, cinematic composition", // Append context for product
                        specs: manualSpecs,
                        settings: genSettings,
                        sessionId: sessionId,
                        taskType: "hero_plus_start",
                        // CRITICAL: Pass BOTH the Hero Shot (Context) and Product Image (Subject)
                        image_urls: [generatedImages.hero_shot, productImageUrl]
                    })
                }).catch(e => console.error("Hero+ trigger failed", e));
            } else {
                console.log("⚠️ Hero Shot Ready, but no Product Image found for Hero+.");
            }
        }
    }, [generatedImages.hero_shot, generatingImages.hero_plus_start, messages, sessionId, manualSpecs, genSettings, recentPrompt]);

    const handleFinalizeProject = () => {
        setIsProcessing(true)
        setTimeout(() => {
            setIsProcessing(false)
            onFinalize(finalPlan || { messages })
        }, 1500)
    }

    const handleSendMessage = async () => {
        if (!input.trim() && uploadedImages.length === 0) return

        const currentSessionId = sessionId || crypto.randomUUID();
        if (!sessionId) setSessionId(currentSessionId);

        const newUserMsg = { role: 'user', content: input, id: crypto.randomUUID(), mediaUrls: uploadedImages }
        setMessages(prev => [...prev, newUserMsg])
        setInput("")
        setRecentPrompt(input)
        setIsLoading(true)

        try {
            const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/cinema-director`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`
                },
                body: JSON.stringify({
                    action: "chat",
                    prompt: input,
                    image_urls: uploadedImages,
                    sessionId: currentSessionId,
                    history: messages.map(m => ({ role: m.role, content: typeof m.content === 'string' ? m.content : m.content?.message })),
                    specs: manualSpecs,
                    settings: genSettings
                })
            })

            const data = await response.json()
            if (data.error) throw new Error(data.error)

            const content = data.content;
            let messageContent = content;
            let assistantMsgId = crypto.randomUUID();

            if (typeof content === 'object') {
                if (content.specs) setManualSpecs((prev: any) => ({ ...prev, ...content.specs }))
                messageContent = content.message || content.response || JSON.stringify(content);

                // --- AUTO-TRIGGER HERO SHOT ---
                if (content.ready_for_hero_shot) {
                    // Set loading state immediately so UI shows "Rendering..."
                    setGeneratingImages(prev => ({ ...prev, hero_shot: 'processing' }));

                    // Trigger backend generation without awaiting (fire and forget - realtime will update)
                    fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/cinema-director`, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            "Authorization": `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`
                        },
                        body: JSON.stringify({
                            action: "generate_image", // Using specific action for tasks
                            prompt: content.refined_prompt || input, // Use the refined prompt from AI
                            specs: content.specs || manualSpecs,
                            settings: genSettings,
                            sessionId: currentSessionId,
                            taskType: "hero_shot",
                            image_urls: [] // EMPTY for Hero Shot (Scene Only - Step 1)
                        })
                    }).then(async (res) => {
                        if (!res.ok) console.error("Auto-gen failed", await res.text());
                    }).catch(e => console.error("Auto-gen error", e));
                }
            }

            setMessages(prev => [...prev, {
                role: 'assistant',
                content: messageContent,
                id: assistantMsgId,
                storyboard: content.storyboard,
                // If we triggered generation, attach the processing state implicitly via the messages rendering logic
                // But we can also pass a flag if needed. The current UI relies on generatingImages state.
            }])

            if (uploadedImages.length > 0) setUploadedImages([])

        } catch (error) {
            console.error("Chat error:", error)
            setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${error instanceof Error ? error.message : "Connection error"}`, id: crypto.randomUUID() }])
        } finally {
            setIsLoading(false)
        }
    }

    const handleGeneratePreview = async (msgId: string, prompt: string, specs: any) => {
        setIsGeneratingPreview(msgId);
        setIsLoading(true)
        const effectivePrompt = prompt || [...messages].reverse().find(m => m.role === 'user')?.content || "Cinematic product shot";

        try {
            const currentSessionId = sessionId || crypto.randomUUID();
            if (!sessionId) setSessionId(currentSessionId);

            const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/cinema-director`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`
                },
                body: JSON.stringify({
                    action: "generate_preview",
                    prompt: effectivePrompt,
                    specs: specs,
                    settings: genSettings,
                    sessionId: currentSessionId
                })
            });

            if (!response.ok) throw new Error("Preview generation failed");
            const data = await response.json();

            setMessages(prev => prev.map(m => m.id === msgId ? { ...m, previewUrl: data.image_url, videoUrl: null } : m));

        } catch (error) {
            console.error(error);
        } finally {
            setIsLoading(false);
            setIsGeneratingPreview(null);
        }
    };

    const handleAnimatePreview = async (msgId: string, imageUrl: string) => {
        setIsLoading(true);
        setIsAnimating(msgId);
        try {
            const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/cinema-director`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`
                },
                body: JSON.stringify({ action: "animate_preview", image_url: imageUrl })
            });

            if (!response.ok) throw new Error("Animation start failed");
            const data = await response.json();
            const taskId = data.task_id;

            const pollInterval = setInterval(async () => {
                try {
                    const statusRes = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/cinema-director`, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            "Authorization": `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`
                        },
                        body: JSON.stringify({ action: "check_status", task_id: taskId })
                    });
                    const statusData = await statusRes.json();
                    if (statusData.status === 'done') {
                        clearInterval(pollInterval);
                        setIsLoading(false);
                        setIsAnimating(null);
                        setMessages(prev => prev.map(m => m.id === msgId ? { ...m, videoUrl: statusData.video_url, type: 'video_preview' } : m));
                    } else if (statusData.status === 'error') {
                        clearInterval(pollInterval);
                        setIsLoading(false);
                        setIsAnimating(null);
                    }
                } catch (e) {
                    clearInterval(pollInterval);
                    setIsLoading(false);
                    setIsAnimating(null);
                }
            }, 5000);
        } catch (error) {
            setIsLoading(false);
            setIsAnimating(null);
        }
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || [])
        if (files.length > 0) {
            files.forEach(file => {
                const reader = new FileReader()
                reader.onloadend = () => { setUploadedImages(prev => [...prev, reader.result as string]) }
                reader.readAsDataURL(file)
            })
        }
    }

    return (
        <div className="flex flex-col h-[calc(100vh-64px)] bg-[#F8F9FB] font-sans selection:bg-purple-100/50">
            {/* Header - Studio Light */}
            <div className="flex items-center justify-between px-8 py-4 border-b border-gray-100 bg-white/90 backdrop-blur-xl sticky top-0 z-50">
                <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-purple-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-purple-500/20 text-white">
                        <Sparkles className="w-5 h-5" />
                    </div>
                    <div>
                        <h2 className="font-extrabold text-lg text-gray-900 tracking-tight">AI Director</h2>
                        <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">Cinematic Studio Pro</p>
                    </div>
                </div>
                <div className="flex gap-3">
                    <Button
                        variant="outline"
                        size="sm"
                        className="hidden md:flex gap-2 border-gray-200 bg-white hover:bg-gray-50 text-gray-600 hover:text-gray-900 transition-all shadow-sm rounded-lg font-semibold"
                        disabled={!finalPlan}
                        onClick={handleFinalizeProject}
                    >
                        {isProcessing ? <Loader2 className="w-4 h-4 animate-spin text-purple-600" /> : <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)] animate-pulse" />}
                        {finalPlan ? "Export Project" : "Waiting for Plan..."}
                    </Button>
                </div>
            </div>

            {/* Chat Area - Light & Clean */}
            <div className="flex-1 overflow-hidden relative bg-[#F8F9FB]">
                {/* Ambient Glow */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-[1200px] h-[500px] bg-blue-100/50 blur-[120px] rounded-full pointer-events-none mix-blend-multiply" />

                <ScrollArea className="h-full px-4 md:px-[10%] py-8">
                    <div className="max-w-5xl mx-auto flex flex-col gap-8 pb-40">
                        {messages.map((msg, idx) => (
                            <div
                                key={msg.id || idx}
                                className={cn(
                                    "flex gap-4 max-w-[85%]",
                                    msg.role === 'user' ? "ml-auto flex-row-reverse" : ""
                                )}
                            >
                                <Avatar className={cn(
                                    "w-10 h-10 mt-1 border border-white shadow-sm",
                                    msg.role === 'ai' ? "bg-white" : "bg-white"
                                )}>
                                    {msg.role === 'assistant' ? (
                                        <div className="flex items-center justify-center w-full h-full bg-gradient-to-br from-purple-600 to-indigo-600">
                                            <Sparkles className="w-5 h-5 text-white" />
                                        </div>
                                    ) : (
                                        <div className="flex items-center justify-center w-full h-full bg-gray-100 text-gray-500 font-bold text-xs ring-1 ring-gray-200">YOU</div>
                                    )}
                                </Avatar>

                                <div className={cn(
                                    "p-5 rounded-3xl text-[15px] leading-relaxed transition-all duration-300 shadow-sm",
                                    msg.role === 'user'
                                        ? "bg-white text-gray-800 rounded-tr-sm border border-gray-200 shadow-lg shadow-gray-200/50"
                                        : "bg-white/90 backdrop-blur-sm text-gray-700 border border-purple-100 rounded-tl-sm shadow-xl shadow-purple-500/5"
                                )}>
                                    <div className="whitespace-pre-wrap font-medium tracking-wide">{msg.content}</div>

                                    {/* Media Generation Status/Result */}
                                    {((msg.role === 'assistant' && generatingImages.hero_shot === 'processing' && (msg === messages[messages.length - 1])) || (msg.content as any).hero_shot_url) && (
                                        <div className="mt-4">
                                            <p className="text-xs font-bold uppercase tracking-wider mb-2 text-gray-400">Hero Shot</p>
                                            {generatingImages.hero_shot === 'processing' && !(msg.content as any).hero_shot_url ? (
                                                <div className="w-full aspect-video bg-gray-50 rounded-2xl flex flex-col items-center justify-center border border-gray-100">
                                                    <Loader2 className="w-8 h-8 text-purple-600 animate-spin mb-3" />
                                                    <p className="text-sm text-gray-500 font-medium animate-pulse">Rendering...</p>
                                                </div>
                                            ) : (
                                                <img src={(msg.content as any).hero_shot_url} alt="Hero Shot" className="rounded-2xl border border-gray-100 shadow-lg w-full" />
                                            )}
                                        </div>
                                    )}

                                    {/* Specs Card */}
                                    {msg.role === 'ai' && msg.specs && Object.values(msg.specs).some(v => v) && (
                                        <div className="mt-4 space-y-3">
                                            <div className="grid grid-cols-2 gap-2 text-xs">
                                                {Object.entries(msg.specs).map(([k, v]) => (
                                                    v && <div key={k} className="p-2.5 bg-gray-50 rounded-lg border border-gray-100">
                                                        <div className="font-bold text-gray-400 mb-0.5 text-[10px] uppercase">{k}</div>
                                                        <div className="text-gray-900 font-bold">{v as string}</div>
                                                    </div>
                                                ))}
                                            </div>
                                            {!msg.previewUrl && (
                                                <Button
                                                    onClick={() => handleGeneratePreview(msg.id!, recentPrompt, msg.specs)}
                                                    size="sm"
                                                    className="w-full bg-[#1A1A1A] text-white hover:bg-black border border-transparent shadow-lg shadow-gray-200 transition-all font-bold gap-2 rounded-xl"
                                                    disabled={isGeneratingPreview === msg.id}
                                                >
                                                    {isGeneratingPreview === msg.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-[#D4FF00]" />}
                                                    Generate Preview
                                                </Button>
                                            )}
                                            {msg.previewUrl && (
                                                <MediaPreview
                                                    src={msg.previewUrl}
                                                    type="image"
                                                    isAnimating={isAnimating === msg.id}
                                                    onAnimate={() => handleAnimatePreview(msg.id!, msg.previewUrl!)}
                                                />
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                        <div ref={messagesEndRef} />
                    </div>
                </ScrollArea>

                {/* Input Area - Floating Capsule */}
                <div className="absolute bottom-0 left-0 w-full p-4 md:p-6 bg-gradient-to-t from-[#F8F9FB] via-[#F8F9FB]/95 to-transparent z-40">
                    <div className="max-w-4xl mx-auto relative flex flex-col gap-3">
                        {isLoading && (
                            <div className="absolute -top-12 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 shadow-lg rounded-full text-xs font-bold text-gray-500 animate-in fade-in slide-in-from-bottom-2">
                                <Loader2 className="w-3 h-3 animate-spin text-purple-600" />
                                DIRECTOR IS THINKING...
                            </div>
                        )}

                        <div className="relative group bg-white rounded-[2rem] shadow-[0_20px_50px_-10px_rgba(0,0,0,0.1)] border border-gray-200 transition-all duration-300 focus-within:ring-4 focus-within:ring-purple-500/10 focus-within:border-purple-200 pl-4 pr-2 py-2 flex items-center gap-2 hover:shadow-[0_20px_50px_-5px_rgba(124,58,237,0.15)]">
                            <label className="p-2 rounded-full hover:bg-gray-50 text-gray-400 hover:text-purple-600 transition-colors cursor-pointer group-hover:scale-105">
                                <Paperclip className="w-5 h-5" />
                                <input type="file" accept="image/*" className="hidden" onChange={handleFileUpload} multiple />
                            </label>

                            <Input
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
                                placeholder="Describe your vision..."
                                className="flex-1 border-0 bg-transparent text-gray-900 placeholder:text-gray-400 focus-visible:ring-0 text-lg h-12 py-3 font-medium"
                            />

                            <Button
                                onClick={handleSendMessage}
                                disabled={!input.trim() && uploadedImages.length === 0}
                                size="icon"
                                className="h-10 w-10 rounded-full bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg shadow-purple-500/30 hover:shadow-purple-500/50 transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:shadow-none"
                            >
                                <Send className="w-4 h-4 ml-0.5" />
                            </Button>
                        </div>

                        {/* Controls Toolbar - MOVED BELOW INPUT */}
                        <div className="flex flex-col md:flex-row items-center justify-between gap-3 px-2">
                            {/* Cinema Controls */}
                            <div className="scale-90 origin-left">
                                <CinemaControls
                                    specs={manualSpecs}
                                    onSpecChange={(k, v) => setManualSpecs((prev: any) => ({ ...prev, [k]: v }))}
                                />
                            </div>

                            {/* Generation Settings */}
                            <div className="flex items-center gap-3 scale-90 origin-right">
                                {/* Aspect Ratio */}
                                <div className="bg-white p-1 rounded-full border border-gray-100 shadow-sm flex items-center gap-1">
                                    {['16:9', '9:16', '1:1'].map((ratio) => (
                                        <button
                                            key={ratio}
                                            onClick={() => setGenSettings(prev => ({ ...prev, aspectRatio: ratio }))}
                                            className={cn(
                                                "px-2.5 py-1 rounded-full text-[9px] font-bold transition-all",
                                                genSettings.aspectRatio === ratio
                                                    ? "bg-white text-purple-700 shadow-sm ring-1 ring-purple-100"
                                                    : "text-gray-400 hover:text-gray-600 hover:bg-gray-50"
                                            )}
                                        >
                                            {ratio}
                                        </button>
                                    ))}
                                </div>

                                <div className="h-3 w-px bg-gray-200" />

                                {/* Resolution */}
                                <div className="bg-white p-1 rounded-full border border-gray-100 shadow-sm flex items-center gap-1">
                                    {['HD', '2K', '4K'].map((res) => (
                                        <button
                                            key={res}
                                            onClick={() => setGenSettings(prev => ({ ...prev, resolution: res }))}
                                            className={cn(
                                                "px-2.5 py-1 rounded-full text-[9px] font-bold transition-all",
                                                genSettings.resolution === res
                                                    ? "bg-purple-600 text-white shadow-md shadow-purple-500/20"
                                                    : "text-gray-400 hover:text-gray-600 hover:bg-gray-50"
                                            )}
                                        >
                                            {res}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>


                        <div className="mt-4 flex justify-center gap-6 text-[10px] font-black tracking-widest text-gray-400 uppercase opacity-60">
                            <span className="flex items-center gap-1.5"><Sparkles className="w-3 h-3 text-purple-500" /> AI Powered</span>
                            <span className="flex items-center gap-1.5"><Film className="w-3 h-3 text-blue-500" /> Cinema Grade</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
