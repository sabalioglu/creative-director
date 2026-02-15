"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Plus, Clapperboard, Sparkles, Clock, LayoutGrid, Zap } from "lucide-react"
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
            // Neon DB integration
            const response = await fetch('/api/projects')
            const data = await response.json()
            setProjects(data || [])
        } catch (error) {
            console.error('Error fetching projects:', error)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen bg-[#F8F9FB] relative overflow-hidden font-sans text-[#1A1A1A]">
            {/* Studio Glow Effect */}
            <div className="fixed inset-0 pointer-events-none border-[30px] border-blue-500/5 blur-[100px] z-0" />

            {/* Header */}
            <div className="relative z-10 px-8 py-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-white border border-gray-100 flex items-center justify-center shadow-sm">
                        <LayoutGrid className="w-5 h-5 text-purple-600" />
                    </div>
                    <div>
                        <h1 className="text-xl font-extrabold tracking-tight text-[#1A1A1A]">My Studio</h1>
                        <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Agentized Creative</p>
                    </div>
                </div>
                {credits !== null && (
                    <div className="px-4 py-1.5 rounded-full bg-white border border-gray-200 shadow-sm flex items-center gap-2">
                        <Zap className="w-3.5 h-3.5 text-[#D4FF00] fill-current drop-shadow-sm" />
                        <span className="text-sm font-bold text-gray-700">{credits} Credits</span>
                    </div>
                )}
            </div>

            <div className="relative z-10 max-w-7xl mx-auto px-8 py-8 space-y-12">

                {/* Hero / Action Section */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div
                        onClick={() => router.push('/cinema/new')}
                        className="col-span-2 relative rounded-[1.5rem] overflow-hidden bg-white border border-gray-100 shadow-[0_20px_40px_-15px_rgba(0,0,0,0.05)] p-10 cursor-pointer group transition-all duration-300 hover:shadow-[0_30px_60px_-15px_rgba(124,58,237,0.15)] hover:border-purple-100"
                    >
                        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-purple-100 to-blue-50 rounded-full blur-3xl opacity-50 translate-x-1/3 -translate-y-1/3 group-hover:scale-110 transition-transform duration-700" />

                        <div className="relative z-10 max-w-lg">
                            <div className="inline-flex items-center gap-2 px-3 py-1 bg-purple-50 border border-purple-100 text-purple-600 rounded-full text-xs font-bold uppercase tracking-wider mb-6">
                                <Sparkles className="w-3 h-3" /> New Production
                            </div>
                            <h2 className="text-4xl font-extrabold text-[#1A1A1A] mb-4 leading-tight">
                                Start a new <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-blue-600">masterpiece</span>.
                            </h2>
                            <p className="text-lg text-gray-500 mb-8 font-medium">
                                Direct your next commercial with our AI-powered studio tools.
                            </p>
                            <Button size="lg" className="h-12 px-8 rounded-xl bg-[#1A1A1A] text-white hover:bg-black font-bold text-sm shadow-xl shadow-gray-200/50 transition-all group-hover:scale-105 active:scale-95">
                                <Plus className="w-4 h-4 mr-2" /> CREATE PROJECT
                            </Button>
                        </div>
                    </div>

                    <div className="rounded-[1.5rem] bg-gradient-to-br from-purple-600 to-indigo-600 p-10 text-white flex flex-col justify-between shadow-xl shadow-purple-500/20 relative overflow-hidden group">
                        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=2564&auto=format&fit=crop')] mix-blend-overlay opacity-20 bg-cover bg-center transition-transform duration-700 group-hover:scale-110" />
                        <div className="relative z-10">
                            <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center mb-6">
                                <Clapperboard className="w-6 h-6 text-white" />
                            </div>
                            <h3 className="text-2xl font-bold mb-2">Tutorials</h3>
                            <p className="text-purple-100 text-sm font-medium leading-relaxed">
                                Learn how to get the most out of the Director's toolkit with our guides.
                            </p>
                        </div>
                        <div className="relative z-10 mt-6">
                            <span className="text-xs font-bold uppercase tracking-widest text-[#D4FF00] flex items-center gap-2 group-hover:gap-3 transition-all">
                                Watch Now <ArrowRight className="w-3 h-3" />
                            </span>
                        </div>
                    </div>
                </div>

                {/* Projects List */}
                <div className="space-y-6">
                    <div className="flex items-center justify-between">
                        <h3 className="text-xl font-bold text-[#1A1A1A] flex items-center gap-2">
                            Recent Productions
                            <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-bold">{projects.length}</span>
                        </h3>
                    </div>

                    {loading ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {[1, 2, 3].map(i => (
                                <div key={i} className="h-64 rounded-2xl bg-gray-100 animate-pulse" />
                            ))}
                        </div>
                    ) : projects.length === 0 ? (
                        <div className="text-center py-24 bg-white rounded-[1.5rem] border border-gray-100 border-dashed">
                            <p className="text-gray-400 font-medium mb-4">No productions found in your studio.</p>
                            <Button variant="outline" onClick={() => router.push('/cinema/new')} className="rounded-xl border-gray-200">Create First Project</Button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {projects.map((project) => (
                                <Link href={`/cinema/editor/${project.id}`} key={project.id} className="group relative block">
                                    <Card className="h-full bg-white border-gray-100 rounded-[1.25rem] overflow-hidden transition-all duration-300 hover:border-purple-200 hover:shadow-xl hover:shadow-purple-500/5 hover:-translate-y-1">
                                        <div className="aspect-video bg-gray-50 relative overflow-hidden group-hover:scale-[1.02] transition-transform duration-500">
                                            {/* Placeholder for project thumbnail */}
                                            <div className="absolute inset-0 bg-gray-50 flex items-center justify-center text-gray-200">
                                                <Clapperboard className="w-12 h-12 opacity-50" />
                                            </div>
                                            <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-gray-900/50 to-transparent pt-12 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <span className="text-white text-xs font-bold flex items-center gap-1">
                                                    Resume <ArrowRight className="w-3 h-3" />
                                                </span>
                                            </div>
                                        </div>
                                        <div className="p-5">
                                            <div className="flex items-center justify-between mb-2">
                                                <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                                                    <Clock className="w-3 h-3" />
                                                    {new Date(project.created_at).toLocaleDateString()}
                                                </div>
                                                <div className="w-2 h-2 rounded-full bg-green-500" />
                                            </div>
                                            <h4 className="font-bold text-lg text-[#1A1A1A] truncate group-hover:text-purple-600 transition-colors">
                                                {project.name}
                                            </h4>
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

function ArrowRight(props: any) {
    return (
        <svg
            {...props}
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M5 12h14" />
            <path d="m12 5 7 7-7 7" />
        </svg>
    )
}
