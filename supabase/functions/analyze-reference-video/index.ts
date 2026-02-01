import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AnalysisRequest {
    video_url: string;
}

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const { video_url } = await req.json() as AnalysisRequest;

        if (!video_url) {
            throw new Error("Video URL is required");
        }

        if (!GEMINI_API_KEY) {
            throw new Error("Missing GEMINI_API_KEY");
        }

        console.log("Analyzing video:", video_url);
        const analysis = await analyzeVideo(video_url);

        return new Response(JSON.stringify(analysis), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });

    } catch (error) {
        console.error("Analysis Error:", error);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});

async function fetchBase64(url: string): Promise<string> {
    if (url.startsWith('data:')) {
        return url.split(',')[1];
    }

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch media: ${res.statusText}`);
    const arrayBuffer = await res.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    // Efficient base64 conversion for Deno
    let binary = '';
    const chunk_size = 0x8000; // 32KB chunks
    for (let i = 0; i < bytes.length; i += chunk_size) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk_size));
    }
    return btoa(binary);
}

async function analyzeVideo(videoUrl: string) {
    const base64Video = await fetchBase64(videoUrl);

    // Using Gemini 2.0 Flash for best video reasoning
    const model = "gemini-2.0-flash";
    const url = "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent?key=" + GEMINI_API_KEY;

    const systemInstruction = `Analyze this video for recreation purposes using the SEALCaM framework.
Focus on 3-5 key scenes that represent the core visual DNA of the video.

OUTPUT FORMAT (JSON ONLY):
{
  "music_analysis": "Description of music/sound",
  "scenes": [
    {
      "scene_number": 1,
      "description": "Visual summary",
      "subject": "Main focus (animal, product, person)",
      "environment": "Setting/Atmosphere",
      "action": "Motion description",
      "lighting": "Quality/Mood",
      "camera": "Angle/Movement/Framing",
      "duration": "Approximate seconds"
    }
  ]
}`;

    const body = {
        contents: [
            {
                parts: [
                    { text: systemInstruction },
                    { inline_data: { mime_type: "video/mp4", data: base64Video } }
                ]
            }
        ],
        generationConfig: {
            temperature: 0.2,
            responseMimeType: "application/json"
        }
    };

    const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        const err = await response.text();
        throw new Error(`Gemini API Error: ${err}`);
    }

    const result = await response.json();
    if (!result.candidates || !result.candidates[0].content) {
        throw new Error("No response from Gemini");
    }

    const text = result.candidates[0].content.parts[0].text;
    return JSON.parse(text);
}
