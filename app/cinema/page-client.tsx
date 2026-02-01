"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Plus, Clapperboard, Sparkles, Clock, ArrowRight } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { useRouter } from "next/navigation"

interface Project {
    id: string
    name: string
    status: string
    created_at: string
}

export default function CinemaDashboardClient() {
    const [projects, setProjects] = useState<Project[]>([])
    const [loading, setLoading] = useState(true)
    const [credits, setCredits] = useState<number | null>(null)
    const router = useRouter()

    useEffect(() => {
        fetchProjects()
        fetchCredits()
    }, [])

    async function fetchCredits() {
        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return
            const { getUserCredits } = await import('@/lib/credits')
            const creditInfo = await getUserCredits(user.id)
            if (creditInfo) setCredits(creditInfo.balance)
        } catch (error) {
            console.error('Error fetching credits:', error)
        }
    }

    async function fetchProjects() {
        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return
            const { data, error } = await supabase
                .from('cinema_projects')
                .select('*')
                .order('created_at', { ascending: false })
            if (error) throw error
            setProjects(data || [])
        } catch (error) {
            console.error('Error fetching projects:', error)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen bg-background text-foreground relative overflow-hidden">
            {/* Ambient Background */}
            <div className="absolute top-0 left-0 w-full h-[500px] bg-gradient-to-b from-purple-900/20 to-transparent pointer-events-none" />

            {/* Header */}
            <div className="relative z-10 px-8 py-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-purple-900/20">
                        <Clapperboard className="w-5 h-5 text-white" />
                    </div>
                    <h1 className="text-xl font-bold tracking-tight text-white">My Studio</h1>
                </div>
                {credits !== null && (
                    <div className="px-4 py-1.5 rounded-full bg-zinc-900/50 border border-white/5 backdrop-blur-md flex items-center gap-2">
                        <Sparkles className="w-3.5 h-3.5 text-yellow-400" />
                        <span className="text-sm font-medium text-zinc-300">{credits} Credits</span>
                    </div>
                )}
            </div>

            <div className="relative z-10 max-w-7xl mx-auto px-8 py-12 space-y-16">

                {/* Hero Section */}
                <div className="relative rounded-3xl overflow-hidden min-h-[400px] flex items-center group cursor-pointer border border-white/5 shadow-2xl" onClick={() => router.push('/cinema/new')}>
                    <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1536440136628-849c177e76a1?q=80&w=2525&auto=format&fit=crop')] bg-cover bg-center transition-transform duration-1000 group-hover:scale-105" />
                    <div className="absolute inset-0 bg-gradient-to-r from-black via-black/60 to-transparent" />

                    <div className="relative z-10 p-12 max-w-2xl">
                        <div className="inline-flex items-center gap-2 px-3 py-1 bg-purple-600 rounded-full text-xs font-bold uppercase tracking-wider text-white mb-6 animate-in fade-in slide-in-from-left-4 duration-700">
                            <Sparkles className="w-3 h-3" /> New Production
                        </div>
                        <h2 className="text-5xl font-black text-white mb-6 leading-tight tracking-tight drop-shadow-lg">
                            Create Your Next <br />Masterpiece.
                        </h2>
                        <p className="text-lg text-zinc-300 mb-8 max-w-md leading-relaxed">
                            Use AI Director to conceptualize, storyboard, and visualize cinematic commercials in minutes.
                        </p>
                        <Button size="lg" className="h-14 px-8 rounded-full bg-white text-black hover:bg-zinc-200 font-bold text-base shadow-[0_0_20px_rgba(255,255,255,0.3)] transition-all active:scale-95">
                            <Plus className="w-5 h-5 mr-2" /> Start New Project
                        </Button>
                    </div>
                </div>

                {/* Projects List */}
                <div className="space-y-6">
                    <h3 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
                        Recent Productions
                        <span className="text-sm font-normal text-zinc-500 ml-2">({projects.length})</span>
                    </h3>

                    {loading ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {[1, 2, 3].map(i => (
                                <div key={i} className="h-64 rounded-xl bg-zinc-900/50 animate-pulse" />
                            ))}
                        </div>
                    ) : projects.length === 0 ? (
                        <div className="text-center py-20 bg-zinc-900/20 rounded-2xl border border-white/5 border-dashed">
                            <p className="text-zinc-500 mb-4">No productions found in your studio.</p>
                            <Button variant="outline" onClick={() => router.push('/cinema/new')}>Create First Project</Button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {projects.map((project) => (
                                <Link href={`/cinema/editor/${project.id}`} key={project.id} className="group relative block">
                                    <Card className="h-full bg-zinc-900/40 border-white/5 backdrop-blur-sm overflow-hidden transition-all duration-300 hover:border-purple-500/30 hover:shadow-xl hover:shadow-purple-900/10 hover:-translate-y-1">
                                        <div className="aspect-video bg-zinc-900 relative">
                                            {/* Placeholder for project thumbnail - could be generated hero shot later */}
                                            <div className="absolute inset-0 bg-gradient-to-tr from-purple-900/20 to-zinc-900 flex items-center justify-center text-zinc-800">
                                                <Clapperboard className="w-12 h-12 opacity-20" />
                                            </div>
                                            <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/90 to-transparent pt-12">
                                                <div className="flex items-center gap-2 text-xs text-zinc-400 mb-1">
                                                    <Clock className="w-3 h-3" />
                                                    {new Date(project.created_at).toLocaleDateString()}
                                                </div>
                                                <h4 className="font-bold text-lg text-white truncate group-hover:text-purple-300 transition-colors">
                                                    {project.name}
                                                </h4>
                                            </div>
                                        </div>
                                    </Card>
                                </Link>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
