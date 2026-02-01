"use client"

import { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Loader2, Sparkles, Image as ImageIcon, CheckCircle2, AlertCircle, Video, Play } from "lucide-react"
import { cn } from "@/lib/utils"
import { PopcornSequence, StoryboardFrameDetails } from "@/types/cinema"
import { supabase } from "@/lib/supabase"

interface StoryboardGridProps {
    sequence: PopcornSequence;
    onFrameUpdate?: (frameId: number, url: string) => void;
}

export function StoryboardGrid({ sequence, onFrameUpdate }: StoryboardGridProps) {
    // Safe access to frames, handling potential structure mismatch
    // The sequence might be the plan itself (flat) or contain a plan property
    const planData = sequence ? ((sequence as any).plan || sequence) : null;
    const initialFrames = planData?.frames || [];
    const initialBackgrounds = planData?.backgrounds || [];

    // If no valid frames found, return Error UI instead of null
    if (!sequence || initialFrames.length === 0) {
        return (
            <div className="mt-4 p-4 border border-red-200 bg-red-50 rounded-xl text-red-600 flex items-center gap-3 shadow-sm">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <div className="text-sm font-medium">
                    Storyboard plan could not be generated. Please try confusing the AI less or refining your prompt. 🎬
                </div>
            </div>
        )
    }

    const [frames, setFrames] = useState<StoryboardFrameDetails[]>(initialFrames)
    const [generatingIds, setGeneratingIds] = useState<number[]>([])
    const [animatingIds, setAnimatingIds] = useState<number[]>([])
    const [bgUrls, setBgUrls] = useState<Record<string, string>>({})
    const [anchorImageUrl, setAnchorImageUrl] = useState<string | null>(null)
    const [isCreatingAnchor, setIsCreatingAnchor] = useState(false)

    const [hasStarted, setHasStarted] = useState(false)

    useEffect(() => {
        if (!hasStarted && !frames.every(f => f.url)) {
            generateAll()
        }
    }, [hasStarted, frames])

    const generateAll = async () => {
        if (hasStarted) return
        setHasStarted(true)

        // Step 1: Create Subject/Product Anchor (Sequential)
        let currentAnchorUrl = anchorImageUrl;
        if (!currentAnchorUrl) {
            setIsCreatingAnchor(true);
            try {
                const { data } = await supabase.functions.invoke('cinema-popcorn', {
                    body: {
                        action: 'create_anchor_image',
                        prompt: sequence.plan.consistency_rules || "Blue earbuds, high quality product visualization",
                        reference_urls: sequence.references.filter(r => r.url).map(r => r.url),
                        style: "Cinematic Realistic"
                    }
                });
                if (data?.url) {
                    currentAnchorUrl = data.url;
                    setAnchorImageUrl(data.url);
                }
            } catch (e) {
                console.error("Anchor creation failed", e);
            } finally {
                setIsCreatingAnchor(false);
            }
        }

        // Step 2: Generate Backgrounds (Parallel)
        const newBgUrls: Record<string, string> = { ...bgUrls }

        if (initialBackgrounds.length > 0) {
            await Promise.all(initialBackgrounds.map(async (bg: any) => {
                if (newBgUrls[bg.id]) return;
                try {
                    const { data } = await supabase.functions.invoke('cinema-popcorn', {
                        body: {
                            action: 'generate_background',
                            background_plan: bg,
                            style: "Cinematic Realistic"
                        }
                    })
                    if (data?.url) newBgUrls[bg.id] = data.url
                } catch (e) {
                    console.error(`Bg ${bg.id} failed`, e)
                }
            }))
        }

        setBgUrls(newBgUrls)

        // Step 3: Generate Frames (Batched)
        const PENDING_LIMIT = 2; // Focus on quality
        const queue = frames.filter(f => !f.url).map(f => f.frame_number);

        const processFrame = async (frameNum: number) => {
            const frame = frames.find(f => f.frame_number === frameNum);
            if (!frame) return;

            setGeneratingIds(prev => [...prev, frameNum])
            try {
                const { data } = await supabase.functions.invoke('cinema-popcorn', {
                    body: {
                        action: 'generate_frame',
                        frame_plan: frame,
                        all_references: sequence.references,
                        bg_url: newBgUrls[frame.background_id],
                        anchor_image_url: currentAnchorUrl || undefined,
                        style: "Cinematic Realistic"
                    }
                })

                if (data?.url) {
                    const updatedUrl = data.url
                    setFrames(prev => prev.map(f =>
                        f.frame_number === frameNum ? { ...f, url: updatedUrl } : f
                    ))
                    if (onFrameUpdate) onFrameUpdate(frameNum, updatedUrl)
                }
            } catch (err) {
                console.error(`Frame ${frameNum} Gen Error:`, err)
            } finally {
                setGeneratingIds(prev => prev.filter(id => id !== frameNum))
            }
        };

        // Batch processing
        for (let i = 0; i < queue.length; i += PENDING_LIMIT) {
            const batch = queue.slice(i, i + PENDING_LIMIT);
            await Promise.all(batch.map(id => processFrame(id)));
        }

        setHasStarted(false)
    }

    const handleAnimateFrame = async (frameNumber: number, imageUrl: string, visualPrompt: string) => {
        if (animatingIds.includes(frameNumber)) return;

        setAnimatingIds(prev => [...prev, frameNumber]);

        try {
            const { data, error } = await supabase.functions.invoke('cinema-popcorn', {
                body: {
                    action: 'generate_video',
                    image_url: imageUrl,
                    prompt: visualPrompt
                }
            });

            if (data?.url) {
                setFrames(prev => prev.map(f =>
                    f.frame_number === frameNumber ? { ...f, video_url: data.url } : f
                ));
                if (onFrameUpdate) onFrameUpdate(frameNumber, data.url);
            } else {
                console.error("Video generation failed:", error);
            }
        } catch (e) {
            console.error("Animate Error:", e);
        } finally {
            setAnimatingIds(prev => prev.filter(id => id !== frameNumber));
        }
    }

    // Group frames into scenes (pairs) for visual grouping
    const scenes: { start: StoryboardFrameDetails, end?: StoryboardFrameDetails }[] = [];
    const usedFrameNumbers = new Set<number>();

    frames.forEach(frame => {
        if (usedFrameNumbers.has(frame.frame_number)) return;

        if (!frame.is_keyframe_b && frame.linked_frame_id) {
            const endFrame = frames.find(f => f.frame_number.toString() === frame.linked_frame_id && f.is_keyframe_b);
            scenes.push({ start: frame, end: endFrame });
            usedFrameNumbers.add(frame.frame_number);
            if (endFrame) usedFrameNumbers.add(endFrame.frame_number);
        } else if (frame.is_keyframe_b && frame.linked_frame_id) {
            const startFrame = frames.find(f => f.frame_number.toString() === frame.linked_frame_id && !f.is_keyframe_b);
            if (startFrame && !usedFrameNumbers.has(startFrame.frame_number)) {
                scenes.push({ start: startFrame, end: frame });
                usedFrameNumbers.add(startFrame.frame_number);
                usedFrameNumbers.add(frame.frame_number);
            }
        } else if (!usedFrameNumbers.has(frame.frame_number)) {
            // Fallback for non-paired frames
            scenes.push({ start: frame });
            usedFrameNumbers.add(frame.frame_number);
        }
    });

    return (
        <div className="space-y-8 mt-6">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-xl font-black text-white flex items-center gap-3">
                        <div className="p-2 bg-indigo-500/20 rounded-lg border border-indigo-500/30">
                            <Sparkles className="w-5 h-5 text-indigo-400" />
                        </div>
                        Director's Shotlist
                    </h3>
                    <p className="text-zinc-500 text-sm mt-1 ml-1">Sequence of {frames.length} cinematic frames organized into {scenes.length} scenes</p>
                </div>
                {!frames.every(f => f.url) && (
                    <Button
                        size="sm"
                        onClick={generateAll}
                        disabled={generatingIds.length > 0 || isCreatingAnchor}
                        className="bg-indigo-600 hover:bg-indigo-500 text-white gap-2 transition-all duration-300 active:scale-95 px-6 rounded-full shadow-lg shadow-indigo-500/20"
                    >
                        {(generatingIds.length > 0 || isCreatingAnchor) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                        {isCreatingAnchor ? "Locking Subject..." : generatingIds.length > 0 ? "Directing Scenes..." : "Generate Sequence"}
                    </Button>
                )}
            </div>

            <div className="space-y-12">
                {scenes.map((scene, sceneIdx) => (
                    <div key={`scene-${sceneIdx}`} className="space-y-4">
                        {/* Scene Header */}
                        <div className="flex items-center gap-4">
                            <div className="h-px flex-1 bg-zinc-800" />
                            <div className="px-4 py-1 rounded-full border border-zinc-800 bg-zinc-900/50 text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">
                                Scene {sceneIdx + 1}
                            </div>
                            <div className="h-px flex-1 bg-zinc-800" />
                        </div>

                        {/* Motion Description - Centered between paired frames */}
                        {scene.start.motion_description && (
                            <div className="flex justify-center">
                                <div className="px-4 py-2 rounded-xl bg-indigo-500/5 border border-indigo-500/10 flex items-center gap-3">
                                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                                    <span className="text-xs text-indigo-300/90 font-medium italic">
                                        Action: {scene.start.motion_description}
                                    </span>
                                </div>
                            </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {[scene.start, scene.end].filter(Boolean).map((frame, frameIdx) => {
                                const f = frame!;
                                return (
                                    <div key={`${f.frame_number}-${frameIdx}`} className="relative group">
                                        <Card className={cn(
                                            "bg-black/40 border-white/5 backdrop-blur-xl overflow-hidden transition-all duration-500 hover:border-indigo-500/50 hover:shadow-[0_0_30px_-5px_rgba(79,70,229,0.3)]",
                                            generatingIds.includes(f.frame_number) && "ring-2 ring-indigo-500/50 scale-[0.98]"
                                        )}>
                                            <div className="aspect-video bg-zinc-950 relative flex items-center justify-center overflow-hidden">
                                                {f.video_url ? (
                                                    <video
                                                        src={f.video_url}
                                                        className="w-full h-full object-cover"
                                                        autoPlay
                                                        loop
                                                        muted
                                                        playsInline
                                                    />
                                                ) : f.url ? (
                                                    <img src={f.url} alt={`Frame ${f.frame_number}`} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
                                                ) : (
                                                    <div className="flex flex-col items-center gap-3 text-zinc-700">
                                                        {generatingIds.includes(f.frame_number) ? (
                                                            <>
                                                                <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
                                                                <span className="text-[10px] uppercase tracking-[0.3em] font-black text-indigo-400/60">Capturing...</span>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <ImageIcon className="w-8 h-8 opacity-20" />
                                                                <span className="text-[10px] uppercase tracking-[0.3em] font-black opacity-20">Planned</span>
                                                            </>
                                                        )}
                                                    </div>
                                                )}

                                                {/* Keyframe Badge */}
                                                <div className={cn(
                                                    "absolute top-4 left-4 px-3 py-1 rounded-lg backdrop-blur-xl border border-white/5 text-[10px] font-black uppercase tracking-widest shadow-xl",
                                                    f.is_keyframe_b ? "bg-amber-500/10 text-amber-500 border-amber-500/20" : "bg-indigo-500/10 text-indigo-400 border-indigo-500/20"
                                                )}>
                                                    {f.is_keyframe_b ? "End State" : "Start State"}
                                                </div>

                                                {f.url && !f.video_url && (
                                                    <div className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 transition-all duration-300 backdrop-blur-sm">
                                                        <Button
                                                            size="sm"
                                                            onClick={() => handleAnimateFrame(f.frame_number, f.url!, f.description)}
                                                            disabled={animatingIds.includes(f.frame_number)}
                                                            className="bg-white text-black hover:bg-zinc-200 rounded-full h-11 px-6 gap-3 shadow-2xl transition-all active:scale-95 font-bold"
                                                        >
                                                            {animatingIds.includes(f.frame_number) ? (
                                                                <Loader2 className="w-4 h-4 animate-spin" />
                                                            ) : (
                                                                <Play className="w-4 h-4 fill-current" />
                                                            )}
                                                            {animatingIds.includes(f.frame_number) ? "Animating..." : "Animate Motion"}
                                                        </Button>
                                                    </div>
                                                )}
                                            </div>

                                            </div>

                                            <div className="p-4 space-y-3 bg-gradient-to-b from-white/5 to-transparent border-t border-white/5">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex gap-2">
                                                        <span className="px-2 py-0.5 rounded-md bg-white/5 text-[10px] font-black uppercase tracking-tighter text-indigo-300 border border-white/10">
                                                            {f.shot_type}
                                                        </span>
                                                        <span className="px-2 py-0.5 rounded-md bg-white/5 text-[10px] font-black uppercase tracking-widest text-zinc-500 border border-white/10">
                                                            {f.camera_angle}
                                                        </span>
                                                    </div>
                                                    <span className="text-[10px] text-zinc-600 font-bold tabular-nums">#{f.frame_number}</span>
                                                </div>

                                                <p className="text-xs text-zinc-400 leading-relaxed min-h-[3em]">
                                                    {f.description}
                                                </p>
                                            </div>
                                        </Card>
                    </div>
                );
                            })}
            </div>
        </div>
    ))
}
            </div >
        </div >
    )
}
