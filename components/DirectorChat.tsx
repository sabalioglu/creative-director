"use client"

import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Card } from "@/components/ui/card"
import { Paperclip, Send, Loader2, Sparkles, Film, Download, RefreshCw, X, Play, LayoutGrid, History, Video } from "lucide-react"
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

// Helper to format AI responses with basic markdown-like support
const formatAIResponse = (text: string) => {
    if (typeof text !== 'string') return text;
    return text.split('\n').map((line, i) => (
        <span key={i}>
            {line.startsWith('**') ? <strong>{line.replace(/\*\*/g, '')}</strong> : line}
            <br />
        </span>
    ));
};

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
        storyboard?: PopcornSequence,
        actionResult?: any
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
    const scrollAreaRef = useRef<HTMLDivElement>(null)
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
        <div className="flex flex-col h-screen bg-black text-white font-sans overflow-hidden relative">
            {/* Cinematic Background Elements */}
            <div className="absolute inset-0 z-0 bg-[url('https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=2564&auto=format&fit=crop')] bg-cover bg-center opacity-10 pointer-events-none mix-blend-overlay" />
            <div className="absolute inset-0 z-0 bg-gradient-to-t from-black via-black/80 to-black/40 pointer-events-none" />

            {/* Header - Minimalist */}
            <div className="relative z-50 flex items-center justify-between px-6 py-4 bg-black/20 backdrop-blur-md border-b border-white/5">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center shadow-[0_0_15px_rgba(124,58,237,0.5)]">
                        <Sparkles className="w-4 h-4 text-white" />
                    </div>
                    <div>
                        <h1 className="text-sm font-bold tracking-wider text-white">VIRTUAL DIRECTOR</h1>
                        <p className="text-[10px] text-gray-400">Cinematic AI Studio v2.0</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <Button variant="ghost" size="icon" className="text-gray-400 hover:text-white hover:bg-white/10">
                        <LayoutGrid className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="text-gray-400 hover:text-white hover:bg-white/10">
                        <History className="w-4 h-4" />
                    </Button>
                </div>
            </div>

            {/* Main Chat Area */}
            <ScrollArea className="flex-1 w-full relative z-10 p-4 md:p-6" ref={scrollAreaRef}>
                <div className="max-w-3xl mx-auto flex flex-col gap-6 pb-48"> {/* Padding bottom for controls */}

                    {/* Welcome Message if empty */}
                    {messages.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-20 opacity-50">
                            <Video className="w-16 h-16 text-gray-600 mb-4" />
                            <p className="text-gray-400 text-lg">Start your cinematic journey...</p>
                        </div>
                    )}

                    {messages.map((msg, index) => (
                        <div
                            key={index}
                            className={cn(
                                "flex gap-4 max-w-[85%] animate-in fade-in slide-in-from-bottom-2 duration-500",
                                msg.role === 'user' ? "ml-auto flex-row-reverse" : ""
                            )}
                        >
                            <Avatar className={cn(
                                "w-10 h-10 border shadow-lg mt-1 shrink-0",
                                msg.role === 'assistant'
                                    ? "border-purple-500/30 shadow-purple-500/20"
                                    : "border-white/10"
                            )}>
                                <AvatarFallback className={cn(
                                    "text-xs font-bold",
                                    msg.role === 'assistant' ? "bg-black text-purple-400" : "bg-white text-black"
                                )}>
                                    {msg.role === 'assistant' ? 'AI' : 'YOU'}
                                </AvatarFallback>
                            </Avatar>

                            <div className={cn(
                                "p-5 rounded-2xl text-[15px] leading-relaxed transition-all duration-300 relative overflow-hidden group",
                                msg.role === 'user'
                                    ? "bg-white text-black shadow-[0_0_20px_rgba(255,255,255,0.1)] rounded-tr-sm"
                                    : "bg-white/5 backdrop-blur-3xl text-gray-200 border border-white/10 rounded-tl-sm shadow-none"
                            )}>
                                {/* Gradient sheen for AI messages */}
                                {msg.role === 'assistant' && (
                                    <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-transparent pointer-events-none" />
                                )}

                                <div className="relative z-10 whitespace-pre-wrap">
                                    {msg.role === 'assistant' ? formatAIResponse(msg.content) : msg.content}
                                </div>

                                {msg.mediaUrls?.map((url, i) => (
                                    <div key={i} className="mt-3 rounded-lg overflow-hidden border border-white/10 shadow-lg">
                                        <img src={url} alt="User upload" className="max-w-full h-auto" />
                                    </div>
                                ))}

                                {msg.actionResult && (
                                    <div className="mt-4 pt-4 border-t border-white/10">
                                        {msg.actionResult.type === 'hero_shot' && (
                                            <div className="rounded-xl overflow-hidden border border-purple-500/30 shadow-[0_0_30px_rgba(124,58,237,0.15)] group-hover:shadow-[0_0_50px_rgba(124,58,237,0.25)] transition-all duration-500">
                                                <img
                                                    src={msg.actionResult.url}
                                                    alt="Hero Shot"
                                                    className="w-full h-auto cursor-pointer hover:scale-[1.02] transition-transform duration-700"
                                                    onClick={() => window.open(msg.actionResult.url, '_blank')}
                                                />
                                                <div className="bg-black/80 backdrop-blur text-xs p-2 flex justify-between items-center text-purple-300/80">
                                                    <span className="flex items-center gap-1"><Sparkles className="w-3 h-3" /> HERO SHOT GENERATED</span>
                                                    <Download className="w-3 h-3 cursor-pointer hover:text-white" />
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}

                    {/* Loading Indicator */}
                    {/* ... (Kept similar but styled dark) ... */}
                    {(isLoading || generatingImages.hero_shot === 'processing' || generatingImages.hero_plus_start === 'processing') && (
                        <div className="flex gap-4 max-w-[85%]">
                            <Avatar className="w-10 h-10 border border-purple-500/30 shadow-purple-500/20 bg-black">
                                <AvatarFallback className="bg-black text-purple-400">AI</AvatarFallback>
                            </Avatar>
                            <div className="bg-white/5 border border-white/10 p-4 rounded-2xl rounded-tl-sm flex items-center gap-3">
                                <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                                <span className="text-xs text-purple-400 font-medium tracking-widest uppercase ml-2">
                                    {generatingImages.hero_shot === 'processing' ? 'Creating Hero Shot...' :
                                        generatingImages.hero_plus_start === 'processing' ? 'Compositing Product...' :
                                            'Thinking...'}
                                </span>
                            </div>
                        </div>
                    )}
                </div>
            </ScrollArea>

            {/* CONTROL DOCK & INPUT - Fixed Bottom */}
            <div className="absolute bottom-0 left-0 w-full z-50 bg-gradient-to-t from-black via-black to-transparent pt-12 pb-6 px-4 md:px-8">
                <div className="max-w-4xl mx-auto space-y-4">

                    {/* 1. CINEMA CONTROLS (Preserved Logic/Content, New Layout) */}
                    <div className="flex items-center justify-between gap-4">
                        <div className="flex-1 bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-2 flex items-center gap-2 overflow-x-auto scrollbar-hide">
                            <div className="scale-90 origin-left pl-2"> {/* Keeping exact component, just scaling to fit nice */}
                                <CinemaControls
                                    specs={manualSpecs}
                                    onSpecChange={(k, v) => setManualSpecs((prev: any) => ({ ...prev, [k]: v }))}
                                />
                            </div>
                        </div>

                        {/* 2. GENERATION SETTINGS (Preserved) */}
                        <div className="flex items-center gap-2 bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-2 px-4 shadow-lg shrink-0">
                            {['16:9', '9:16', '1:1'].map((ratio) => (
                                <button
                                    key={ratio}
                                    onClick={() => setGenSettings(prev => ({ ...prev, aspectRatio: ratio }))}
                                    className={cn(
                                        "px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all border",
                                        genSettings.aspectRatio === ratio
                                            ? "bg-purple-600/20 border-purple-500 text-purple-300 shadow-[0_0_10px_rgba(168,85,247,0.2)]"
                                            : "bg-transparent border-transparent text-gray-500 hover:text-gray-300"
                                    )}
                                >
                                    {ratio}
                                </button>
                            ))}
                            <div className="w-px h-4 bg-white/10 mx-1" />
                            {['HD', '2K', '4K'].map((res) => (
                                <button
                                    key={res}
                                    onClick={() => setGenSettings(prev => ({ ...prev, resolution: res }))}
                                    className={cn(
                                        "px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all border",
                                        genSettings.resolution === res
                                            ? "bg-blue-600/20 border-blue-500 text-blue-300 shadow-[0_0_10px_rgba(59,130,246,0.2)]"
                                            : "bg-transparent border-transparent text-gray-500 hover:text-gray-300"
                                    )}
                                >
                                    {res}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* 3. INPUT CAPSULE */}
                    <div className="relative group bg-white/10 backdrop-blur-xl rounded-2xl border border-white/10 transition-all focus-within:bg-white/15 focus-within:border-purple-500/50 focus-within:shadow-[0_0_30px_rgba(168,85,247,0.15)] flex items-center p-2 gap-2">
                        {/* Upload Button */}
                        <label className="p-3 rounded-xl hover:bg-white/10 text-gray-400 hover:text-white transition-colors cursor-pointer group-active:scale-95">
                            <Paperclip className="w-5 h-5" />
                            <input type="file" accept="image/*" className="hidden" onChange={handleFileUpload} multiple />
                        </label>

                        {/* Text Input */}
                        <Input
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
                            placeholder="Describe your cinematic vision..."
                            className="flex-1 border-0 bg-transparent text-white placeholder:text-gray-500 focus-visible:ring-0 text-lg h-12 py-3 font-light tracking-wide"
                        />

                        {/* Send Button */}
                        <Button
                            onClick={handleSendMessage}
                            disabled={!input.trim() && uploadedImages.length === 0}
                            size="icon"
                            className="h-12 w-12 rounded-xl bg-purple-600 hover:bg-purple-500 text-white shadow-[0_0_20px_rgba(168,85,247,0.4)] transition-all hover:scale-105 active:scale-95 disabled:opacity-30 disabled:shadow-none"
                        >
                            <Send className="w-5 h-5 ml-0.5" />
                        </Button>
                    </div>

                    {/* Copyright / Footer */}
                    <div className="flex justify-center gap-6 text-[9px] font-bold tracking-[0.2em] text-gray-600 uppercase">
                        <span className="flex items-center gap-1.5"><Sparkles className="w-3 h-3 text-purple-900" /> AI Powered</span>
                        <span className="flex items-center gap-1.5"><Film className="w-3 h-3 text-blue-900" /> Cinema Grade</span>
                    </div>

                </div>
            </div>

            {/* Uploaded Image Previews (Floating above input) */}
            {uploadedImages.length > 0 && (
                <div className="absolute bottom-48 left-0 w-full flex justify-center z-50 pointer-events-none">
                    <div className="bg-black/80 backdrop-blur-md border border-white/10 p-2 rounded-2xl flex gap-2 pointer-events-auto animate-in slide-in-from-bottom-4">
                        {uploadedImages.map((img, idx) => (
                            <div key={idx} className="relative w-16 h-16 rounded-lg overflow-hidden border border-white/20 group/preview">
                                <img src={img} alt="Upload" className="w-full h-full object-cover" />
                                <button
                                    onClick={() => setUploadedImages(prev => prev.filter((_, i) => i !== idx))}
                                    className="absolute top-0.5 right-0.5 bg-black/50 hover:bg-red-500 text-white rounded-md p-1 opacity-0 group-hover/preview:opacity-100 transition-all backdrop-blur-sm"
                                >
                                    <X className="w-3 h-3" />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
