import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { CAMERA_OPTIONS, LENS_OPTIONS, LIGHTING_OPTIONS, MOVIE_LOOK_OPTIONS, AUDIENCE_OPTIONS } from "../_shared/cinema-presets.ts";
import { GoogleGenerativeAI } from "npm:@google/generative-ai@0.1.3";
import { createClient } from 'jsr:@supabase/supabase-js@2';

// Configuration
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY")!;

// Initialize Supabase client for Realtime updates
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseKey);

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface DirectorRequest {
    action: 'analyze_image' | 'plan_sequence' | 'chat' | 'generate_preview' | 'animate_preview' | 'check_status';
    prompt?: string;
    image_urls?: string[];
    image_url?: string; // Flexible for animation input
    history?: any[];
    specs?: any;
    task_id?: string;
    style?: string;
    num_frames?: number;
    audience?: string;
    settings?: any; // For dynamic control
}

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const reqBody = await req.json() as DirectorRequest;
        const { action, prompt, image_urls, history, style = "Cinematic Realistic", num_frames = 6, audience } = reqBody;

        if (!GEMINI_API_KEY) {
            throw new Error("Missing GEMINI_API_KEY");
        }

        // -------------------------------------------------------------------------
        // ACTION 1: ANALYZE IMAGE (Vision)
        // -------------------------------------------------------------------------
        if (action === "analyze_image" && image_urls && image_urls.length > 0) {
            const analysis = await analyzeImage(image_urls[0]);
            return new Response(JSON.stringify(analysis), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // -------------------------------------------------------------------------
        // ACTION 2: PLAN SEQUENCE
        // -------------------------------------------------------------------------
        if (action === "plan_sequence") {
            const plan = await planSequence(prompt || "", image_urls, style, num_frames, audience);
            return new Response(JSON.stringify(plan), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // -------------------------------------------------------------------------
        // ACTION 3: CHAT (Collaborative Director)
        // -------------------------------------------------------------------------
        if (action === "chat") {
            const sessionId = reqBody.sessionId || crypto.randomUUID(); // Use provided session or create new
            const reply = await chatWithDirector(history || [], prompt || "", image_urls, reqBody.specs, reqBody.settings);
            reply.content.sessionId = sessionId; // Return session ID to frontend
            const videoAnalysis = reqBody.settings?.videoAnalysis;

            // STAGE 1: HERO SHOT (Character/Scene Only)
            if (reply.content.ready_for_hero_shot && !reply.content.hero_shot_url) {
                console.log("Generating Hero Shot (character/scene) for:", reply.content.refined_prompt);
                try {
                    // Generate character and scene WITHOUT product
                    const heroPrompt = reply.content.refined_prompt;
                    const heroImageUrl = await generateImage(heroPrompt, undefined, sessionId, 'hero_shot');

                    reply.content.hero_shot_url = heroImageUrl;
                    reply.content.message += `\n\n✨ Karakter ve mekan oluşturuldu! Ürünle birlikte sahneleri oluşturalım mı?`;
                    reply.content.ready_for_hero_plus = true; // Trigger Hero+ generation
                } catch (error) {
                    console.error("Hero Shot generation failed:", error);
                    reply.content.message += `\n\n(Hero Shot oluşturulamadı, ancak devam edebiliriz.)`;
                }
            }

            // STAGE 2: HERO+ SHOT (Start & End Frames with Product)
            if (reply.content.ready_for_hero_plus && reply.content.hero_shot_url && image_urls && image_urls.length > 0) {
                console.log("Generating Hero+ Shot (start & end frames) with product reference");
                try {
                    const heroShotUrl = reply.content.hero_shot_url;
                    const productImageUrl = image_urls[0]; // User's product image
                    const basePrompt = reply.content.refined_prompt;

                    // Generate Start Frame (beginning action with product)
                    const startPrompt = `${basePrompt}, character beginning to interact with product, cinematic start frame, dynamic composition`;
                    const startFrameUrl = await generateImage(startPrompt, [heroShotUrl, productImageUrl], sessionId, 'hero_plus_start');

                    // Generate End Frame (completed action with product)
                    const endPrompt = `${basePrompt}, character fully engaged with product, satisfied expression, cinematic end frame, polished composition`;
                    const endFrameUrl = await generateImage(endPrompt, [heroShotUrl, productImageUrl], sessionId, 'hero_plus_end');

                    reply.content.hero_plus_frames = {
                        start: startFrameUrl,
                        end: endFrameUrl
                    };
                    reply.content.message += `\n\n🎬 Hero+ Shot oluşturuldu! Start ve End frame'leri hazır. Storyboard'a geçelim mi?`;
                    reply.content.ready_for_storyboard = true; // Now ready for full storyboard
                } catch (error) {
                    console.error("Hero+ Shot generation failed:", error);
                    reply.content.message += `\n\n(Hero+ Shot oluşturulamadı, Hero Shot ile devam edebiliriz.)`;
                }
            }

            // AUTO-STORYBOARD TRIGGER
            if (reply.content.ready_for_storyboard) {
                console.log("Director is ready. Generating storyboard for:", reply.content.refined_prompt);
                const finalPrompt = reply.content.refined_prompt || prompt || "";
                const finalAudience = reply.content.specs?.audience || audience;

                const plan = await planSequence(finalPrompt, image_urls, style, num_frames, finalAudience);

                // Attach the plan
                reply.content.storyboard = {
                    plan: plan,
                    references: image_urls?.map(url => ({ type: 'reference', url, description: 'User Reference', key_features: [] })) || []
                };
            }

            return new Response(JSON.stringify(reply), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // -------------------------------------------------------------------------
        // ACTION 4: GENERATE PREVIEW (Image)
        // -------------------------------------------------------------------------
        if (action === "generate_preview") {
            const sessionId = reqBody.sessionId || crypto.randomUUID();
            // 1. Refine prompt for Nano Banana Pro
            const refinedPrompt = await refineImagePrompt(prompt || "", reqBody.specs);
            // 2. Generate Image
            const imageUrl = await generateImage(refinedPrompt, undefined, sessionId, 'preview_shot');

            return new Response(JSON.stringify({ image_url: imageUrl, refined_prompt: refinedPrompt, sessionId: sessionId }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // -------------------------------------------------------------------------
        // ACTION 5: ANIMATE PREVIEW (Video)
        // -------------------------------------------------------------------------
        if (action === "animate_preview") {
            const previewImageUrl = image_urls?.[0] || reqBody.image_url; // Fallback for safety
            if (!previewImageUrl) throw new Error("Image URL required for animation");

            // Start Video Gen (Returns Task ID)
            const taskId = await startVideoGeneration(previewImageUrl, prompt || "Cinematic slow motion");

            return new Response(JSON.stringify({ task_id: taskId, status: "processing" }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // -------------------------------------------------------------------------
        // ACTION 6: CHECK STATUS (Polling)
        // -------------------------------------------------------------------------
        if (action === "check_status") {
            if (!reqBody.task_id) throw new Error("Task ID required");

            const status = await checkVideoStatus(reqBody.task_id);
            return new Response(JSON.stringify(status), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        return new Response(JSON.stringify({ error: "Invalid action" }), { status: 400, headers: corsHeaders });

    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});

// --- HELPER FUNCTIONS ---

async function fetchImageBase64(url: string): Promise<string> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch image: ${res.statusText}`);
    const blob = await res.blob();
    const arrayBuffer = await blob.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
    return base64;
}

async function callGemini(contents: any[], options: { json?: boolean } = {}) {
    const model = "gemini-2.5-flash";
    const url = "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent?key=" + GEMINI_API_KEY;

    const body: any = {
        contents: contents,
        generationConfig: {
            temperature: 0.7,
        }
    };

    if (options.json) {
        body.generationConfig.responseMimeType = "application/json";
    }

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
    return options.json ? JSON.parse(text) : text;
}

async function analyzeImage(imageUrl: string) {
    const base64Image = await fetchImageBase64(imageUrl);
    const contents = [{
        role: "user",
        parts: [
            { text: "Analyze this image for a cinematic commercial. Describe: 1. Subject 2. Key visual features (colors, lighting) 3. Suitable mood/style. Return simple JSON with keys: subject, visual_features, mood." },
            { inline_data: { mime_type: "image/jpeg", data: base64Image } }
        ]
    }];
    return await callGemini(contents, { json: true });
}

async function planSequence(prompt: string, imageUrls: string[] | undefined, style: string, numFrames: number, audience?: string) {
    const imagesParts = [];
    if (imageUrls && imageUrls.length > 0) {
        for (const url of imageUrls) {
            const base64 = await fetchImageBase64(url);
            imagesParts.push({ inline_data: { mime_type: "image/jpeg", data: base64 } });
        }
    }


    const systemInstruction = `You are a professional visual planner (Director AI). 
Plan ${numFrames} frames that fulfill the brief.
SCENE STRUCTURE: Frames must be planned in Pairs (Start -> End) for each shot to ensure movement guidance.
Example: Frame 1 (Shot Start), Frame 2 (Shot End), Frame 3 (Shot Start), Frame 4 (Shot End)...

TARGET AUDIENCE: ${audience || "General Audience"}

OUTPUT FORMAT (JSON):
{
  "backgrounds": [{ "id": "bg1", "description": "..." }],
  "frames": [
    {
      "frame_number": 1,
      "shot_type": "wide/medium/close-up",
      "camera_angle": "eye-level/low/high",
      "description": "Start frame of the action. Describe the initial state/pose.",
      "is_keyframe_b": false,
      "linked_frame_id": "2",
      "motion_description": "e.g., Dolly zoom in while character reaches for product",
      "lighting_override": "Shot style",
      "background_id": "bg1"
    },
    {
      "frame_number": 2,
      "shot_type": "wide/medium/close-up",
      "camera_angle": "eye-level/low/high",
      "description": "End frame of the action. Describe the final state/result.",
      "is_keyframe_b": true,
      "linked_frame_id": "1",
      "background_id": "bg1"
    }
  ],
  "consistency_rules": "Detailed physical description of main subject/product. Target audience focused."
}
`;

    const parts = [{ text: "Prompt: " + prompt + "\n\n" + systemInstruction }];
    if (imagesParts.length > 0) parts.push(...imagesParts);

    const contents = [{ role: "user", parts }];
    return await callGemini(contents, { json: true });
}

// --- NEW STUDIO FUNCTIONS ---

async function refineImagePrompt(userPrompt: string, specs: any) {
    const specText = specs ? `
    Camera: ${specs.camera || "Cinematic"}
    Lens: ${specs.lens || "Standard"}
    Lighting: ${specs.lighting || "Natural"}
    Mood: ${specs.mood || "Balanced"}
    ` : "";

    const contents = [{
        role: "user",
        parts: [{
            text: `Act as a Prompt Engineer for a high-end AI Image Generator (Nano Banana Pro).
        Reword this user concept into a detailed visual prompt.
        
        User Concept: "${userPrompt}"
        Technical Specs: ${specText}
        
        Guidelines:
        - Focus on Subject, Actions, Context, Lighting, and Art Style.
        - Be descriptive but concise.
        - Output ONLY the raw prompt string, no JSON.` }]
    }];

    return await callGemini(contents, { json: false });
}

async function generateImage(prompt: string, referenceUrls?: string[], sessionId?: string, taskType?: string) {
    // Using Kie.ai Nano Banana Pro API
    const apiKey = Deno.env.get("KIE_API_KEY");
    if (!apiKey) throw new Error("KIE_API_KEY not configured");

    // Step 1: Create database record if sessionId provided
    if (sessionId && taskType) {
        await supabase
            .from('image_generation_tasks')
            .insert({
                session_id: sessionId,
                task_type: taskType,
                status: 'pending'
            });
        console.log(`Created DB task: ${sessionId}/${taskType} - pending`);
    }

    // Step 2: Create Kie.ai Task
    const createTaskBody: any = {
        model: "nano-banana-pro",
        input: {
            prompt: prompt,
            aspect_ratio: '16:9',
            resolution: '2K',
            output_format: 'png',
            image_input: referenceUrls || []
        }
    };

    console.log("Creating Kie.ai task with prompt:", prompt.substring(0, 100));

    const createResponse = await fetch('https://api.kie.ai/api/v1/jobs/createTask', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(createTaskBody)
    });

    if (!createResponse.ok) {
        const errorText = await createResponse.text();

        // Update database with failure
        if (sessionId && taskType) {
            await supabase
                .from('image_generation_tasks')
                .update({
                    status: 'failed',
                    error_message: `Task creation failed: ${errorText}`,
                    updated_at: new Date().toISOString()
                })
                .eq('session_id', sessionId)
                .eq('task_type', taskType)
                .eq('status', 'pending');
        }

        throw new Error(`Kie.ai Task Creation Failed: ${errorText}`);
    }

    const createData = await createResponse.json();
    const taskId = createData.data.taskId;
    console.log("Task created with ID:", taskId);

    // Step 3: Update database with Kie.ai task ID and set to processing
    if (sessionId && taskType) {
        await supabase
            .from('image_generation_tasks')
            .update({
                kie_task_id: taskId,
                status: 'processing',
                updated_at: new Date().toISOString()
            })
            .eq('session_id', sessionId)
            .eq('task_type', taskType)
            .eq('status', 'pending');
        console.log(`Updated DB task: ${sessionId}/${taskType} - processing`);
    }

    // Step 4: Poll for Results (max 300 seconds, check every 2 seconds)
    const maxAttempts = 150;
    const pollInterval = 2000; // 2 seconds

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        await new Promise(resolve => setTimeout(resolve, pollInterval));

        const queryResponse = await fetch(`https://api.kie.ai/api/v1/jobs/recordInfo?taskId=${taskId}`, {
            headers: {
                'Authorization': `Bearer ${apiKey}`
            }
        });

        if (!queryResponse.ok) {
            const errorText = await queryResponse.text();
            throw new Error(`Kie.ai Query Failed: ${errorText}`);
        }

        const queryData = await queryResponse.json();
        const state = queryData.data.state;

        console.log(`Task ${taskId} status: ${state} (attempt ${attempt + 1}/${maxAttempts})`);

        if (state === 'success') {
            const resultJson = JSON.parse(queryData.data.resultJson);
            const imageUrl = resultJson.resultUrls[0];
            console.log("Image generated successfully:", imageUrl);

            // Update database with success
            if (sessionId && taskType) {
                await supabase
                    .from('image_generation_tasks')
                    .update({
                        status: 'success',
                        image_url: imageUrl,
                        updated_at: new Date().toISOString()
                    })
                    .eq('session_id', sessionId)
                    .eq('task_type', taskType)
                    .eq('kie_task_id', taskId);
                console.log(`Updated DB task: ${sessionId}/${taskType} - success`);
            }

            return imageUrl;
        } else if (state === 'fail') {
            // Update database with failure
            if (sessionId && taskType) {
                await supabase
                    .from('image_generation_tasks')
                    .update({
                        status: 'failed',
                        error_message: queryData.data.failMsg,
                        updated_at: new Date().toISOString()
                    })
                    .eq('session_id', sessionId)
                    .eq('task_type', taskType)
                    .eq('kie_task_id', taskId);
            }

            throw new Error(`Kie.ai Generation Failed: ${queryData.data.failMsg}`);
        }
        // If state is 'waiting', continue polling
    }

    // Timeout - update database
    if (sessionId && taskType) {
        await supabase
            .from('image_generation_tasks')
            .update({
                status: 'failed',
                error_message: 'Timeout: Task did not complete within 300 seconds',
                updated_at: new Date().toISOString()
            })
            .eq('session_id', sessionId)
            .eq('task_type', taskType)
            .eq('kie_task_id', taskId);
    }

    throw new Error("Kie.ai Generation Timeout: Task did not complete within 300 seconds");
}

async function startVideoGeneration(imageUrl: string, prompt: string) {
    const apiKey = Deno.env.get("RAPIDAPI_KEY");
    if (!apiKey) throw new Error("RAPIDAPI_KEY not configured");

    const response = await fetch('https://api.kie.ai/api/v1/veo/generate', {
        method: 'POST',
        headers: {
            'x-rapidapi-key': apiKey,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            prompt: prompt,
            model: 'veo3_fast',
            aspectRatio: '16:9',
            enableTranslation: false,
            generationType: 'IMAGE_2_VIDEO', // Standard Image to Video
            imageUrls: [imageUrl]
        })
    });

    if (!response.ok) {
        const txt = await response.text();
        console.error("Video Start Error:", txt);
        throw new Error(`Video Gen Failed: ${txt}`);
    }

    const data = await response.json();
    return data.data.taskId;
}

async function checkVideoStatus(taskId: string) {
    const apiKey = Deno.env.get("RAPIDAPI_KEY");
    if (!apiKey) throw new Error("RAPIDAPI_KEY not configured");

    const response = await fetch(
        `https://api.kie.ai/api/v1/veo/record-info?taskId=${taskId}`,
        {
            headers: {
                'x-rapidapi-key': apiKey
            }
        }
    );

    if (!response.ok) throw new Error(`Status Check Failed: ${response.statusText}`);

    const data = await response.json();

    // successFlag: 1 = done, 0 = processing, -1 = error
    if (data.data.successFlag === 1) {
        return { status: 'done', video_url: data.data.response.resultUrls[0] };
    } else if (data.data.successFlag === -1) {
        return { status: 'error', error: "Video generation failed provider-side" };
    } else {
        return { status: 'processing' };
    }
}


async function chatWithDirector(history: any[], lastUserMessage: string, imageUrls?: string[], specs?: any, settings?: any) {
    const imagesParts = [];
    if (imageUrls && imageUrls.length > 0) {
        for (const url of imageUrls) {
            try {
                const base64 = await fetchImageBase64(url);
                imagesParts.push({ inline_data: { mime_type: "image/jpeg", data: base64 } });
            } catch (e) {
                console.error("Failed to load image for chat", e);
            }
        }
    }
    // Flatten history to Gemini format if needed, or just append recent context
    // Gemini supports multi-turn via 'contents' array with 'user'/'model' roles.

    // Inject Preset Knowledge
    const cameraList = CAMERA_OPTIONS.map(c => c.label).join(", ");
    const lensList = LENS_OPTIONS.map(l => l.label).join(", ");
    const lightingList = LIGHTING_OPTIONS.map(l => l.label).join(", ");
    const audienceList = AUDIENCE_OPTIONS.map(a => `${a.label} (${a.description})`).join(", ");

    const systemPrompt = `ROLE: You are an expert AI Film Director and Creative Consultant for a high-end cinematic ad agency.
  GOAL: Your objective is to EFFICIENTLY gather essential information and CREATE visuals. Be decisive and action-oriented.

  EFFICIENCY RULES:
  1. **Maximum 3-4 Questions Total**: Ask only essential questions before generating Hero Shot.
  2. **Never Repeat Questions**: If you already asked about atmosphere/mood/lighting, don't ask again.
  3. **User Says "Sen Karar Ver"**: Make the decision immediately and proceed. DO NOT ask another question.
  4. **Batch Questions**: Combine related questions into one message when possible.
  5. **Language Preference**: Always respond in the SAME language as the user. You are fully multilingual.

  WORKFLOW:
  - **Step 1**: Gather essentials in 1-2 questions (audience, product, scenario idea).
  - **Step 2**: If user provides scenario OR says "sen karar ver" → Set ready_for_hero_shot: true
  - **Step 3**: After Hero Shot approval → Set ready_for_storyboard: true

  DECISION TRIGGERS:
  - User mentions specific scenario (e.g., "ofiste başlasın") → READY FOR HERO SHOT
  - User says "sen karar ver", "buna sen karar ver", "aynen" → MAKE DECISION & PROCEED
  - User provides visual tone (e.g., "soğuk mavi tonlar") → READY FOR HERO SHOT
  - You have: audience + scenario + visual tone → READY FOR HERO SHOT

  PRESET OPTIONS (Use these labels in 'specs'):
  - Cameras: ${cameraList}
  - Lenses: ${lensList}
  - Lighting: ${lightingList}
  - Audiences: ${audienceList}

  OUTPUT FORMAT: JSON ONLY.
  {
    "message": "Your conversational response. Be concise and action-oriented.",
    "ready_for_hero_shot": boolean,
    "ready_for_storyboard": boolean,
    "refined_prompt": "Detailed Midjourney-style prompt for the CURRENT shot.",
    "specs": { "camera": "", "lens": "", "lighting": "", "mood": "", "audience": "" }
  }`;

    // Convert history format (assuming standard [{role, content}]) to Gemini ({role: "user"|"model", parts: [{text}]})
    const geminiHistory = history.map((msg: any) => {
        let textContent = "";
        // If previous content was JSON (from our new format), extract the message part for history
        try {
            if (typeof msg.content === 'object' && msg.content.message) {
                textContent = msg.content.message;
            } else if (typeof msg.content === 'string' && msg.content.trim().startsWith('{')) {
                const parsed = JSON.parse(msg.content);
                textContent = parsed.message || msg.content;
            } else {
                textContent = msg.content;
            }
        } catch (e) {
            textContent = msg.content;
        }

        return {
            role: msg.role === "assistant" ? "model" : "user",
            parts: [{ text: textContent }]
        };
    });

    // Add current message
    const currentParts: any[] = [{ text: `System: ${systemPrompt} \nUser: ${lastUserMessage} ` }];

    if (imagesParts.length > 0) {
        currentParts.push(...imagesParts);
    }

    const contents = [
        ...geminiHistory,
        { role: "user", parts: currentParts }
    ];

    // Force JSON response
    const result = await callGemini(contents, { json: true });
    return {
        role: "assistant",
        content: result // result is now the JSON object { message, specs }
    };
}
